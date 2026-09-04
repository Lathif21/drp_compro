#!/usr/bin/env node
/*
 * Generates a directory per market from the four source pages.
 *
 *   node tools/build-locales.js
 *
 * Output is committed, not built on Netlify. A build command is one more
 * thing that can fail on deploy, and this site has already had one outage
 * from a netlify.toml change -- generated files in git are inspectable in a
 * diff and cannot break a deploy.
 *
 * What each generated page gets that the source does not:
 *   - <html lang> for the market's language
 *   - a canonical pointing at itself, not at the source page
 *   - hreflang alternates covering every market, plus x-default
 *   - internal links prefixed with the market segment
 *   - window.__DRP_MARKET__, so the client knows its market without
 *     having to parse the URL
 *   - a <script> for its own language's translations only, generated
 *     alongside the pages into assets/i18n.<lang>.js
 *
 * Body copy is still translated client-side by app.js, exactly as it is
 * today. This step gets the URLs, the metadata and the currency right; the
 * text is a separate problem and prerendering it can follow.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MARKETS = require(path.join(ROOT, 'assets', 'markets.js'));
const TRANSLATIONS = eval(
  fs.readFileSync(path.join(ROOT, 'assets', 'i18n.js'), 'utf8') + ';TRANSLATIONS');
const PAGE_KEY = { '': 'home', '/over-ons': 'about', '/prijzen': 'pricing', '/contact': 'contact' };
const ORIGIN = 'https://drpbuildlab.com';

// Everything __-prefixed is metadata, not a market: __default, __fallback
// and __webfonts. Matched by prefix so the next one added does not have to
// be remembered here.
const CODES = Object.keys(MARKETS).filter(k => !k.startsWith('__'));
const DEFAULT = MARKETS.__default;
// x-default is advice to a crawler about the unmatched visitor, so it names
// the fallback market rather than the home one.
const FALLBACK = MARKETS.__fallback || MARKETS.__default;

/* source page -> path under a market directory */
const PAGES = [
  { src: 'src/index.html', out: 'index.html', route: '' },
  { src: 'src/over-ons/index.html', out: 'over-ons/index.html', route: '/over-ons' },
  { src: 'src/prijzen/index.html', out: 'prijzen/index.html', route: '/prijzen' },
  { src: 'src/contact/index.html', out: 'contact/index.html', route: '/contact' },
];

/* Internal routes that must gain the market prefix. Ordered longest-first so
 * "/contact" is not partly matched while rewriting "/". */
const ROUTES = ['/over-ons', '/prijzen', '/contact'];

function marketiseLinks(html, code) {
  let out = html;
  for (const r of ROUTES) {
    out = out.split(`href="${r}"`).join(`href="/${code}${r}"`);
  }
  // The bare root link, only as a complete attribute value.
  out = out.split('href="/"').join(`href="/${code}/"`);
  return out;
}

function hreflangBlock(route) {
  const lines = CODES.map(code => {
    // hreflang wants language-REGION; the market code is the region.
    const tag = `${MARKETS[code].lang}-${code.toUpperCase()}`;
    return `<link rel="alternate" hreflang="${tag}" href="${ORIGIN}/${code}${route || '/'}">`;
  });
  lines.push(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}/${FALLBACK}${route || '/'}">`);
  return lines.join('\n');
}


/* The market picker, with this market preselected. Grouped by region because
 * a flat list of every market is not scannable, and labelled with the
 * currency because that is half of what a visitor is choosing. */
function marketPicker(current, route) {
  const byRegion = {};
  for (const code of CODES) {
    const m = MARKETS[code];
    (byRegion[m.region] = byRegion[m.region] || []).push(code);
  }
  const groups = Object.keys(byRegion).map(region => {
    const opts = byRegion[region].map(code => {
      const m = MARKETS[code];
      const sel = code === current ? ' selected' : '';
      return `        <option value="${code}"${sel}>${m.name} — ${m.currency}</option>`;
    }).join('\n');
    return `      <optgroup label="${region}">\n${opts}\n      </optgroup>`;
  }).join('\n');

  return [
    '    <div class="market-sw">',
    `      <select id="marketSel" data-route="${route || '/'}" aria-label="Choose your market">`,
    groups,
    '      </select>',
    '    </div>',
  ].join('\n');
}


/* The social tags, in the market's language. Kept in step with <title> and
 * the meta description, which applyLang sets at runtime from these same
 * keys -- otherwise a shared link previews in a different language from the
 * page it opens. */
