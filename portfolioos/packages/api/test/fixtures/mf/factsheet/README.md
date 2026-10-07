# MF factsheet / monthly-portfolio fixtures

## Provenance — read this first

This tree holds **two kinds of fixture**, and the difference matters more than
anything else in this file.

| Kind | File | What it proves |
|---|---|---|
| **REAL capture** | `portfolio-real-2026-07.csv` | That the parser reads what the AMC *actually publishes* |
| **SYNTHETIC** | every other `.csv` and `.txt` | That the parser handles a specific *edge case* (weights-sum failure, truncation, section transitions, TER out of range) |

### The real captures

Each `<amc>/portfolio-real-2026-07.csv` was extracted on **2026-09-07** from a
monthly portfolio disclosure downloaded from that AMC's own website. One equity
scheme per AMC, the full sheet, nothing trimmed — so the weights genuinely sum
to ~100% and the `01 §6` gate is genuinely exercised.

| AMC | Source file | Scheme captured | Where it came from |
|---|---|---|---|
| `sbi` | `all-schemes-monthly-portfolio---as-on-31st-july-2026.xlsx`, sheet `SMEEF` | SBI ESG Exclusionary Strategy Fund | sbimf.com, consolidated workbook (122 sheets) |
| `icici` | `ICICI Prudential Balanced Advantage Fund.xlsx`, sheet `BAF` | ICICI Prudential Balanced Advantage Fund | icicipruamc.com blob store, zip of 146 workbooks |
| `hdfc` | `Monthly HDFC Flexi Cap Fund - 31 July 2026.xlsx`, sheet `HDFCEQ` | HDFC Flexi Cap Fund | files.hdfcfund.com, one workbook per scheme |
| `nippon` | `NIMF-MONTHLY-PORTFOLIO-31-July-26.xls`, sheet `GF` | Nippon India Growth Mid Cap Fund | mf.nipponindiaim.com, consolidated (108 sheets) |
| `kotak` | `ConsolidatedSEBIPortfolioJuly2026.xlsx`, sheet `V3I` | Kotak Nifty200 Value 30 Index Fund | vatseelabs-s3.kotakmf.com, consolidated (119 sheets) |
| `axis` | `Monthly_Portfolio_31_07_2026_b590bc59d9.xlsx`, sheet `AXIS500` | Axis Nifty 500 Index Fund | axismf.com, consolidated (87 sheets) |
| `uti` | `Sebi Exposure as on 31 Jul 2026_final.xlsx`, sheet `exposure`, rows 0–187 | UTI Unit Linked Insurance Plan | utimf.com → CloudFront zip; one sheet, 83 stacked scheme blocks |
| `absl` | `ABSL_Monthly_Portfolio_Report_July 2026.xls`, sheet `BSL95F` | ABSL Equity Hybrid '95 Fund | mutualfund.adityabirlacapital.com, zip of one BIFF8 workbook (106 sheets) |
| `mirae` | `mascf-july2026.xlsx`, sheet `MASCF` | Mirae Asset Small Cap Fund | miraeassetmf.co.in, one workbook per scheme |
| `dsp` | `DSP Equity FOF ISIN Portfolio as on 31 Jul 2026.xlsx`, sheet `Flexi Cap` | DSP Flexi Cap Fund | dspim.com, zip of 2 workbooks (63 + 26 sheets) |

These are **public statutory disclosures** — SEBI requires every AMC to publish
them monthly. They contain no personal data, so they are stored verbatim, with
no anonymisation. Holdings, weights, ISINs and quantities are the real
published numbers as at **31 July 2026**.

They are stored as CSV rather than as the original workbooks because a fixture
nobody can read in a diff is a fixture nobody checks. The conversion applied the
**same extraction rule as production** (`cellToText` in `v1Support.ts`): the
cell's *formatted* value, with percent-formatted cells scaled to a percent
string. See below for why that rule is the whole ballgame.

Exercised by `test/adapters/mfFactsheet/parsers.real.test.ts`.

### The synthetic fixtures

Everything else in this tree is **hand-written**, not scraped: the
`portfolio-equity-normal`, `portfolio-debt-normal`, `portfolio-hybrid-normal`,
`portfolio-weights-sum-fail`, `portfolio-truncated-malformed` CSVs and both
`factsheet-*.txt` files, for all ten AMCs. The schemes, holdings, weights, AUMs,
TERs and manager names are invented.

