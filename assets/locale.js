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

  /* Region-qualify the formatting locale with the visitor's own country, so
   * a currency renders the way it does where they are: a US visitor sees
   * "$541", not en-GB's "US$541". Intl falls back sensibly for combinations
   * that are not real locales (en-JP resolves to English with yen). */
  function fmtLocale(lang) {
    var base = LOCALES[lang] || 'nl-BE';
    if (!state.country) return base;
    try {
      var tag = (lang || 'en') + '-' + state.country;
      Intl.NumberFormat.supportedLocalesOf(tag);
      return tag;
    } catch (e) { return base; }
  }

  function format(value, currency, lang) {
    try {
      return new Intl.NumberFormat(fmtLocale(lang), {
        style: 'currency', currency: currency,
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(value);
    } catch (e) {
      // Unknown ISO code, or a currency this runtime cannot format.
      return currency + ' ' + Math.round(value).toLocaleString();
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
    splitFigures(cur, rate, lang);
    recount();
    note(cur);
    fitTable();
  }

  /* Figures that wrap the currency symbol in its own tag for styling --
   * "<sup>&euro;</sup>499" on the pricing card -- put the symbol and the
   * digits in separate text nodes, so the walk above cannot see an amount.
   * Converted whole instead, from a snapshot of the original markup. */
  var snapHTML = new WeakMap();
  function splitFigures(cur, rate, lang) {
    var els = document.querySelectorAll('.pprice');
    Array.prototype.forEach.call(els, function (el) {
      if (!snapHTML.has(el)) snapHTML.set(el, el.innerHTML);
      var original = snapHTML.get(el);
      el.innerHTML = (cur === 'EUR' || !rate) ? original : state.money(original);
    });
  }

  /* Counters that have already finished animating keep whatever they counted
   * to, which is a euro figure if the rates landed after they ran. Rewrite
   * those to the converted total; ones that have not run yet will pick the
   * rate up when they do. */
  function recount() {
    var els = document.querySelectorAll('[data-count][data-counted]');
    Array.prototype.forEach.call(els, function (el) {
      var raw = parseInt(el.dataset.count, 10);
      if (isNaN(raw) || (el.dataset.prefix || '').indexOf('€') === -1) return;
      el.textContent = state.formatAmount(state.convertAmount(raw))
        || ((el.dataset.prefix || '') + raw + (el.dataset.suffix || ''));
    });
  }

  /* The comparison table's columns are fr-proportional and sized for euro
   * figures. A converted price can be three times longer, which clipped the
   * cells rather than widening them. Measure what each column actually needs
   * and, only if the total exceeds the space available, pin every row to the
   * same explicit template and let the table scroll -- identical templates
   * are what keep the columns lined up once fr no longer applies. */
  function fitTable() {
    var tbl = document.querySelector('.ctbl');
    if (!tbl) return;
    tbl.classList.remove('scrolls');
    tbl.style.removeProperty('--c1');
    tbl.style.removeProperty('--c2');
    tbl.style.removeProperty('--c3');

    var rows = tbl.querySelectorAll('.chd, .crow');
    if (!rows.length) return;

    /* Engage only when the normal wrapping layout actually cuts something
     * off. Euro figures wrap onto two lines and fit fine at 320px -- forcing
     * a scroll for them would undo the narrow-screen work that made the
     * table fit in the first place. Long converted prices cannot wrap small
     * enough, and those are the ones that need the scroll. */
    var clippedNow = false;
    Array.prototype.forEach.call(rows, function (row) {
      Array.prototype.forEach.call(row.children, function (cell) {
        if (getComputedStyle(cell).display === 'none') return;
        if (cell.scrollWidth > cell.clientWidth + 1) clippedNow = true;
      });
    });
    if (!clippedNow) return;

    tbl.classList.add('measuring');
    var need = [], rng = document.createRange();
    Array.prototype.forEach.call(rows, function (row) {
      var i = 0;
      Array.prototype.forEach.call(row.children, function (cell) {
        var cs = getComputedStyle(cell);
        if (cs.display === 'none') return;
        // Measured with a Range over the cell's own contents rather than via
        // scrollWidth: these cells are flex containers, where scrollWidth
        // reported a few pixels under the real text width and left the
        // column short enough to still clip. A Range measures the text
        // itself, independently of the box it is currently squeezed into.
        rng.selectNodeContents(cell);
        var text = rng.getBoundingClientRect().width;
        var box = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
                + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
        need[i] = Math.max(need[i] || 0, Math.ceil(text + box) + 2);
        i++;
      });
    });
    tbl.classList.remove('measuring');

    if (!need.length) return;

    var apply = function () {
      need.forEach(function (w, i) { tbl.style.setProperty('--c' + (i + 1), w + 'px'); });
    };
    apply();
    tbl.classList.add('scrolls');

    /* Measuring inline content inside a flex cell is not exact -- both
     * scrollWidth and a Range come up a few pixels short depending on the
     * engine. So rather than trust the measurement, look at what actually
     * clipped once applied and widen those columns by the shortfall. Two
     * passes settle it; the loop exits as soon as nothing is cut off. */
    for (var pass = 0; pass < 3; pass++) {
      var extra = [], clipped = false;
      Array.prototype.forEach.call(rows, function (row) {
        var i = 0;
        Array.prototype.forEach.call(row.children, function (cell) {
          if (getComputedStyle(cell).display === 'none') return;
          var over = cell.scrollWidth - cell.clientWidth;
          if (over > 0) { extra[i] = Math.max(extra[i] || 0, over + 1); clipped = true; }
          i++;
        });
      });
      if (!clipped) break;
      need = need.map(function (w, i) { return w + (extra[i] || 0); });
      apply();
    }
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

  /* Converts a short HTML fragment such as the zoom-section statistics.
   *
   * Those mark the currency symbol up in its own <span> for the blue accent
   * -- "<span>&euro;</span>0" in Dutch, "0<span> &euro;</span>" in French --
   * which splits the symbol from the digits into two separate text nodes.
   * The text-node walk above can never see an amount in that shape, so these
   * are converted from the element's text as a whole and the symbol is put
   * back inside its span, on whichever side it started.
   *
   * Exposed because the zoom stats are also rewritten on scroll, straight
   * from the translation strings; app.js runs the value through this on the
   * way in, so a converted figure is never overwritten with a euro one. */
  state.money = function (html) {
    var cur = state.currency;
    var rate = cur === 'EUR' ? 1 : (state.rates && state.rates[cur]);
    if (!rate || cur === 'EUR' || !html) return html;

    var lang = document.documentElement.lang || 'nl';
    // Any single wrapping tag, not just <span>: the pricing card marks the
    // symbol up as <sup>, the zoom statistics as <span>.
    var leadTag = String(html).match(/^<([a-zA-Z]+)>[^<]*<\/[a-zA-Z]+>/);
    var trailTag = String(html).match(/<([a-zA-Z]+)>[^<]*<\/[a-zA-Z]+>$/);
    var text = String(html).replace(/<[^>]*>/g, '');

    var out = text.replace(amountPattern(lang), function (m, pre, a, b) {
      var v = parseAmount(a || b, lang);
      return v === null ? m : format(Math.round(v * rate), cur, lang);
    });
    if (out === text) return html;          // nothing to convert, e.g. "100%"

    var m2, tag;
    if (leadTag && (m2 = out.match(/^([^0-9]+)([0-9].*)$/))) {
      tag = leadTag[1];
      return '<' + tag + '>' + m2[1] + '</' + tag + '>' + m2[2];
    }
    if (trailTag && (m2 = out.match(/^(.*[0-9])([^0-9]+)$/))) {
      tag = trailTag[1];
      return m2[1] + '<' + tag + '>' + m2[2] + '</' + tag + '>';
    }
    return out;
  };

  /* The animated statistics count towards a number and rebuild their own
   * text each frame, so they need the figure and the formatter separately
   * rather than a finished string. formatAmount returns null for euro, which
   * tells the caller to keep its own prefix+digits formatting. */
  state.convertAmount = function (n) {
    var cur = state.currency;
    var rate = cur === 'EUR' ? 1 : (state.rates && state.rates[cur]);
    return (!rate || cur === 'EUR') ? n : Math.round(n * rate);
  };
  state.formatAmount = function (n) {
    var cur = state.currency;
    if (cur === 'EUR' || !state.rates || !state.rates[cur]) return null;
    return format(n, cur, document.documentElement.lang || 'nl');
  };

  document.addEventListener('drp:langapplied', convert);

  /* The column measurement above is only as good as the font in use when it
   * runs, and the webfont arrives after first paint -- measuring in the
   * fallback face gave columns a few pixels too narrow, which is exactly how
   * wide the clipping was. Re-fit once the real font is in, and again on
   * resize or orientation change. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { fitTable(); });
  }
  var refit;
  addEventListener('resize', function () {
    clearTimeout(refit);
    refit = setTimeout(fitTable, 150);
  }, { passive: true });

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