function socialTags(html, code, route) {
  const lang = MARKETS[code].lang;
  const t = TRANSLATIONS[lang];
  const key = PAGE_KEY[route];
  const title = t['meta.title.' + key] || t['meta.title'];
  const desc = t['meta.desc.' + key] || t['meta.desc'];
  const alt = 'DRP BuildLab — ' + [t['hero.l1'], t['hero.l2']].filter(Boolean).join(' ');

  const set = (attr, name, value) => {
    const re = new RegExp('(<meta ' + attr + '="' + name + '" content=")[^"]*(")');
    html = html.replace(re, '$1' + value.replace(/"/g, '&quot;') + '$2');
  };

  set('property', 'og:title', title);
  set('property', 'og:description', desc);
  set('property', 'og:image:alt', alt);
  set('property', 'og:locale', lang + '_' + code.toUpperCase());
  set('name', 'twitter:title', title);
  set('name', 'twitter:description', desc);
  set('name', 'twitter:image:alt', alt);
  return html;
}

/* The structured data, per market.
 *
 * Every market shipped Belgium's schema. /jp/ told Google areaServed BE,
 * named Brussels and Antwerp and accepted euro, so a crawler read a Belgian
 * business that happened to be written in Japanese -- the page indexed but
 * had no reason to rank in the market it was written for.
 *
 * What stays Belgian is what actually is Belgian: the KBO number, the VAT
 * ID, the registered address and the phone number all describe one legal
 * entity in Hallaar, and that stays true whichever market is reading.
 *
 * Edited as text rather than parsed and re-serialised, so untouched lines
 * keep their formatting and /be/ comes out byte-for-byte what it was before
 * this function existed -- which is the check that the generator reproduces
 * the hand-written original rather than merely something close to it. */
/* The English name of each language, for contactPoint.availableLanguage.
 *
 * A language missing from here used to sail straight through: JSON.stringify
 * of undefined is undefined, so the join produced "availableLanguage": [,"
 * English"] -- invalid JSON that no page would parse, in a block a human only
 * reads when something has already gone wrong. Adding Portuguese found it.
 * Hence the check below rather than a shrug. */
const LANG_NAME = {
  nl: 'Dutch', en: 'English', fr: 'French', de: 'German',
  es: 'Spanish', id: 'Indonesian', ja: 'Japanese', pt: 'Portuguese',
  it: 'Italian', pl: 'Polish',
};

/* Replace everything from `open` to the first following `close`, inclusive.
 * Index surgery rather than a multi-line regex: the thing being matched is a
 * JSON block whose own punctuation would need escaping either way, and this
 * says plainly where the edit starts and stops. */
function spliceBetween(html, open, close, replacement) {
  const i = html.indexOf(open);
  if (i === -1) return html;
  const j = html.indexOf(close, i + open.length);
  if (j === -1) return html;
  return html.slice(0, i) + replacement + html.slice(j + close.length);
}

function marketSchema(html, code) {
  const m = MARKETS[code];
  const t = TRANSLATIONS[m.lang];
  const LF = String.fromCharCode(10);

  /* areaServed: the country, whatever administrative areas the market
   * declares, then its cities -- each named in the market's own language,
   * because the page around them is. */
  const node = (type, name) =>
    `{"@type":"${type}","name":${JSON.stringify(name)}}`;
  const nodes = [node('Country', m.name)]
    .concat((m.areas || []).map(a => node('AdministrativeArea', a)))
    .concat((m.cities || []).map(c => node('City', c)));
  html = spliceBetween(html, '"areaServed": [', LF + '  ]',
    '"areaServed": [' + LF + nodes.map(n => '    ' + n).join(',' + LF) + LF + '  ]');

  /* The currency the market is quoted in. Deliberately not the offers'
   * priceCurrency, which stays EUR: that is the currency invoiced in, and
   * baking a converted figure into a static file would freeze one day's
   * exchange rate. */
  html = html.replace(/"currenciesAccepted": "[^"]*"/,
    () => '"currenciesAccepted": ' + JSON.stringify(m.currency));

  /* The market's language plus English, unless the market names its own set.
   * Belgium does, because the studio really does answer in French too. */
  if (!m.languages && !LANG_NAME[m.lang]) {
    throw new Error('no English name for language "' + m.lang + '" (market '
      + code + '). Add it to LANG_NAME, or give the market its own `languages`.');
  }
  const langs = m.languages
    || [LANG_NAME[m.lang], 'English'].filter((v, i, a) => a.indexOf(v) === i);
  html = spliceBetween(html, '"availableLanguage": [', ']',
    '"availableLanguage": [' + langs.map(l => JSON.stringify(l)).join(',') + ']');

  /* How the studio is paid.
   *
   * This read "Bankoverschrijving, Bancontact" on all nineteen markets: Dutch
   * everywhere, and naming a Belgian-only debit scheme that a visitor in
   * eighteen of them cannot use. The same shape of error as a translated tax
   * term -- a real thing, correctly named, asserted where it does not exist.
   *
   * Now the market's own language, and bank transfer alone, which is the one
   * payment fact the site can stand behind: it invoices, in euro. Nothing is
   * claimed that has not been confirmed. */
  const pay = t['pay.methods'];
  if (!pay) {
    throw new Error('no pay.methods for language "' + m.lang + '" (market '
      + code + '). Every language block needs one.');
  }
  html = html.replace(/"paymentAccepted": "[^"]*"/,
    () => '"paymentAccepted": ' + JSON.stringify(pay));

  /* The descriptive copy, taken from the translations instead of the Dutch it
   * was hardcoded in.
   *
   * All of it shipped in Dutch to every market -- the business description a
   * crawler reads, the services it knows about, both package names and both
   * package descriptions. Invisible to a visitor, and the strongest reason
   * Google had to treat nineteen markets as one Belgian page.
   *
   * Not one of these needed a new translation key. The site already says all
   * of it, in every language, in copy a human wrote or reviewed: meta.desc is
   * the business description, hero.eye the one-liner, p1/p2 the packages,
   * ex.items the service list. Reusing them means no new machine translation
   * enters the schema, and the schema cannot drift from the page. */
  const plain = s => String(s).replace(/<[^>]*>/g, '');
  const setJson = (key, value, was) => {
    const from = '"' + key + '": ' + JSON.stringify(was);
    if (!html.includes(from)) {
      throw new Error('src no longer contains ' + key + ' = ' + JSON.stringify(was).slice(0, 60)
        + '\n  (market ' + code + '; update marketSchema in build-locales.js)');
    }
    html = html.split(from).join('"' + key + '": ' + JSON.stringify(value));
  };

  /* Only the home page carries ProfessionalService, Organization and WebSite;
   * the other three have a BreadcrumbList and, on pricing, an FAQPage. So the
   * copy below is skipped where those blocks do not exist -- but where they
   * do, every literal must still be found, which is what setJson enforces.
   * A silent no-op on all four pages would hide the day someone edits the
   * Dutch in src and the schema quietly stops being translated. */
  if (html.includes('"@type": "ProfessionalService"')) {
  setJson('description', t['meta.desc'],
    'DRP BuildLab ontwerpt en bouwt websites volledig op maat voor lokale ondernemers in België. Beginnerspakket vanaf €499 of quotatie op maat voor geavanceerde projecten — met optioneel maandelijks onderhoud vanaf €29 per maand.');
  setJson('description', t['hero.eye'],
    'Websites op maat voor lokale ondernemers in België.');
  setJson('alternateName', 'DRP BuildLab — ' + plain(t['ab.logotag']),
    'DRP BuildLab — Webdesign op maat');

  // What the studio does, from the extra-services list it already publishes.
  html = html.replace(/"knowsAbout": \[[^\]]*\]/,
    () => '"knowsAbout": [' + t['ex.items'].map(i => JSON.stringify(i.n)).join(',') + ']');

  // The two offers, from the two package blocks on the pricing page.
  setJson('name', t['p1.name'], 'Beginnerspakket — Website op maat');
  setJson('description', plain(t['p1.desc']),
    'Ideaal voor lokale ondernemers die net starten zonder website, of een bestaande website willen laten aanpassen. Website op maat; maandelijks onderhoud optioneel vanaf €29 per maand.');
  setJson('name', t['p1.name'], 'Website op maat — Beginnerspakket');
  setJson('name', t['p2.name'], 'Maatwerk website — quotatie op maat');
  setJson('description', plain(t['p2.desc']),
    'Geavanceerde websites volledig op maat. Prijs wordt bepaald op basis van de omvang van het project. Maandelijks onderhoud optioneel: €29 per maand of €250 per jaar.');
  setJson('name', t['p2.name'], 'Maatwerk website op maat');
  }

  /* The contactPoint's own areaServed, which is a country code, not a list. */
  html = html.replace(/"areaServed": "[A-Z]{2}"/,
    () => '"areaServed": ' + JSON.stringify(code.toUpperCase()));

  /* Scope the entity ids to the market.
   *
   * All seventeen markets published the same three @ids while now making
   * different claims under them -- one #business simultaneously serving
   * Belgium, Japan and the United States in three currencies. An @id is a
   * global identifier, so a crawler is entitled to merge those into one
   * node and keep whichever it saw last.
   *
   * Per-market ids let each page describe the studio as that market meets
   * it. The pages are still tied to one company by the things that identify
   * a company -- the same vatID, the same BE-KBO number, the same telephone
   * and the same registered address on every one of them. */
  const base = ORIGIN + '/' + code + '/#';
  html = html.split(ORIGIN + '/#').join(base);

  /* WebSite.inLanguage, which claimed nl-BE on all seventeen. */
  html = html.replace(/"inLanguage": "[^"]*"/,
    () => '"inLanguage": ' + JSON.stringify(m.lang + '-' + code.toUpperCase()));

  return html;
}

