# Testing the country and currency features locally

The site picks a language from the visitor's country and converts every price
into their currency. Both depend on two endpoints, `/api/geo` and
`/api/rates`, which are **Netlify edge functions**. They do not exist as
files, so a plain static server returns 404 for them and you see the fallback
— Dutch, euro — rather than the feature.

`serve.py` stubs both, so the whole thing is testable offline.

---

## Start here

```powershell
python serve.py --cc=US --lock
```

Open <http://127.0.0.1:8000>. You should see the site **in English with
dollar prices**, and a small black `DEV geo-lock` badge bottom-left telling
you which country is being simulated.

If that works, everything works. Change `--cc=` to test anywhere.

### Why not `DRP_CC=US python serve.py`

That is bash syntax and **fails in PowerShell**. The flags above work in every
shell, which is why they exist. The environment variables still work if you
want them:

```powershell
$env:DRP_CC = "US"; python serve.py     # PowerShell
set DRP_CC=US && python serve.py        # cmd.exe
DRP_CC=US python serve.py               # bash / Git Bash
```

---

## The flags

| Flag | Meaning |
|---|---|
| `--cc=XX` | Pretend the visitor is in country `XX`. Any ISO code, e.g. `--cc=ID`. Default `BE`. |
| `--lock` | Hide the language switcher and clear any stored language, so the country is the **only** input. |
| `--draft` | Also serve the machine translations from `assets/i18n.draft.js`, and load a CJK/Arabic font so they render properly. |
| `8080` | A bare number sets the port. Default 8000. |

`python serve.py --help` prints the same.

### Reviewing a machine translation

Generated languages live in `assets/i18n.draft.js` and **no page loads that
file** — they are drafts, not translations, until someone has read them. But a
translation you cannot see is a translation you cannot review, so the dev
server can serve them without promoting anything:

```powershell
python serve.py --cc=JP --lock --draft     # the Japanese draft, in Japanese
python serve.py --cc=ID --lock --draft     # the Indonesian draft
```

Without `--draft` those same commands show **English**, and correctly so:
`geo.js` routes every country to one of the four real languages, and a draft
is not a real language yet.

Two things `--draft` does beyond loading the file:

- **Loads Noto** for CJK, Arabic, Hebrew, Thai and Devanagari. Plus Jakarta
  Sans has none of those glyphs, so without it Japanese falls back to whatever
  the OS provides and you would be reviewing the wrong typography entirely.
  Noto is appended to the stack, so Latin text keeps the brand face.
- **Flips `dir="rtl"`** for Arabic and Hebrew drafts.

Generate more languages with `node tools/translate.js --langs=xx` — see
`--help` on that script. Once a draft is signed off, move its block from
`i18n.draft.js` into `i18n.js` and map the country in `geo.js`; only then does
it reach real visitors.

### Why `--lock` matters

A language you have *clicked* deliberately beats the detected country — that
is intentional, so a Belgian on holiday in Spain is not forced into Spanish.
But it also means **one click on the switcher pins your language forever**,
and from then on `--cc=` appears to do nothing at all.

That is almost certainly what "I can't check this" looks like. `--lock` clears
the stored choice on every load and hides the switcher, so you always see what
a first-time visitor from that country would see.

Use `--lock` while testing. Drop it to test the switcher itself.

---

## Every language, and how to reach it

There are two kinds. **Live** languages are written by hand, sit in
`i18n.js`, and real visitors get them. **Drafts** are machine translations in
`i18n.draft.js`; no page loads them and only `--draft` shows them.

### Live — four languages, real visitors see these

| Language | Reached from | Test |
|---|---|---|
| Dutch `nl` | Belgium, Netherlands, Suriname, Aruba, Curacao, Sint Maarten, Caribbean NL | `python serve.py --cc=BE --lock` |
| French `fr` | France, Monaco, Luxembourg, Switzerland, Haiti, overseas France, francophone Africa, Maghreb — 42 countries | `python serve.py --cc=FR --lock` |
| Spanish `es` | Spain and Latin America — 21 countries | `python serve.py --cc=ES --lock` |
| English `en` | **every other country on earth** | `python serve.py --cc=US --lock` |

English is the fallback, not a region: Germany, Japan, Brazil and India all
get English because the site has no copy in their language. That is the
behaviour to change by promoting a draft, not a bug.

### Drafts — machine translated, need `--draft`

Currently generated: **German, Indonesian, Japanese**.

```powershell
python serve.py --cc=DE --lock --draft     # German
python serve.py --cc=ID --lock --draft     # Indonesian
python serve.py --cc=JP --lock --draft     # Japanese
```

Drop `--draft` from any of those and you get English (or Dutch/French/Spanish
if the country maps there) — which is exactly what production does today.

### Countries wired for a draft

Generate any of these with `node tools/translate.js --langs=xx` and the
matching `--cc=` immediately previews it. Nothing else is needed.

| Code | Language | Test with `--cc=` |
|---|---|---|
| `ar` | Arabic *(RTL)* | AE EG JO KW QA SA |
| `cs` | Czech | CZ |
| `da` | Danish | DK |
| `de` | German ✅ | AT DE |
| `el` | Greek | GR |
| `fi` | Finnish | FI |
| `he` | Hebrew *(RTL)* | IL |
| `hi` | Hindi | IN |
| `hu` | Hungarian | HU |
| `id` | Indonesian ✅ | ID |
| `it` | Italian | IT |
| `ja` | Japanese ✅ | JP |
| `ko` | Korean | KR |
| `nb` | Norwegian | NO |
| `pl` | Polish | PL |
| `pt` | Portuguese | BR PT |
| `ro` | Romanian | RO |
| `ru` | Russian | RU |
| `sv` | Swedish | SE |
| `th` | Thai | TH |
| `tr` | Turkish | TR |
| `uk` | Ukrainian | UA |
| `vi` | Vietnamese | VN |
| `zh` | Chinese | CN HK TW |

