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

const META_KEYS = ['__default', '__fallback'];
const CODES = Object.keys(MARKETS).filter(k => META_KEYS.indexOf(k) === -1);
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