/* The breadcrumb trail, per market.
 *
 * Every market published the root crumb as https://drpbuildlab.com/ and the
 * page crumb as the unprefixed route, so /jp/prijzen told Google its parent
 * was a URL that redirects away from Japan and that its own address belonged
 * to no market at all. The labels were Dutch on all seventeen too: applyLang
 * rewrites the visible navigation but never the JSON-LD sitting behind it.
 *
 * Names come from the same nav.* keys the visible nav uses, so a crumb and
 * the link it describes cannot drift apart. In Dutch they are already the
 * words that were hard-coded here, which is why /be/ only gains the prefix. */
const CRUMB_KEY = {
  '': 'nav.home', '/over-ons': 'nav.about',
  '/prijzen': 'nav.pricing', '/contact': 'nav.contact',
};

function breadcrumb(html, code, route) {
  const t = TRANSLATIONS[MARKETS[code].lang];
  const LF = String.fromCharCode(10);
  const crumb = (pos, name, path) => '    '
    + '{"@type":"ListItem","position":' + pos
    + ',' + '"name":' + JSON.stringify(name)
    + ',' + '"item":' + JSON.stringify(ORIGIN + '/' + code + path) + '}';

  const items = [crumb(1, t['nav.home'], '/')];
  if (route) items.push(crumb(2, t[CRUMB_KEY[route]], route));

  return spliceBetween(html, '"itemListElement": [', LF + '  ]',
    '"itemListElement": [' + LF + items.join(',' + LF) + LF + '  ]');
}