✅ = already generated. DeepL can target **110 languages**; run
`node tools/translate.js --list` for the full set. Anything not in the table
above needs a line adding to `DRAFT_CC` in `serve.py` before `--cc=` can
preview it.

### Adding a language, start to finish

```powershell
node tools/translate.js --langs=ko        # generate (keeps existing drafts)
python serve.py --cc=KR --lock --draft    # review it
```

Then, once someone who reads it has signed it off: move the block from
`i18n.draft.js` into `i18n.js`, map `KR: 'ko'` in `geo.js`, add a switcher
button, and move the Noto font link into the real `<head>`.

### Currency is separate from language

They are decided independently, so a country can get English with local
prices. Spot-check a spread:

```powershell
python serve.py --cc=BE --lock     # Dutch    €499
python serve.py --cc=FR --lock     # French   499 €           eurozone, no conversion
python serve.py --cc=ES --lock     # Spanish  499 €           eurozone, no conversion
python serve.py --cc=DE --lock     # English  €499            no German live yet
python serve.py --cc=US --lock     # English  $578
python serve.py --cc=GB --lock     # English  £429
python serve.py --cc=CH --lock     # French   470 CHF
python serve.py --cc=MX --lock     # Spanish  $9,820
python serve.py --cc=JP --lock     # English  ¥91,816
python serve.py --cc=IN --lock     # English  ₹54,890         lakh grouping: 8,22,030
python serve.py --cc=ID --lock     # English  Rp 10.258.941
python serve.py --cc=BR --lock     # English  R$2,970
python serve.py --cc=NG --lock     # English  ₦778,440
```

Figures come from a fixed rate snapshot in `serve.py`, so they will not match
today's real rates. Production fetches live ones.

### The four things worth checking

1. **Language follows the country.** Germany and Japan get *English* without
   `--draft` — the site has four live languages and routes every country to
   the closest one that exists.
2. **Prices convert everywhere**, not just the headline: the pricing cards,
   the comparison table, the cost-calculation box, the FAQ answers, the
   sticky mobile bar, and the big statistics in the scroll-zoom section.
   That last one is worth scrolling slowly through — it shows three figures
   in turn and each is re-rendered as you pass it, so a currency bug there
   only appears once you scroll rather than on load.
3. **A note appears under the prices** whenever the currency is not EUR,
   saying the figure is indicative and invoicing is in euro. It must *not*
   appear for BE/FR/ES/DE.
4. **The comparison table scrolls sideways** for long currencies (IDR, VND,
   KRW, NGN) and does **not** for short ones (EUR, USD, GBP). Nothing should
   ever be cut off. Check at a phone width — DevTools device toolbar, 320px.

---

## Testing the language switcher

Run **without** `--lock`:

```powershell
python serve.py --cc=US
```

- The page loads in English (country).
- Click `FR`. It switches to French and stays French on reload — your choice
  beats the country, which is the intended behaviour.
- To get back to country-driven: clear site data in DevTools
  (Application → Local Storage → delete `drp-lang`), or just restart with
  `--lock`.

---

## Testing the failure paths

These matter more than the happy path, because a broken rate provider must
never produce a wrong price.

| To simulate | How | Expected |
|---|---|---|
| Rate provider down | DevTools → Network → block `/api/rates` | Prices stay in **EUR**. Never a converted price from a stale rate. |
| Country lookup down | Block `/api/geo` | Falls back to browser language, prices in EUR. |
| Currency with no rate | `--cc=KP` (North Korean won is not quoted) | Language English, prices in **EUR**. |
| Offline entirely | Disconnect | Site still renders, Dutch/EUR. |

---

## Live Server (port 5500/5501)

Live Server **cannot** run this feature. It serves files only, so `/api/geo`
and `/api/rates` return 404 and the page falls back to browser language and
euro prices. Those two 404s in the console are expected there and are not a
fault — but you will never see the localisation.

Use `python serve.py` instead.

An unrelated console error you may also see on any page:

```
content.883ade9e.js  Failed to update QuickPro worker preference
```

That is a **browser extension**, not this site. Ignore it, or test in a
private window.

---

## The real thing: `netlify dev`

`serve.py` is a stand-in. It fakes the country and uses fixed rates, and it
knows nothing about `_headers` or `_redirects`.

```powershell
npm install -g netlify-cli
netlify dev
```

That runs the actual edge functions against **live** exchange rates, and
applies the real cache headers and redirect rules. The country will be your
own, since it comes from your real IP — which is exactly why `serve.py` has
`--cc=`.

If the two ever disagree, Netlify is right.

---

## In production

- Country comes from Netlify's own edge data. No third-party geo service, and
  the visitor's IP is never forwarded or logged — only a country code.
- Rates are fetched once an hour per edge region and cached, so the provider
  never sees visitor traffic.
- 205 countries are mapped to 153 currencies. Every one of them is quoted by
  the live provider except North Korean won, which falls back to EUR.
- Prices, and the invoice, remain in EUR. The converted figure is a display
  convenience and says so.
