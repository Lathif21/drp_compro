/* DRP BuildLab — visitor locale: country-driven language, live currency.
 *
 * Two edge endpoints feed this: /api/geo (country, from Netlify's own edge,
 * no third-party lookup) and /api/rates (ECB-derived EUR rates, cached an
 * hour). Both are optional -- if either is unreachable the page keeps the
 * Dutch/browser language and EUR prices it was authored with.
 *
 * Prices live inside translated sentences ("...kost €29 per maand..."), not
 * in dedicated elements, so conversion works over text nodes. Every node it
 * touches is snapshotted first and restored before each re-run, because the
 * language switcher re-renders some text and leaves the rest -- converting a
 * converted price is the one failure mode that would be invisible and wrong.
 */
(function () {
  'use strict';

  var LOCALES = { nl: 'nl-BE', en: 'en-GB', fr: 'fr-BE', es: 'es-ES' };

  /* Thousands separators per language, so "€8.320" parses as 8320 in Dutch
   * and "€8,320" as 8320 in English. No displayed price carries decimals,
   * which is why the patterns below require groups of exactly three digits:
   * it keeps a sentence-ending "€98." from being read as a separator. */
  var GROUP = { nl: '.', en: ',', fr: '   ', es: '.' };

  var state = { country: null, currency: 'EUR', lang: null, rates: null, stale: false };
  window.DRP_LOCALE = state;

  var snap = new WeakMap();

  function get(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }

  /* ── price conversion ─────────────────────────────────────────────── */

  function amountPattern(lang) {
    var g = (GROUP[lang] || '.').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var num = '[0-9]{1,3}(?:[' + g + '][0-9]{3})+|[0-9]+';
    // Symbol before (nl/en) or after (fr/es) the figure.
    return new RegExp('(€\\s*)(' + num + ')|(' + num + ')(\\s*€)', 'g');
  }

  function parseAmount(raw, lang) {
    var g = GROUP[lang] || '.';
    var cleaned = '';
    for (var i = 0; i < raw.length; i++) {
      if (g.indexOf(raw[i]) === -1) cleaned += raw[i];
    }
    var n = parseInt(cleaned, 10);
    return isNaN(n) ? null : n;
  }

  function format(value, currency, lang) {
    try {
      return new Intl.NumberFormat(LOCALES[lang] || 'nl-BE', {
        style: 'currency', currency: currency,
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(value);
    } catch (e) {
      return currency + ' ' + Math.round(value);
    }
  }

  function walk(root, fn) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('[data-no-currency]')) return NodeFilter.FILTER_REJECT;
        return n.nodeValue && n.nodeValue.indexOf('€') !== -1
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(fn);
  }

  function convert() {
    var lang = document.documentElement.lang || 'nl';
    var cur = state.currency;
    var rate = cur === 'EUR' ? 1 : (state.rates && state.rates[cur]);

    // Restore originals first: the language switcher rewrites some nodes from
    // source and leaves others untouched, so without this a second pass would
    // convert an already-converted figure.
    walk(document.body, function (node) {
      if (snap.has(node)) node.nodeValue = snap.get(node);
    });

    if (!rate || cur === 'EUR') { note(null); return; }

    var re = amountPattern(lang);
    walk(document.body, function (node) {
      var original = node.nodeValue;
      var out = original.replace(re, function (m, pre, a, b, post) {
        var raw = a || b;
        var v = parseAmount(raw, lang);
        if (v === null) return m;
        return format(Math.round(v * rate), cur, lang);
      });
      if (out !== original) {
        if (!snap.has(node)) snap.set(node, original);
        node.nodeValue = out;
      }
    });
    note(cur);
  }

  /* A converted figure is indicative: the invoice is issued in EUR under
   * Belgian VAT, and the rate moves. Saying so sits next to the prices
   * rather than in a footer nobody reads. */
  function note(cur) {
    var hosts = document.querySelectorAll('.pgrid, .opp-box, .ctbl');
    Array.prototype.forEach.call(hosts, function (host) {
      var el = host.parentNode.querySelector(':scope > .cur-note');
      if (!cur) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('p');
        el.className = 'cur-note';
        host.parentNode.insertBefore(el, host.nextSibling);
      }
      var t = window.DRP_T && window.DRP_T('cur.note');
      el.textContent = (t || 'Prices shown in {cur} are converted from euro at today’s rate and are indicative. Invoicing is in EUR.')
        .replace('{cur}', cur) + (state.stale ? '' : '');
    });
  }

  document.addEventListener('drp:langapplied', convert);

  /* ── boot ─────────────────────────────────────────────────────────── */

  // A previously-seen country is applied immediately so a returning visitor
  // does not watch the page change language a beat after it paints; the live
  // lookup below still runs and corrects it if they have moved.
  try {
    var cached = JSON.parse(localStorage.getItem('drp-geo') || 'null');
    if (cached && cached.currency) {
      state.country = cached.country;
      state.currency = cached.currency;
      state.lang = cached.lang;
    }
  } catch (e) { /* private mode, or corrupt value: fall through to defaults */ }

  var geo = get('/api/geo').then(function (g) {
    state.country = g.country;
    state.currency = g.currency || 'EUR';
    state.lang = g.lang;
    try { localStorage.setItem('drp-geo', JSON.stringify(g)); } catch (e) {}
    return g;
  }).catch(function () { return null; });

  // Fetched unconditionally and in parallel with the country: which currency
  // is needed is not known until /api/geo answers, and gating on the cached
  // value meant a first-time visitor never loaded rates at all. The response
  // is edge-cached and about a kilobyte, so the parallel request is free.
  var rates = get('/api/rates').catch(function () { return null; });

  window.DRP_LOCALE_READY = Promise.all([geo, rates]).then(function (r) {
    var rt = r[1];
    if (rt && rt.rates) { state.rates = rt.rates; state.stale = !!rt.stale; }
    // Currency we cannot price in is not a currency we should display.
    if (state.currency !== 'EUR' && (!state.rates || !state.rates[state.currency])) {
      state.currency = 'EUR';
    }
    return state;
  });
})();
