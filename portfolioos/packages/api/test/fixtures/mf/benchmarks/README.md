# Benchmark + risk-free feed fixtures

Provenance matters more than coverage here. The previous generation of these
fixtures was **written by hand from the same assumption as the parser**, so the
two agreed with each other and with nothing else — the parser expected a CSV
that niftyindices has never served. A fixture you wrote yourself proves only
that you are consistent with yourself.

Everything below is either a byte-for-byte capture of a live response, or a
documented mutation of one. Nothing here was invented.

---

## NSE — niftyindices.com Total Return Index

**The request that produced these** (verified 2026-09-07):

```http
POST https://www.niftyindices.com/BackPage/getTotalReturnIndexString
content-type: application/json; charset=utf-8
accept: application/json, text/javascript, */*; q=0.01
x-requested-with: XMLHttpRequest
referer: https://www.niftyindices.com/reports/historical-data
origin: https://www.niftyindices.com

{"cinfo":"{'name':'NIFTY 50','startDate':'01-Jan-2024','endDate':'31-Jan-2024','indexName':'NIFTY 50'}"}
```

No cookie, session or CSRF token is required — only `content-type`. The
response's own `content-type` is `text/html; charset=utf-8` even when the body
is JSON, so it cannot be used to tell the two apart.

| File | Capture date | What it is |
|---|---|---|
| `nse-nifty50-tri-2024-01.json` | 2026-09-07 | Verbatim. `name`/`indexName` = `NIFTY 50`, 01–31 Jan 2024. 22 rows. Carries a real `NTR_Value`. |
| `nse-nifty500-tri-2024-01.json` | 2026-09-07 | Verbatim. `NIFTY 500`, same window. 22 rows, real `NTR_Value`. |
| `nse-midcap150-tri-2024-01.json` | 2026-09-07 | Verbatim. `NIFTY MIDCAP 150`, same window. 22 rows, `NTR_Value` is the literal `"-"` — the majority case. |
| `nse-nifty50-tri-2024-10-holidays.json` | 2026-09-07 | Verbatim. `NIFTY 50`, 25 Oct – 15 Nov 2024. 15 rows spanning the Diwali cluster, including the 01-Nov-2024 Muhurat session. Proves real Indian market holidays do **not** trip `detectGaps`. |
| `nse-unknown-index-empty.json` | 2026-09-07 | Verbatim. The response to `name: 'NIFTY NOT A REAL INDEX'` — a bare `[]` under HTTP 200. This is how the endpoint reports an unrecognised index, and the single most dangerous thing it does. |
| `nse-html-shell-not-json.html` | 2026-09-07 | The first 1,200 bytes of the real 78,857-byte body returned when the same POST is sent **without** `content-type: application/json`: the site's HTML homepage, HTTP 200. Trimmed for size; the trim point is marked with an HTML comment. |

### Derived (mutated) NSE fixtures

Both are produced from `nse-nifty50-tri-2024-01.json`. Reproduce with the
snippets below if you ever need to regenerate them.

| File | Mutation |
|---|---|
| `nse-nifty50-tri-derived-gap.json` | Rows for 08–25 Jan 2024 **deleted** from the real capture, leaving 01–05 Jan and 29–31 Jan. Nothing else changed. Needed because the Indian market has no real closure longer than five business days, so a genuine `detectGaps` case cannot be captured. |
| `nse-nifty50-tri-derived-malformed.json` | Ten elements taken from the real capture, seven of them corrupted one field at a time to exercise every failure reason exactly once: `not_an_object` (element 2 replaced by a bare string), `missing_date` (3), `bad_date` (4, `"31 Foo 2024"`), `missing_value` (5, `"-"`), `bad_value` (6), `non_positive_value` (7, sign flipped), `duplicate_date` (9, element 8 repeated). Elements 1, 8 and 10 are untouched. |

---

## BSE — api.bseindia.com index archive

**The request** (verified 2026-09-07):

```http
GET https://api.bseindia.com/BseIndiaAPI/api/IndexArchDailyPAR/w?fmdt=01/01/2024&index=SENSEX&period=D&todt=31/01/2024
referer: https://www.bseindia.com/
origin: https://www.bseindia.com
```

The `referer`/`origin` pair is load-bearing: without it the API 302s to
`error_Bse.html`.

