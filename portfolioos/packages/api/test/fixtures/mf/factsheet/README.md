# MF factsheet / monthly-portfolio fixtures

## Provenance — read this first

**Every file in this tree is SYNTHETIC.** Nothing here was scraped from, or
copied out of, any AMC's website, factsheet PDF or portfolio workbook. That
covers all **ten** AMC folders — the three added by Task 1.5 (`sbi`, `icici`,
`hdfc`) *and* the seven added by Task 1.6 (`nippon`, `kotak`, `axis`, `uti`,
`absl`, `mirae`, `dsp`). None of the ten was downloaded from anywhere.

They are *synthetic but representative*: hand-written to match the **shape** of
a SEBI-mandated monthly portfolio disclosure and a scheme factsheet — the
column set, the section headings, the subtotal/grand-total rows, the Indian
number grouping, the way the Industry/Rating column does double duty for equity
and debt, and the several ways a credit rating gets written. The specific
schemes, holdings, weights, AUMs, TERs and manager names are invented. Any
resemblance to a real fund's actual portfolio is coincidental and meaningless.

**Consequence:** these fixtures pin the *parsers'* behaviour, not the AMCs'
formats. They prove that given input of the documented shape the parser
produces the documented output. They do **not** prove that the real files have
that shape. The assumed shape is written out at the top of each
`src/adapters/mfFactsheet/<amc>.parse.ts`, and the URLs in each `<amc>.v1.ts`
are marked `UNVERIFIED` for the same reason. Before enabling any of these
adapters against a live site, download one real file per AMC, diff it against
the assumed shape, and either confirm it or add a real (anonymised) fixture and
bump the adapter version.

## Layout

```
<amc>/
  portfolio-equity-normal.csv        equity scheme, weights sum to 100.00
  portfolio-debt-normal.csv          debt scheme: issuer, rating, YTM, maturity
  portfolio-hybrid-normal.csv        equity + debt + cash in one disclosure
  portfolio-weights-sum-fail.csv     weights sum to 80.00 → rejected, `weights_sum`
  portfolio-truncated-malformed.csv  preamble + half a header, no data → `MALFORMED_INPUT`
  factsheet-normal.txt               TER / AUM / managers / exit load / riskometer
  factsheet-ter-out-of-range.txt     TER outside 0.01–3.0% → rejected, `ter_range`
```

Seven per AMC × ten AMCs, against the repo's floor of five per parser
(`CONTEXT.md §12`).

## What each fixture is for

| Fixture | Pins |
|---|---|
| `portfolio-equity-normal` | header detection, section state, subtotal skipping, lakh→rupee conversion, ISIN normalisation, `cashPct` recomputation, negative "Net Receivables" weight |
| `portfolio-debt-normal` | debt classification from section state, rating normalisation across agency prefixes (`CRISIL AAA`, `[ICRA]AAA`, `CARE AA+`, `CRISIL AA- /Stable`, `IND AAA(CE)`, `CARE A1+`), issuer derivation from a coupon-prefixed name, YTM and maturity columns |
| `portfolio-hybrid-normal` | two subtotal rows and a section transition inside one file — the case where losing section state silently files bonds as shares |
| `portfolio-weights-sum-fail` | the `01 §6` 97–103% gate; the snapshot must be rejected **whole**, not stored partially |
| `portfolio-truncated-malformed` | a truncated export must be `MALFORMED_INPUT`, never a silently empty snapshot |
| `factsheet-normal` | per-plan TER selection, month-end vs average AUM, manager name + "managing since" date, exit-load ladder parsing |
| `factsheet-ter-out-of-range` | the `01 §6` TER gate. ICICI's variant uses `0.00%`, which is a *misread column*, not a missing value — SEBI permits no zero-expense scheme, and letting it through would rank that fund first on cost forever |

## Deliberate per-AMC differences

The ten AMCs' files are not copies with the names swapped. Each carries the
wording its parser is written against, which is the whole reason there are ten
parsers rather than one.

### The three from Task 1.5

- **SBI** — `% to AUM`, `Market value (Rs. in Lakhs)`, `Industry/Rating`,
  `Total Expense Ratio: Regular Plan 1.45% | Direct Plan 0.75%`.
