# EMI Calculator, Live Loan Rates and Existing-Loan Checks — Design

Date: 2026-10-12. Status: approved in brainstorming, awaiting written-spec review.

## 1. Goal

A Tools → **EMI Calculator** section where a user can:

1. Plan a new loan with every common parameter (EMI, reverse solving, prepayments, rate changes, fees/APR, offer comparison, tax benefit, export).
2. See live indicative loan rates by loan type and lender, refreshed daily from RBI and bank pages, with an admin page to correct them.
3. Have their existing loans in the app checked against the market: a "Compare with market" card, a refinance alert, and benchmark (repo / MCLR) change alerts for floating loans.

User decisions (brainstorming 2026-10-12): purpose (b) plan new loans **and** check existing loans; calculator features: all eight; rate sources (c) official + top bank pages + admin overrides; existing-loan depth (c) card + refinance alert + fixed/floating flag with benchmark alerts; architecture A (maths in shared, runs in browser; rates on server).

## 2. Delivery

Three plans, each merged separately:

| Plan | Contents | Depends on |
|---|---|---|
| 1. Calculator | shared maths + tests, `/emi` page (Calculate, Compare), shareable URL, PDF/Excel export, nav entry | — |
| 2. Live rates | source discovery against real pages, tables + migration, readers, daily job, admin page, Live rates tab, "Use this rate" | Plan 1 page shell |
| 3. Existing-loan checks | `Loan` rate type/benchmark fields, Compare-with-market card, refinance + benchmark alerts, notification opt-out | Plans 1, 2 |

## 3. Calculator maths — `packages/shared/src/loans/emi.ts`

All money and rates are `Decimal` (decimal.js). No `Number` on money. Pure functions, no I/O; used by the web page and by the API (export, existing-loan savings).

### 3.1 Inputs

```ts
type EmiMode = 'REDUCE_EMI' | 'REDUCE_TENURE';

interface LoanInput {
  principal: Decimal;          // > 0
  annualRatePct: Decimal;      // 0–50
  tenureMonths: number;        // 1–480 (integer count, not money)
  firstEmiDate: string;        // 'YYYY-MM-DD'
  prepayments?: Prepayment[];
  rateChanges?: RateChange[];
  fees?: Fees;
}
interface Prepayment { month: number; amount: Decimal; recurrence: 'ONCE' | 'YEARLY'; mode: EmiMode; }
interface RateChange { fromMonth: number; annualRatePct: Decimal; mode: EmiMode; } // default REDUCE_TENURE = keep EMI, tenure moves
interface Fees { processingFeeKind: 'PCT' | 'AMOUNT'; processingFeeValue: Decimal; gstPct: Decimal /* default 18 */; otherCharges: Decimal; }
```

### 3.2 Rules

