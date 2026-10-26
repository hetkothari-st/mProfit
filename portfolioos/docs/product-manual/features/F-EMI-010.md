---
id: F-EMI-010
title: "Daily lender-rate refresh"
module: "EMI Calculator"
status: Live
roles: "Automatic"
settings: []
related: [F-EMI-007, F-LOAN-010, F-LOAN-013]
---

[← EMI Calculator](../modules/emi-calculator.md) · [Index](../INDEX.md)

# Daily lender-rate refresh

`F-EMI-010` · Live · Roles: Automatic

**What it does:** Every day at 07:30 IST the server reads the published loan rates and MCLR of tracked lenders (SBI, HDFC Bank, ICICI Bank, Axis Bank, Kotak, PNB, Bank of Baroda, Canara Bank, Union Bank, LIC Housing Finance) and the RBI repo rate from their public web pages, and keeps the last good rate for each lender and loan type. These feed **Live rates** ([F-EMI-007](F-EMI-007.md)), **Compare with market** ([F-LOAN-010](F-LOAN-010.md)) and the refinance and benchmark alerts ([F-LOAN-013](F-LOAN-013.md)).

**Why it exists:** Inferred from behavior: to give market rates without a paid data feed; readings are sanity-checked so a misread page does not reach users.

**Where to find it:** No page of its own; its result appears on **Tools → EMI Calculator → Live rates** and on loan pages.

**Who can use it:** Automatic for everyone. Administrators can review suspect readings, set manual rates and run it on demand at **Settings → Loan rates** ([D-EMI-001](../dependencies.md#d-emi-001)).

**Steps:** Not applicable — automatic.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None for users. Operators can disable the job with `ENABLE_LOAN_RATES_CRON=false`.

**Results:** New readings are stored; a reading outside 4–30%, a ceiling outside the range, a jump of more than 2 points from the last good reading, or a page date more than 7 days ahead or too old (180 days for MCLR, 400 days for product rates) is kept as suspect and not shown. Failures are logged to the ingestion-failure list owned by the oldest active administrator; sources with no success for 7 days raise one operations alert per day to that administrator.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A lender missing from Live rates | Its page could not be read or the reading was suspect, and there is no earlier good reading | Administrator reviews it on **Settings → Loan rates** |
| **Stale** badge | No successful read in 7 days | Administrator checks the source |

**Limitations:** Many lender/loan-type pairs are not read automatically; they show only when an administrator enters a manual rate. Lender pages can change format at any time.

**How it works:** Runs under a system database context (the rate tables are shared reference data). The source list lives in code and is re-applied on every run; the job fetches each page once (allow-listed, respecting robots.txt), parses it, applies the sanity rules above, then runs the loan checks ([F-LOAN-013](F-LOAN-013.md)). Only one run at a time; overlapping calls are skipped.

**Related features:** [F-EMI-007](F-EMI-007.md), [F-LOAN-010](F-LOAN-010.md), [F-LOAN-013](F-LOAN-013.md), [D-EMI-001](../dependencies.md#d-emi-001).

**Sources:** `packages/api/src/jobs/loanRatesJob.ts:88`, `packages/api/src/jobs/loanRatesJob.ts:136`, `packages/api/src/jobs/loanRatesJob.ts:141`, `packages/api/src/jobs/loanRatesJob.ts:45`, `packages/api/src/services/loans/loanRates/sourceList.ts:30`, `packages/api/src/services/loans/loanRates/sourceList.ts:71`, `packages/api/src/services/loans/loanRates/sanity.ts:5`, `packages/api/src/services/loans/loanRates/sanity.ts:9`, `packages/api/src/services/loans/loanRates/sanity.ts:46`, `packages/api/src/services/loans/loanRates/sanity.ts:73`

**What this area doesn't do**
- It doesn't save calculations to your account; use **Share** or the address bar.
- It doesn't create a loan from a calculation — add the loan on the Loans page.
- It doesn't fetch a personalised offer or your credit score; live rates are public, indicative headline rates.
- The Compare tab doesn't model prepayments or rate changes, and doesn't export.