/* The webfont for a script the body face does not cover, declared in the
 * page instead of injected by JS.
 *
 * app.js loads it at runtime, which turned out to be too late to matter:
 * prerender bakes the <link> into the page but strips the inline
 * font-family that used it, so /jp/ pulled Noto Sans JP on every visit and
 * still rendered Japanese in whatever the browser fell back to. With
 * JavaScript off it downloaded the font and never applied it at all.
 *
 * The rule is keyed on html[lang] so it outranks the plain body rule in
 * styles.css whichever order the two load in. */
const SHEET = '<link rel="stylesheet" href="/assets/styles.css">';

function webfont(html, code) {
  const lang = MARKETS[code].lang;
  const wf = (MARKETS.__webfonts || {})[lang];
  if (!wf) return html;
  const href = wf.href.split('&').join('&amp;');
  return html.split(SHEET).join([
    `<link rel="stylesheet" href="${href}">`,
    '<style>',
    `html[lang="${lang}"] body{font-family:'Plus Jakarta Sans','${wf.family}',sans-serif}`,
    '</style>',
    SHEET,
  ].join('\n'));
}

function build(code, page) {
  const m = MARKETS[code];
  let html = fs.readFileSync(path.join(ROOT, page.src), 'utf8');
  const self = `${ORIGIN}/${code}${page.route || '/'}`;

  // 1. document language
  html = html.replace(/<html lang="[^"]*"/, `<html lang="${m.lang}"`);

  // 2. canonical + og:url point at this market's own URL
  html = html.replace(/<link rel="canonical" href="[^"]*">/,
    `<link rel="canonical" href="${self}">`);
  html = html.replace(/<meta property="og:url" content="[^"]*">/,
    `<meta property="og:url" content="${self}">`);

  // 2b. social tags in this market's language
  html = socialTags(html, code, page.route);

  // 2c. structured data describing this market, not Belgium
  html = marketSchema(html, code);

  // 2d. breadcrumbs that point into this market, labelled in its language
  html = breadcrumb(html, code, page.route);

  // 3. replace the existing hreflang pair with the full market set
  html = html.replace(/<link rel="alternate" hreflang="nl-be"[^>]*>\s*\n\s*<link rel="alternate" hreflang="x-default"[^>]*>/,
    hreflangBlock(page.route));
  if (!html.includes('hreflang="x-default"')) {
    html = html.replace('<link rel="canonical"',
      hreflangBlock(page.route) + '\n<link rel="canonical"');
  }

  // 4. internal links carry the market
  html = marketiseLinks(html, code);

  // 4b. this market loads its own language only, not all seven
  html = html.split('<script defer src="/assets/i18n.js"></script>')
             .join(`<script defer src="/assets/i18n.${m.lang}.js"></script>`);

  // 5. tell the client which market it is, before the deferred scripts run
  html = html.replace('<link rel="stylesheet" href="/assets/styles.css">',
    `<script>window.__DRP_MARKET__=${JSON.stringify(code)};</script>\n`
    + '<script defer src="/assets/markets.js"></script>\n'
    + '<link rel="stylesheet" href="/assets/styles.css">');

  // 5b. and the font its script needs, in the page rather than via JS
  html = webfont(html, code);


  // 6. the language toggle becomes a market picker that navigates
  html = html.replace(
    /[ \t]*<div class="lang-sw"[\s\S]*?<\/div>\n/,
    marketPicker(code, page.route) + '\n');

  const dest = path.join(ROOT, code, page.out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html, 'utf8');
  return dest;
}

