/* Visitor country, resolved at Netlify's edge.
 *
 * Netlify already knows the country from the connecting IP, so nothing is
 * sent to a third-party geo service and the IP itself never leaves the edge
 * -- it is never logged here, never forwarded, and never reaches the client.
 * Only a two-letter country code comes back.
 *
 * Deliberately `no-store`: a cached country response is another visitor's
 * location, and this site's HTML is served through a shared CDN cache.
 */

// Country -> site language. Only the four the site actually speaks; anything
// else returns null so the client falls back to the browser's own preference
// rather than being forced into a language it did not ask for.
const LANG = {
  BE: 'nl', NL: 'nl', SR: 'nl', AW: 'nl', CW: 'nl',
  FR: 'fr', MC: 'fr', LU: 'fr', CH: 'fr', CI: 'fr', SN: 'fr', CD: 'fr', CM: 'fr',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
  EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es',
  SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', GQ: 'es',
  GB: 'en', IE: 'en', US: 'en', CA: 'en', AU: 'en', NZ: 'en', ZA: 'en',
  IN: 'en', SG: 'en', PH: 'en', NG: 'en', KE: 'en', MT: 'en',
};

// Country -> display currency. Everything absent is treated as EUR, which is
// also the currency the client is actually invoiced in.
const CURRENCY = {
  GB: 'GBP', US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
  RO: 'RON', BG: 'BGN', TR: 'TRY', JP: 'JPY', CN: 'CNY', IN: 'INR',
  BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
  ZA: 'ZAR', AE: 'AED', SA: 'SAR', SG: 'SGD', HK: 'HKD', KR: 'KRW',
  ID: 'IDR', MY: 'MYR', TH: 'THB', PH: 'PHP', VN: 'VND', IL: 'ILS',
  UA: 'UAH', RS: 'RSD', IS: 'ISK', MA: 'MAD', NG: 'NGN', KE: 'KES',
};

export default async (request, context) => {
  const code = (context.geo && context.geo.country && context.geo.country.code) || '';
  const cc = code.toUpperCase();

  return new Response(JSON.stringify({
    country: cc || null,
    region: (context.geo && context.geo.subdivision && context.geo.subdivision.code) || null,
    lang: LANG[cc] || null,
    currency: CURRENCY[cc] || 'EUR',
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
    },
  });
};

export const config = { path: '/api/geo' };