They exist to pin edge cases that a real file does not conveniently contain (a
snapshot that must be rejected whole; a truncated export; a TER outside the
permitted band). **As of 2026-09-07 they were corrected to carry each AMC's real
column wording and real units** — see "What the real files disproved" below.
Before that they carried assumed wording, and that is precisely how the bug
described in the next section survived 54 passing tests.

---

## What the real files disproved

The synthetic fixtures were written from the same assumptions as the parsers.
So they agreed with the code instead of with the AMCs, and every one passed
while **six of the ten parsers could not read their AMC's file at all**.

### 1. The 100x error: `% to NAV` is stored two incompatible ways

This is the important one. Verified across all ten real workbooks:

| Stored value | Number format | AMCs |
|---|---|---|
| `9.21` | `#,##0.00` | SBI, HDFC, Kotak, UTI |
| `0.0921` | `0.00%` | ICICI Pru, Nippon, Axis, ABSL, Mirae, DSP |

Both mean 9.21% of NAV. Reading the **raw** cell value — which is what
`XLSX.utils.sheet_to_json` returns, and the obvious thing to write — makes the
second group's weights sum to ~1 instead of ~100, so the 97–103% gate rejects
**every file those six AMCs publish**.

The resolution is that the *number format* is exactly the metadata that
disambiguates them: a cell storing a fraction is always marked as a percent
format, because that is the only way Excel renders it as `9.21%` to the human
who published it. Production therefore reads the formatted value, and both
conventions converge. Pinned by
`test/adapters/mfFactsheet/workbookExtraction.test.ts`.

### 2. Units: every one of the ten quotes lakhs

The old fixtures had Kotak in **crore** and Axis in **plain rupees**. Both are
wrong; all ten real files quote lakhs, in five different spellings
(`Rs. in Lakhs`, `Rs. in Lacs`, `Rs.in Lacs`, `Rs. In lakhs`, `Rs. in Lacs.`).

A unit mistake is the one per-AMC fact with **no downstream check behind it** —
weights, which every metric in `02` actually uses, stay correct under it, and
the 97–103% gate still passes. So Kotak shipped a silently 100x-wrong
`marketValue` and Axis a 100,000x-wrong one, and nothing else would have noticed.

### 3. Column wording that was simply invented

- **ABSL** was given a dedicated `Issuer` column. No AMC of the ten publishes
  one. A test asserted the walker preferred that column over
  `deriveIssuer(securityName)` — a capability tested, and passing, against a
  column that does not exist in any file the adapter will ever see.
- **Nippon** `% of AUM` → really `% to NAV`. **Mirae** `% of Net Assets` →
  really `% to Net Assets`. Both were "of" vs "to" differences invented to make
  the ten parsers look meaningfully distinct from one another.
- **ICICI Pru** uses `Company/Issuer/Instrument Name`, not
  `Name of the Instrument`. **SBI** and **ABSL** use
  `Name of the Instrument / Issuer`.
- **SBI**, **UTI** and **DSP** put **rating before industry**
  (`Rating / Industry^`, `RATING/INDUSTRY`, `Rating/Industry`).

### 4. Structural facts no synthetic fixture had

- **ICICI Pru** prints each section's subtotal **on the heading row**
  (`Equity & Equity Related Instruments … 74.72%`), so the "a name and no
  numbers" section rule cannot see it and the weights sum lands near 200%.
  Worse, it uses the *same string* for a heading and for the instruments under
  it (`Government Securities`), so a name-only rule would delete every
  government bond in the fund.
- **UTI** has **no grand-total row at all**, and its footnote block is a
  default-disclosure table whose "Total Amt Due" column lands under the mapped
  `% TO NAV` position. Two defaulted securities were read as holdings weighing
  1,724% and 9,992% of NAV.
- **Kotak** merges its `Name of Instrument` header across columns A:C while the
  values sit in column C, so a plain `row[0]` read returns empty for every
  holding.
- **DSP** glues a *second, unrelated* sector-allocation table to the right of
  the holdings at columns K/L, outrunning the holdings by dozens of rows.
- **SBI**'s as-of cell is an Excel **date serial** (`46234`, format
  `mmmm dd, yyyy`, displaying `July 31, 2026`). Converting that serial to a JS
  `Date` produces local midnight, which in `Asia/Kolkata` is
  `2026-07-30T18:30:00Z` — so an ISO render of it reads **30 July** and files
  every SBI snapshot one day early. Only the publisher's formatted text is
  correct. The first version of the extractor had exactly this bug, and the CSV
  fixtures could not catch it.
- **SBI**, **Mirae** and **ICICI Pru** write empty sections as the literal
  string `NIL` / `Nil` rather than leaving the cells blank.