- Monthly rate `r = annualRatePct / 1200`. EMI = `P·r·(1+r)^n / ((1+r)^n − 1)`; `r = 0` → `P / n`.
- EMI rounded UP to the next rupee, so the final instalment is never larger than the EMI (rounding down would push up to ~₹150 of residual onto the last instalment over 20 years). Interest per month rounded to the paisa (half-up). The final instalment is adjusted so the closing balance is exactly ₹0.00. Schedule invariant (tested): Σ principal + Σ prepayments = P, and the closing balance reaches exactly 0.00 and is never negative.
- **Reverse — max loan:** given EMI, rate, tenure → `P = EMI·((1+r)^n − 1)/(r·(1+r)^n)`, rounded down to the rupee.
- **Reverse — tenure:** given P, EMI, rate → `n = ceil(log(EMI/(EMI − P·r)) / log(1+r))`. If `EMI ≤ P·r` → error `EMI_TOO_LOW` ("EMI never pays off the loan").
- **Prepayments:** applied after that month's EMI. `REDUCE_EMI` recomputes the EMI over remaining months; `REDUCE_TENURE` keeps EMI and shortens. A prepayment larger than the balance closes the loan (capped, flagged `PREPAYMENT_CAPPED`). Recurring yearly = same month every 12 months until closure.
- **Rate changes:** from the given month, new rate; mode `REDUCE_TENURE` (keep EMI, tenure moves — banks' default) or `REDUCE_EMI` (keep tenure, EMI moves). If a rate rise makes the kept EMI ≤ interest, switch that change to recompute the EMI and flag `NEGATIVE_AMORTISATION_AVOIDED`.
- **APR:** cash flows = `+(P − fee − GST on fee − other charges)` at t0, `−EMI_k` monthly (actual schedule incl. prepayments). Monthly IRR by bisection in Decimal (tolerance 1e-10, max 200 iterations), APR = `((1+irr)^12 − 1)·100`, shown to 2 dp. Also show nominal `irr·1200`.
- **Tax (old regime only; user enters slab % and optionally remaining 80C room):**
  - HOME, self-occupied: interest deduction ≤ ₹2,00,000 per FY (24(b)); principal ≤ remaining 80C room (default ₹1,50,000) under 80C.
  - HOME, let-out: interest fully deductible but loss set-off against other income capped at ₹2,00,000 per FY (excess shown as carried forward, not valued).
  - EDUCATION: interest fully deductible under 80E for the first 8 FYs from the first repayment FY.
  - New regime selected → benefit ₹0 with an explanatory note.
  - Aggregation by Indian FY (Apr–Mar) from schedule dates. Output: deduction and tax saved per FY, total, post-tax cost. Cess 4% applied to slab rate.
- **Comparison:** 2–3 `LoanInput`s → per-offer EMI, total interest, total paid, fees, APR, post-tax cost; flags cheapest by total paid and by post-tax cost.

### 3.3 Outputs

`{ emi, totalInterest, totalPaid, totalFees, aprPct, months, schedule: ScheduleRow[], warnings: string[], tax?: TaxSummary }` where `ScheduleRow = { month, date, opening, emi, interest, principal, prepayment, closing, ratePct }`. All money as `Decimal` in shared code; serialised as strings at the API boundary.

## 4. Calculator page — `/emi`

- Nav: Tools → **EMI Calculator** (lucide icon `Percent`; Tax uses `Calculator`, Bonds uses `Landmark`).
- Tabs: **Calculate**, **Compare**, **Live rates** (Live rates added in Plan 2; in Plan 1 the tab is absent).
- **Calculate:** inputs with sliders (amount, rate, tenure years/months toggle, first EMI date default next month's 5th); mode switch Normal / Max loan / Tenure; "Advanced" collapsible for prepayments, rate changes, fees, tax. Results: EMI, total interest, total paid, APR, principal-vs-interest donut, balance-over-time area chart, schedule grouped by year (expandable to months). Live recompute as the user types (debounced 150 ms).
- **Compare:** 2–3 offer columns (each a compact input set), result table, cheapest highlighted.
- **Shareable URL:** the full input state serialised into the query string (versioned key `v=1`); opening the URL restores it. Nothing stored server-side. Unknown/invalid params ignored with a toast.
- **Export:** PDF and Excel via `POST /api/emi/export` with the input; server recomputes with the same shared maths (never trusts client totals). Excel uses real date cells formatted `dd/mm/yyyy` and numeric money cells; PDF dates dd/mm/yyyy. Rate-limited (10/min/user).
- Validation inline per field (tenure 1–480 months, rate 0–50%, amount > 0 and ≤ ₹100 crore). Responsive at 375 px, no horizontal scroll (schedule table scrolls inside its card).

## 5. Live rates (Plan 2)

### 5.1 Sources

- **RBI:** policy repo rate (daily read of the RBI site; history kept); RBI monthly weighted-average lending rates by sector (monthly read).
- **Lenders (initial):** SBI, HDFC Bank, ICICI Bank, Axis Bank, Kotak, PNB, Bank of Baroda, Canara Bank, Union Bank, LIC Housing Finance. Per loan type: min–max rate and basis (`REPO_LINKED` | `MCLR` | `FIXED` | `OTHER`); per lender: MCLR tenors (overnight, 1M, 3M, 6M, 1Y) where published.
- **Loan types:** HOME, CAR, TWO_WHEELER, PERSONAL, EDUCATION, GOLD, LAP, LAS, BUSINESS.
- **Discovery is Plan 2's first task:** fetch each real page; save it as a fixture; classify each (lender × loan type) as `AUTO` (static HTML parseable) or `MANUAL` (JS-rendered, blocked, PDF-only, or absent). The classification is reported to the user before readers are built. No reader is written against a synthetic page.

### 5.2 Readers — `packages/api/src/services/loanRates/sources/`

- Interface: `{ id, version, url, read(html): RateReading[] }`, one file per source. Each reading carries `sourceAdapter` + `sourceAdapterVer`.
- Fetch: one request per page per day, 15 s timeout, max 2 MB body, plain `User-Agent` naming the app, robots.txt respected (disallowed → MANUAL). URLs come only from the code-defined source list (no user-supplied URLs; SSRF-safe).
- Pages parsed as text/HTML (cheerio or equivalent); never executed.

### 5.3 Data model (global, not user-scoped → no RLS; not in `USER_SCOPED_MODELS`)

```prisma
model LoanRateSource {
  id          String   @id            // e.g. "sbi.home"
  lender      String                  // "SBI"
  loanType    String                  // HOME | CAR | ... | MCLR | REPO
  url         String
  mode        String                  // AUTO | MANUAL
  adapter     String?
  adapterVer  String?
  lastSuccessAt DateTime? @db.Timestamptz(3)
  lastErrorAt   DateTime? @db.Timestamptz(3)
  lastError     String?
  rates       LoanRate[]
}

model LoanRate {
  id          String   @id @default(cuid())
  sourceId    String
  source      LoanRateSource @relation(fields: [sourceId], references: [id])
  basis       String               // REPO_LINKED | MCLR | FIXED | OTHER
  tenor       String?              // MCLR tenor, e.g. "1Y"
  minRatePct  Decimal  @db.Decimal(6,3)
  maxRatePct  Decimal? @db.Decimal(6,3)
  effectiveDate DateTime? @db.Date
  fetchedAt   DateTime @default(now()) @db.Timestamptz(3)
  origin      String               // AUTO | MANUAL
  status      String               // ACTIVE | SUSPECT | REJECTED | SUPERSEDED
  note        String?
  createdById String?              // admin for MANUAL
  @@index([sourceId, status, fetchedAt])
}

model BenchmarkRate {
  id        String   @id @default(cuid())
  kind      String               // REPO | MCLR
  lender    String?              // null for REPO
  tenor     String?
  ratePct   Decimal  @db.Decimal(6,3)
  effectiveDate DateTime @db.Date
  fetchedAt DateTime @default(now()) @db.Timestamptz(3)
  @@unique([kind, lender, tenor, effectiveDate])
}
```

Append-only history: a new reading inserts a row; previous `ACTIVE` AUTO row → `SUPERSEDED` only when the new one is `ACTIVE`.

### 5.4 Daily job — `loanRatesJob.ts`

- 07:30 IST daily, registered in `startupSync.ts`, gated by `ENABLE_LOAN_RATES_CRON` (default on in prod, off in tests). Monthly RBI sector read on the job's first run each month.
- Sanity: rate outside 4–30 %, or |Δ| > 2 percentage points vs the last ACTIVE row → `SUSPECT` (not shown to users; admin reviews).
- Failure: exception or zero readings → `IngestionFailure` row (raw payload truncated to 8 KB, PII-free public page), source `lastError*` updated, other sources continue. Last good rate stays displayed. No successful reading for 7 days → rate shown "stale" and an ops alert to admins (existing ops-alert path).
- **Effective rate per (source, basis, tenor):** latest `MANUAL` `ACTIVE` if one exists (manual wins until cleared), else latest `AUTO` `ACTIVE`.

### 5.5 Admin page — Settings → **Loan rates** (role `ADMIN`, plus the existing admin 2FA / mfa session requirement)

- Per source: mode, last success, last error, current effective rate, latest AUTO reading beside any MANUAL override (highlighted if they differ).
- Actions: set/correct a rate (with note) → MANUAL row; clear override; approve / reject a SUSPECT reading; "Run now" (single source or all; rate-limited).
- Every write → `AuditLog` (`loan_rate_manual_set`, `loan_rate_override_cleared`, `loan_rate_suspect_approved`, `loan_rate_suspect_rejected`, `loan_rate_run_now`).

### 5.6 API

- `GET /api/loan-rates?loanType=HOME` (authenticated): effective rows per lender `{ lender, loanType, basis, minRatePct, maxRatePct, effectiveDate, asOf, stale, sourceUrl }` + `{ repo: { ratePct, effectiveDate, lastChange: { deltaPct, date } } }`. Rates as strings.
- Admin: `GET /api/admin/loan-rates`, `POST /api/admin/loan-rates/:sourceId/manual`, `DELETE /api/admin/loan-rates/:sourceId/manual`, `POST /api/admin/loan-rates/readings/:id/approve|reject`, `POST /api/admin/loan-rates/run`.

### 5.7 Live rates tab

Loan-type filter; table: lender, from–to rate, basis, "as of" (dd/mm/yyyy), stale badge, link to the lender page; best min rate highlighted. Header: RBI repo rate and date of last change. Note: "Indicative. Your rate depends on credit score, loan amount and tenure." Row action **Use this rate** → Calculate tab with that rate (and loan type for tax defaults). Empty state: "Rates not available yet" (calculator unaffected).

## 6. Existing-loan checks (Plan 3)

### 6.1 Schema (additive)

`Loan`: `rateType String @default("UNKNOWN")` (FIXED | FLOATING | UNKNOWN), `rateBenchmark String?` (REPO | MCLR | OTHER), `nextRateResetDate DateTime? @db.Date`. Loan form gains these fields; existing loans start UNKNOWN and the card shows a one-tap "Fixed or floating?" prompt.

Lender matching: `LenderAlias` (code constant, not a table) mapping normalised `Loan.lenderName` to a lender in §5.1 (e.g. "State Bank of India", "SBI" → SBI). Unmatched → repo-only for benchmark display, no MCLR alerts.

Loan-type mapping: `Loan.loanType` HOME→HOME, CAR→CAR, PERSONAL→PERSONAL, EDUCATION→EDUCATION, GOLD→GOLD, LAS→LAS, BUSINESS→BUSINESS, OTHER→none ("No market data").

### 6.2 Compare-with-market card (loan detail page)

- Inputs: outstanding balance and remaining months from the loan's existing schedule; current rate; best current market min rate for the mapped type (ACTIVE, not stale, not suspect); switching costs (default processing 0.5 % of outstanding + ₹10,000 other, editable, not persisted).
- Outputs: new EMI over the same remaining tenure; interest saved net of switching costs; break-even month; "Open in calculator" (prefilled shareable URL).
- Floating loans: current repo (REPO-benchmark) or this lender's MCLR (MCLR-benchmark) and its last change date.

### 6.3 Alerts (daily, after the rates job; existing alerts service + daily digest email)

- **LOAN_REFINANCE:** active loan, `loan.rate − bestMarketMin ≥ 0.50` pp and net saving > ₹0 → "Home loan with HDFC at 9.10%; market from 8.35% — switching could save ≈ ₹3.4 lakh". Dedup key `loan:refi:<loanId>:<YYYY-MM>` (≤ 1 per calendar month).
- **LOAN_BENCHMARK_CHANGE:** new `BenchmarkRate` REPO row with a different rate → for active FLOATING + REPO loans; new MCLR row for the matched lender → for FLOATING + MCLR loans. Text: "RBI cut the repo rate by 0.25% on dd/mm/yyyy — your rate should drop at the next reset (≈ dd/mm/yyyy). Estimated: EMI ≈ ₹X or tenure −N months." Estimates assume full pass-through of the delta. Dedup key `loan:bench:<loanId>:<kind>:<effectiveDate>`.
- UNKNOWN or FIXED loans get no benchmark alerts. Opt-out: Settings → Notifications → "Loan rate alerts" (default on). Managed family members: alerts for their own loans, same rules.
- Job runs per user under the existing alert-job pattern (`runAsUser`/system bypass as the existing alert jobs do). Alert text uses dd/mm/yyyy; metadata keys stay ISO.

## 7. Errors

- Calculator: inline field errors; domain errors `EMI_TOO_LOW`, `PREPAYMENT_CAPPED` (warning), `NEGATIVE_AMORTISATION_AVOIDED` (warning), `INVALID_INPUT` with field.
- API: standard `ApiResponse` envelope and central error codes; money/rates as strings.
- Readers: never crash the job; DLQ via `IngestionFailure`. No silent catch.

## 8. Security

- Rate tables readable by any authenticated user; writes admin-only with mfa session, all audited.
- Reader URLs fixed in code (SSRF-safe); body size cap; no script execution.
- Export endpoint rate-limited; stateless; recomputes server-side.
- No new Railway services; all storage in the existing database. No user data sent to third parties.

## 9. Testing

- Shared maths: EMI against published bank calculator values (≥ 5 cases incl. 0 %), schedule closes at exactly 0.00, reverse solvers round-trip, prepayment both modes, rate changes both modes, negative-amortisation guard, APR against a known IRR, tax per FY incl. caps, new-regime zero, 80E 8-year window, comparison ordering.
- Web: page renders, live recompute, URL round-trip, invalid param toast, compare cheapest flag, 375 px layout check in browser.
- API: export endpoint (PDF/Excel produced, Excel date cells), rate limits.
- Plan 2: ≥ 5 real-page fixtures per AUTO reader with snapshot output; sanity rules; manual-wins; supersede logic; stale after 7 days; admin routes require ADMIN + mfa; audit rows written.
- Plan 3: savings/break-even, type mapping, lender aliasing, refinance threshold + monthly dedup, benchmark dedup, opt-out, UNKNOWN → no benchmark alert.

## 10. Out of scope

Credit-score-based quotes; loan applications / lead generation; NBFCs beyond LIC Housing (addable later via a new source + admin manual mode); in-app balance-transfer offers; new-regime home-loan optimisations beyond showing ₹0.