/* ── per-language translation payloads ──────────────────────────────
 * assets/i18n.js holds every language and is the file humans edit; it stays
 * the source of truth and translate.js keeps writing to it. Shipping it
 * whole meant /be/ downloading Japanese, German and Indonesian in order to
 * render Dutch -- 125KB where 18KB was needed, growing by another slice with
 * every language added.
 *
 * So each language is written out on its own here, and each market page is
 * pointed at just its own. The object keeps the same global name and the
 * same shape -- TRANSLATIONS, keyed by language -- holding exactly one key,
 * so applyLang() and locale.js read it without knowing the split happened.
 *
 * One key per line rather than one minified blob: these files are committed,
 * and a translation change should read in a diff as the line that changed. */
function writeLangPayloads() {
  const langs = Object.keys(TRANSLATIONS);
  for (const lang of langs) {
    const t = TRANSLATIONS[lang];
    const entries = Object.keys(t).map(
      k => `  ${JSON.stringify(k)}: ${JSON.stringify(t[k])}`).join(",\n");
    const out = [
      "/* GENERATED by tools/build-locales.js -- do not edit.",
      `   The ${lang} slice of assets/i18n.js, which is the file to edit. */`,
      "const TRANSLATIONS = {",
      `${JSON.stringify(lang)}: {`,
      entries,
      "}",
      "};",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(ROOT, "assets", `i18n.${lang}.js`), out, "utf8");
  }
  return langs;
}
const LANGS = writeLangPayloads();
console.log(`wrote ${LANGS.length} language payloads: ${LANGS.join(", ")}`);

let n = 0;
for (const code of CODES) {
  for (const page of PAGES) { build(code, page); n++; }
}
console.log(`generated ${n} pages across ${CODES.length} markets`);

/* ── sitemap ─────────────────────────────────────────────────────────────
 * Every market page, so each is discoverable rather than relying on the
 * crawler following hreflang. */
const urls = [];
for (const code of CODES) {
  for (const page of PAGES) {
    const loc = `${ORIGIN}/${code}${page.route || '/'}`;
    const alts = CODES.map(c =>
      `    <xhtml:link rel="alternate" hreflang="${MARKETS[c].lang}-${c.toUpperCase()}" href="${ORIGIN}/${c}${page.route || '/'}"/>`
    ).join('\n');
    urls.push(
      `  <url>\n    <loc>${loc}</loc>\n`
      + `    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n`
      + `    <changefreq>${page.route ? 'monthly' : 'weekly'}</changefreq>\n`
      + `    <priority>${page.route ? '0.8' : '1.0'}</priority>\n`
      + alts + '\n'
      + `    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/${FALLBACK}${page.route || '/'}"/>\n`
      + '  </url>'
    );
  }
}
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
  + '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
  + urls.join('\n') + '\n</urlset>\n', 'utf8');
console.log(`sitemap.xml: ${urls.length} URLs`);
