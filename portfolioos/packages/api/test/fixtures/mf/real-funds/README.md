# Real-fund golden fixtures (`02-METRICS.md §10.4`)

Three real schemes, ~13 years of daily NAV each, with **published** 1y/3y/5y
returns, 3-year standard deviation, Sharpe ratio and beta taken from the AMC's
own monthly factsheet PDF. `test/services/mfAnalytics/mfRealFunds.golden.test.ts`
runs `src/services/mfAnalytics/mfMetricsMath.ts` on these series at the
factsheet's as-of date and compares against the AMC's numbers at the doc's
tolerances (returns ±0.05 pp, σ ±0.1 pp, Sharpe ±0.03; beta ±0.03 by analogy,
the doc is silent).

## Why factsheets, and why this is not circular

Every other test of the metric math derives its expected value from the same
formula the code implements. These fixtures are the one place the expected
value comes from a calculation we did not do. The AMC computed its Sharpe from
its own NAV file with its own conventions; we compute ours from MFAPI's copy of
the NAV with the doc's conventions; agreement (or a gap with a nameable cause)
is evidence about the math. Static aggregator pages (Value Research,
Morningstar) render these figures with JavaScript and could not be captured;
AMFI's performance page 404s. Every large AMC prints σ / Sharpe / beta per
scheme in its factsheet with the methodology in a footnote, so that is the
source.

All figures were captured on **2026-09-07**. All three factsheet editions carry
data **as on 31 July 2026**, so `asOf = 2026-07-31` for every scheme.

## Layout

```
real-funds/
  README.md              this file
  <directPlanAmfiCode>/
    nav.json             MFAPI response for the DIRECT plan, byte-for-byte as downloaded
    nav-regular.json     MFAPI response for the REGULAR plan, likewise (see "Which plan")
    benchmark.json       the scheme's benchmark TRI series, dumped from the local feed table
    riskfree.json        FBIL 3M T-bill series, dumped from the local feed table
    published.json       the factsheet's figures + source URL/page/SHA-256 + methodology verbatim
    published.txt        the extracted factsheet text (pdfjs) for the pages the figures came from
```

The PDFs themselves are not committed (4.7–27 MB each). `published.json`
carries the URL and the SHA-256 of the file as captured, so a re-download can
be checked against what was read.

## Provenance chain

