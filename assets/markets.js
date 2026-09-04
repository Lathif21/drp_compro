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

  /* `cities` and `areas` feed the ProfessionalService schema's areaServed,
   * and `languages` its contactPoint. They are the market's own major
   * cities, named in the market's language, following the pattern the
   * Belgian list already set -- so /jp/ tells Google it serves Japan and
   * Japanese cities rather than Brussels and Antwerp.
   *
   * `areas` and `languages` are optional and default sensibly: no
   * administrative areas, and the market's language plus English. Belgium
   * declares both explicitly because it has regions worth naming and the
   * studio genuinely answers in French as well as Dutch.
   *
   * These are service-area claims in structured data. Adding a city here
   * asserts the studio serves it -- so this list is the client's to revise,
   * and revising it is a one-line edit that the next build picks up. */
  return {
    //        language   currency  the market's own name (also the picker label)
    be: { lang: 'nl', currency: 'EUR', name: 'België',        region: 'Europe',
          areas: ['Vlaanderen', 'Wallonië'],
          languages: ['Dutch', 'English', 'French'],
          cities: ['Brussel', 'Antwerpen', 'Gent', 'Leuven', 'Mechelen', 'Hasselt', 'Brugge', 'Kortrijk', 'Namen', 'Luik'] },
    nl: { lang: 'nl', currency: 'EUR', name: 'Nederland',     region: 'Europe',
          cities: ['Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven', 'Groningen', 'Tilburg', 'Breda'] },
    fr: { lang: 'fr', currency: 'EUR', name: 'France',        region: 'Europe',
          cities: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Bordeaux', 'Lille'] },
    lu: { lang: 'fr', currency: 'EUR', name: 'Luxembourg',    region: 'Europe',
          cities: ['Luxembourg', 'Esch-sur-Alzette', 'Differdange', 'Dudelange'] },
    ch: { lang: 'fr', currency: 'CHF', name: 'Suisse',        region: 'Europe',
          cities: ['Zurich', 'Genève', 'Bâle', 'Lausanne', 'Berne', 'Winterthour', 'Lucerne'] },
    de: { lang: 'de', currency: 'EUR', name: 'Deutschland',   region: 'Europe',
          cities: ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt am Main', 'Stuttgart', 'Düsseldorf', 'Leipzig'] },
    at: { lang: 'de', currency: 'EUR', name: 'Österreich',    region: 'Europe',
          cities: ['Wien', 'Graz', 'Linz', 'Salzburg', 'Innsbruck', 'Klagenfurt'] },
    es: { lang: 'es', currency: 'EUR', name: 'España',        region: 'Europe',
          cities: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Bilbao'] },
    gb: { lang: 'en', currency: 'GBP', name: 'United Kingdom', region: 'Europe',
          cities: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Edinburgh', 'Bristol', 'Liverpool'] },
    ie: { lang: 'en', currency: 'EUR', name: 'Ireland',       region: 'Europe',
          cities: ['Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford'] },

    us: { lang: 'en', currency: 'USD', name: 'United States', region: 'Americas',
          cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Diego', 'Dallas'] },
    ca: { lang: 'en', currency: 'CAD', name: 'Canada',        region: 'Americas',
          cities: ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg'] },
    mx: { lang: 'es', currency: 'MXN', name: 'México',        region: 'Americas',
          cities: ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'León', 'Querétaro'] },

    id: { lang: 'id', currency: 'IDR', name: 'Indonesia',     region: 'Asia Pacific',
          cities: ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Denpasar'] },
    jp: { lang: 'ja', currency: 'JPY', name: '日本',           region: 'Asia Pacific',
          cities: ['東京', '大阪', '名古屋', '横浜', '福岡', '札幌', '京都', '神戸'] },
    sg: { lang: 'en', currency: 'SGD', name: 'Singapore',     region: 'Asia Pacific',
          cities: ['Singapore'] },
    au: { lang: 'en', currency: 'AUD', name: 'Australia',     region: 'Asia Pacific',
          cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Gold Coast'] },

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
