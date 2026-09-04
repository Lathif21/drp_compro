/* The markets the site is published for.
 *
 * A market is a URL segment, a language and a currency -- the same three
 * things nike.com/gb/ and nike.com/mx/ carry. Language and currency are
 * separate properties of a market, not derived from each other, which is the
 * whole point: the UK and the US both read English at different currencies,
 * and Mexico and Spain both read Spanish at different currencies. Binding
 * currency to language instead would have collapsed all of that to one
 * currency per language.
 *
 * `lang` must exist in TRANSLATIONS. `currency` must be quoted by the rate
 * feed, or prices quietly fall back to EUR, which is the currency invoicing
 * happens in anyway.
 *
 * Loaded by the page (for the client) and by tools/build-locales.js (to
 * generate the directories), so it has to work in both a browser and Node.
 */
(function (root, factory) {
  var MARKETS = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = MARKETS;
  else root.DRP_MARKETS = MARKETS;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return {
    //        language   currency  English name (for the market picker)
    be: { lang: 'nl', currency: 'EUR', name: 'België',        region: 'Europe' },
    nl: { lang: 'nl', currency: 'EUR', name: 'Nederland',     region: 'Europe' },
    fr: { lang: 'fr', currency: 'EUR', name: 'France',        region: 'Europe' },
    lu: { lang: 'fr', currency: 'EUR', name: 'Luxembourg',    region: 'Europe' },
    ch: { lang: 'fr', currency: 'CHF', name: 'Suisse',        region: 'Europe' },
    de: { lang: 'de', currency: 'EUR', name: 'Deutschland',   region: 'Europe' },
    at: { lang: 'de', currency: 'EUR', name: 'Österreich',    region: 'Europe' },
    es: { lang: 'es', currency: 'EUR', name: 'España',        region: 'Europe' },
    gb: { lang: 'en', currency: 'GBP', name: 'United Kingdom', region: 'Europe' },
    ie: { lang: 'en', currency: 'EUR', name: 'Ireland',       region: 'Europe' },

    us: { lang: 'en', currency: 'USD', name: 'United States', region: 'Americas' },
    ca: { lang: 'en', currency: 'CAD', name: 'Canada',        region: 'Americas' },
    mx: { lang: 'es', currency: 'MXN', name: 'México',        region: 'Americas' },

    id: { lang: 'id', currency: 'IDR', name: 'Indonesia',     region: 'Asia Pacific' },
    jp: { lang: 'ja', currency: 'JPY', name: '日本',           region: 'Asia Pacific' },
    sg: { lang: 'en', currency: 'SGD', name: 'Singapore',     region: 'Asia Pacific' },
    au: { lang: 'en', currency: 'AUD', name: 'Australia',     region: 'Asia Pacific' },

    /* The market served when geo says nothing useful, and the one every
     * pre-existing URL redirects into. Belgium, because that is where the
     * business is and Dutch is the language the copy was written in. */
    __default: 'be',

    /* Where a visitor whose country has no market of its own is sent, and
       what x-default advertises. Deliberately not __default: the home
       market is Dutch, and Dutch is the wrong first impression for the
       ~180 countries not listed above. Ireland is English and prices in
       euro, which is the currency the studio actually quotes -- /gb/ would
       be English too but would misprice every non-UK visitor in sterling. */
    __fallback: 'ie',
  };
}));