- **ICICI Pru** — `% to Nav`, `Exposure/Market Value(Rs.Lakh)`, a caret-decorated
  `Industry^/Rating`, a section heading containing a comma (`Cash, Cash
  Equivalents and Net Current Assets` — which is why the CSV reader has to
  honour quoting), two managers in one clause, a window-first exit load
  (`Upto 1 Year from allotment - 1% of applicable NAV`), and the TER trap:
  `Other than Direct 1.51% | Direct 0.86%`, where a naive `/Direct ([\d.]+)%/`
  reports the regular plan's TER as the direct plan's.
- **HDFC** — `% to NAV`, `Market/Fair Value (Rs. in Lacs)` (note "Lacs"), a
  `+`-decorated `Industry+ / Rating`, a `¤` footnote marker on the fund-manager
  label, and month-name dates (`March 31, 2026`) rather than `31-Mar-2026`.

### The seven added by Task 1.6

Same rule: each carries the wording, units and date format its own parser is
written against. The table is the quickest way to see why ten parsers exist
rather than one.

| AMC | weight column | market-value column | portfolio as-of | TER wording | exit load | other |
|---|---|---|---|---|---|---|
| `nippon` | `% of AUM` — "**of**", not "to" | `Market/Fair Value (Rs. in Lacs)` — **lakh** | `31-Mar-2026` | `TER (Regular / Direct): 1.62% / 0.78%` — one line, **no plan token beside the direct number** | percent-first, 365 days | manager clause uses "Managing this fund since" |
| `kotak` | `% to Net Assets` | `Market Value (Rs. in Crore)` — **crore** | `31/03/2026` (**numeric, day-first**) | `Regular Plan: 1.72% ; Direct Plan: 0.62%` | **window-first**, "within 1 year … - 1%" | month-end AUM vs `AAUM (Monthly Average)` on the same page |
| `axis` | `% to NAV` | `Market Value (Rs.)` — **plain rupees, no scaling** | `March 31, 2026` (month-name, **comma → quoted CSV cell**) | `Expense Ratio:` — **not** "Total Expense Ratio" | percent-first, 365 days | two managers joined by "and" |
| `uti` | `% to NAV` | `Market/Fair Value (Rs. In Lakhs)` — lakh | `31-03-2026` (numeric, day-first) | `Total Expense Ratio (TER) : Regular: 1.29% Direct: 0.99%` | window-first, **12 months → `daysUpTo: 360`** | AUM labelled `Fund Size (AUM) as on …`; manager date introduced by `w.e.f.` |
| `absl` | `% to Net Assets` | `Market Value (Rs. in Lacs)` — lakh | `31-Mar-2026` | `Total Expense Ratio (TER) Regular 1.85% Direct 0.95%` (no colon, no separator) | window-first, 365 days | the **only** AMC with a disclosed `Issuer` column, and its industry header is reversed: `Rating / Industry` |
| `mirae` | `% of Net Assets` — "**of**", and not a prefix of `to net assets` | `Market Value (Rs. Lakh)` — lakh | `March 31, 2026` (quoted cell) | `Expense Ratio: Regular Plan – 1.55% \| Direct Plan – 0.54%` (**en dash**) | percent-first, 365 days | `ISIN Code`, `Quantity/Units`, and `Risk-o-meter` rather than `Riskometer` |
| `dsp` | `% to Net Assets` | `Market Value (Rs. in Lakh)` — lakh | `31-Mar-2026` | `Total Expense Ratio: 1.71% (Regular) / 0.71% (Direct)` — **number before the plan label** | percent-first, **12 months → `daysUpTo: 360`** | name header is `Name of Instrument`, without "the" |

All seven equity fixtures hold the *same* economic position — HDFC Bank at
₹23.4567 crore — written in each AMC's own units, so `parsers.remaining.test.ts`
asserts the identical `234567000` for all of them. That is deliberate: the
market-value unit is the one per-AMC fact with **no** downstream check behind
it. Weights, which every metric in `02` actually uses, stay correct under a unit
mistake, and the 97–103% gate still passes at 100.00% — so a lakh/crore mix-up
would ship a silently ×100-wrong `marketValue` and nothing else would notice.

## Adding a fixture

`registry.test.ts` asserts that every registered adapter has a fixture folder
with at least five files. Registering an AMC without fixtures fails the suite —
by design (`CONTEXT.md §12`, "≥5 per parser").