- **ICICI Pru** puts a footnote glyph (`^`, "less than 0.01% of NAV") *inside*
  the numeric weight column.

### 5. Nothing is a CSV

All ten publish XLS/XLSX, three of them inside a ZIP. The `.v1.ts` fetchers were
written against `fetchText` + `csvToGrid` and could not have read a single real
file regardless of whether their URLs were right.

---

## Layout

```
<amc>/
  portfolio-real-2026-07.csv         REAL capture — see the provenance table
  portfolio-equity-normal.csv        synthetic: equity scheme, weights sum to 100.00
  portfolio-debt-normal.csv          synthetic: issuer, rating, YTM, maturity
  portfolio-hybrid-normal.csv        synthetic: equity + debt + cash in one file
  portfolio-weights-sum-fail.csv     synthetic: weights sum to 80.00 → `weights_sum`
  portfolio-truncated-malformed.csv  synthetic: half a header, no data → `MALFORMED_INPUT`
  factsheet-normal.txt               synthetic: TER / AUM / managers / exit load
  factsheet-ter-out-of-range.txt     synthetic: TER outside 0.01–3.0% → `ter_range`
```

Eight per AMC × ten AMCs, against the repo's floor of five per parser
(`CONTEXT.md §12`).

## What each fixture is for

| Fixture | Pins |
|---|---|
| `portfolio-real-2026-07` | **the real column wording, units, section markers, date format and subtotal placement of that AMC** — header detection, section state, percent scaling, lakh→rupee conversion, and the 97–103% gate against genuine published weights |
| `portfolio-equity-normal` | section state, subtotal skipping, ISIN normalisation, `cashPct` recomputation, negative "Net Receivables" weight |
| `portfolio-debt-normal` | debt classification from section state, rating normalisation across agency prefixes (`CRISIL AAA`, `[ICRA]AAA`, `CARE AA+`, `CRISIL AA- /Stable`, `IND AAA(CE)`, `CARE A1+`), issuer derivation from a coupon-prefixed name, YTM and maturity |
| `portfolio-hybrid-normal` | two subtotal rows and a section transition in one file — the case where losing section state files bonds as shares |
| `portfolio-weights-sum-fail` | the `01 §6` gate; the snapshot must be rejected **whole**, not stored partially |
| `portfolio-truncated-malformed` | a truncated export must be `MALFORMED_INPUT`, never a silently empty snapshot |
| `factsheet-normal` | per-plan TER selection, month-end vs average AUM, manager name + "managing since", exit-load ladder |
| `factsheet-ter-out-of-range` | the `01 §6` TER gate. ICICI's variant uses `0.00%`, which is a *misread column*, not a missing value — SEBI permits no zero-expense scheme, and letting it through would rank that fund first on cost forever |

## The factsheet `.txt` fixtures are still fully synthetic

The ten **factsheet PDFs** were downloaded and inspected on 2026-09-07, but no
real factsheet fixture has been added and the `factsheet-*.txt` files remain
hand-written. The reason is recorded here so nobody assumes otherwise:

- Every AMC's factsheet is a **multi-scheme, multi-column PDF**, and plain text
  extraction runs the columns together. SBI yields `TER1.510.85` for a
  Regular/Direct pair; Mirae yields `38,009.52843,207.9114,455.917` for three
  schemes' AUM. Reliable extraction needs **positional (x/y) parsing**, not the
  line-oriented scanner in `factsText.ts`.
- **UTI** is the worst case: its TER label sits ~140 extracted lines from its
  value, so line-adjacency parsing mis-associates them.
- Several AMCs no longer publish a *Total* Expense Ratio in the factsheet at
  all. ICICI Pru, ABSL, Nippon and HDFC publish only **Base Expense Ratio**;
  DSP explicitly redirects to `dspim.com/ter`; Axis puts TER in a separate
  consolidated annexure.

So `factsText.ts` and its fixtures are **unproven against real factsheets**, and
the `0.01–3.0%` TER gate has only ever been exercised against invented text.
That is the largest remaining gap in this adapter family.

## Adding a fixture

`registry.test.ts` asserts that every registered adapter has a fixture folder
with at least five files. Registering an AMC without fixtures fails the suite —
by design (`CONTEXT.md §12`, "≥5 per parser").

When an AMC changes format, **add a new dated real capture**
(`portfolio-real-YYYY-MM.csv`) and bump that adapter's version rather than
editing an existing capture in place. A capture is evidence of what the AMC
published on a date; editing one destroys the evidence.