| File | Capture date | What it is |
|---|---|---|
| `bse-sensex-archive-2024-01.json` | 2026-09-07 | Verbatim `{"Table":[…]}`, 22 rows, `SENSEX`, Jan 2024. **This is the PRICE-RETURN Sensex** (72,271.94 on 01 Jan 2024) and exists here only to prove the parser reads BSE's shape correctly. It must never be ingested as `SENSEX_TRI`. |
| `bse-unknown-index-empty.json` | 2026-09-07 | Verbatim. The answer to `index=SENSEX_TRI`: `{"Table":[]}` under HTTP 200. |
| `bse-index-list.json` | 2026-09-07 | Verbatim `FillddlIndex` response — the archive tool's own picker, all **149** indices it serves. This is the evidence that BSE publishes no free total-return series: there is no `SENSEX_TRI`, no "Total Return", no "… TR" entry anywhere in it. A test asserts that, so if BSE ever adds one the test fails and tells us to go and wire it up. |

---

## Risk-free rate — FBIL T-Bill par yield curve

RBI is **not** the source. `dbie.rbi.org.in` is a decommissioned hostname, and
the replacement portal serves its T-Bill reports through SAP BusinessObjects
Web Intelligence behind a session that cannot be minted outside the portal's own
Angular bootstrap. The full evidence is in `src/priceFeeds/fbilTbillCurve.v1.ts`.
The synthetic `rbi-tbill-91d.csv` that used to live here has been deleted along
with the parser that read it — it described a CSV export that does not exist.

**The request** (verified 2026-09-07). No auth, no cookie, no referer:

```http
GET https://www.fbil.org.in/wasdm/tbill/fetchfiltered?fromDate=2026-08-24&toDate=2026-08-28&authenticated=false
accept: application/json
```

`fromDate`/`toDate` must be `YYYY-MM-DD`; anything else, and `authenticated=true`,
answer HTTP 500. The series begins **2017-08-23**; earlier windows return `[]`.

| File | Capture date | What it is |
|---|---|---|
| `fbil-tbill-curve-2026-08.json` | 2026-09-07 | Verbatim. 24–28 Aug 2026: 14 tenors x 4 trading days = 56 elements. 26 Aug is genuinely absent (a holiday), which gives `forwardFillToDates` a real hole to carry across. |
| `fbil-tbill-empty-pre-history.json` | 2026-09-07 | Verbatim. The response for calendar 2010, before FBIL began publishing: a bare `[]` under HTTP 200. |
| `fbil-tbill-bad-date-500.txt` | 2026-09-07 | First 1,200 bytes of the real 9,391-byte HTTP 500 body returned for `fromDate=01-01-2026` — a serialised Java `WASDMExceptionInterceptor` stack trace. It is *valid JSON*, which is why the parser's array check matters and a first-byte sniff alone is not enough. Trimmed; the trim point is marked. |
| `fbil-tbill-derived-malformed.json` | derived | Ten elements taken from the real capture, corrupted one field at a time to exercise every failure reason once: `not_an_object` (2), `missing_date` (4), `bad_date` (5, `DD-MM-YYYY`), `missing_rate` (6, `rate: null`), `bad_rate` (7), `rate_out_of_range` (8, `999`), `duplicate_date` (10). Element 3 is an untouched `7 Days` row, which must be **skipped, not failed**. |

⚠ FBIL's free tier ran roughly five to seven business days behind live when
captured (newest observation 2026-08-28 against a capture date of 2026-09-07),
and FBIL sells this data commercially. Read their terms before shipping.

---

## Regenerating

```js
// NSE
const body = JSON.stringify({ cinfo:
  "{'name':'NIFTY 50','startDate':'01-Jan-2024','endDate':'31-Jan-2024','indexName':'NIFTY 50'}" });
await fetch('https://www.niftyindices.com/BackPage/getTotalReturnIndexString',
  { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body });

// BSE
await fetch('https://api.bseindia.com/BseIndiaAPI/api/IndexArchDailyPAR/w'
  + '?fmdt=01/01/2024&index=SENSEX&period=D&todt=31/01/2024',
  { headers: { referer: 'https://www.bseindia.com/', origin: 'https://www.bseindia.com' } });

// FBIL
await fetch('https://www.fbil.org.in/wasdm/tbill/fetchfiltered'
  + '?fromDate=2026-08-24&toDate=2026-08-28&authenticated=false',
  { headers: { accept: 'application/json' } });
```

Captured bodies are re-serialised with `JSON.stringify(x, null, 1)` for
readable diffs; no field is added, removed or reordered. `RequestNumber` is a
per-request nonce and differs on every call — it is not part of the observation
and no parser reads it.