| Series | File | Source | Chain |
|---|---|---|---|
| NAV (both plans) | `nav.json`, `nav-regular.json` | `GET https://api.mfapi.in/mf/<amfiCode>` | MFAPI mirrors AMFI's daily NAV file (`NAVAll.txt`). Dates are `DD-MM-YYYY` (day-first). Captured 2026-09-07, series run to 2026-09-04 and are truncated to `asOf` by the test. Scheme identity confirmed from `meta.scheme_code` / `scheme_name` and against the AMFI list served at `https://api.mfapi.in/mf`. |
| Benchmark TRI | `benchmark.json` | local `BenchmarkIndexPrice` table (dev DB `portfolioos-mfdev`, read-only dump) | filled by `src/priceFeeds/nseIndices.v1.ts` from `POST https://www.niftyindices.com/BackPage/getTotalReturnIndexString` (NSE's public historical-data tool, TRI variant). 2,479 rows, 2016-09-06 → 2026-09-04. Not re-fetched for this task; the feed's own capture is the provenance. |
| Risk-free | `riskfree.json` | local `RiskFreeRate` table, series `FBIL_TBILL_3M` (read-only dump) | filled by `src/priceFeeds/fbilTbillCurve.v1.ts` from `GET https://www.fbil.org.in/wasdm/tbill/fetchfiltered?…&authenticated=false`, tenor `3M` — FBIL's secondary-market T-bill par yield, annualised percent. 2,181 rows, 2017-08-23 → 2026-08-28. This is the `TBILL_91D` series `02 §1` prescribes. |
| Published figures | `published.json`, `published.txt` | AMC factsheet PDF | URL, page, SHA-256 per scheme below. Text extracted with `pdfjs-dist` (the same library as `src/lib/pdf.ts`). |

The benchmark fixture is itself validated by the test: the AMC prints its
benchmark's 1y/3y/5y returns, and our TRI series reproduces them to
≤ 0.015 pp for all three indices (tables below). A 10-year benchmark window
needs 2016-07-29 and the TRI capture starts 2016-09-06, so the test asserts
that horizon is reported unavailable rather than computed.

## Which plan the AMC's ratios are on — and why both NAV files exist

The task asked for Direct-plan schemes, and the fixture scheme (directory name,
`nav.json`, `schemeCode`) is the Direct plan. But the AMCs compute their risk
ratios on the **Regular** plan:

- **Mirae** says so in print (p.25 note 1: "The reference and details provided
  here in are of Regular Plan - Growth Option") and prints no Direct-plan
  point-to-point returns at all.
- **HDFC** and **Nippon** do not say. Their printed Sharpe is reproduced to the
  printed precision from the Regular-plan NAV (0.8213 vs 0.821; 0.8356 vs 0.84)
  and misses from the Direct-plan NAV (0.8727; 0.8808) under the same
  convention. That settles it.

Sharpe is the only figure that cares — the plans differ by a near-constant
expense drag, which moves the mean and leaves σ and β essentially unchanged —
but it is the figure the whole exercise is about, so the Regular-plan series
is captured too and the like-for-like comparison is made on it. The Direct-plan
figures are asserted as well because that is the fixture scheme; where a
Direct-plan Sharpe passes, the tables below show it is the sum of two
offsetting differences (the plan gap and the rf gap), not agreement.

## Risk-free rate: the systematic difference

`02 §1` uses the FBIL 3M T-bill series, forward-filled to each month end and
de-annualised geometrically. Over the Aug 2023 – Jul 2026 window that series
averages **6.14 %** (range 5.23 – 7.02 %). All three factsheets instead subtract
a **single spot rate: FBIL Overnight MIBOR as on 31 July 2026 = 5.41 %**
(HDFC and Nippon print the value; Mirae names the source and date only; HDFC's
own market-data page confirms overnight MIBOR at 5.41 on that date). The
0.73 pp gap is worth 0.04 – 0.06 of Sharpe at these volatilities and is the
cause of both Regular-plan doc-convention misses below. A secondary 0.01 comes
from de-annualising rf geometrically (doc) vs arithmetically (÷12, which is
what reproduces HDFC to 3 dp).

## Scheme 1 — Mirae Asset Large Cap Fund (`118825`)

| | |
|---|---|
| Direct plan | AMFI `118825` — Mirae Asset Large Cap Fund - Direct Plan - Growth (ISIN INF769K01AX2 per MFAPI meta); NAV from 2013-01-02 |
| Regular plan | AMFI `107578` — Mirae Asset Large Cap Fund - Regular Plan - Growth; NAV from 2008-04-09 |
| Category | Equity — Large Cap |
| Benchmark | Nifty 100 (TRI) → `NIFTY100_TRI` |
| Factsheet | `https://www.miraeassetmf.co.in/docs/default-source/fachsheet/active-factsheet---august-2026.pdf` — "Active Factsheet, August 2026", every page headed "Monthly Factsheet as on 31 July, 2026". SHA-256 `b7d9969828ff5002c30ab0c6ad14f493a7917fd87bb4d807d98fba4c779101bb`. Ratios p.25, performance p.60, methodology footnote p.84. |
| Methodology (verbatim) | "@The Volatility, Beta, R Squared, Sharpe Ratio & Information Ratio are calculated on returns from last three years Monthly data points." / "# Risk free rate: FBILOVERNIGHTMIBOR as on 31st July 2026" |
| Factsheet rf | Named, value not printed. 5.41 % assumed (the FBIL overnight MIBOR for 31 Jul 2026 quoted by HDFC and Nippon for the same date). |

Comparison (ours from the fixtures at asOf 2026-07-31; deltas are ours − published):

| Figure | Plan / basis | Ours | Published | Δ | Tol | Result |
|---|---|---|---|---|---|---|
| 1y return | Regular | 0.854 % | 0.85 % | +0.004 | ±0.05 | PASS |
| 3y return | Regular | 9.061 % | 9.05 % | +0.011 | ±0.05 | PASS |
| 5y return | Regular | 9.368 % | 9.36 % | +0.008 | ±0.05 | PASS |
| 10y return | Regular | 12.149 % | 12.13 % | +0.019 | ±0.05 | PASS |
| 1y / 3y / 5y | Direct | 1.833 / 10.127 / 10.467 % | not printed | — | — | not asserted |
| 1y return | Nifty 100 TRI | 1.540 % | 1.54 % | 0.000 | ±0.05 | PASS |
| 3y return | Nifty 100 TRI | 10.240 % | 10.23 % | +0.010 | ±0.05 | PASS |
| 5y return | Nifty 100 TRI | 10.933 % | 10.92 % | +0.013 | ±0.05 | PASS |
| σ 3y | Regular | 14.039 % | 14.04 % | −0.001 | ±0.1 | PASS |
| σ 3y | Direct | 14.047 % | 14.04 % | +0.007 | ±0.1 | PASS |
| β 3y | Regular | 0.9526 | 0.93 | +0.023 | ±0.03 | PASS |
| β 3y | Direct | 0.9532 | 0.93 | +0.023 | ±0.03 | PASS |
| Sharpe 3y | Regular, doc convention (T-bill series) | 0.2639 | 0.26 | +0.004 | ±0.03 | PASS |
| Sharpe 3y | Regular, factsheet rf 5.41 % ÷ 12 | 0.3039 | 0.26 | +0.044 | ±0.03 | **FAIL** (`it.fails`) |
| Sharpe 3y | Direct, doc convention | 0.3336 | 0.26 | +0.074 | ±0.03 | **FAIL** (`it.fails`) |

Attribution. Mirae's 0.26 is reproduced by `(CAGR_3y − 5.41 %) / σ` =
(9.061 − 5.41) / 14.039 = **0.2601** — a geometric (CAGR-based) numerator
with the spot MIBOR. The doc's arithmetic numerator `mean(e_m) × 12` with the
same rf gives 0.3039 (the arithmetic mean of 36 monthly returns exceeds the
CAGR by ~0.6 pp here, the usual volatility drag). The doc-convention pass
(0.2639) is therefore partly luck: the T-bill series' higher rf pulls the
arithmetic figure down by about the same amount the geometric numerator would.
It is still recorded as a pass because it is inside the doc's tolerance under
the doc's own convention; the factsheet-rf row is the one that exposes the
numerator difference, and it is `it.fails` with that cause. The Direct-plan
miss is the plan gap: Direct out-earns Regular by ~1.07 pp/yr over this window.

## Scheme 2 — HDFC Flexi Cap Fund (`118955`)

| | |
|---|---|
| Direct plan | AMFI `118955` — HDFC Flexi Cap Fund - Direct Plan - Growth Option (ISIN INF179K01UT0 per MFAPI meta); NAV from 2013-01-01 |
| Regular plan | AMFI `101762` — HDFC Flexi Cap Fund - Regular Plan - Growth Option; NAV from 2006-04-03 |
| Category | Equity — Flexi Cap |
| Benchmark | NIFTY 500 Index (TRI) → `NIFTY500_TRI` |
| Factsheet | `https://files.hdfcfund.com/s3fs-public/2026-08/HDFC%20MF%20Factsheet%20-%20July%202026.pdf` — "HDFC MF Factsheet - July 2026", data as on July 31, 2026. SHA-256 `d5760e7627b7e36848eb71f892cd1e3c0b56c2b206df2affbe06099debce02ea`. Ratios p.7, Regular-plan performance p.8, Direct-plan performance p.115. |
| Methodology (verbatim) | "Computed for the 3-yr period ended July 31, 2026 Based on month-end NAV.* Risk free rate: 5.41% (Source: FIMMDA MIBOR) For schemes which have not completed 3 years, data is computed since inception." |
| Factsheet rf | 5.41 % (printed). HDFC's own market-data table on p.4 lists "MIBOR Overnight Rate (%) Jun-26 5.50, Jul-26 5.41". |

| Figure | Plan / basis | Ours | Published | Δ | Tol | Result |
|---|---|---|---|---|---|---|
| 1y return | Direct | 5.288 % | 5.29 % | −0.002 | ±0.05 | PASS |
| 3y return | Direct | 17.055 % | 17.04 % | +0.015 | ±0.05 | PASS |
| 5y return | Direct | 18.785 % | 18.76 % | +0.025 | ±0.05 | PASS |
| 10y return | Direct | 16.365 % | 16.35 % | +0.015 | ±0.05 | PASS |
| 1y return | Regular | 4.604 % | 4.60 % | +0.004 | ±0.05 | PASS |
| 3y return | Regular | 16.287 % | 16.27 % | +0.017 | ±0.05 | PASS |
| 5y return | Regular | 18.009 % | 17.99 % | +0.019 | ±0.05 | PASS |
| 1y return | Nifty 500 TRI | 3.374 % | 3.37 % | +0.004 | ±0.05 | PASS |
| 3y return | Nifty 500 TRI | 12.302 % | 12.29 % | +0.012 | ±0.05 | PASS |
| 5y return | Nifty 500 TRI | 12.543 % | 12.53 % | +0.013 | ±0.05 | PASS |
| σ 3y | Regular | 12.900 % | 12.899 % | +0.001 | ±0.1 | PASS |
| σ 3y | Direct | 12.905 % | 12.899 % | +0.006 | ±0.1 | PASS |
| β 3y | Regular | 0.8115 | 0.790 | +0.022 | ±0.03 | PASS |
| β 3y | Direct | 0.8118 | 0.790 | +0.022 | ±0.03 | PASS |
| Sharpe 3y | Regular, doc convention (T-bill series) | 0.7778 | 0.821 | −0.043 | ±0.03 | **FAIL** (`it.fails`) |
| Sharpe 3y | Regular, factsheet rf 5.41 % ÷ 12 | 0.8213 | 0.821 | +0.000 | ±0.03 | PASS |
| Sharpe 3y | Direct, doc convention | 0.8291 | 0.821 | +0.008 | ±0.03 | PASS — **offsetting**, see below |

Attribution. With the factsheet's own rf, our `sharpe()` — arithmetic
`mean(e_m) × 12` over sample σ × √12 — reproduces HDFC's 0.821 to three
decimals (0.8213). That is as strong a confirmation of the formula structure as
a factsheet can give. The doc-convention miss is entirely the rf series: 0.73 pp
of rf over σ = 12.9 % is 0.057, less 0.01 for geometric-vs-arithmetic
de-annualisation, net −0.043 observed. The Direct-plan "pass" is
(+0.77 pp plan return) − (+0.73 pp rf) ≈ 0 by coincidence of two unrelated
gaps; it is kept as a plain `it` because it is inside tolerance, and its name
says so.

## Scheme 3 — Nippon India Growth Mid Cap Fund (`118668`)

| | |
|---|---|
| Direct plan | AMFI `118668` — Nippon India Growth Mid Cap Fund - Direct Plan - Growth Option (ISIN INF204K01E54 per MFAPI meta); NAV from 2013-01-02 |
| Regular plan | AMFI `100377` — Nippon India Growth Mid Cap Fund - Regular Plan - Growth Option; NAV from 2006-04-03 |
| Category | Equity — Mid Cap |
| Benchmark | NIFTY Midcap 150 TRI → `NIFTY_MIDCAP150_TRI` |
| Factsheet | `https://mf.nipponindiaim.com/InvestorServices/FactSheetsDocuments/Nippon-FS-AUGUST-2026.pdf` — "Fundamentals", August 2026, details as on July 31, 2026. SHA-256 `87fd536c1df76224cd27c8bdd18eeaa9a229dbe436204aea160e9af9642c29b3`. Ratios p.9, performance (Regular and Direct) p.117. |
| Methodology (verbatim) | "The above measures have been calculated using monthly rolling returns for 36 months period with 5.41% risk free return (FBIL Overnight MIBOR as on 31/07/2026)." |
| Factsheet rf | 5.41 % (printed). |

| Figure | Plan / basis | Ours | Published | Δ | Tol | Result |
|---|---|---|---|---|---|---|
| 1y return | Direct | 10.559 % | 10.56 % | −0.001 | ±0.05 | PASS |
| 3y return | Direct | 21.418 % | 21.40 % | +0.018 | ±0.05 | PASS |
| 5y return | Direct | 19.821 % | 19.80 % | +0.021 | ±0.05 | PASS |
| 1y return | Regular | 9.699 % | 9.70 % | −0.001 | ±0.05 | PASS |
| 3y return | Regular | 20.450 % | 20.43 % | +0.020 | ±0.05 | PASS |
| 5y return | Regular | 18.872 % | 18.85 % | +0.022 | ±0.05 | PASS |
| 1y return | Nifty Midcap 150 TRI | 9.009 % | 9.01 % | −0.001 | ±0.05 | PASS |
| 3y return | Nifty Midcap 150 TRI | 18.545 % | 18.53 % | +0.015 | ±0.05 | PASS |
| 5y return | Nifty Midcap 150 TRI | 17.930 % | 17.91 % | +0.020 | ±0.05 | PASS |
| σ 3y | Regular | 17.813 % | 17.81 % | +0.003 | ±0.1 | PASS |
| σ 3y | Direct | 17.822 % | 17.81 % | +0.012 | ±0.1 | PASS |
| β 3y | Regular | 0.9684 | 0.94 | +0.028 | ±0.03 | PASS (marginal) |
| β 3y | Direct | 0.9689 | 0.94 | +0.029 | ±0.03 | PASS (marginal) |
| Sharpe 3y | Regular, doc convention (T-bill series) | 0.8040 | 0.84 | −0.036 | ±0.03 | **FAIL** (`it.fails`) |
| Sharpe 3y | Regular, factsheet rf 5.41 % ÷ 12 | 0.8356 | 0.84 | −0.004 | ±0.03 | PASS |
| Sharpe 3y | Direct, doc convention | 0.8493 | 0.84 | +0.009 | ±0.03 | PASS — **offsetting**, see HDFC |

Attribution. Same shape as HDFC: the factsheet-rf figure agrees within 0.005,
the doc-convention miss is the rf series (0.73 pp / 17.8 % = 0.041, less
~0.01 for de-annualisation → −0.036 observed), and the Direct-plan pass is the
plan gap (+0.97 pp) cancelling the rf gap. "Monthly rolling returns for 36
months" reads, on the evidence, as plain 36 monthly returns — a genuinely
rolling construction would not reproduce to 0.004.

## Observations that are not misses but are worth knowing

- **Returns and σ agree to well inside tolerance for every row** (max return
  delta 0.025 pp, max σ delta 0.012 pp), across three AMCs whose NAV files and
  our MFAPI copies are independent. The month-end sampling in
  `toMonthEndSeries` (last NAV on or before the calendar month end, stamped
  with the calendar date) and the sample (n − 1) standard deviation × √12 are
  therefore the AMCs' conventions too.
- **Beta runs +0.022 to +0.029 above the published figure for all three
  schemes**, all inside ±0.03 but with the same sign every time. Nothing in
  the fixtures attributes it: sample vs population cancels in a ratio, and
  raw-vs-excess returns move beta by < 0.001 here (both variants computed).
  Candidates are a different TRI vintage at the AMC's data vendor or a
  different alignment of month ends (our benchmark month end is the calendar
  date; a vendor using the fund's last NAV date for both series would drift
  by a day in some months). If a future scheme lands outside ±0.03 on beta,
  look here first rather than at `beta()`.
- **Sharpe numerators differ between AMCs.** HDFC and Nippon use the
  arithmetic annualised mean (the doc's `mean(e_m) × 12`); Mirae's figure is
  reproduced by the 3-year CAGR. Both are "Sharpe ratio" on a factsheet. The
  doc's ±0.03 allowance for "methodology differences" does not cover the
  CAGR-vs-arithmetic gap at this volatility (~0.04), which is why the Mirae
  factsheet-rf row is a declared miss and not a tolerance adjustment.
- **5-year σ and Sharpe** are not published by any of the three AMCs (only the
  3-year figures are printed), so the doc's "3y/5y Sharpe, σ" cannot be
  checked against an independent source at 5y. Only 5-year returns are
  asserted.
- **No bug in `mfMetricsMath.ts` was exposed.** Every miss has a stated
  convention cause and disappears when that one input is aligned; no figure
  disagrees under matched conventions.

## Re-capturing

Do not regenerate these files casually: the whole value is that the published
figures and the NAV series were captured together on one date, against one
factsheet edition. To refresh, capture a new factsheet edition, re-download
NAV, re-dump benchmark and rf, update `published.json` (URL, page, SHA-256,
figures, `asOf`) and re-derive the honesty table in the test from the new
deltas. Network cost of the original capture: 7 MFAPI requests (4 Direct + 3
Regular, one probed and unused), 3 PDFs, 1 AMFI list, 2 download-page fetches.
