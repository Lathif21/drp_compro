/* Live EUR exchange rates, proxied and cached at the edge.
 *
 * Proxied rather than called from the browser for three reasons: the upstream
 * host never sees visitor traffic, the response is cached once per hour per
 * edge region instead of once per pageview, and a provider outage degrades
 * here -- where there is a fallback -- instead of in the page.
 *
 * Rates move by fractions of a percent within a day, and these figures are
 * indicative prices rather than a checkout total (invoicing is in EUR), so an
 * hour of staleness is immaterial.
 */

const UPSTREAM = 'https://open.er-api.com/v6/latest/EUR';
const TTL = 3600;

/* Last-resort table, used only when the provider is unreachable. Deliberately
 * coarse: it exists so prices still render rather than to be accurate. The
 * response is marked stale:true so the page can say the rate is approximate.
 * Refresh these occasionally; they are not load-bearing. */
const FALLBACK = {
  USD: 1.08, GBP: 0.85, CHF: 0.95, CAD: 1.47, AUD: 1.63, NZD: 1.77,
  SEK: 11.3, NOK: 11.6, DKK: 7.46, PLN: 4.995, CZK: 25.2, HUF: 392,
  RON: 4.97, BGN: 1.956, TRY: 35.2, JPY: 163, CNY: 7.82, INR: 90.5,
  BRL: 5.95, MXN: 19.8, ARS: 985, CLP: 1030, COP: 4400, PEN: 4.05,
  ZAR: 19.9, AED: 3.97, SAR: 4.05, SGD: 1.45, HKD: 8.42, KRW: 1470,
  IDR: 17100, MYR: 4.85, THB: 37.5, PHP: 62.5, VND: 27000, ILS: 3.98,
  UAH: 44.5, RSD: 117, ISK: 150, MAD: 10.8, NGN: 1650, KES: 140,
};

const send = (body, cache) => new Response(JSON.stringify(body), {
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache,
  },
});

export default async () => {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(UPSTREAM, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error('upstream ' + r.status);

    const data = await r.json();
    if (!data || !data.rates || !data.rates.USD) throw new Error('malformed');

    return send({
      base: 'EUR',
      rates: data.rates,
      updated: data.time_last_update_utc || null,
      stale: false,
    }, 'public, max-age=' + TTL + ', stale-while-revalidate=86400');
  } catch (_) {
    // Short cache on the fallback so a brief provider blip does not pin the
    // stale table in the CDN for a full hour.
    return send({
      base: 'EUR', rates: FALLBACK, updated: null, stale: true,
    }, 'public, max-age=300');
  }
};

export const config = { path: '/api/rates' };
