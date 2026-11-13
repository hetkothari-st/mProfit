# EMI Calculator - Plan 3 (Existing-loan checks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check the user's existing loans against the live market: a fixed/floating flag and benchmark on every loan, a **Compare with market** card on the loan page (savings net of switching costs, break-even month, "Open in calculator"), and two daily alerts - **LOAN_REFINANCE** and **LOAN_BENCHMARK_CHANGE** - with a Settings opt-out.

**Architecture:** The comparison maths is one pure shared module (`packages/shared/src/loans/loanChecks.ts`, built on Plan 1's `buildEmiSchedule` / `emiFor` / `tenureForEmi`) used by both the web card and the API job, so the card and the alert can never disagree. The API adds three additive `Loan` columns, a `User.loanRateAlerts` flag and two `AlertType` values; `GET /api/loans/:id/market-check` returns the loan's position (from its own schedule), the best non-stale market rate (Plan 2's `listLoanRates`) and its benchmark series (Plan 2's `BenchmarkRate`). A daily job, chained right after Plan 2's rates job, finds benchmark changes once under `runAsSystem`, then checks each eligible user's loans under `runAsUser` and writes deduplicated alerts.

**Tech Stack:** decimal.js, Prisma 5 + PostgreSQL (RLS), node-cron, Express + zod, vitest, React 18 + @tanstack/react-query + shadcn-style UI.

**Spec:** `portfolioos/docs/superpowers/specs/2026-10-12-emi-calculator-design.md` (§6 Existing-loan checks; §2 delivery table; §7-§9 rows for Plan 3). Plan 1 (`2026-10-12-emi-calculator-01-calculator.md`) supplies the shared loan maths and the `/emi` share-URL codec; Plan 2 (`2026-10-12-emi-calculator-02-live-rates.md`, including its final fix wave: `repoSummary` skips zero deltas, `recordReading` returns `UNCHANGED_SUSPECT`, the job is registered in `src/index.ts`) supplies the rate tables, `listLoanRates`, `BenchmarkRate` and `runLoanRatesJob`.

## Global Constraints

- Scope is spec §6 only. Plan 1's maths and Plan 2's rate pipeline are reused, not changed, except: `computeLoanSummary` gains an optional `asOf` date, and the 07:30 IST cron callback in `loanRatesJob.ts` runs the loan checks after the rates job.
- Schema changes are additive: `Loan.rateType String @default("UNKNOWN")` (FIXED | FLOATING | UNKNOWN), `Loan.rateBenchmark String?` (REPO | MCLR | OTHER), `Loan.nextRateResetDate DateTime? @db.Date`, `User.loanRateAlerts Boolean @default(true)`, `AlertType` += `LOAN_REFINANCE`, `LOAN_BENCHMARK_CHANGE`. No column is dropped or rewritten; existing loans start `UNKNOWN`.
- `Loan` is user-scoped and stays in `USER_SCOPED_MODELS`; its existing RLS policy covers the new columns. No new GRANT: the table-level grants to `portfolioos_app` cover added columns (asserted by a test in Task 2).
- Migration: only against the isolated local DB with BOTH overrides, `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split`, from `portfolioos/packages/api`. Never use `packages/api/.env`. The SQL is hand-written (the local DB may carry unrelated drift, so `migrate diff` output is only a cross-check, never pasted whole) and applied with `prisma migrate deploy`. No production migration in this plan.
- API tests run with `DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false`. Suites that write loan rates clear the three rate tables (`clearLoanRateTables`) before and after.
- Money and rates are `Decimal` (decimal.js, imported from `@everypaisa/shared` in new code) and decimal **strings** on the wire (`"8.35"`, `"3000000.00"`). Never `Number`/`parseFloat` on money or a rate.
- Refinance alert: ACTIVE loan, mapped loan type has a market rate, `loan.interestRate - bestMarketMin >= 0.50` pp, and net saving (after default switching costs) `> ₹0`. Dedup key `loan:refi:<loanId>:<YYYY-MM>` (IST month): at most one per loan per calendar month.
- Benchmark alert: a new `BenchmarkRate` row whose rate differs from the previous row of its series -> FLOATING + REPO loans (repo) or FLOATING + MCLR loans whose lender matches (MCLR, 1-year tenor). Dedup key `loan:bench:<loanId>:<kind>:<effectiveDate>`. UNKNOWN and FIXED loans never get benchmark alerts.
- Opt-out: Settings -> Notifications -> "Loan rate alerts", default on, stored per user (a managed family profile has its own flag). Off = no LOAN_REFINANCE / LOAN_BENCHMARK_CHANGE alerts for that user; the card still shows.
- Alert text shows dates as dd/mm/yyyy (`formatDateOnly`); metadata keys and dates stay ISO (`YYYY-MM`, `YYYY-MM-DD`). New code strings use plain `-` (no en/em dash, no Unicode minus).
- Jobs: the daily checks run under `runAsSystem` only to read global data and list users, and under `runAsUser(userId)` for that user's loans and alerts. No new Railway service, table or external call; nothing is sent to third parties.
- Web tests: vitest with `// @vitest-environment jsdom`, `afterEach(cleanup)`, plain assertions (no jest-dom).
- Commits: Conventional Commits, each ending with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push. Check every changed text file with `iconv -f UTF-8 -t UTF-8 <file> >/dev/null`.

## Rulings made while writing this plan

1. **No daily digest email.** The spec says alerts go out through "the existing alerts service + daily digest email". The codebase has no general alert digest email (only the Split activity/weekly digests). Alerts land in the existing in-app channels (Alerts page, header bell, dashboard). Building an alert email is out of scope; listed under spec conflicts.
2. **Opt-out storage.** A real column `User.loanRateAlerts` (default `true`), not a key in `User.preferences`: the sidebar preferences endpoint overwrites that JSON wholesale, which would silently re-enable alerts. API: `GET/PUT /api/notifications/preferences` `{ loanRateAlerts: boolean }`. `/api/notifications` is not an account route, so a manager acting for a managed profile (`X-Act-As`) reads and sets that profile's flag.
3. **Alert types** are two new `AlertType` enum values (`ALTER TYPE ... ADD VALUE`, the pattern `20260421125959_loans_credit_cards` used), shown on the Alerts page as "Loan refinance" and "Loan rate change"; dashboard links go to `/loans`.
4. **Market rate** = the lowest `minRatePct` among `listLoanRates(type)` rows that are not stale (ACTIVE effective rows; SUSPECT never reaches that list). Any lender counts, including the user's own (a rate conversion with the same bank is a valid switch).
5. **Savings maths.** Outstanding balance, remaining months and next EMI date come from the loan's own schedule (`computeLoanSummary`). Both sides are amortised over the same remaining months; gross saving = interest at the current rate - interest at the market rate; net = gross - switching costs; break-even = first month in which the cumulative EMI difference reaches the switching costs (null when net <= 0). Switching costs default to 0.5 % of outstanding (no GST added) + ₹10,000, editable on the card, never persisted. The calculator link carries them as a 0.5 % processing fee with GST 0 % plus other charges.
6. **MCLR series** is the lender's 1-year MCLR (`tenor '1Y'`), the tenor most retail floating loans are linked to.
7. **What counts as a benchmark change:** a `BenchmarkRate` row fetched in the last 7 days whose previous row in the same series has a different rate. A loan created after the change was fetched gets no alert for it (its entered rate is assumed to reflect it). The 7-day window lets a missed day catch up; the dedup key stops repeats.
8. **Next reset date in alert text:** the stored `nextRateResetDate` rolled forward in steps of 3 months (REPO) or 12 months (MCLR) until it is on or after the later of the change date and today. Unset -> the text says "at the next reset" without a date.
9. **Estimates** assume full pass-through of the delta: new EMI over the same remaining months, or (keeping the EMI) the tenure change from `tenureForEmi`; when the kept EMI would no longer cover interest the tenure part is omitted.
10. **Who is checked:** active users, not scheduled for deletion, with `loanRateAlerts = true`, excluding CA-owned shadow clients (`isShadowClient` with no `managedById`); managed family profiles (`isShadowClient` with `managedById`) are included and get alerts on their own loans. Only `status = 'ACTIVE'` loans. Refinance alerts apply to every rate type; benchmark alerts only to FLOATING.
11. **Scheduling.** `startLoanRatesJob`'s cron now calls `runDailyLoanJobs`: rates job, then loan checks, and the checks still run if the rates step throws. Admin "Run now" does not trigger checks. Disabled with the rates cron (`ENABLE_LOAN_RATES_CRON=false`). The checks are single-flight.
12. **Rate fields validation.** A benchmark or reset date on a loan that is not FLOATING is refused (422 `VALIDATION_ERROR`); switching a loan to FIXED or UNKNOWN clears both.
13. **Where the mappings live.** The loan-type -> market-type mapping and the vocabulary are in shared (the card needs "No market data"); the lender alias map is API-only (`services/loanChecks/lenderAlias.ts`), exact match after normalisation so "PNB Housing Finance" never matches PNB. Canonical names equal Plan 2's `LoanRateSource.lender` values.
14. **Card scope.** Shown only for ACTIVE loans. "Open in calculator" appears when 1-480 months remain (the calculator's tenure limit). The card does not refetch on payment changes beyond react-query's normal refetch on mount/focus.

## Review Focus

1. **A loan with past EMIs, payments or prepayments** -> the card and the alert must use the outstanding balance and remaining months from the loan's own schedule, not principal and tenure. Test in Task 4 (`uses the loan's own schedule`).
2. **Market data that is stale or only SUSPECT** -> no refinance alert and the card says market rates are not available, never a misleading saving. Tests in Task 4 (`market is null when only stale or suspect rates exist`) and Task 8 (Kotak's stale 7.70 % is ignored).
3. **Lender names typed many ways** ("State Bank of India Ltd.", "HDFC LTD", "kotak mahindra bank") must match, and look-alikes ("PNB Housing Finance", "ICICI Home Finance", "Can Fin Homes") must not. Test in Task 3.
4. **A loan added after a repo cut** must not be told "your rate should drop" for a cut its entered rate already reflects. Test in Task 8 (loan E).
5. **The job running twice in a day, then again next month** -> no duplicates the same day; next month one new refinance alert per loan and no repeated benchmark alert. Test in Task 8.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/loans/loanChecks.ts` | Rate-type vocabulary, loan-type mapping, switching costs, `compareWithMarket`, `passThroughEstimate`, `nextResetOnOrAfter`, `approxInr`, wire types |
| `packages/api/prisma/schema.prisma` + `migrations/20261013090000_loan_rate_checks/` | Loan columns, `User.loanRateAlerts`, two `AlertType` values |
| `packages/api/src/services/loans.service.ts` | `resolveRateFields`, create/update carry the new columns, `computeLoanSummary(loan, asOf?)` |
| `packages/api/src/controllers/loans.controller.ts`, `routes/loans.routes.ts` | zod for the new fields; `GET /api/loans/:id/market-check` |
| `packages/api/src/services/loanChecks/lenderAlias.ts` | `canonicalLender` (code-constant alias map) |
| `packages/api/src/services/loanChecks/marketCheck.service.ts` | `loanPosition`, `bestMarketRate`, `benchmarkTarget`, `benchmarkSummary`, `getLoanMarketCheck` |
| `packages/api/src/services/loanChecks/loanAlertText.ts` | Alert titles and descriptions (pure) |
| `packages/api/src/services/loanChecks/loanAlerts.service.ts` | `findBenchmarkChanges`, `eligibleUserIds`, `checkUserLoans` |
| `packages/api/src/jobs/loanChecksJob.ts` | `runLoanChecks`, `runLoanChecksJob` |
| `packages/api/src/jobs/loanRatesJob.ts` | `runDailyLoanJobs`; cron calls it |
| `packages/api/src/services/notifications/alertPrefs.service.ts`, `controllers/alertPrefs.controller.ts` | Loan-rate-alert opt-out |
| `apps/web/src/api/loans.api.ts` | Loan DTO fields, `getMarketCheck` |
| `apps/web/src/pages/loans/LoanRateFields.tsx` | Rate type / benchmark / next reset inputs used by the add and edit dialogs |
| `apps/web/src/pages/loans/marketCheck.ts`, `MarketCheckCard.tsx` | Card model, calculator link, benchmark line; the card |
| `apps/web/src/api/notifications.api.ts`, `pages/settings/LoanRateAlertsCard.tsx` | Opt-out toggle |
| `apps/web/src/api/alerts.api.ts`, `pages/alerts/AlertsPage.tsx`, `pages/dashboard/DashboardPage.tsx` | Labels and links for the two alert types |

## Execution waves (tasks in one wave touch disjoint files and may run in parallel)

| Wave | Tasks | Needs |
|---|---|---|
| 1 | Task 1 (shared maths), Task 3 (lender aliases) | - |
| 2 | Task 2 (schema + loan fields API), Task 6 (web loan form fields), Task 7 (web opt-out card + alert labels) | Task 1 |
| 3 | Task 4 (market-check API), Task 5 (opt-out API) | Tasks 1-3 |
| 4 | Task 8 (alerts + daily job), Task 9 (web Compare-with-market card) | Task 8: 1-4; Task 9: 1, 6 |
| 5 | Task 10 (full verification + browser check) | all |

Rebuild shared (`cd portfolioos && pnpm --filter @everypaisa/shared build`) after Task 1 and Task 2 land, and run `npx prisma generate` in `packages/api` after Task 2, before trusting any later type error.

---
### Task 1: Shared loan-check maths and vocabulary

**Wave 1** (parallel with Task 3).

**Files:**
- Create: `packages/shared/src/loans/loanChecks.ts`
- Modify: `packages/shared/src/loans/index.ts` (add `export * from './loanChecks.js';`)
- Test: `packages/shared/src/loans/loanChecks.test.ts`

**Interfaces:**
- Consumes (Plan 1): `buildEmiSchedule(input: LoanInput): ScheduleResult`, `emiFor(principal, ratePct, months): Decimal`, `tenureForEmi(principal, emi, ratePct): number` (throws `EmiError('EMI_TOO_LOW')`), `addMonthsIso(iso, months)` from `./emiDates.js`; (Plan 2) `type RateLoanType`.
- Produces (exported from `@everypaisa/shared`):
  - `LOAN_RATE_TYPES = ['FIXED','FLOATING','UNKNOWN'] as const`, `type LoanRateType`, `LOAN_RATE_TYPE_LABELS: Record<LoanRateType, string>`
  - `LOAN_RATE_BENCHMARKS = ['REPO','MCLR','OTHER'] as const`, `type LoanRateBenchmark`, `LOAN_RATE_BENCHMARK_LABELS: Record<LoanRateBenchmark, string>`
  - `type BenchmarkKind = 'REPO' | 'MCLR'`, `MCLR_BENCHMARK_TENOR = '1Y'`, `BENCHMARK_RESET_STEP_MONTHS: { REPO: 3; MCLR: 12 }`
  - `rateLoanTypeForLoan(loanType: string): RateLoanType | null`
  - `REFINANCE_MIN_GAP_PP: Decimal` (0.50), `DEFAULT_SWITCHING_COSTS = { processingPct: '0.5', otherCharges: '10000' }`
  - `switchingCost(outstanding: Decimal, processingPct: Decimal, otherCharges: Decimal): Decimal`
  - `interface MarketComparisonInput { outstanding: Decimal; remainingMonths: number; currentRatePct: Decimal; marketRatePct: Decimal; switchingCost: Decimal }`
  - `interface MarketComparison { currentEmi; newEmi; currentInterest; newInterest; grossSaving; switchingCost; netSaving: Decimal; breakEvenMonth: number | null }`
  - `compareWithMarket(input: MarketComparisonInput): MarketComparison | null` (null when remaining < 1 or outstanding <= 0)
  - `interface PassThroughEstimate { newRatePct: Decimal; currentEmi: Decimal; newEmi: Decimal; tenureDeltaMonths: number | null }`
  - `passThroughEstimate(input: { outstanding: Decimal; remainingMonths: number; currentRatePct: Decimal; deltaPct: Decimal }): PassThroughEstimate | null`
  - `nextResetOnOrAfter(stored: string | null, from: string, kind: BenchmarkKind): string | null`
  - `approxInr(amount: Decimal): string` ("₹2.1 lakh", "₹1.3 crore", "₹45,000")
  - wire types `MarketRateWire`, `BenchmarkSummaryWire`, `LoanMarketCheckWire`, `LoanAlertPrefsWire` (full text below)

- [ ] **Step 1: Write the failing test**

`packages/shared/src/loans/loanChecks.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import {
  approxInr, compareWithMarket, nextResetOnOrAfter, passThroughEstimate, rateLoanTypeForLoan, switchingCost,
  DEFAULT_SWITCHING_COSTS, REFINANCE_MIN_GAP_PP,
} from './loanChecks.js';

const D = (v: string | number) => new Decimal(v);

describe('rateLoanTypeForLoan (spec s6.1)', () => {
  it.each([
    ['HOME', 'HOME'], ['CAR', 'CAR'], ['PERSONAL', 'PERSONAL'], ['EDUCATION', 'EDUCATION'],
    ['GOLD', 'GOLD'], ['LAS', 'LAS'], ['BUSINESS', 'BUSINESS'],
  ])('%s -> %s', (loanType, want) => expect(rateLoanTypeForLoan(loanType)).toBe(want));
  it.each(['OTHER', '', 'toString', 'home', 'LAP'])('%j has no market data', (loanType) => {
    expect(rateLoanTypeForLoan(loanType)).toBeNull();
  });
});

describe('switching costs', () => {
  it('defaults to 0.5 % of outstanding plus Rs 10,000', () => {
    const cost = switchingCost(D(3000000), D(DEFAULT_SWITCHING_COSTS.processingPct), D(DEFAULT_SWITCHING_COSTS.otherCharges));
    expect(cost.toFixed(2)).toBe('25000.00');
  });
  it('rounds to the paisa', () => expect(switchingCost(D('123456.78'), D('0.5'), D(0)).toFixed(2)).toBe('617.28'));
  it('the refinance gap is 0.50 pp', () => expect(REFINANCE_MIN_GAP_PP.toFixed(2)).toBe('0.50'));
});

describe('compareWithMarket', () => {
  const base = { outstanding: D(3000000), remainingMonths: 180, currentRatePct: D('9.10'), marketRatePct: D('8.35') };

  it('same remaining tenure at both rates: EMI, interest, net saving and break-even', () => {
    const r = compareWithMarket({ ...base, switchingCost: D(25000) })!;
    expect(r.currentEmi.toFixed(0)).toBe('30607');
    expect(r.newEmi.toFixed(0)).toBe('29280');
    expect(r.currentInterest.toFixed(2)).toBe('2509153.08');
    expect(r.newInterest.toFixed(2)).toBe('2270044.38');
    expect(r.grossSaving.toFixed(2)).toBe('239108.70');
    expect(r.netSaving.toFixed(2)).toBe('214108.70');
    // 25,000 / 1,327 a month -> paid back during month 19.
    expect(r.breakEvenMonth).toBe(19);
  });

  it('no switching costs -> break-even in month 1', () => {
    const r = compareWithMarket({ ...base, switchingCost: D(0) })!;
    expect(r.netSaving.toFixed(2)).toBe('239108.70');
    expect(r.breakEvenMonth).toBe(1);
  });

  it('costs larger than the saving -> negative net, no break-even', () => {
    const r = compareWithMarket({ outstanding: D(200000), remainingMonths: 12, currentRatePct: D('9.00'), marketRatePct: D('8.50'), switchingCost: D(11000) })!;
    expect(r.grossSaving.toFixed(2)).toBe('555.74');
    expect(r.netSaving.toFixed(2)).toBe('-10444.26');
    expect(r.breakEvenMonth).toBeNull();
  });

  it('a market rate above the current rate is a loss, not a saving', () => {
    const r = compareWithMarket({ ...base, currentRatePct: D('8.35'), marketRatePct: D('9.10'), switchingCost: D(25000) })!;
    expect(r.grossSaving.toFixed(2)).toBe('-239108.70');
    expect(r.breakEvenMonth).toBeNull();
  });

  it('nothing left to compare -> null', () => {
    expect(compareWithMarket({ ...base, remainingMonths: 0, switchingCost: D(0) })).toBeNull();
    expect(compareWithMarket({ ...base, outstanding: D(0), switchingCost: D(0) })).toBeNull();
    expect(compareWithMarket({ ...base, remainingMonths: 1.5, switchingCost: D(0) })).toBeNull();
  });
});

describe('passThroughEstimate (full pass-through of a benchmark change)', () => {
  it('a 0.25 cut: lower EMI over the same months, or 5 months fewer at the same EMI', () => {
    const e = passThroughEstimate({ outstanding: D(3000000), remainingMonths: 180, currentRatePct: D('8.50'), deltaPct: D('-0.25') })!;
    expect(e.currentEmi.toFixed(0)).toBe('29543');
    expect(e.newRatePct.toFixed(2)).toBe('8.25');
    expect(e.newEmi.toFixed(0)).toBe('29105');
    expect(e.tenureDeltaMonths).toBe(-5);
  });
  it('a 0.25 rise: higher EMI, or 6 more months', () => {
    const e = passThroughEstimate({ outstanding: D(3000000), remainingMonths: 180, currentRatePct: D('8.50'), deltaPct: D('0.25') })!;
    expect(e.newEmi.toFixed(0)).toBe('29984');
    expect(e.tenureDeltaMonths).toBe(6);
  });
  it('a rise the old EMI can no longer cover -> no tenure estimate', () => {
    const e = passThroughEstimate({ outstanding: D(3000000), remainingMonths: 360, currentRatePct: D('8.50'), deltaPct: D('3') })!;
    expect(e.tenureDeltaMonths).toBeNull();
    expect(e.newEmi.toFixed(0)).toBe('29709');
  });
  it('the rate never goes below zero', () => {
    const e = passThroughEstimate({ outstanding: D(120000), remainingMonths: 12, currentRatePct: D('0.10'), deltaPct: D('-0.50') })!;
    expect(e.newRatePct.toFixed(2)).toBe('0.00');
  });
  it('nothing outstanding -> null', () => {
    expect(passThroughEstimate({ outstanding: D(0), remainingMonths: 12, currentRatePct: D('8'), deltaPct: D('-0.25') })).toBeNull();
  });
});

describe('nextResetOnOrAfter', () => {
  it('rolls a past repo reset forward in 3-month steps', () => {
    expect(nextResetOnOrAfter('2026-07-01', '2026-10-12', 'REPO')).toBe('2027-01-01');
  });
  it('rolls a past MCLR reset forward in 12-month steps', () => {
    expect(nextResetOnOrAfter('2025-04-01', '2026-10-08', 'MCLR')).toBe('2027-04-01');
  });
  it('keeps a future date and a same-day date', () => {
    expect(nextResetOnOrAfter('2027-01-01', '2026-10-08', 'MCLR')).toBe('2027-01-01');
    expect(nextResetOnOrAfter('2026-10-08', '2026-10-08', 'REPO')).toBe('2026-10-08');
  });
  it('steps from the original day (31st stays 31st where the month has one)', () => {
    expect(nextResetOnOrAfter('2026-01-31', '2026-06-01', 'REPO')).toBe('2026-07-31');
  });
  it('unknown reset date -> null', () => expect(nextResetOnOrAfter(null, '2026-10-08', 'REPO')).toBeNull());
});

describe('approxInr', () => {
  it.each([
    ['214108.70', '₹2.1 lakh'],
    ['100000', '₹1 lakh'],
    ['12500000', '₹1.3 crore'],
    ['45000.40', '₹45,000'],
    ['-10444.26', '-₹10,444'],
  ])('%s -> %s', (v, want) => expect(approxInr(D(v))).toBe(want));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/packages/shared && npx vitest run src/loans/loanChecks.test.ts`
Expected: FAIL - `Failed to resolve import "./loanChecks.js"`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/loans/loanChecks.ts`:
```ts
/**
 * Existing-loan checks (EMI calculator plan 3, spec s6): the rate-type vocabulary, the mapping from a loan's
 * type to the market rates of Plan 2, the refinance comparison and the benchmark pass-through estimate.
 * Pure: the web card and the API's daily alert job both use it, so they always agree. Money and rates are
 * Decimal here and strings on the wire.
 */
import { Decimal } from '../decimal.js';
import { formatINR } from '../format/number.js';
import { buildEmiSchedule, emiFor, tenureForEmi } from './emi.js';
import { addMonthsIso } from './emiDates.js';
import { EmiError, type ScheduleRow } from './emi.types.js';
import type { RateLoanType } from './loanRates.js';

export const LOAN_RATE_TYPES = ['FIXED', 'FLOATING', 'UNKNOWN'] as const;
export type LoanRateType = (typeof LOAN_RATE_TYPES)[number];
export const LOAN_RATE_TYPE_LABELS: Record<LoanRateType, string> = {
  FIXED: 'Fixed',
  FLOATING: 'Floating',
  UNKNOWN: 'Not sure',
};

export const LOAN_RATE_BENCHMARKS = ['REPO', 'MCLR', 'OTHER'] as const;
export type LoanRateBenchmark = (typeof LOAN_RATE_BENCHMARKS)[number];
export const LOAN_RATE_BENCHMARK_LABELS: Record<LoanRateBenchmark, string> = {
  REPO: 'Repo rate (EBLR)',
  MCLR: 'MCLR',
  OTHER: 'Other / not sure',
};

export type BenchmarkKind = 'REPO' | 'MCLR';
/** Plan ruling 6: floating retail loans are linked to the lender's 1-year MCLR. */
export const MCLR_BENCHMARK_TENOR = '1Y';
/** Plan ruling 8: repo-linked loans reset at least quarterly (RBI EBLR rule); MCLR loans yearly. */
export const BENCHMARK_RESET_STEP_MONTHS = { REPO: 3, MCLR: 12 } as const;

/** spec s6.1. A Map, so prototype keys like "toString" never match. */
const LOAN_TYPE_TO_RATE_TYPE: ReadonlyMap<string, RateLoanType> = new Map<string, RateLoanType>([
  ['HOME', 'HOME'],
  ['CAR', 'CAR'],
  ['PERSONAL', 'PERSONAL'],
  ['EDUCATION', 'EDUCATION'],
  ['GOLD', 'GOLD'],
  ['LAS', 'LAS'],
  ['BUSINESS', 'BUSINESS'],
]);

/** The market loan type for a `Loan.loanType`; null (OTHER or unknown) means "No market data". */
export function rateLoanTypeForLoan(loanType: string): RateLoanType | null {
  return LOAN_TYPE_TO_RATE_TYPE.get(loanType) ?? null;
}

/** spec s6.3: a refinance alert needs the loan to be at least this far above the market's lowest rate. */
export const REFINANCE_MIN_GAP_PP = new Decimal('0.50');
/** spec s6.2: processing 0.5 % of outstanding + Rs 10,000 other charges (editable on the card, not stored). */
export const DEFAULT_SWITCHING_COSTS = { processingPct: '0.5', otherCharges: '10000' } as const;

export function switchingCost(outstanding: Decimal, processingPct: Decimal, otherCharges: Decimal): Decimal {
  return outstanding.times(processingPct).div(100).plus(otherCharges).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export interface MarketComparisonInput {
  outstanding: Decimal;
  remainingMonths: number;
  currentRatePct: Decimal;
  marketRatePct: Decimal;
  switchingCost: Decimal;
}

export interface MarketComparison {
  currentEmi: Decimal;
  newEmi: Decimal;
  currentInterest: Decimal;
  newInterest: Decimal;
  grossSaving: Decimal;
  switchingCost: Decimal;
  netSaving: Decimal;
  /** First month whose cumulative EMI saving covers the switching costs; null when switching does not pay. */
  breakEvenMonth: number | null;
}

/** Only totals and per-row EMIs are used, so the calendar position of the plan is irrelevant. */
const PLACEHOLDER_FIRST_EMI = '2000-01-01';

/**
 * spec s6.2: the outstanding balance re-amortised over the same remaining months at the current rate and at
 * the market rate (plan ruling 5). Null when there is nothing left to compare.
 */
export function compareWithMarket(input: MarketComparisonInput): MarketComparison | null {
  const { outstanding, remainingMonths } = input;
  if (!Number.isInteger(remainingMonths) || remainingMonths < 1 || !outstanding.greaterThan(0)) return null;
  const plan = (annualRatePct: Decimal) =>
    buildEmiSchedule({ principal: outstanding, annualRatePct, tenureMonths: remainingMonths, firstEmiDate: PLACEHOLDER_FIRST_EMI });
  const now = plan(input.currentRatePct);
  const next = plan(input.marketRatePct);
  const grossSaving = now.totalInterest.minus(next.totalInterest);
  const netSaving = grossSaving.minus(input.switchingCost);
  return {
    currentEmi: now.emi,
    newEmi: next.emi,
    currentInterest: now.totalInterest,
    newInterest: next.totalInterest,
    grossSaving,
    switchingCost: input.switchingCost,
    netSaving,
    breakEvenMonth: netSaving.greaterThan(0) ? breakEven(now.schedule, next.schedule, input.switchingCost) : null,
  };
}

function breakEven(current: ScheduleRow[], next: ScheduleRow[], cost: Decimal): number | null {
  let saved = new Decimal(0);
  const months = Math.max(current.length, next.length);
  for (let i = 0; i < months; i++) {
    saved = saved.plus(current[i]?.emi ?? 0).minus(next[i]?.emi ?? 0);
    if (saved.greaterThan(0) && saved.greaterThanOrEqualTo(cost)) return i + 1;
  }
  return null;
}

export interface PassThroughEstimate {
  newRatePct: Decimal;
  currentEmi: Decimal;
  /** EMI over the same remaining months at the new rate. */
  newEmi: Decimal;
  /** Months added (+) or saved (-) when the EMI is kept; null when the kept EMI would not cover interest. */
  tenureDeltaMonths: number | null;
}

/** spec s6.3: what a benchmark change does to this loan if the lender passes all of it on. */
export function passThroughEstimate(input: {
  outstanding: Decimal;
  remainingMonths: number;
  currentRatePct: Decimal;
  deltaPct: Decimal;
}): PassThroughEstimate | null {
  const { outstanding, remainingMonths } = input;
  if (!Number.isInteger(remainingMonths) || remainingMonths < 1 || !outstanding.greaterThan(0)) return null;
  const newRatePct = Decimal.max(0, input.currentRatePct.plus(input.deltaPct));
  const currentEmi = emiFor(outstanding, input.currentRatePct, remainingMonths);
  const newEmi = emiFor(outstanding, newRatePct, remainingMonths);
  let tenureDeltaMonths: number | null;
  try {
    tenureDeltaMonths = tenureForEmi(outstanding, currentEmi, newRatePct) - remainingMonths;
  } catch (err) {
    if (!(err instanceof EmiError) || err.code !== 'EMI_TOO_LOW') throw err;
    tenureDeltaMonths = null;
  }
  return { newRatePct, currentEmi, newEmi, tenureDeltaMonths };
}

/**
 * Plan ruling 8: the stored reset date rolled forward (3 months REPO, 12 months MCLR) until it is on or after
 * `from` ('YYYY-MM-DD'). Steps are taken from the original date so a 31st stays a 31st where it can.
 */
export function nextResetOnOrAfter(stored: string | null, from: string, kind: BenchmarkKind): string | null {
  if (stored === null) return null;
  const step = BENCHMARK_RESET_STEP_MONTHS[kind];
  let date = stored;
  for (let k = 1; date < from && k <= 400; k++) date = addMonthsIso(stored, k * step);
  return date;
}

/** Rounded rupees for alert text: "₹2.1 lakh", "₹1.3 crore", below a lakh "₹45,000". */
export function approxInr(amount: Decimal): string {
  const abs = amount.abs();
  const sign = amount.isNegative() ? '-' : '';
  const unit = (size: number, word: string) =>
    `${sign}₹${abs.div(size).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1).replace(/\.0$/, '')} ${word}`;
  if (abs.greaterThanOrEqualTo(10_000_000)) return unit(10_000_000, 'crore');
  if (abs.greaterThanOrEqualTo(100_000)) return unit(100_000, 'lakh');
  return formatINR(amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0), { fractionDigits: 0 });
}

// ─── Wire shapes (GET /api/loans/:id/market-check, /api/notifications/preferences) ───

/** The best (lowest, not stale) effective market rate for the loan's type. */
export interface MarketRateWire {
  sourceId: string;
  lender: string;
  minRatePct: string;
  /** ISO instant the rate was last confirmed. */
  asOf: string;
  sourceUrl: string;
}

export interface BenchmarkSummaryWire {
  kind: BenchmarkKind;
  /** Canonical lender for MCLR; null for REPO. */
  lender: string | null;
  tenor: string | null;
  ratePct: string;
  effectiveDate: string;
  /** Null until the series has two different rates. deltaPct is signed: "-0.25" is a cut. */
  lastChange: { deltaPct: string; date: string } | null;
}

export interface LoanMarketCheckWire {
  loanId: string;
  status: string;
  loanType: string;
  /** Null = no market data for this loan type (OTHER). */
  rateLoanType: RateLoanType | null;
  /** Canonical lender matched from the loan's lender name; null = not one of the tracked lenders. */
  lender: string | null;
  rateType: LoanRateType;
  rateBenchmark: LoanRateBenchmark | null;
  nextRateResetDate: string | null;
  currentRatePct: string;
  /** From the loan's own schedule. */
  outstanding: string;
  remainingMonths: number;
  nextEmiDate: string | null;
  market: MarketRateWire | null;
  /** FLOATING loans with a REPO or MCLR benchmark (MCLR with an unmatched lender shows REPO). */
  benchmark: BenchmarkSummaryWire | null;
}

export interface LoanAlertPrefsWire {
  loanRateAlerts: boolean;
}
```

Append to `packages/shared/src/loans/index.ts`:
```ts
export * from './loanChecks.js';
```

- [ ] **Step 4: Run tests and build**

Run:
```bash
cd portfolioos/packages/shared
npx vitest run src/loans
npx tsc --noEmit
cd ../.. && pnpm --filter @everypaisa/shared build
```
Expected: all PASS (the new file plus Plan 1/2 loan tests unchanged); no type errors; the build emits `dist/loans/loanChecks.js`.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/shared/src/loans/loanChecks.ts packages/shared/src/loans/loanChecks.test.ts packages/shared/src/loans/index.ts
git commit -m "feat(loan-checks): shared refinance and pass-through maths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Schema, migration and the loan rate fields in the API

**Wave 2** (parallel with Tasks 6 and 7; needs Task 1).

**Files:**
- Modify: `packages/api/prisma/schema.prisma` (`Loan`, `User`, `enum AlertType`)
- Create: `packages/api/prisma/migrations/20261013090000_loan_rate_checks/migration.sql`
- Modify: `packages/shared/src/types/enums.ts` (`AlertType` const)
- Modify: `packages/api/src/services/loans.service.ts` (`CreateLoanInput`, `resolveRateFields`, `createLoan`, `updateLoan`, `computeLoanSummary`)
- Modify: `packages/api/src/controllers/loans.controller.ts` (`createLoanSchema`)
- Test: `packages/api/test/invariants/loan-rate-check-columns.test.ts`, `packages/api/test/loanChecks/loanRateFields.db.test.ts`

**Interfaces:**
- Consumes: `LOAN_RATE_TYPES`, `LOAN_RATE_BENCHMARKS`, `type LoanRateType`, `type LoanRateBenchmark` (Task 1).
- Produces: Prisma `Loan.rateType: string`, `Loan.rateBenchmark: string | null`, `Loan.nextRateResetDate: Date | null`, `User.loanRateAlerts: boolean`, `AlertType.LOAN_REFINANCE`, `AlertType.LOAN_BENCHMARK_CHANGE`; `CreateLoanInput.rateType?: LoanRateType`, `.rateBenchmark?: LoanRateBenchmark | null`, `.nextRateResetDate?: string | null` (`'YYYY-MM-DD'`); `interface RateFieldsData`; `resolveRateFields(input, existing: { rateType: string } | null): RateFieldsData`; `computeLoanSummary(loan: StoredLoan, asOf?: Date): LoanSummary`. Loan JSON responses carry the three new fields (`nextRateResetDate` as an ISO instant at UTC midnight; the web slices it to `YYYY-MM-DD`).

- [ ] **Step 1: Write the failing tests**

`packages/api/test/invariants/loan-rate-check-columns.test.ts`:
```ts
/**
 * EMI plan 3 adds columns to two existing tables. No GRANT is written: the table-level grants to the app role
 * already cover added columns, and Loan's RLS policy is row-based. This pins both facts.
 */
import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { prisma, USER_SCOPED_MODELS } from '../../src/lib/prisma.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const COLUMNS = [
  ['Loan', 'rateType'],
  ['Loan', 'rateBenchmark'],
  ['Loan', 'nextRateResetDate'],
  ['User', 'loanRateAlerts'],
] as const;

describe('loan-check columns', () => {
  it('the app role can read, insert and update every new column', async () => {
    for (const [table, column] of COLUMNS) {
      const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
        SELECT has_column_privilege('portfolioos_app'::name, ${`"${table}"`}::text, ${column}::text, 'SELECT, INSERT, UPDATE'::text) AS ok`;
      expect(rows[0]?.ok, `${table}.${column}`).toBe(true);
    }
  });

  it('Loan stays user-scoped', () => expect(USER_SCOPED_MODELS.has('Loan')).toBe(true));

  it('AlertType has the two loan-check values', async () => {
    const rows = await prisma.$queryRaw<{ v: string }[]>`SELECT unnest(enum_range(NULL::"AlertType"))::text AS v`;
    expect(rows.map((r) => r.v)).toEqual(expect.arrayContaining(['LOAN_REFINANCE', 'LOAN_BENCHMARK_CHANGE']));
  });
});
```

`packages/api/test/loanChecks/loanRateFields.db.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { ValidationError } from '../../src/lib/errors.js';
import {
  computeLoanSummary, createLoan, updateLoan, type CreateLoanInput, type StoredLoan,
} from '../../src/services/loans.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const BASE: CreateLoanInput = {
  lenderName: 'HDFC Bank', loanType: 'HOME', borrowerName: 'Test Borrower', principalAmount: '3000000', interestRate: '9.10',
  tenureMonths: 180, emiAmount: '30607', emiDueDay: 5, disbursementDate: '2026-10-01', firstEmiDate: '2026-11-05',
};
const iso = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

let user: TestScope;
beforeAll(async () => { user = await createTestScope('loan-rate-fields'); });
afterAll(async () => { await user.cleanup(); });
const as = <T>(fn: () => Promise<T>) => user.runAs(fn);

describe('loan rate fields (spec s6.1)', () => {
  it('a new loan starts UNKNOWN with no benchmark', async () => {
    const loan = await as(() => createLoan(user.userId, BASE));
    expect(loan).toMatchObject({ rateType: 'UNKNOWN', rateBenchmark: null, nextRateResetDate: null });
  });

  it('stores a floating repo-linked loan with its next reset date', async () => {
    const loan = await as(() => createLoan(user.userId, { ...BASE, rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' }));
    expect(loan).toMatchObject({ rateType: 'FLOATING', rateBenchmark: 'REPO' });
    expect(iso(loan.nextRateResetDate)).toBe('2027-01-01');
  });

  it('refuses a benchmark or reset date on a loan that is not floating', async () => {
    await expect(as(() => createLoan(user.userId, { ...BASE, rateType: 'FIXED', rateBenchmark: 'REPO' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(as(() => createLoan(user.userId, { ...BASE, nextRateResetDate: '2027-01-01' }))).rejects.toBeInstanceOf(ValidationError);
    const unknown = await as(() => createLoan(user.userId, BASE));
    await expect(as(() => updateLoan(user.userId, unknown.id, { rateBenchmark: 'MCLR' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('switching a floating loan to fixed clears the benchmark and reset date', async () => {
    const loan = await as(() => createLoan(user.userId, { ...BASE, rateType: 'FLOATING', rateBenchmark: 'MCLR', nextRateResetDate: '2027-04-01' }));
    const fixed = await as(() => updateLoan(user.userId, loan.id, { rateType: 'FIXED' }));
    expect(fixed).toMatchObject({ rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null });
  });

  it('changing only the reset date of a floating loan keeps its benchmark', async () => {
    const loan = await as(() => createLoan(user.userId, { ...BASE, rateType: 'FLOATING', rateBenchmark: 'REPO' }));
    const moved = await as(() => updateLoan(user.userId, loan.id, { nextRateResetDate: '2027-02-01' }));
    expect(moved.rateBenchmark).toBe('REPO');
    expect(iso(moved.nextRateResetDate)).toBe('2027-02-01');
  });

  it('an unrelated edit leaves the rate fields alone', async () => {
    const loan = await as(() => createLoan(user.userId, { ...BASE, rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' }));
    const edited = await as(() => updateLoan(user.userId, loan.id, { borrowerName: 'Renamed' }));
    expect(edited).toMatchObject({ rateType: 'FLOATING', rateBenchmark: 'REPO' });
    expect(iso(edited.nextRateResetDate)).toBe('2027-01-01');
  });
});

describe('computeLoanSummary as of a date', () => {
  const stored: StoredLoan = {
    id: 'pure', principalAmount: new Prisma.Decimal('3000000'), interestRate: new Prisma.Decimal('9.10'), tenureMonths: 180,
    emiAmount: new Prisma.Decimal('30607'), emiDueDay: 5, firstEmiDate: new Date('2026-11-05T00:00:00Z'),
    prepaymentOption: 'REDUCE_TENURE', payments: [],
  };
  it('before the first EMI everything is still outstanding', () => {
    const s = computeLoanSummary(stored, new Date('2026-10-12T03:00:00Z'));
    expect(s).toMatchObject({ outstandingBalance: '3000000.0000', remainingEmiCount: 180, nextEmiDate: '2026-11-05' });
  });
  it('a later date moves the next EMI on (unpaid past rows are not counted, as before)', () => {
    const s = computeLoanSummary(stored, new Date('2026-12-06T03:00:00Z'));
    expect(s.nextEmiDate).toBe('2027-01-05');
    expect(s.remainingEmiCount).toBe(178);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/invariants/loan-rate-check-columns.test.ts test/loanChecks/loanRateFields.db.test.ts
```
Expected: FAIL - `column "rateType" of relation "Loan" does not exist`; the service tests fail on the missing fields and the `asOf` argument.

- [ ] **Step 3: Change the schema**

In `packages/api/prisma/schema.prisma`, `model Loan`, after `lenderMatchKey    String?`:
```prisma
  /// Existing-loan checks (EMI plan 3, spec s6.1): FIXED | FLOATING | UNKNOWN.
  rateType          String    @default("UNKNOWN")
  /// REPO | MCLR | OTHER. Only for FLOATING loans (loans.service resolveRateFields).
  rateBenchmark     String?
  nextRateResetDate DateTime? @db.Date
```

In `model User`, after `preferences Json?`:
```prisma
  /// Settings -> Notifications -> Loan rate alerts (EMI plan 3, spec s6.3). Default on.
  loanRateAlerts Boolean @default(true)
```

In `enum AlertType`, after `PF_REFRESH_DUE`:
```prisma
  LOAN_REFINANCE
  LOAN_BENCHMARK_CHANGE
```

- [ ] **Step 4: Write and apply the migration on the isolated local DB only**

`packages/api/prisma/migrations/20261013090000_loan_rate_checks/migration.sql`:
```sql
-- EMI plan 3 (spec s6): existing-loan checks. Additive only.
-- No GRANT: the table-level grants on "Loan" and "User" cover added columns
-- (test/invariants/loan-rate-check-columns.test.ts), and Loan's RLS policy is row-based.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'LOAN_REFINANCE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'LOAN_BENCHMARK_CHANGE';

ALTER TABLE "Loan" ADD COLUMN "rateType" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "rateBenchmark" TEXT,
ADD COLUMN "nextRateResetDate" DATE;

ALTER TABLE "User" ADD COLUMN "loanRateAlerts" BOOLEAN NOT NULL DEFAULT true;
```

Run (from `portfolioos/packages/api`, BOTH overrides; never source `.env`):
```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split
export DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split
npx prisma migrate deploy
npx prisma generate
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script \
  | grep -nE 'rateType|rateBenchmark|nextRateResetDate|loanRateAlerts|LOAN_REFINANCE|LOAN_BENCHMARK_CHANGE' || echo "clean"
unset DATABASE_URL DIRECT_URL
```
Expected: `migrate deploy` applies `20261013090000_loan_rate_checks` and nothing resets data; the cross-check prints `clean`. The diff may print unrelated statements from local drift: ignore them and never copy them into this migration (Plan 2 lesson). If `migrate deploy` reports a failed or modified earlier migration, stop with BLOCKED; do not reset the database.

- [ ] **Step 5: Shared AlertType const**

In `packages/shared/src/types/enums.ts`, inside `export const AlertType = {`, after `PROPERTY_POSSESSION_DUE: 'PROPERTY_POSSESSION_DUE',`:
```ts
  LOAN_REFINANCE: 'LOAN_REFINANCE',
  LOAN_BENCHMARK_CHANGE: 'LOAN_BENCHMARK_CHANGE',
```

- [ ] **Step 6: Loan service and controller**

In `packages/api/src/services/loans.service.ts`:

1. Replace the two import lines `import { NotFoundError } from '../lib/errors.js';` and `import { serializeMoney } from '@everypaisa/shared';` with:
```ts
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { serializeMoney, type LoanRateBenchmark, type LoanRateType } from '@everypaisa/shared';
```

2. Add to `interface CreateLoanInput`, after `lenderMatchKey?: string | null;`:
```ts
  /** spec s6.1. Default UNKNOWN. */
  rateType?: LoanRateType;
  /** Only for FLOATING loans. */
  rateBenchmark?: LoanRateBenchmark | null;
  /** 'YYYY-MM-DD'. Only for FLOATING loans. */
  nextRateResetDate?: string | null;
```

3. Add after `function addMonths(...) { ... }` in the helpers section:
```ts
export interface RateFieldsData {
  rateType?: string;
  rateBenchmark?: string | null;
  nextRateResetDate?: Date | null;
}

/**
 * spec s6.1 + plan ruling 12: a benchmark and a reset date describe FLOATING loans only. Giving either for a
 * loan that is (or is becoming) FIXED/UNKNOWN is refused; switching a loan away from FLOATING clears both.
 * `existing` is null on create.
 */
export function resolveRateFields(
  input: Pick<UpdateLoanInput, 'rateType' | 'rateBenchmark' | 'nextRateResetDate'>,
  existing: { rateType: string } | null,
): RateFieldsData {
  const type = input.rateType ?? existing?.rateType ?? 'UNKNOWN';
  const out: RateFieldsData = {};
  if (input.rateType !== undefined) out.rateType = input.rateType;
  if (type !== 'FLOATING') {
    const field =
      (input.rateBenchmark ?? null) !== null ? 'rateBenchmark' : (input.nextRateResetDate ?? null) !== null ? 'nextRateResetDate' : null;
    if (field !== null) {
      throw new ValidationError('A benchmark and a reset date apply to floating-rate loans only', { field });
    }
    if (existing === null || input.rateType !== undefined) {
      out.rateBenchmark = null;
      out.nextRateResetDate = null;
    }
    return out;
  }
  if (input.rateBenchmark !== undefined) out.rateBenchmark = input.rateBenchmark;
  if (input.nextRateResetDate !== undefined) out.nextRateResetDate = input.nextRateResetDate ? toDate(input.nextRateResetDate) : null;
  return out;
}
```

4. In `createLoan`, inside `data: { ... }`, after `lenderMatchKey: input.lenderMatchKey ?? null,`:
```ts
      ...resolveRateFields(input, null),
```

5. In `updateLoan`, inside `data: { ... }`, after the `...(input.lenderMatchKey !== undefined && { lenderMatchKey: input.lenderMatchKey }),` line:
```ts
      ...resolveRateFields(input, existing),
```

6. Replace the first lines of `computeLoanSummary` (from its doc comment to `today.setUTCHours(0, 0, 0, 0);`) with:
```ts
/**
 * Compute a high-level summary of the current loan state. `asOf` (default now) is the day the position is
 * taken on; the loan-check job passes its own clock.
 */
export function computeLoanSummary(loan: StoredLoan, asOf: Date = new Date()): LoanSummary {
  const ZERO = new Decimal(0);

  const schedule = buildAmortizationSchedule(loan);
  const today = new Date(asOf.getTime());
  today.setUTCHours(0, 0, 0, 0);
```
The rest of the function is unchanged.

In `packages/api/src/controllers/loans.controller.ts`, replace `import { serializeMoney } from '@everypaisa/shared';` with:
```ts
import { LOAN_RATE_BENCHMARKS, LOAN_RATE_TYPES, serializeMoney } from '@everypaisa/shared';
```
and add to `createLoanSchema` after `lenderMatchKey: z.string().nullable().optional(),`:
```ts
  rateType: z.enum(LOAN_RATE_TYPES).optional(),
  rateBenchmark: z.enum(LOAN_RATE_BENCHMARKS).nullable().optional(),
  nextRateResetDate: isoDate.nullable().optional(),
```
(`updateLoanSchema = createLoanSchema.partial()` picks them up.)

- [ ] **Step 7: Run tests, typecheck, lint**

Run:
```bash
cd portfolioos && pnpm --filter @everypaisa/shared build
cd packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/invariants/loan-rate-check-columns.test.ts test/invariants/user-scoped-coverage.test.ts test/loanChecks/loanRateFields.db.test.ts test/services/loanPaymentSplit.test.ts src/services/loanMath.test.ts
npx tsc --noEmit
npx eslint src/services/loans.service.ts src/controllers/loans.controller.ts
```
Expected: all PASS; no type or lint errors.

- [ ] **Step 8: Commit**

```bash
cd portfolioos
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations/20261013090000_loan_rate_checks packages/shared/src/types/enums.ts packages/api/src/services/loans.service.ts packages/api/src/controllers/loans.controller.ts packages/api/test/invariants/loan-rate-check-columns.test.ts packages/api/test/loanChecks/loanRateFields.db.test.ts
git commit -m "feat(loan-checks): loan rate type, benchmark and reset date; alert opt-out column

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lender alias map

**Wave 1** (parallel with Task 1).

**Files:**
- Create: `packages/api/src/services/loanChecks/lenderAlias.ts`
- Test: `packages/api/test/loanChecks/lenderAlias.test.ts`

**Interfaces:**
- Consumes: `LOAN_RATE_SOURCES` (Plan 2, `services/loanRates/sourceList.ts`) - test only.
- Produces: `normaliseLenderName(name: string): string`, `canonicalLender(name: string | null | undefined): string | null` (a Plan 2 `LoanRateSource.lender` value: `'SBI' | 'HDFC Bank' | 'ICICI Bank' | 'Axis Bank' | 'Kotak' | 'PNB' | 'Bank of Baroda' | 'Canara Bank' | 'Union Bank' | 'LIC Housing Finance'`), `MATCHED_LENDERS: readonly string[]`.

- [ ] **Step 1: Write the failing test**

`packages/api/test/loanChecks/lenderAlias.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { MATCHED_LENDERS, canonicalLender, normaliseLenderName } from '../../src/services/loanChecks/lenderAlias.js';
import { LOAN_RATE_SOURCES } from '../../src/services/loanRates/sourceList.js';

describe('canonicalLender (spec s6.1 LenderAlias)', () => {
  it.each([
    ['SBI', 'SBI'],
    ['State Bank of India', 'SBI'],
    ['state bank of india ltd.', 'SBI'],
    ['  The  State Bank of India  ', 'SBI'],
    ['HDFC', 'HDFC Bank'],
    ['HDFC LTD', 'HDFC Bank'],
    ['HDFC Bank Limited', 'HDFC Bank'],
    ['ICICI Bank', 'ICICI Bank'],
    ['Axis Bank Ltd', 'Axis Bank'],
    ['Kotak Mahindra Bank', 'Kotak'],
    ['kotak', 'Kotak'],
    ['Punjab National Bank', 'PNB'],
    ['PNB', 'PNB'],
    ['Bank of Baroda', 'Bank of Baroda'],
    ['BoB', 'Bank of Baroda'],
    ['Canara Bank', 'Canara Bank'],
    ['Union Bank of India', 'Union Bank'],
    ['LIC Housing Finance Ltd', 'LIC Housing Finance'],
    ['LICHFL', 'LIC Housing Finance'],
  ])('%j -> %s', (name, want) => expect(canonicalLender(name)).toBe(want));

  it.each([
    'PNB Housing Finance', 'ICICI Home Finance', 'Can Fin Homes', 'HDFC Credila', 'IDFC First Bank',
    'Bajaj Finance', 'Bajaj Housing Finance', 'LIC', 'Union', 'toString', '', '   ',
  ])('%j is not a tracked lender', (name) => expect(canonicalLender(name)).toBeNull());

  it('null and undefined are unmatched', () => {
    expect(canonicalLender(null)).toBeNull();
    expect(canonicalLender(undefined)).toBeNull();
  });

  it('normalises case, punctuation, "&", a leading "the" and trailing ltd/limited', () => {
    expect(normaliseLenderName('The Kotak Mahindra Bank Ltd.')).toBe('kotak mahindra bank');
    expect(normaliseLenderName('L&T Finance Limited')).toBe('l and t finance');
  });

  it('every canonical name is a lender in the live-rates source list', () => {
    const lenders = new Set(LOAN_RATE_SOURCES.map((s) => s.lender));
    expect(MATCHED_LENDERS.filter((l) => !lenders.has(l))).toEqual([]);
    expect(MATCHED_LENDERS).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/packages/api && npx vitest run test/loanChecks/lenderAlias.test.ts`
Expected: FAIL - cannot find module `lenderAlias.js`.

- [ ] **Step 3: Write the implementation**

`packages/api/src/services/loanChecks/lenderAlias.ts`:
```ts
/**
 * LenderAlias (spec s6.1): a code constant, not a table. Maps the free-text `Loan.lenderName` to a lender of
 * the live-rates source list (Plan 2, `LoanRateSource.lender`). Exact match after normalisation, so a
 * look-alike ("PNB Housing Finance", "ICICI Home Finance") never borrows a bank's MCLR. Unmatched loans get
 * repo-only benchmark display and no MCLR alerts.
 */

const ALIASES: Readonly<Record<string, readonly string[]>> = {
  SBI: ['sbi', 'state bank of india', 'state bank', 'sbi bank'],
  'HDFC Bank': ['hdfc', 'hdfc bank', 'hdfc home loan', 'hdfc home loans'],
  'ICICI Bank': ['icici', 'icici bank'],
  'Axis Bank': ['axis', 'axis bank', 'uti bank'],
  Kotak: ['kotak', 'kotak bank', 'kotak mahindra', 'kotak mahindra bank'],
  PNB: ['pnb', 'punjab national bank'],
  'Bank of Baroda': ['bob', 'bank of baroda', 'baroda bank'],
  'Canara Bank': ['canara', 'canara bank'],
  'Union Bank': ['union bank', 'union bank of india', 'ubi'],
  'LIC Housing Finance': ['lic housing finance', 'lic housing', 'lic hfl', 'lichfl', 'lic home loans'],
};

const BY_ALIAS: ReadonlyMap<string, string> = new Map(
  Object.entries(ALIASES).flatMap(([lender, aliases]) => aliases.map((alias) => [alias, lender] as const)),
);

export const MATCHED_LENDERS: readonly string[] = Object.keys(ALIASES);

/** Lowercase, "&" -> "and", punctuation to spaces, single spaces, no leading "the", no trailing ltd/limited. */
export function normaliseLenderName(name: string): string {
  let s = name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  s = s.replace(/^the\s+/, '');
  for (;;) {
    const next = s.replace(/\s+(ltd|limited)$/, '');
    if (next === s) break;
    s = next;
  }
  return s;
}

export function canonicalLender(name: string | null | undefined): string | null {
  if (name === null || name === undefined) return null;
  const key = normaliseLenderName(name);
  return key === '' ? null : (BY_ALIAS.get(key) ?? null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd portfolioos/packages/api && npx vitest run test/loanChecks/lenderAlias.test.ts && npx tsc --noEmit && npx eslint src/services/loanChecks`
Expected: PASS; no type or lint errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/api/src/services/loanChecks/lenderAlias.ts packages/api/test/loanChecks/lenderAlias.test.ts
git commit -m "feat(loan-checks): lender alias map for MCLR matching

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Market check API - GET /api/loans/:id/market-check

**Wave 3** (parallel with Task 5; needs Tasks 1-3).

**Files:**
- Create: `packages/api/src/services/loanChecks/marketCheck.service.ts`
- Modify: `packages/api/src/controllers/loans.controller.ts` (add `getLoanMarketCheckHandler`)
- Modify: `packages/api/src/routes/loans.routes.ts` (register the route)
- Test: `packages/api/test/routes/loanMarketCheck.routes.test.ts`

**Interfaces:**
- Consumes: `rateLoanTypeForLoan`, `MCLR_BENCHMARK_TENOR`, `Decimal`, wire types (Task 1); `computeLoanSummary(loan, asOf)`, `type StoredLoan` (Task 2); `canonicalLender` (Task 3); Plan 2 `listLoanRates(loanType, now): Promise<LoanRatesWire>` (rows are effective ACTIVE rates, lowest first, with `stale`), `isoDate(d)`, `pctString(d)` from `services/loanRates/store.ts`; test helpers `createTestScope`, `clearLoanRateTables`, `ensureLoanRateSources`.
- Produces:
  - `interface LoanPosition { outstanding: Decimal; remainingMonths: number; nextEmiDate: string | null }`, `loanPosition(loan: StoredLoan, asOf: Date): LoanPosition`
  - `bestMarketRate(type: RateLoanType, now: Date): Promise<MarketRateWire | null>`
  - `interface BenchmarkTarget { kind: BenchmarkKind; lender: string | null; tenor: string | null }`, `benchmarkTarget(rateType: string, rateBenchmark: string | null, lender: string | null): BenchmarkTarget | null`
  - `benchmarkSummary(target: BenchmarkTarget): Promise<BenchmarkSummaryWire | null>`
  - `getLoanMarketCheck(userId: string, loanId: string, now?: Date): Promise<LoanMarketCheckWire>` (404 `NotFoundError` for a loan the user does not own)
  - HTTP `GET /api/loans/:id/market-check` -> `ApiResponse<LoanMarketCheckWire>`

- [ ] **Step 1: Write the failing test**

`packages/api/test/routes/loanMarketCheck.routes.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { LoanMarketCheckWire } from '@everypaisa/shared';
import { Decimal } from '@everypaisa/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { loansRouter } from '../../src/routes/loans.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { computeLoanSummary, type StoredLoan } from '../../src/services/loans.service.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
let other: TestScope;
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** The 5th of the month `offset` months from today (UTC), as YYYY-MM-DD. */
const fifth = (offset: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 5)).toISOString().slice(0, 10);
};
const token = (u: TestScope) => signAccessToken({ sub: u.userId, email: `${u.userId}@test.local`, role: 'INVESTOR', plan: 'FREE' }).token;
async function check(loanId: string, as: TestScope | null = user): Promise<Response> {
  return fetch(`${base}/api/loans/${loanId}/market-check`, { headers: as ? { authorization: `Bearer ${token(as)}` } : {} });
}
async function body(loanId: string): Promise<LoanMarketCheckWire> {
  const res = await check(loanId);
  expect(res.status).toBe(200);
  return (await res.json()).data as LoanMarketCheckWire;
}

async function loan(owner: TestScope, data: { lenderName?: string; loanType?: string; rate?: string; emi?: string; rateType?: string; rateBenchmark?: string | null; firstEmiDate?: string }) {
  return sys(() => prisma.loan.create({
    data: {
      userId: owner.userId, lenderName: data.lenderName ?? 'HDFC Bank', loanType: data.loanType ?? 'HOME', borrowerName: 'Test Borrower',
      principalAmount: '3000000', interestRate: data.rate ?? '9.10', tenureMonths: 180, emiAmount: data.emi ?? '30607', emiDueDay: 5,
      disbursementDate: day(fifth(-4)), firstEmiDate: day(data.firstEmiDate ?? fifth(1)),
      rateType: data.rateType ?? 'FIXED', rateBenchmark: data.rateBenchmark ?? null,
    },
  }));
}

async function seedRates() {
  await sys(async () => {
    await prisma.loanRateSource.update({ where: { id: 'sbi.home' }, data: { lastSuccessAt: ago(1) } });
    await prisma.loanRateSource.update({ where: { id: 'kotak.home' }, data: { lastSuccessAt: ago(8 * 24) } });
    await prisma.loanRate.createMany({
      data: [
        { sourceId: 'sbi.home', basis: 'REPO_LINKED', minRatePct: '8.35', maxRatePct: '10.05', origin: 'AUTO', status: 'ACTIVE', fetchedAt: ago(2) },
        // Lower, but stale (no success for 8 days): never the market rate.
        { sourceId: 'kotak.home', basis: 'REPO_LINKED', minRatePct: '7.70', maxRatePct: '13.05', origin: 'AUTO', status: 'ACTIVE', fetchedAt: ago(8 * 24) },
        // Lower, but held for review: never shown.
        { sourceId: 'axis.home', basis: 'REPO_LINKED', minRatePct: '5.00', origin: 'AUTO', status: 'SUSPECT', fetchedAt: ago(2) },
      ],
    });
    await prisma.benchmarkRate.createMany({
      data: [
        { kind: 'REPO', lender: null, tenor: null, ratePct: '5.50', effectiveDate: day('2026-06-06'), fetchedAt: new Date('2026-06-06T04:00:00Z') },
        { kind: 'REPO', lender: null, tenor: null, ratePct: '5.25', effectiveDate: day('2026-10-08'), fetchedAt: new Date('2026-10-09T02:00:00Z') },
        { kind: 'MCLR', lender: 'SBI', tenor: '1Y', ratePct: '8.75', effectiveDate: day('2026-09-15'), fetchedAt: new Date('2026-09-15T02:00:00Z') },
        { kind: 'MCLR', lender: 'SBI', tenor: '1Y', ratePct: '8.65', effectiveDate: day('2026-10-10'), fetchedAt: new Date('2026-10-10T02:00:00Z') },
      ],
    });
  });
}

beforeAll(async () => {
  user = await createTestScope('loan-market-check');
  other = await createTestScope('loan-market-check-other');
  await sys(() => ensureLoanRateSources(true));
  const app = express();
  app.use(express.json());
  app.use('/api/loans', loansRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(async () => {
  await clearLoanRateTables();
  await seedRates();
});
afterAll(async () => {
  server.close();
  await clearLoanRateTables();
  await user.cleanup();
  await other.cleanup();
});

describe('GET /api/loans/:id/market-check', () => {
  it('requires auth and ownership', async () => {
    const mine = await loan(user, {});
    expect((await check(mine.id, null)).status).toBe(401);
    expect((await check(mine.id, other)).status).toBe(404);
  });

  it('a fixed home loan: position from its schedule, lowest fresh market rate, no benchmark', async () => {
    const l = await loan(user, {});
    expect(await body(l.id)).toEqual({
      loanId: l.id, status: 'ACTIVE', loanType: 'HOME', rateLoanType: 'HOME', lender: 'HDFC Bank',
      rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null, currentRatePct: '9.10',
      outstanding: '3000000.00', remainingMonths: 180, nextEmiDate: fifth(1),
      market: { sourceId: 'sbi.home', lender: 'SBI', minRatePct: '8.35', asOf: expect.any(String), sourceUrl: expect.stringMatching(/^https:\/\//) },
      benchmark: null,
    });
  });

  it('a floating repo-linked loan shows the repo series and its last change', async () => {
    const l = await loan(user, { rateType: 'FLOATING', rateBenchmark: 'REPO', rate: '8.50', emi: '29543' });
    expect((await body(l.id)).benchmark).toEqual({
      kind: 'REPO', lender: null, tenor: null, ratePct: '5.25', effectiveDate: '2026-10-08',
      lastChange: { deltaPct: '-0.25', date: '2026-10-08' },
    });
  });

  it('a floating MCLR loan with a matched lender shows that lender 1-year MCLR', async () => {
    const l = await loan(user, { lenderName: 'State Bank of India', rateType: 'FLOATING', rateBenchmark: 'MCLR', rate: '8.60', emi: '29719' });
    const b = await body(l.id);
    expect(b.lender).toBe('SBI');
    expect(b.benchmark).toEqual({
      kind: 'MCLR', lender: 'SBI', tenor: '1Y', ratePct: '8.65', effectiveDate: '2026-10-10',
      lastChange: { deltaPct: '-0.10', date: '2026-10-10' },
    });
  });

  it('a floating MCLR loan with an unmatched lender falls back to the repo rate', async () => {
    const l = await loan(user, { lenderName: 'Bajaj Finance', rateType: 'FLOATING', rateBenchmark: 'MCLR' });
    const b = await body(l.id);
    expect(b.lender).toBeNull();
    expect(b.benchmark?.kind).toBe('REPO');
  });

  it('OTHER loans have no market data', async () => {
    const l = await loan(user, { loanType: 'OTHER' });
    expect(await body(l.id)).toMatchObject({ rateLoanType: null, market: null });
  });

  it('market is null when only stale or suspect rates exist', async () => {
    await sys(() => prisma.loanRate.deleteMany({ where: { sourceId: 'sbi.home' } }));
    const l = await loan(user, {});
    expect((await body(l.id)).market).toBeNull();
  });

  it("uses the loan's own schedule (past EMIs paid), not principal and tenure", async () => {
    const l = await loan(user, { firstEmiDate: fifth(-3) });
    await sys(() => prisma.loanPayment.createMany({
      data: [
        { loanId: l.id, paymentType: 'EMI', paidOn: day(fifth(-3)), amount: '30607', installmentNo: 1 },
        { loanId: l.id, paymentType: 'EMI', paidOn: day(fifth(-2)), amount: '30607', installmentNo: 2 },
      ],
    }));
    const stored = await sys(() => prisma.loan.findUniqueOrThrow({ where: { id: l.id }, include: { payments: { orderBy: { paidOn: 'asc' } } } }));
    const want = computeLoanSummary(stored as unknown as StoredLoan, new Date());
    const b = await body(l.id);
    expect(b.outstanding).toBe(new Decimal(want.outstandingBalance).toFixed(2));
    expect(b.remainingMonths).toBe(want.remainingEmiCount);
    expect(b.remainingMonths).toBeLessThan(180);
    expect(new Decimal(b.outstanding).lessThan(3000000)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/routes/loanMarketCheck.routes.test.ts
```
Expected: FAIL - the route answers 404 for `/market-check` on every call.

- [ ] **Step 3: Write the service**

`packages/api/src/services/loanChecks/marketCheck.service.ts`:
```ts
/**
 * Compare-with-market data for one loan (EMI calculator plan 3, spec s6.2). The savings themselves are
 * computed by the shared `compareWithMarket` (the web card lets the user edit switching costs); this returns
 * the inputs: the loan's position from its own schedule, the best fresh market rate and the benchmark series.
 */
import {
  Decimal, MCLR_BENCHMARK_TENOR, rateLoanTypeForLoan,
  type BenchmarkKind, type BenchmarkSummaryWire, type LoanMarketCheckWire, type LoanRateBenchmark, type LoanRateType,
  type MarketRateWire, type RateLoanType,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { computeLoanSummary, type StoredLoan } from '../loans.service.js';
import { listLoanRates } from '../loanRates/loanRates.service.js';
import { isoDate, pctString } from '../loanRates/store.js';
import { canonicalLender } from './lenderAlias.js';

export interface LoanPosition {
  outstanding: Decimal;
  remainingMonths: number;
  nextEmiDate: string | null;
}

/** Outstanding balance, remaining EMIs and next EMI date from the loan's own schedule (payments included). */
export function loanPosition(loan: StoredLoan, asOf: Date): LoanPosition {
  const summary = computeLoanSummary(loan, asOf);
  return {
    outstanding: new Decimal(summary.outstandingBalance),
    remainingMonths: summary.remainingEmiCount,
    nextEmiDate: summary.nextEmiDate,
  };
}

/** Plan ruling 4: the lowest effective min rate that is not stale (SUSPECT rows never reach listLoanRates). */
export async function bestMarketRate(type: RateLoanType, now: Date): Promise<MarketRateWire | null> {
  const { rows } = await listLoanRates(type, now);
  const best = rows.find((row) => !row.stale);
  return best ? { sourceId: best.sourceId, lender: best.lender, minRatePct: best.minRatePct, asOf: best.asOf, sourceUrl: best.sourceUrl } : null;
}

export interface BenchmarkTarget {
  kind: BenchmarkKind;
  lender: string | null;
  tenor: string | null;
}

/**
 * Which benchmark series a loan follows (spec s6.1/s6.2): FLOATING + REPO -> repo; FLOATING + MCLR -> the
 * matched lender's 1-year MCLR, or repo for display when the lender is not tracked. Everything else: none.
 */
export function benchmarkTarget(rateType: string, rateBenchmark: string | null, lender: string | null): BenchmarkTarget | null {
  if (rateType !== 'FLOATING') return null;
  if (rateBenchmark === 'REPO') return { kind: 'REPO', lender: null, tenor: null };
  if (rateBenchmark === 'MCLR') {
    return lender !== null ? { kind: 'MCLR', lender, tenor: MCLR_BENCHMARK_TENOR } : { kind: 'REPO', lender: null, tenor: null };
  }
  return null;
}

/** Latest rate of the series and, when the two newest rows differ, the signed last change. */
export async function benchmarkSummary(target: BenchmarkTarget): Promise<BenchmarkSummaryWire | null> {
  const [current, previous] = await prisma.benchmarkRate.findMany({
    where: { kind: target.kind, lender: target.lender, tenor: target.tenor },
    orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }],
    take: 2,
  });
  if (!current) return null;
  const date = isoDate(current.effectiveDate)!;
  return {
    kind: target.kind,
    lender: target.lender,
    tenor: target.tenor,
    ratePct: pctString(current.ratePct),
    effectiveDate: date,
    lastChange:
      previous && !previous.ratePct.equals(current.ratePct)
        ? { deltaPct: pctString(current.ratePct.minus(previous.ratePct)), date }
        : null,
  };
}

export async function getLoanMarketCheck(userId: string, loanId: string, now: Date = new Date()): Promise<LoanMarketCheckWire> {
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId },
    include: { payments: { orderBy: { paidOn: 'asc' } } },
  });
  if (!loan) throw new NotFoundError(`Loan ${loanId} not found`);
  const rateLoanType = rateLoanTypeForLoan(loan.loanType);
  const lender = canonicalLender(loan.lenderName);
  const position = loanPosition(loan as unknown as StoredLoan, now);
  const target = benchmarkTarget(loan.rateType, loan.rateBenchmark, lender);
  return {
    loanId: loan.id,
    status: loan.status,
    loanType: loan.loanType,
    rateLoanType,
    lender,
    rateType: loan.rateType as LoanRateType,
    rateBenchmark: loan.rateBenchmark as LoanRateBenchmark | null,
    nextRateResetDate: isoDate(loan.nextRateResetDate),
    currentRatePct: pctString(loan.interestRate),
    outstanding: position.outstanding.toFixed(2),
    remainingMonths: position.remainingMonths,
    nextEmiDate: position.nextEmiDate,
    market: rateLoanType !== null ? await bestMarketRate(rateLoanType, now) : null,
    benchmark: target !== null ? await benchmarkSummary(target) : null,
  };
}
```

- [ ] **Step 4: Handler and route**

In `packages/api/src/controllers/loans.controller.ts`, add the import:
```ts
import { getLoanMarketCheck } from '../services/loanChecks/marketCheck.service.js';
```
and, after `getAmortizationHandler`:
```ts
/** GET /api/loans/:id/market-check (spec s6.2). */
export async function getLoanMarketCheckHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await getLoanMarketCheck(req.user.id, req.params['id']!));
}
```

In `packages/api/src/routes/loans.routes.ts`, add `getLoanMarketCheckHandler` to the import list from `../controllers/loans.controller.js`, and after `loansRouter.get('/:id/amortization', asyncHandler(getAmortizationHandler));`:
```ts
loansRouter.get('/:id/market-check', asyncHandler(getLoanMarketCheckHandler));
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/routes/loanMarketCheck.routes.test.ts test/routes/loanRates.routes.test.ts
npx tsc --noEmit
npx eslint src/services/loanChecks src/controllers/loans.controller.ts src/routes/loans.routes.ts
```
Expected: all PASS; no type or lint errors.

- [ ] **Step 6: Commit**

```bash
cd portfolioos
git add packages/api/src/services/loanChecks/marketCheck.service.ts packages/api/src/controllers/loans.controller.ts packages/api/src/routes/loans.routes.ts packages/api/test/routes/loanMarketCheck.routes.test.ts
git commit -m "feat(loan-checks): GET /api/loans/:id/market-check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Loan rate alert opt-out API

**Wave 3** (parallel with Task 4; needs Task 2).

**Files:**
- Create: `packages/api/src/services/notifications/alertPrefs.service.ts`
- Create: `packages/api/src/controllers/alertPrefs.controller.ts`
- Modify: `packages/api/src/routes/notifications.routes.ts`
- Test: `packages/api/test/routes/notificationPrefs.routes.test.ts`

**Interfaces:**
- Consumes: `User.loanRateAlerts` (Task 2), `type LoanAlertPrefsWire` (Task 1).
- Produces: `getLoanAlertPrefs(userId): Promise<LoanAlertPrefsWire>`, `setLoanAlertPrefs(userId, prefs: LoanAlertPrefsWire): Promise<LoanAlertPrefsWire>`; HTTP `GET /api/notifications/preferences` -> `{ loanRateAlerts: boolean }`, `PUT /api/notifications/preferences` body `{ loanRateAlerts: boolean }` (strict; anything else 422) -> the saved prefs.

- [ ] **Step 1: Write the failing test**

`packages/api/test/routes/notificationPrefs.routes.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { notificationsRouter } from '../../src/routes/notifications.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
const token = () => signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan: 'FREE' }).token;
const url = () => `${base}/api/notifications/preferences`;
const get = (auth = true) => fetch(url(), { headers: auth ? { authorization: `Bearer ${token()}` } : {} });
const put = (body: unknown) =>
  fetch(url(), { method: 'PUT', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  user = await createTestScope('loan-alert-prefs');
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationsRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await user.cleanup();
});

describe('/api/notifications/preferences', () => {
  it('requires auth', async () => expect((await get(false)).status).toBe(401));

  it('loan rate alerts are on by default', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ loanRateAlerts: true });
  });

  it('turning them off is saved on the user', async () => {
    const res = await put({ loanRateAlerts: false });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ loanRateAlerts: false });
    expect((await (await get()).json()).data).toEqual({ loanRateAlerts: false });
    const row = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { loanRateAlerts: true } }));
    expect(row.loanRateAlerts).toBe(false);
    await put({ loanRateAlerts: true });
  });

  it('rejects anything but a boolean flag', async () => {
    expect((await put({ loanRateAlerts: 'no' })).status).toBe(422);
    expect((await put({})).status).toBe(422);
    expect((await put({ loanRateAlerts: true, role: 'ADMIN' })).status).toBe(422);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/routes/notificationPrefs.routes.test.ts
```
Expected: FAIL - `/preferences` answers 404.

- [ ] **Step 3: Write the service, controller and routes**

`packages/api/src/services/notifications/alertPrefs.service.ts`:
```ts
/**
 * Settings -> Notifications -> "Loan rate alerts" (EMI calculator plan 3, spec s6.3). A real column, not a
 * key in User.preferences: the sidebar preferences endpoint replaces that JSON wholesale (plan ruling 2).
 * Per user; a manager acting for a managed profile reads and sets the profile's own flag.
 */
import type { LoanAlertPrefsWire } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';

export async function getLoanAlertPrefs(userId: string): Promise<LoanAlertPrefsWire> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { loanRateAlerts: true } });
  return { loanRateAlerts: user.loanRateAlerts };
}

export async function setLoanAlertPrefs(userId: string, prefs: LoanAlertPrefsWire): Promise<LoanAlertPrefsWire> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { loanRateAlerts: prefs.loanRateAlerts },
    select: { loanRateAlerts: true },
  });
  return { loanRateAlerts: user.loanRateAlerts };
}
```

`packages/api/src/controllers/alertPrefs.controller.ts`:
```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { getLoanAlertPrefs, setLoanAlertPrefs } from '../services/notifications/alertPrefs.service.js';

const prefsBody = z.object({ loanRateAlerts: z.boolean() }).strict();

/** GET /api/notifications/preferences */
export async function getAlertPrefsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await getLoanAlertPrefs(req.user.id));
}

/** PUT /api/notifications/preferences */
export async function putAlertPrefsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const prefs = prefsBody.parse(req.body);
  ok(res, await setLoanAlertPrefs(req.user.id, prefs));
}
```

In `packages/api/src/routes/notifications.routes.ts`, add:
```ts
import { getAlertPrefsHandler, putAlertPrefsHandler } from '../controllers/alertPrefs.controller.js';
```
and after `notificationsRouter.post('/test', asyncHandler(testConfigHandler));`:
```ts
notificationsRouter.get('/preferences', asyncHandler(getAlertPrefsHandler));
notificationsRouter.put('/preferences', asyncHandler(putAlertPrefsHandler));
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/routes/notificationPrefs.routes.test.ts
npx tsc --noEmit
npx eslint src/services/notifications/alertPrefs.service.ts src/controllers/alertPrefs.controller.ts src/routes/notifications.routes.ts
```
Expected: PASS; no type or lint errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/api/src/services/notifications/alertPrefs.service.ts packages/api/src/controllers/alertPrefs.controller.ts packages/api/src/routes/notifications.routes.ts packages/api/test/routes/notificationPrefs.routes.test.ts
git commit -m "feat(loan-checks): loan rate alert opt-out API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Web - rate type, benchmark and reset date on the loan forms

**Wave 2** (parallel with Tasks 2 and 7; needs Task 1; uses the API contract of Task 2, which the tests mock).

**Files:**
- Modify: `apps/web/src/api/loans.api.ts` (DTO fields, `getMarketCheck`)
- Create: `apps/web/src/pages/loans/LoanRateFields.tsx`
- Modify: `apps/web/src/pages/loans/LoanListPage.tsx` (`CreateLoanDialog`)
- Modify: `apps/web/src/pages/loans/LoanDetailPage.tsx` (`EditLoanDialog`)
- Test: `apps/web/src/pages/loans/LoanRateFields.test.tsx`

**Interfaces:**
- Consumes: `LOAN_RATE_TYPES`, `LOAN_RATE_TYPE_LABELS`, `LOAN_RATE_BENCHMARKS`, `LOAN_RATE_BENCHMARK_LABELS`, `type LoanRateType`, `type LoanRateBenchmark`, `type LoanMarketCheckWire` (Task 1).
- Produces:
  - `LoanDTO.rateType?: LoanRateType`, `.rateBenchmark?: LoanRateBenchmark | null`, `.nextRateResetDate?: string | null` (optional so older fixtures still type-check; the server always sends them)
  - `CreateLoanInput.rateType?`, `.rateBenchmark?`, `.nextRateResetDate?: string | null` (`UpdateLoanInput` follows)
  - `loansApi.getMarketCheck(id: string): Promise<LoanMarketCheckWire>`
  - `interface RateFieldsValue { rateType: LoanRateType; rateBenchmark: LoanRateBenchmark | null; nextRateResetDate: string }` (`''` = no date)
  - `rateFieldsFrom(loan?: { rateType?: string | null; rateBenchmark?: string | null; nextRateResetDate?: string | null } | null): RateFieldsValue`
  - `rateFieldsPayload(v: RateFieldsValue): { rateType: LoanRateType; rateBenchmark: LoanRateBenchmark | null; nextRateResetDate: string | null }`
  - `<LoanRateFields value onChange idPrefix? />` with labels "Rate type", "Linked to", "Next rate reset (optional)"

- [ ] **Step 1: Write the failing test**

`apps/web/src/pages/loans/LoanRateFields.test.tsx`:
```tsx
// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LoanRateFields, rateFieldsFrom, rateFieldsPayload, type RateFieldsValue } from './LoanRateFields';

afterEach(cleanup);

function Harness({ initial, onChange }: { initial: RateFieldsValue; onChange: (v: RateFieldsValue) => void }) {
  const [value, setValue] = useState(initial);
  return <LoanRateFields idPrefix="t" value={value} onChange={(next) => { setValue(next); onChange(next); }} />;
}

describe('LoanRateFields', () => {
  it('shows the benchmark and the reset date only for floating loans', () => {
    const onChange = vi.fn();
    render(<Harness initial={rateFieldsFrom(null)} onChange={onChange} />);
    expect((screen.getByLabelText('Rate type') as HTMLSelectElement).value).toBe('UNKNOWN');
    expect(screen.queryByLabelText('Linked to')).toBeNull();
    fireEvent.change(screen.getByLabelText('Rate type'), { target: { value: 'FLOATING' } });
    fireEvent.change(screen.getByLabelText('Linked to'), { target: { value: 'MCLR' } });
    fireEvent.change(screen.getByLabelText('Next rate reset (optional)'), { target: { value: '2027-04-01' } });
    expect(onChange).toHaveBeenLastCalledWith({ rateType: 'FLOATING', rateBenchmark: 'MCLR', nextRateResetDate: '2027-04-01' });
  });

  it('switching to fixed hides and clears them', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Rate type'), { target: { value: 'FIXED' } });
    expect(onChange).toHaveBeenLastCalledWith({ rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: '' });
    expect(screen.queryByLabelText('Linked to')).toBeNull();
  });

  it('"Not set" clears the benchmark', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Linked to'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ rateType: 'FLOATING', rateBenchmark: null, nextRateResetDate: '' });
  });
});

describe('rateFieldsFrom / rateFieldsPayload', () => {
  it('reads a loan, slicing the reset instant to a date', () => {
    expect(rateFieldsFrom({ rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01T00:00:00.000Z' }))
      .toEqual({ rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' });
  });
  it('unknown or missing values fall back to UNKNOWN with nothing else', () => {
    expect(rateFieldsFrom({ rateType: 'SOMETHING', rateBenchmark: 'REPO', nextRateResetDate: null }))
      .toEqual({ rateType: 'UNKNOWN', rateBenchmark: null, nextRateResetDate: '' });
    expect(rateFieldsFrom(undefined)).toEqual({ rateType: 'UNKNOWN', rateBenchmark: null, nextRateResetDate: '' });
  });
  it('sends nulls for non-floating loans and for an empty date', () => {
    expect(rateFieldsPayload({ rateType: 'FIXED', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' }))
      .toEqual({ rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null });
    expect(rateFieldsPayload({ rateType: 'FLOATING', rateBenchmark: 'MCLR', nextRateResetDate: '' }))
      .toEqual({ rateType: 'FLOATING', rateBenchmark: 'MCLR', nextRateResetDate: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/loans/LoanRateFields.test.tsx`
Expected: FAIL - cannot resolve `./LoanRateFields`.

- [ ] **Step 3: API client**

In `apps/web/src/api/loans.api.ts`:

1. Replace `import type { ApiResponse } from '@everypaisa/shared';` with:
```ts
import type { ApiResponse, LoanMarketCheckWire, LoanRateBenchmark, LoanRateType } from '@everypaisa/shared';
```
2. In `interface LoanDTO`, after `closedDate: string | null;`:
```ts
  /** Existing-loan checks (spec s6.1). Optional only so older fixtures type-check; the API always sends them. */
  rateType?: LoanRateType;
  rateBenchmark?: LoanRateBenchmark | null;
  /** ISO instant at UTC midnight, or null. */
  nextRateResetDate?: string | null;
```
3. In `interface CreateLoanInput`, after `closedDate?: string | null;`:
```ts
  rateType?: LoanRateType;
  rateBenchmark?: LoanRateBenchmark | null;
  /** 'YYYY-MM-DD' or null. */
  nextRateResetDate?: string | null;
```
4. In `loansApi`, after `getAmortization`:
```ts
  async getMarketCheck(id: string): Promise<LoanMarketCheckWire> {
    const { data } = await api.get<ApiResponse<LoanMarketCheckWire>>(`/api/loans/${id}/market-check`);
    return unwrap(data);
  },
```

- [ ] **Step 4: The fields component**

`apps/web/src/pages/loans/LoanRateFields.tsx`:
```tsx
import {
  LOAN_RATE_BENCHMARKS, LOAN_RATE_BENCHMARK_LABELS, LOAN_RATE_TYPES, LOAN_RATE_TYPE_LABELS,
  type LoanRateBenchmark, type LoanRateType,
} from '@everypaisa/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Form state for spec s6.1's three loan fields. `nextRateResetDate` is '' when not set. */
export interface RateFieldsValue {
  rateType: LoanRateType;
  rateBenchmark: LoanRateBenchmark | null;
  nextRateResetDate: string;
}

const isRateType = (v: unknown): v is LoanRateType => typeof v === 'string' && (LOAN_RATE_TYPES as readonly string[]).includes(v);
const isBenchmark = (v: unknown): v is LoanRateBenchmark => typeof v === 'string' && (LOAN_RATE_BENCHMARKS as readonly string[]).includes(v);

export function rateFieldsFrom(
  loan?: { rateType?: string | null; rateBenchmark?: string | null; nextRateResetDate?: string | null } | null,
): RateFieldsValue {
  const rawType = loan?.rateType;
  const rawBenchmark = loan?.rateBenchmark;
  const rateType: LoanRateType = isRateType(rawType) ? rawType : 'UNKNOWN';
  if (rateType !== 'FLOATING') return { rateType, rateBenchmark: null, nextRateResetDate: '' };
  return {
    rateType,
    rateBenchmark: isBenchmark(rawBenchmark) ? rawBenchmark : null,
    nextRateResetDate: (loan?.nextRateResetDate ?? '').slice(0, 10),
  };
}

/** What the API takes: benchmark and date only for FLOATING (the server refuses them otherwise). */
export function rateFieldsPayload(v: RateFieldsValue): {
  rateType: LoanRateType;
  rateBenchmark: LoanRateBenchmark | null;
  nextRateResetDate: string | null;
} {
  const floating = v.rateType === 'FLOATING';
  return {
    rateType: v.rateType,
    rateBenchmark: floating ? v.rateBenchmark : null,
    nextRateResetDate: floating && v.nextRateResetDate !== '' ? v.nextRateResetDate : null,
  };
}

export function LoanRateFields({
  value,
  onChange,
  idPrefix = 'loan',
}: {
  value: RateFieldsValue;
  onChange: (next: RateFieldsValue) => void;
  idPrefix?: string;
}) {
  const typeId = `${idPrefix}-rate-type`;
  const benchId = `${idPrefix}-rate-benchmark`;
  const resetId = `${idPrefix}-rate-reset`;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={typeId}>Rate type</Label>
        <Select
          id={typeId}
          className="mt-1"
          value={value.rateType}
          onChange={(e) => {
            const rateType = e.target.value as LoanRateType;
            onChange(rateType === 'FLOATING' ? { ...value, rateType } : { rateType, rateBenchmark: null, nextRateResetDate: '' });
          }}
        >
          {LOAN_RATE_TYPES.map((t) => (
            <option key={t} value={t}>{LOAN_RATE_TYPE_LABELS[t]}</option>
          ))}
        </Select>
      </div>
      {value.rateType === 'FLOATING' && (
        <>
          <div>
            <Label htmlFor={benchId}>Linked to</Label>
            <Select
              id={benchId}
              className="mt-1"
              value={value.rateBenchmark ?? ''}
              onChange={(e) => {
                const picked = e.target.value;
                onChange({ ...value, rateBenchmark: isBenchmark(picked) ? picked : null });
              }}
            >
              <option value="">Not set</option>
              {LOAN_RATE_BENCHMARKS.map((b) => (
                <option key={b} value={b}>{LOAN_RATE_BENCHMARK_LABELS[b]}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={resetId}>Next rate reset (optional)</Label>
            <Input
              id={resetId}
              type="date"
              className="mt-1"
              value={value.nextRateResetDate}
              onChange={(e) => onChange({ ...value, nextRateResetDate: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire it into the add and edit dialogs**

`apps/web/src/pages/loans/LoanListPage.tsx`, `CreateLoanDialog`:
1. Add the import next to the other local imports:
```ts
import { LoanRateFields, rateFieldsFrom, rateFieldsPayload, type RateFieldsValue } from './LoanRateFields';
```
2. After `const [errors, setErrors] = useState<Partial<Record<string, string>>>({});`:
```ts
  const [rate, setRate] = useState<RateFieldsValue>(() => rateFieldsFrom(initial));
```
3. In the re-sync `useEffect`, after `setErrors({});`:
```ts
      setRate(rateFieldsFrom(initial));
```
4. In `handleSubmit`, add to the object passed to `mutation.mutate({ ... })`, after `taxBenefitSection: form.taxBenefitSection || null,`:
```ts
      ...rateFieldsPayload(rate),
```
5. In the JSX, immediately before the grid whose first field is `<Label>Disbursement date *</Label>`:
```tsx
          <LoanRateFields idPrefix="add-loan" value={rate} onChange={setRate} />
```

`apps/web/src/pages/loans/LoanDetailPage.tsx`, `EditLoanDialog`:
1. Add the import:
```ts
import { LoanRateFields, rateFieldsFrom, rateFieldsPayload, type RateFieldsValue } from './LoanRateFields';
```
2. After `const [errors, setErrors] = useState<Partial<Record<string, string>>>({});`:
```ts
  const [rate, setRate] = useState<RateFieldsValue>(() => rateFieldsFrom(loan));
```
3. In the re-sync `useEffect`, after `setErrors({});`:
```ts
      setRate(rateFieldsFrom(loan));
```
4. In the mutation's `onSuccess`, after `qc.invalidateQueries({ queryKey: ['loans'] });`:
```ts
      qc.invalidateQueries({ queryKey: ['loan-market-check', loan.id] });
```
5. Change the Save button's handler to:
```tsx
          <Button onClick={() => { if (validate()) mutation.mutate({ ...form, ...rateFieldsPayload(rate) }); }} disabled={mutation.isPending}>
```
6. In the JSX, immediately before `<div>` that holds `<Label>Portfolio</Label>`:
```tsx
          <LoanRateFields idPrefix="edit-loan" value={rate} onChange={setRate} />
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run:
```bash
cd portfolioos/apps/web
npx vitest run src/pages/loans
npx tsc --noEmit
npx eslint src/pages/loans src/api/loans.api.ts
```
Expected: all PASS (new tests plus the existing `LoanListPage` and `InstallmentTracker` tests); no type or lint errors.

- [ ] **Step 7: Commit**

```bash
cd portfolioos
git add apps/web/src/api/loans.api.ts apps/web/src/pages/loans/LoanRateFields.tsx apps/web/src/pages/loans/LoanRateFields.test.tsx apps/web/src/pages/loans/LoanListPage.tsx apps/web/src/pages/loans/LoanDetailPage.tsx
git commit -m "feat(loan-checks): rate type, benchmark and reset date on the loan forms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Web - "Loan rate alerts" setting and the two alert labels

**Wave 2** (parallel with Tasks 2 and 6; needs Task 1; uses the API contract of Task 5, which the tests mock).

**Files:**
- Modify: `apps/web/src/api/notifications.api.ts` (`getPrefs`, `setPrefs`)
- Create: `apps/web/src/pages/settings/LoanRateAlertsCard.tsx`
- Modify: `apps/web/src/pages/settings/NotificationsSection.tsx` (render the card)
- Modify: `apps/web/src/api/alerts.api.ts` (`AlertType` union)
- Modify: `apps/web/src/pages/alerts/AlertsPage.tsx` (`TYPE_LABELS`, `ALL_TYPES`)
- Modify: `apps/web/src/pages/dashboard/DashboardPage.tsx` (`alertHref`)
- Test: `apps/web/src/pages/settings/LoanRateAlertsCard.test.tsx`, `apps/web/src/pages/alerts/AlertsPage.test.tsx`

**Interfaces:**
- Consumes: `type LoanAlertPrefsWire` (Task 1); HTTP `GET/PUT /api/notifications/preferences` (Task 5).
- Produces: `notificationsApi.getPrefs(): Promise<LoanAlertPrefsWire>`, `notificationsApi.setPrefs(prefs: LoanAlertPrefsWire): Promise<LoanAlertPrefsWire>`, `<LoanRateAlertsCard />` (query key `['notification-prefs']`), alert labels "Loan refinance" / "Loan rate change".

- [ ] **Step 1: Write the failing tests**

`apps/web/src/pages/settings/LoanRateAlertsCard.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { notificationsApi } from '@/api/notifications.api';
import { LoanRateAlertsCard } from './LoanRateAlertsCard';

vi.mock('@/api/notifications.api', () => ({ notificationsApi: { getPrefs: vi.fn(), setPrefs: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const box = () => screen.getByRole('checkbox', { name: /refinancing/i }) as HTMLInputElement;

describe('LoanRateAlertsCard', () => {
  it('shows the saved flag and saves a change', async () => {
    vi.mocked(notificationsApi.getPrefs).mockResolvedValue({ loanRateAlerts: true });
    vi.mocked(notificationsApi.setPrefs).mockResolvedValue({ loanRateAlerts: false });
    renderWithProviders(<LoanRateAlertsCard />);
    await waitFor(() => expect(box().checked).toBe(true));
    fireEvent.click(box());
    await waitFor(() => expect(notificationsApi.setPrefs).toHaveBeenCalledWith({ loanRateAlerts: false }));
    await waitFor(() => expect(box().checked).toBe(false));
  });

  it('a load error offers Try again', async () => {
    vi.mocked(notificationsApi.getPrefs).mockRejectedValueOnce(new Error('down')).mockResolvedValue({ loanRateAlerts: true });
    renderWithProviders(<LoanRateAlertsCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(box().checked).toBe(true));
  });
});
```

`apps/web/src/pages/alerts/AlertsPage.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { alertsApi } from '@/api/alerts.api';
import { AlertsPage } from './AlertsPage';

vi.mock('@/api/alerts.api', () => ({
  alertsApi: { list: vi.fn(), markRead: vi.fn(), delete: vi.fn(), markAllRead: vi.fn(), triggerScan: vi.fn(), createCustom: vi.fn(), getUnreadCount: vi.fn() },
}));

afterEach(cleanup);

describe('AlertsPage - loan check alerts', () => {
  it('labels refinance and rate-change alerts and offers them as filters', async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(alertsApi.list).mockResolvedValue({
      alerts: [
        { id: 'a1', type: 'LOAN_REFINANCE', title: 'Home loan with HDFC Bank at 9.10%; market from 8.35%', description: 'Switching could save ≈ ₹2.1 lakh after switching costs (lowest: SBI). Open the loan to compare.', triggerDate: today, isRead: false, metadata: { key: 'loan:refi:l1:2026-10' }, createdAt: `${today}T03:00:00.000Z` },
        { id: 'a2', type: 'LOAN_BENCHMARK_CHANGE', title: 'RBI cut the repo rate by 0.25% on 08/10/2026', description: null, triggerDate: today, isRead: false, metadata: { key: 'loan:bench:l2:REPO:2026-10-08' }, createdAt: `${today}T03:00:00.000Z` },
      ],
      total: 2, unreadCount: 2, page: 1, limit: 30,
    });
    renderWithProviders(<AlertsPage />);
    expect(await screen.findByText('Home loan with HDFC Bank at 9.10%; market from 8.35%')).toBeTruthy();
    // Once on the row, once in the type filter.
    expect(screen.getAllByText('Loan refinance')).toHaveLength(2);
    expect(screen.getAllByText('Loan rate change')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/settings/LoanRateAlertsCard.test.tsx src/pages/alerts/AlertsPage.test.tsx`
Expected: FAIL - cannot resolve `./LoanRateAlertsCard`; AlertsPage shows the raw fallback label `loan refinance` once and no filter option.

- [ ] **Step 3: API clients**

In `apps/web/src/api/notifications.api.ts`, replace `import type { ApiResponse } from '@everypaisa/shared';` with:
```ts
import type { ApiResponse, LoanAlertPrefsWire } from '@everypaisa/shared';
```
and add to `notificationsApi`:
```ts
  /** Settings -> Notifications -> Loan rate alerts (spec s6.3). */
  async getPrefs(): Promise<LoanAlertPrefsWire> {
    const { data } = await api.get<ApiResponse<LoanAlertPrefsWire>>('/api/notifications/preferences');
    return unwrap(data);
  },
  async setPrefs(prefs: LoanAlertPrefsWire): Promise<LoanAlertPrefsWire> {
    const { data } = await api.put<ApiResponse<LoanAlertPrefsWire>>('/api/notifications/preferences', prefs);
    return unwrap(data);
  },
```

In `apps/web/src/api/alerts.api.ts`, change the union to:
```ts
export type AlertType =
  | 'FD_MATURITY' | 'BOND_MATURITY' | 'MF_LOCK_IN_EXPIRY' | 'SIP_DUE'
  | 'INSURANCE_PREMIUM' | 'DIVIDEND_RECEIVED' | 'CORPORATE_ACTION'
  | 'PRICE_TARGET' | 'LOAN_REFINANCE' | 'LOAN_BENCHMARK_CHANGE' | 'CUSTOM';
```

- [ ] **Step 4: The card and the labels**

`apps/web/src/pages/settings/LoanRateAlertsCard.tsx`:
```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Percent } from 'lucide-react';
import type { LoanAlertPrefsWire } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notificationsApi } from '@/api/notifications.api';
import { apiErrorMessage } from '@/api/client';

const KEY = ['notification-prefs'];

/** spec s6.3 opt-out: refinance and repo/MCLR change alerts for this profile's loans. Default on. */
export function LoanRateAlertsCard() {
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: KEY, queryFn: () => notificationsApi.getPrefs() });
  const save = useMutation({
    mutationFn: (loanRateAlerts: boolean) => notificationsApi.setPrefs({ loanRateAlerts }),
    onSuccess: (saved: LoanAlertPrefsWire) => {
      qc.setQueryData(KEY, saved);
      toast.success(saved.loanRateAlerts ? 'Loan rate alerts on' : 'Loan rate alerts off');
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save - try again")),
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-accent-ink/70" />
          <CardTitle>Loan rate alerts</CardTitle>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Checked every morning against live lender rates and RBI / MCLR changes.</p>
      </CardHeader>
      <CardContent>
        {prefs.isLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : prefs.isError || !prefs.data ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>Couldn't load this setting.</span>
            <Button size="sm" variant="outline" onClick={() => void prefs.refetch()}>Try again</Button>
          </div>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={prefs.data.loanRateAlerts}
              disabled={save.isPending}
              onChange={(e) => save.mutate(e.target.checked)}
            />
            <span>Tell me when I could save by refinancing a loan, and when the repo rate or my lender's MCLR changes</span>
          </label>
        )}
      </CardContent>
    </Card>
  );
}
```

`apps/web/src/pages/settings/NotificationsSection.tsx`:
1. Add `import { LoanRateAlertsCard } from './LoanRateAlertsCard';`.
2. Change the component's `return (` / `<Card>` opening to `return (` / `<>` / `<Card>`, and its closing `</Card>` / `);` (the one right before `function GoogleGlyph`) to `</Card>` / `<LoanRateAlertsCard />` / `</>` / `);`.

`apps/web/src/pages/alerts/AlertsPage.tsx`:
1. In `TYPE_LABELS`, before `CUSTOM: 'Custom',`:
```ts
  LOAN_REFINANCE: 'Loan refinance',
  LOAN_BENCHMARK_CHANGE: 'Loan rate change',
```
2. Replace `ALL_TYPES` with:
```ts
const ALL_TYPES: AlertType[] = [
  'FD_MATURITY', 'BOND_MATURITY', 'MF_LOCK_IN_EXPIRY', 'SIP_DUE',
  'INSURANCE_PREMIUM', 'DIVIDEND_RECEIVED', 'CORPORATE_ACTION', 'PRICE_TARGET',
  'LOAN_REFINANCE', 'LOAN_BENCHMARK_CHANGE', 'CUSTOM',
];
```

`apps/web/src/pages/dashboard/DashboardPage.tsx`, in `alertHref`, add to the `/loans` group:
```ts
    case 'LOAN_EMI_OVERDUE':
    case 'LOAN_EMI_DUE':
    case 'LOAN_REFINANCE':
    case 'LOAN_BENCHMARK_CHANGE':
      return '/loans';
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run:
```bash
cd portfolioos/apps/web
npx vitest run src/pages/settings src/pages/alerts
npx tsc --noEmit
npx eslint src/pages/settings/LoanRateAlertsCard.tsx src/pages/settings/NotificationsSection.tsx src/pages/alerts src/pages/dashboard/DashboardPage.tsx src/api/notifications.api.ts src/api/alerts.api.ts
```
Expected: all PASS (including Plan 2's `LoanRatesAdminPage` tests); no type or lint errors.

- [ ] **Step 6: Commit**

```bash
cd portfolioos
git add apps/web/src/api/notifications.api.ts apps/web/src/api/alerts.api.ts apps/web/src/pages/settings/LoanRateAlertsCard.tsx apps/web/src/pages/settings/LoanRateAlertsCard.test.tsx apps/web/src/pages/settings/NotificationsSection.tsx apps/web/src/pages/alerts/AlertsPage.tsx apps/web/src/pages/alerts/AlertsPage.test.tsx apps/web/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat(loan-checks): Loan rate alerts setting and alert labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: LOAN_REFINANCE and LOAN_BENCHMARK_CHANGE alerts - the daily job

**Wave 4** (parallel with Task 9; needs Tasks 1-4).

**Files:**
- Create: `packages/api/src/services/loanChecks/loanAlertText.ts`
- Create: `packages/api/src/services/loanChecks/loanAlerts.service.ts`
- Create: `packages/api/src/jobs/loanChecksJob.ts`
- Modify: `packages/api/src/jobs/loanRatesJob.ts` (`runDailyLoanJobs`; the cron calls it; header comment)
- Test: `packages/api/test/loanChecks/loanAlertText.test.ts`, `packages/api/test/jobs/loanChecksJob.test.ts`, `packages/api/test/jobs/dailyLoanJobs.test.ts`

**Interfaces:**
- Consumes: Task 1 `compareWithMarket`, `switchingCost`, `passThroughEstimate`, `nextResetOnOrAfter`, `approxInr`, `rateLoanTypeForLoan`, `REFINANCE_MIN_GAP_PP`, `DEFAULT_SWITCHING_COSTS`, `MCLR_BENCHMARK_TENOR`, `Decimal`, `formatDateOnly`, `formatINR`; Task 3 `canonicalLender`; Task 4 `loanPosition`, `bestMarketRate`; Plan 2 `istDate(now)` (`services/loanRates/sanity.ts`), `isoDate(d)` (`store.ts`), `runLoanRatesJob()`; `runAsSystem`, `runAsUser` (`lib/requestContext.ts`).
- Produces:
  - `loanLabel(loanType: string): string`, `interface AlertText { title: string; description: string }`, `refinanceAlertText(...)`, `benchmarkAlertText(...)` (signatures below)
  - `BENCHMARK_LOOKBACK_DAYS = 7`, `interface BenchmarkChange { kind: BenchmarkKind; lender: string | null; ratePct: Decimal; deltaPct: Decimal; effectiveDate: string; fetchedAt: Date }`, `findBenchmarkChanges(now: Date): Promise<BenchmarkChange[]>`
  - `eligibleUserIds(only?: string[]): Promise<string[]>` (call under `runAsSystem`)
  - `interface LoanCheckContext { now: Date; changes: BenchmarkChange[]; market: (type: RateLoanType) => Promise<MarketRateWire | null> }`, `interface UserCheckResult { refinance: number; benchmark: number; failedLoans: number }`, `checkUserLoans(userId: string, ctx: LoanCheckContext): Promise<UserCheckResult>` (call under `runAsUser(userId)`)
  - `interface LoanChecksOptions { now?: Date; userIds?: string[] }`, `interface LoanChecksResult { users; refinance; benchmark; changes; failedLoans; failedUsers: number }`, `runLoanChecks(options?): Promise<LoanChecksResult | null>` (null when a run is in progress), `runLoanChecksJob(): Promise<LoanChecksResult | null>`
  - `runDailyLoanJobs(steps?: { rates: () => Promise<unknown>; checks: () => Promise<unknown> }): Promise<void>` in `loanRatesJob.ts`

- [ ] **Step 1: Write the failing tests**

`packages/api/test/loanChecks/loanAlertText.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Decimal, type PassThroughEstimate } from '@everypaisa/shared';
import { benchmarkAlertText, loanLabel, refinanceAlertText } from '../../src/services/loanChecks/loanAlertText.js';

const D = (v: string | number) => new Decimal(v);
const estimate = (newEmi: string, tenureDeltaMonths: number | null): PassThroughEstimate =>
  ({ newRatePct: D(0), currentEmi: D(0), newEmi: D(newEmi), tenureDeltaMonths });

describe('refinanceAlertText', () => {
  it('names the loan, both rates and the rounded net saving', () => {
    expect(refinanceAlertText({
      loanType: 'HOME', lenderName: 'HDFC Bank', currentRatePct: D('9.1'), marketLender: 'SBI', marketRatePct: D('8.35'), netSaving: D('214108.70'),
    })).toEqual({
      title: 'Home loan with HDFC Bank at 9.10%; market from 8.35%',
      description: 'Switching could save ≈ ₹2.1 lakh after switching costs (lowest: SBI). Open the loan to compare.',
    });
  });
});

describe('benchmarkAlertText', () => {
  it('repo cut with a reset date and both estimates (dd/mm/yyyy dates)', () => {
    expect(benchmarkAlertText({
      kind: 'REPO', benchmarkLender: null, deltaPct: D('-0.25'), effectiveDate: '2026-10-08', lenderName: 'State Bank of India',
      nextResetDate: '2027-01-01', estimate: estimate('29105', -5),
    })).toEqual({
      title: 'RBI cut the repo rate by 0.25% on 08/10/2026',
      description: 'Your State Bank of India loan rate should drop at the next reset (≈ 01/01/2027). Estimated: EMI ≈ ₹29,105 or tenure -5 months, assuming the full change is passed on.',
    });
  });

  it('MCLR rise: rise wording, + months, singular month', () => {
    expect(benchmarkAlertText({
      kind: 'MCLR', benchmarkLender: 'HDFC Bank', deltaPct: D('0.10'), effectiveDate: '2026-11-01', lenderName: 'HDFC Ltd',
      nextResetDate: null, estimate: estimate('29719', 1),
    })).toEqual({
      title: 'HDFC Bank raised its 1-year MCLR by 0.10% on 01/11/2026',
      description: 'Your HDFC Ltd loan rate should rise at the next reset. Estimated: EMI ≈ ₹29,719 or tenure +1 month, assuming the full change is passed on.',
    });
  });

  it('no tenure estimate -> EMI only; no estimate -> no Estimated sentence', () => {
    const base = { kind: 'REPO' as const, benchmarkLender: null, deltaPct: D('0.50'), effectiveDate: '2026-12-05', lenderName: 'PNB', nextResetDate: null };
    expect(benchmarkAlertText({ ...base, estimate: estimate('29709', null) }).description)
      .toBe('Your PNB loan rate should rise at the next reset. Estimated: EMI ≈ ₹29,709, assuming the full change is passed on.');
    expect(benchmarkAlertText({ ...base, estimate: null }).description).toBe('Your PNB loan rate should rise at the next reset.');
  });

  it('uses plain hyphens only', () => {
    const t = benchmarkAlertText({ kind: 'REPO', benchmarkLender: null, deltaPct: D('-0.25'), effectiveDate: '2026-10-08', lenderName: 'SBI', nextResetDate: null, estimate: estimate('29105', -5) });
    expect(`${t.title} ${t.description}`).not.toMatch(/[–—−]/);
  });
});

describe('loanLabel', () => {
  it('maps known types and falls back to "Loan"', () => {
    expect(loanLabel('LAS')).toBe('Loan against securities');
    expect(loanLabel('CAR')).toBe('Car loan');
    expect(loanLabel('OTHER')).toBe('Loan');
    expect(loanLabel('toString')).toBe('Loan');
  });
});
```

`packages/api/test/jobs/dailyLoanJobs.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runDailyLoanJobs } from '../../src/jobs/loanRatesJob.js';

describe('runDailyLoanJobs (spec s6.3: checks run after the rates job)', () => {
  it('runs the loan checks after the rates job', async () => {
    const order: string[] = [];
    await runDailyLoanJobs({ rates: async () => { order.push('rates'); }, checks: async () => { order.push('checks'); } });
    expect(order).toEqual(['rates', 'checks']);
  });

  it('still runs the loan checks when the rates job fails', async () => {
    const order: string[] = [];
    await runDailyLoanJobs({
      rates: async () => { order.push('rates'); throw new Error('bank page down'); },
      checks: async () => { order.push('checks'); },
    });
    expect(order).toEqual(['rates', 'checks']);
  });
});
```

`packages/api/test/jobs/loanChecksJob.test.ts`:
```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Alert } from '@prisma/client';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { runLoanChecks } from '../../src/jobs/loanChecksJob.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

/** 08:30 IST, an hour after the 07:30 rates run. */
const NOW = new Date('2026-10-12T03:00:00Z');
const NEXT_MONTH = new Date('2026-11-12T03:00:00Z');
const BEFORE_CHANGES = new Date('2026-09-01T00:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

let owner: TestScope;
let optedOut: TestScope;
let managedId = '';
let caClientId = '';
const ids: Record<string, string> = {};
const scope = () => [owner.userId, optedOut.userId, managedId, caClientId];

async function shadowUser(label: string, managedById: string | null): Promise<string> {
  const row = await sys(() => prisma.user.create({
    data: { email: `inv-${label}-${randomUUID().slice(0, 8)}@test.local`, passwordHash: 'test-not-a-real-hash', name: `Test ${label}`, isShadowClient: true, managedById },
  }));
  return row.id;
}

interface LoanSpec { lenderName: string; rate: string; emi: string; loanType?: string; rateType: string; rateBenchmark?: string; nextRateResetDate?: string; createdAt?: Date }
async function addLoan(name: string, userId: string, spec: LoanSpec): Promise<void> {
  const row = await sys(() => prisma.loan.create({
    data: {
      userId, lenderName: spec.lenderName, loanType: spec.loanType ?? 'HOME', borrowerName: 'Test Borrower',
      principalAmount: '3000000', interestRate: spec.rate, tenureMonths: 180, emiAmount: spec.emi, emiDueDay: 5,
      disbursementDate: day('2026-10-01'), firstEmiDate: day('2026-11-05'),
      rateType: spec.rateType, rateBenchmark: spec.rateBenchmark ?? null,
      nextRateResetDate: spec.nextRateResetDate ? day(spec.nextRateResetDate) : null,
      createdAt: spec.createdAt ?? BEFORE_CHANGES,
    },
  }));
  ids[name] = row.id;
}

async function alertsOf(userId: string): Promise<Alert[]> {
  return sys(() => prisma.alert.findMany({
    where: { userId, type: { in: ['LOAN_REFINANCE', 'LOAN_BENCHMARK_CHANGE'] } },
    orderBy: { createdAt: 'asc' },
  }));
}
const loanIdOf = (a: Alert) => (a.metadata as { loanId?: string }).loanId;

beforeAll(async () => {
  owner = await createTestScope('loan-checks-owner');
  optedOut = await createTestScope('loan-checks-opted-out');
  managedId = await shadowUser('loan-checks-managed', owner.userId);
  caClientId = await shadowUser('loan-checks-ca-client', null);
  await sys(() => prisma.user.update({ where: { id: optedOut.userId }, data: { loanRateAlerts: false } }));

  await sys(() => ensureLoanRateSources(true));
  await clearLoanRateTables();
  await sys(async () => {
    await prisma.loanRateSource.update({ where: { id: 'sbi.home' }, data: { lastSuccessAt: new Date(NOW.getTime() - HOUR) } });
    await prisma.loanRateSource.update({ where: { id: 'kotak.home' }, data: { lastSuccessAt: new Date(NOW.getTime() - 8 * DAY) } });
    await prisma.loanRate.createMany({
      data: [
        { sourceId: 'sbi.home', basis: 'REPO_LINKED', minRatePct: '8.35', maxRatePct: '10.05', origin: 'AUTO', status: 'ACTIVE', fetchedAt: new Date(NOW.getTime() - 2 * HOUR) },
        // Lower but stale: must not drive a refinance alert.
        { sourceId: 'kotak.home', basis: 'REPO_LINKED', minRatePct: '7.70', maxRatePct: '13.05', origin: 'AUTO', status: 'ACTIVE', fetchedAt: new Date(NOW.getTime() - 8 * DAY) },
      ],
    });
    await prisma.benchmarkRate.createMany({
      data: [
        { kind: 'REPO', lender: null, tenor: null, ratePct: '5.50', effectiveDate: day('2026-06-06'), fetchedAt: new Date('2026-06-06T04:00:00Z') },
        { kind: 'REPO', lender: null, tenor: null, ratePct: '5.25', effectiveDate: day('2026-10-08'), fetchedAt: new Date('2026-10-09T02:00:00Z') },
        { kind: 'MCLR', lender: 'SBI', tenor: '1Y', ratePct: '8.75', effectiveDate: day('2026-09-15'), fetchedAt: new Date('2026-09-15T02:00:00Z') },
        { kind: 'MCLR', lender: 'SBI', tenor: '1Y', ratePct: '8.65', effectiveDate: day('2026-10-10'), fetchedAt: new Date('2026-10-10T02:00:00Z') },
      ],
    });
  });

  // A: fixed, 0.75 pp above the market -> refinance.
  await addLoan('A', owner.userId, { lenderName: 'HDFC Bank', rate: '9.10', emi: '30607', rateType: 'FIXED' });
  // B: floating repo-linked, reset date in the past -> repo alert with the rolled-forward reset.
  await addLoan('B', owner.userId, { lenderName: 'State Bank of India', rate: '8.50', emi: '29543', rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2026-07-01' });
  // C: floating MCLR with a tracked lender -> MCLR alert only.
  await addLoan('C', owner.userId, { lenderName: 'SBI', rate: '8.60', emi: '29719', rateType: 'FLOATING', rateBenchmark: 'MCLR' });
  // D: UNKNOWN rate type, close to the market -> nothing.
  await addLoan('D', owner.userId, { lenderName: 'Axis Bank', rate: '8.50', emi: '29543', rateType: 'UNKNOWN' });
  // E: floating repo, but added after the cut was seen -> nothing (and no CAR market rates).
  await addLoan('E', owner.userId, { lenderName: 'HDFC Bank', loanType: 'CAR', rate: '8.50', emi: '29543', rateType: 'FLOATING', rateBenchmark: 'REPO', createdAt: new Date('2026-10-11T00:00:00Z') });
  // I: floating MCLR with an untracked lender -> no MCLR alert, and the repo cut is not its benchmark.
  await addLoan('I', owner.userId, { lenderName: 'Bajaj Finance', rate: '8.50', emi: '29543', rateType: 'FLOATING', rateBenchmark: 'MCLR' });
  // G: managed family profile, same as A -> refinance on the profile's own alerts.
  await addLoan('G', managedId, { lenderName: 'HDFC Bank', rate: '9.10', emi: '30607', rateType: 'FIXED' });
  // F: opted out; H: a CA-owned shadow client -> nothing for either.
  await addLoan('F', optedOut.userId, { lenderName: 'HDFC Bank', rate: '9.50', emi: '31327', rateType: 'FIXED' });
  await addLoan('H', caClientId, { lenderName: 'HDFC Bank', rate: '9.10', emi: '30607', rateType: 'FIXED' });
});

afterAll(async () => {
  await sys(() => prisma.user.deleteMany({ where: { id: { in: [managedId, caClientId] } } }));
  await clearLoanRateTables();
  await owner.cleanup();
  await optedOut.cleanup();
});

describe('runLoanChecks (spec s6.3)', () => {
  it('first run: refinance for loans well above the market, benchmark alerts for matching floating loans only', async () => {
    const result = await runLoanChecks({ now: NOW, userIds: scope() });
    expect(result).toEqual({ users: 2, refinance: 2, benchmark: 2, changes: 2, failedLoans: 0, failedUsers: 0 });

    const mine = await alertsOf(owner.userId);
    const of = (name: string) => mine.filter((a) => loanIdOf(a) === ids[name]);

    expect(of('A')).toHaveLength(1);
    expect(of('A')[0]).toMatchObject({
      type: 'LOAN_REFINANCE',
      title: 'Home loan with HDFC Bank at 9.10%; market from 8.35%',
      description: 'Switching could save ≈ ₹2.1 lakh after switching costs (lowest: SBI). Open the loan to compare.',
    });
    expect(of('A')[0]!.metadata).toMatchObject({
      key: `loan:refi:${ids.A}:2026-10`, month: '2026-10', currentRatePct: '9.10', marketRatePct: '8.35', marketLender: 'SBI',
      netSaving: '214108.70', breakEvenMonth: 19,
    });

    expect(of('B')).toHaveLength(1);
    expect(of('B')[0]).toMatchObject({
      type: 'LOAN_BENCHMARK_CHANGE',
      title: 'RBI cut the repo rate by 0.25% on 08/10/2026',
      description: 'Your State Bank of India loan rate should drop at the next reset (≈ 01/01/2027). Estimated: EMI ≈ ₹29,105 or tenure -5 months, assuming the full change is passed on.',
    });
    expect(of('B')[0]!.metadata).toMatchObject({
      key: `loan:bench:${ids.B}:REPO:2026-10-08`, kind: 'REPO', effectiveDate: '2026-10-08', deltaPct: '-0.25', nextResetDate: '2027-01-01',
      newEmi: '29105', tenureDeltaMonths: -5,
    });

    expect(of('C')).toHaveLength(1);
    expect(of('C')[0]).toMatchObject({
      type: 'LOAN_BENCHMARK_CHANGE',
      title: 'SBI cut its 1-year MCLR by 0.10% on 10/10/2026',
      description: 'Your SBI loan rate should drop at the next reset. Estimated: EMI ≈ ₹29,543 or tenure -2 months, assuming the full change is passed on.',
    });

    for (const name of ['D', 'E', 'I']) expect(of(name), name).toEqual([]);
    expect(mine).toHaveLength(3);
    expect((await alertsOf(managedId)).map((a) => [a.type, loanIdOf(a)])).toEqual([['LOAN_REFINANCE', ids.G]]);
    expect(await alertsOf(optedOut.userId)).toEqual([]);
    expect(await alertsOf(caClientId)).toEqual([]);
  });

  it('a second run the same day creates nothing', async () => {
    const result = await runLoanChecks({ now: new Date(NOW.getTime() + 2 * HOUR), userIds: scope() });
    expect(result).toMatchObject({ refinance: 0, benchmark: 0 });
    expect(await alertsOf(owner.userId)).toHaveLength(3);
  });

  it('next month: one new refinance alert per loan, no repeated benchmark alert', async () => {
    await sys(() => prisma.loanRateSource.update({ where: { id: 'sbi.home' }, data: { lastSuccessAt: new Date(NEXT_MONTH.getTime() - HOUR) } }));
    const result = await runLoanChecks({ now: NEXT_MONTH, userIds: scope() });
    expect(result).toMatchObject({ refinance: 2, benchmark: 0, changes: 0 });
    const keys = (await alertsOf(owner.userId)).map((a) => (a.metadata as { key: string }).key);
    expect(keys).toContain(`loan:refi:${ids.A}:2026-11`);
    expect(keys).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/loanChecks/loanAlertText.test.ts test/jobs/dailyLoanJobs.test.ts test/jobs/loanChecksJob.test.ts
```
Expected: FAIL - cannot find modules `loanAlertText.js` and `loanChecksJob.js`; `runDailyLoanJobs` is not exported.

- [ ] **Step 3: Alert text (pure)**

`packages/api/src/services/loanChecks/loanAlertText.ts`:
```ts
/**
 * Alert wording for the existing-loan checks (spec s6.3). Dates dd/mm/yyyy, rates to 2 dp, money rounded;
 * plain hyphens only. Pure, so the exact text is pinned by unit tests.
 */
import { approxInr, formatDateOnly, formatINR, type BenchmarkKind, type Decimal, type PassThroughEstimate } from '@everypaisa/shared';

const LOAN_LABELS: ReadonlyMap<string, string> = new Map([
  ['HOME', 'Home loan'],
  ['CAR', 'Car loan'],
  ['PERSONAL', 'Personal loan'],
  ['EDUCATION', 'Education loan'],
  ['BUSINESS', 'Business loan'],
  ['GOLD', 'Gold loan'],
  ['LAS', 'Loan against securities'],
]);

export function loanLabel(loanType: string): string {
  return LOAN_LABELS.get(loanType) ?? 'Loan';
}

export interface AlertText {
  title: string;
  description: string;
}

const pct = (d: Decimal) => d.toFixed(2);
const rupees = (d: Decimal) => formatINR(d.toFixed(0), { fractionDigits: 0 });

export function refinanceAlertText(i: {
  loanType: string;
  lenderName: string;
  currentRatePct: Decimal;
  marketLender: string;
  marketRatePct: Decimal;
  netSaving: Decimal;
}): AlertText {
  return {
    title: `${loanLabel(i.loanType)} with ${i.lenderName} at ${pct(i.currentRatePct)}%; market from ${pct(i.marketRatePct)}%`,
    description: `Switching could save ≈ ${approxInr(i.netSaving)} after switching costs (lowest: ${i.marketLender}). Open the loan to compare.`,
  };
}

export function benchmarkAlertText(i: {
  kind: BenchmarkKind;
  /** Canonical lender of an MCLR series; null for REPO. */
  benchmarkLender: string | null;
  deltaPct: Decimal;
  effectiveDate: string;
  /** The loan's lender as the user typed it. */
  lenderName: string;
  nextResetDate: string | null;
  estimate: PassThroughEstimate | null;
}): AlertText {
  const cut = i.deltaPct.isNegative();
  const verb = cut ? 'cut' : 'raised';
  const size = `${i.deltaPct.abs().toFixed(2)}%`;
  const on = formatDateOnly(i.effectiveDate);
  const title =
    i.kind === 'REPO'
      ? `RBI ${verb} the repo rate by ${size} on ${on}`
      : `${i.benchmarkLender ?? 'Your lender'} ${verb} its 1-year MCLR by ${size} on ${on}`;
  const reset = i.nextResetDate !== null ? ` (≈ ${formatDateOnly(i.nextResetDate)})` : '';
  let description = `Your ${i.lenderName} loan rate should ${cut ? 'drop' : 'rise'} at the next reset${reset}.`;
  if (i.estimate !== null) {
    const months = i.estimate.tenureDeltaMonths;
    const tenure =
      months === null || months === 0
        ? ''
        : ` or tenure ${months > 0 ? '+' : '-'}${Math.abs(months)} month${Math.abs(months) === 1 ? '' : 's'}`;
    description += ` Estimated: EMI ≈ ${rupees(i.estimate.newEmi)}${tenure}, assuming the full change is passed on.`;
  }
  return { title, description };
}
```

- [ ] **Step 4: Change detection and per-user checks**

`packages/api/src/services/loanChecks/loanAlerts.service.ts`:
```ts
/**
 * The daily existing-loan checks (spec s6.3), one user at a time. `findBenchmarkChanges` and
 * `eligibleUserIds` read across users and run under runAsSystem; `checkUserLoans` runs under
 * runAsUser(userId), so it can only see and write that user's loans and alerts.
 */
import type { Loan, LoanPayment, Prisma } from '@prisma/client';
import {
  DEFAULT_SWITCHING_COSTS, Decimal, MCLR_BENCHMARK_TENOR, REFINANCE_MIN_GAP_PP,
  compareWithMarket, nextResetOnOrAfter, passThroughEstimate, rateLoanTypeForLoan, switchingCost,
  type BenchmarkKind, type MarketRateWire, type RateLoanType,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { istDate } from '../loanRates/sanity.js';
import { isoDate } from '../loanRates/store.js';
import type { StoredLoan } from '../loans.service.js';
import { canonicalLender } from './lenderAlias.js';
import { benchmarkAlertText, refinanceAlertText } from './loanAlertText.js';
import { loanPosition } from './marketCheck.service.js';

/** Plan ruling 7: a change fetched within this window is still news; the dedup key stops repeats. */
export const BENCHMARK_LOOKBACK_DAYS = 7;
const DAY_MS = 86_400_000;

export interface BenchmarkChange {
  kind: BenchmarkKind;
  lender: string | null;
  ratePct: Decimal;
  /** Signed: negative is a cut. */
  deltaPct: Decimal;
  effectiveDate: string;
  fetchedAt: Date;
}

/** REPO and 1-year MCLR rows fetched in the window whose previous row in the same series has another rate. */
export async function findBenchmarkChanges(now: Date): Promise<BenchmarkChange[]> {
  const since = new Date(now.getTime() - BENCHMARK_LOOKBACK_DAYS * DAY_MS);
  const recent = await prisma.benchmarkRate.findMany({
    where: {
      fetchedAt: { gte: since, lte: now },
      OR: [{ kind: 'REPO', lender: null, tenor: null }, { kind: 'MCLR', tenor: MCLR_BENCHMARK_TENOR }],
    },
    orderBy: [{ effectiveDate: 'asc' }, { fetchedAt: 'asc' }],
  });
  const changes: BenchmarkChange[] = [];
  for (const row of recent) {
    const previous = await prisma.benchmarkRate.findFirst({
      where: {
        kind: row.kind,
        lender: row.lender,
        tenor: row.tenor,
        id: { not: row.id },
        OR: [{ effectiveDate: { lt: row.effectiveDate } }, { effectiveDate: row.effectiveDate, fetchedAt: { lt: row.fetchedAt } }],
      },
      orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }],
    });
    if (!previous || previous.ratePct.equals(row.ratePct)) continue;
    changes.push({
      kind: row.kind as BenchmarkKind,
      lender: row.lender,
      ratePct: new Decimal(row.ratePct.toString()),
      deltaPct: new Decimal(row.ratePct.minus(previous.ratePct).toString()),
      effectiveDate: isoDate(row.effectiveDate)!,
      fetchedAt: row.fetchedAt,
    });
  }
  return changes;
}

/**
 * Plan ruling 10: owners of ACTIVE loans who are active, not scheduled for deletion, opted in, and not a
 * CA-owned shadow client (managed family profiles are included). Loans are read first because a relation
 * filter on User would run Loan's RLS policy without the system bypass.
 */
export async function eligibleUserIds(only?: string[]): Promise<string[]> {
  const owners = await prisma.loan.findMany({
    where: { status: 'ACTIVE', ...(only ? { userId: { in: only } } : {}) },
    select: { userId: true },
    distinct: ['userId'],
  });
  if (owners.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      id: { in: owners.map((o) => o.userId) },
      isActive: true,
      loanRateAlerts: true,
      deletionScheduledFor: null,
      OR: [{ isShadowClient: false }, { managedById: { not: null } }],
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return users.map((u) => u.id);
}

export interface LoanCheckContext {
  now: Date;
  changes: BenchmarkChange[];
  market: (type: RateLoanType) => Promise<MarketRateWire | null>;
}

export interface UserCheckResult {
  refinance: number;
  benchmark: number;
  failedLoans: number;
}

type LoanWithPayments = Loan & { payments: LoanPayment[] };

export async function checkUserLoans(userId: string, ctx: LoanCheckContext): Promise<UserCheckResult> {
  const loans = await prisma.loan.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { payments: { orderBy: { paidOn: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  const result: UserCheckResult = { refinance: 0, benchmark: 0, failedLoans: 0 };
  for (const loan of loans) {
    try {
      result.refinance += await refinanceCheck(loan, ctx);
      result.benchmark += await benchmarkChecks(loan, ctx);
    } catch (err) {
      // One loan whose schedule cannot be built must not cost the user's other loans their checks; it is
      // counted in the run result and logged with its id.
      result.failedLoans++;
      logger.warn({ err, loanId: loan.id }, '[loanChecks] loan skipped');
    }
  }
  return result;
}

async function alertExists(userId: string, type: 'LOAN_REFINANCE' | 'LOAN_BENCHMARK_CHANGE', key: string): Promise<boolean> {
  const row = await prisma.alert.findFirst({ where: { userId, type, metadata: { path: ['key'], equals: key } }, select: { id: true } });
  return row !== null;
}

async function refinanceCheck(loan: LoanWithPayments, ctx: LoanCheckContext): Promise<number> {
  const type = rateLoanTypeForLoan(loan.loanType);
  if (type === null) return 0;
  const market = await ctx.market(type);
  if (market === null) return 0;
  const current = new Decimal(loan.interestRate.toString());
  const best = new Decimal(market.minRatePct);
  if (current.minus(best).lessThan(REFINANCE_MIN_GAP_PP)) return 0;
  const position = loanPosition(loan as unknown as StoredLoan, ctx.now);
  const cost = switchingCost(position.outstanding, new Decimal(DEFAULT_SWITCHING_COSTS.processingPct), new Decimal(DEFAULT_SWITCHING_COSTS.otherCharges));
  const comparison = compareWithMarket({
    outstanding: position.outstanding,
    remainingMonths: position.remainingMonths,
    currentRatePct: current,
    marketRatePct: best,
    switchingCost: cost,
  });
  if (comparison === null || !comparison.netSaving.greaterThan(0)) return 0;
  const month = istDate(ctx.now).slice(0, 7);
  const key = `loan:refi:${loan.id}:${month}`;
  if (await alertExists(loan.userId, 'LOAN_REFINANCE', key)) return 0;
  const text = refinanceAlertText({
    loanType: loan.loanType, lenderName: loan.lenderName, currentRatePct: current,
    marketLender: market.lender, marketRatePct: best, netSaving: comparison.netSaving,
  });
  const metadata: Prisma.InputJsonObject = {
    key,
    loanId: loan.id,
    lenderName: loan.lenderName,
    month,
    currentRatePct: current.toFixed(2),
    marketRatePct: best.toFixed(2),
    marketLender: market.lender,
    marketSourceId: market.sourceId,
    netSaving: comparison.netSaving.toFixed(2),
    breakEvenMonth: comparison.breakEvenMonth,
  };
  await prisma.alert.create({
    data: { userId: loan.userId, type: 'LOAN_REFINANCE', title: text.title, description: text.description, triggerDate: ctx.now, metadata },
  });
  return 1;
}

async function benchmarkChecks(loan: LoanWithPayments, ctx: LoanCheckContext): Promise<number> {
  if (loan.rateType !== 'FLOATING' || ctx.changes.length === 0) return 0;
  const lender = canonicalLender(loan.lenderName);
  const applicable = ctx.changes.filter(
    (c) =>
      (c.kind === 'REPO' && loan.rateBenchmark === 'REPO') ||
      (c.kind === 'MCLR' && loan.rateBenchmark === 'MCLR' && lender !== null && c.lender === lender),
  );
  let created = 0;
  for (const change of applicable) {
    // Plan ruling 7: a loan entered after the change was seen already carries the new rate.
    if (loan.createdAt.getTime() >= change.fetchedAt.getTime()) continue;
    const key = `loan:bench:${loan.id}:${change.kind}:${change.effectiveDate}`;
    if (await alertExists(loan.userId, 'LOAN_BENCHMARK_CHANGE', key)) continue;
    const position = loanPosition(loan as unknown as StoredLoan, ctx.now);
    const estimate = passThroughEstimate({
      outstanding: position.outstanding,
      remainingMonths: position.remainingMonths,
      currentRatePct: new Decimal(loan.interestRate.toString()),
      deltaPct: change.deltaPct,
    });
    const today = istDate(ctx.now);
    const from = change.effectiveDate > today ? change.effectiveDate : today;
    const nextResetDate = nextResetOnOrAfter(isoDate(loan.nextRateResetDate), from, change.kind);
    const text = benchmarkAlertText({
      kind: change.kind, benchmarkLender: change.lender, deltaPct: change.deltaPct, effectiveDate: change.effectiveDate,
      lenderName: loan.lenderName, nextResetDate, estimate,
    });
    const metadata: Prisma.InputJsonObject = {
      key,
      loanId: loan.id,
      lenderName: loan.lenderName,
      kind: change.kind,
      benchmarkLender: change.lender,
      effectiveDate: change.effectiveDate,
      deltaPct: change.deltaPct.toFixed(2),
      nextResetDate,
      newEmi: estimate !== null ? estimate.newEmi.toFixed(0) : null,
      tenureDeltaMonths: estimate !== null ? estimate.tenureDeltaMonths : null,
    };
    await prisma.alert.create({
      data: { userId: loan.userId, type: 'LOAN_BENCHMARK_CHANGE', title: text.title, description: text.description, triggerDate: ctx.now, metadata },
    });
    created++;
  }
  return created;
}
```

- [ ] **Step 5: The job and the chaining**

`packages/api/src/jobs/loanChecksJob.ts`:
```ts
/**
 * Daily existing-loan checks (EMI calculator spec s6.3): LOAN_REFINANCE and LOAN_BENCHMARK_CHANGE alerts.
 * Runs right after the 07:30 IST rates job (loanRatesJob.ts runDailyLoanJobs), so it sees today's rates.
 *
 * Context: benchmark changes and the user list are read once under runAsSystem (global tables, and a list
 * of owners across users); every user's loans and alerts are then handled under runAsUser(userId), so RLS
 * confines each step to that user. Single-flight: an overlapping call returns null.
 */
import type { MarketRateWire, RateLoanType } from '@everypaisa/shared';
import { logger } from '../lib/logger.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import { checkUserLoans, eligibleUserIds, findBenchmarkChanges } from '../services/loanChecks/loanAlerts.service.js';
import { bestMarketRate } from '../services/loanChecks/marketCheck.service.js';

export interface LoanChecksOptions {
  now?: Date;
  /** Limit the run to these users (tests, manual re-runs). Default: every eligible user. */
  userIds?: string[];
}

export interface LoanChecksResult {
  users: number;
  refinance: number;
  benchmark: number;
  changes: number;
  failedLoans: number;
  failedUsers: number;
}

let running = false;

export async function runLoanChecks(options: LoanChecksOptions = {}): Promise<LoanChecksResult | null> {
  if (running) {
    logger.warn('[loanChecks] run already in progress - skipping');
    return null;
  }
  running = true;
  try {
    const now = options.now ?? new Date();
    const { changes, userIds } = await runAsSystem(async () => ({
      changes: await findBenchmarkChanges(now),
      userIds: await eligibleUserIds(options.userIds),
    }));
    // One market lookup per loan type per run, shared by every user.
    const cache = new Map<RateLoanType, Promise<MarketRateWire | null>>();
    const market = (type: RateLoanType): Promise<MarketRateWire | null> => {
      let pending = cache.get(type);
      if (pending === undefined) {
        pending = bestMarketRate(type, now);
        cache.set(type, pending);
      }
      return pending;
    };
    const result: LoanChecksResult = { users: userIds.length, refinance: 0, benchmark: 0, changes: changes.length, failedLoans: 0, failedUsers: 0 };
    for (const userId of userIds) {
      try {
        const r = await runAsUser(userId, () => checkUserLoans(userId, { now, changes, market }));
        result.refinance += r.refinance;
        result.benchmark += r.benchmark;
        result.failedLoans += r.failedLoans;
      } catch (err) {
        // One user's failure (e.g. a transient DB error) must not stop everyone else's alerts; counted and logged.
        result.failedUsers++;
        logger.error({ err, userId }, '[loanChecks] user skipped');
      }
    }
    return result;
  } finally {
    running = false;
  }
}

/** Cron entry point (via runDailyLoanJobs). */
export async function runLoanChecksJob(): Promise<LoanChecksResult | null> {
  try {
    const result = await runLoanChecks();
    if (result) logger.info(result, '[cron] loan checks done');
    return result;
  } catch (err) {
    logger.error({ err }, '[cron] loan checks failed');
    throw err;
  }
}
```

In `packages/api/src/jobs/loanRatesJob.ts`:
1. Add the import:
```ts
import { runLoanChecksJob } from './loanChecksJob.js';
```
2. After `runLoanRatesJob`, add:
```ts
/**
 * The 07:30 IST cron (spec s5.4 + s6.3): refresh the rates, then run the existing-loan checks against them.
 * The checks run even when the rates step fails - yesterday's rates and any benchmark change already
 * recorded are still worth checking. Admin "Run now" calls runLoanRates directly and does not trigger checks.
 */
export async function runDailyLoanJobs(
  steps: { rates: () => Promise<unknown>; checks: () => Promise<unknown> } = { rates: runLoanRatesJob, checks: runLoanChecksJob },
): Promise<void> {
  try {
    await steps.rates();
  } catch (err) {
    logger.error({ err }, '[cron] loan rates step failed - running the loan checks anyway');
  }
  await steps.checks();
}
```
3. In `startLoanRatesJob`, replace the cron callback body:
```ts
    () => {
      runDailyLoanJobs().catch((err: unknown) => logger.error({ err }, '[cron] daily loan jobs rejected'));
    },
```
and the log line with `logger.info('[cron] scheduled: loan rates + loan checks @07:30 IST');`.
4. Add one sentence to the file's header comment, after the REGISTRATION paragraph:
```
 * LOAN CHECKS: the cron runs runDailyLoanJobs - this job, then jobs/loanChecksJob.ts (EMI plan 3).
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/loanChecks test/jobs/dailyLoanJobs.test.ts test/jobs/loanChecksJob.test.ts test/jobs/loanRatesJob.test.ts
npx tsc --noEmit
npx eslint src/services/loanChecks src/jobs/loanChecksJob.ts src/jobs/loanRatesJob.ts
```
Expected: all PASS (Plan 2's job tests unchanged); no type or lint errors.

- [ ] **Step 7: Commit**

```bash
cd portfolioos
git add packages/api/src/services/loanChecks/loanAlertText.ts packages/api/src/services/loanChecks/loanAlerts.service.ts packages/api/src/jobs/loanChecksJob.ts packages/api/src/jobs/loanRatesJob.ts packages/api/test/loanChecks/loanAlertText.test.ts packages/api/test/jobs/loanChecksJob.test.ts packages/api/test/jobs/dailyLoanJobs.test.ts
git commit -m "feat(loan-checks): daily refinance and benchmark-change alerts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Web - Compare with market card

**Wave 4** (parallel with Task 8; needs Tasks 1 and 6; uses the API contract of Task 4, which the tests mock).

**Files:**
- Create: `apps/web/src/pages/loans/marketCheck.ts`
- Create: `apps/web/src/pages/loans/MarketCheckCard.tsx`
- Modify: `apps/web/src/pages/loans/LoanDetailPage.tsx` (render the card)
- Test: `apps/web/src/pages/loans/marketCheck.test.ts`, `apps/web/src/pages/loans/MarketCheckCard.test.tsx`

**Interfaces:**
- Consumes: Task 1 `compareWithMarket`, `switchingCost`, `DEFAULT_SWITCHING_COSTS`, `type MarketComparison`, `type LoanMarketCheckWire`, `type MarketRateWire`, `type BenchmarkSummaryWire`, `type LoanRateType`; shared `Decimal`, `cleanNumber`, `EMI_LIMITS`, `formatDateOnly`, `formatDateIST`; Task 6 `loansApi.getMarketCheck`, `loansApi.update(id, { rateType })`; Plan 1 `defaultCalcState`, `defaultCompareState`, `groupedWhole`, `moneyWhole`, `NUMBER_TEXT`, `type CalcState` (`pages/emi/emiState.ts`), `encodeEmiUrl` (`pages/emi/emiUrl.ts`); Plan 2 `loanKindForRate` (`pages/emi/liveRates.ts`).
- Produces:
  - `interface SwitchingInput { processingPct: string; otherCharges: string }`, `DEFAULT_SWITCHING_INPUT: SwitchingInput` (`'0.5'`, `'10,000'`)
  - `parseCosts(c: SwitchingInput): { ok: true; processingPct: Decimal; otherCharges: Decimal } | { ok: false; field: 'processingPct' | 'otherCharges'; message: string }`
  - `type CardModel = { kind: 'NO_MARKET_DATA' } | { kind: 'NO_RATES' } | { kind: 'CLOSED' } | { kind: 'AT_OR_BELOW'; current: Decimal; market: MarketRateWire } | { kind: 'INVALID_COSTS'; current: Decimal; market: MarketRateWire; field: 'processingPct' | 'otherCharges'; message: string } | { kind: 'READY'; current: Decimal; market: MarketRateWire; result: MarketComparison }`
  - `cardModel(check: LoanMarketCheckWire, costs: SwitchingInput): CardModel`
  - `calculatorHref(check: LoanMarketCheckWire, costs: SwitchingInput, today?: Date): string | null`
  - `benchmarkLine(b: BenchmarkSummaryWire): string`
  - `<MarketCheckCard loan={{ id, status }} />`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/pages/loans/marketCheck.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { LoanMarketCheckWire } from '@everypaisa/shared';
import { decodeEmiUrl } from '@/pages/emi/emiUrl';
import { DEFAULT_SWITCHING_INPUT, benchmarkLine, calculatorHref, cardModel, parseCosts } from './marketCheck';

const CHECK: LoanMarketCheckWire = {
  loanId: 'l1', status: 'ACTIVE', loanType: 'HOME', rateLoanType: 'HOME', lender: 'HDFC Bank',
  rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null, currentRatePct: '9.10',
  outstanding: '3000000.00', remainingMonths: 180, nextEmiDate: '2026-11-05',
  market: { sourceId: 'sbi.home', lender: 'SBI', minRatePct: '8.35', asOf: '2026-10-12T02:00:00.000Z', sourceUrl: 'https://sbi.bank.in/x' },
  benchmark: null,
};

describe('cardModel', () => {
  it('READY with the default switching costs', () => {
    const m = cardModel(CHECK, DEFAULT_SWITCHING_INPUT);
    if (m.kind !== 'READY') throw new Error(m.kind);
    expect(m.result.newEmi.toFixed(0)).toBe('29280');
    expect(m.result.switchingCost.toFixed(2)).toBe('25000.00');
    expect(m.result.netSaving.toFixed(2)).toBe('214108.70');
    expect(m.result.breakEvenMonth).toBe(19);
  });
  it('the empty and edge states', () => {
    expect(cardModel({ ...CHECK, rateLoanType: null, market: null }, DEFAULT_SWITCHING_INPUT).kind).toBe('NO_MARKET_DATA');
    expect(cardModel({ ...CHECK, market: null }, DEFAULT_SWITCHING_INPUT).kind).toBe('NO_RATES');
    expect(cardModel({ ...CHECK, remainingMonths: 0 }, DEFAULT_SWITCHING_INPUT).kind).toBe('CLOSED');
    expect(cardModel({ ...CHECK, outstanding: '0.00' }, DEFAULT_SWITCHING_INPUT).kind).toBe('CLOSED');
    expect(cardModel({ ...CHECK, currentRatePct: '8.35' }, DEFAULT_SWITCHING_INPUT).kind).toBe('AT_OR_BELOW');
    expect(cardModel(CHECK, { processingPct: 'abc', otherCharges: '0' })).toMatchObject({ kind: 'INVALID_COSTS', field: 'processingPct' });
  });
});

describe('parseCosts', () => {
  it('accepts grouped rupees and refuses junk or a fee above 10 %', () => {
    const ok = parseCosts({ processingPct: '0.5', otherCharges: '₹10,000' });
    expect(ok.ok && ok.otherCharges.toString()).toBe('10000');
    expect(parseCosts({ processingPct: '12', otherCharges: '0' })).toMatchObject({ ok: false, field: 'processingPct' });
    expect(parseCosts({ processingPct: '0.5', otherCharges: '-5' })).toMatchObject({ ok: false, field: 'otherCharges' });
  });
});

describe('calculatorHref', () => {
  it('opens /emi with the outstanding balance, market rate, remaining months and switching costs', () => {
    const href = calculatorHref(CHECK, DEFAULT_SWITCHING_INPUT, new Date('2026-10-12T05:00:00Z'))!;
    expect(href.startsWith('/emi?v=1')).toBe(true);
    const decoded = decodeEmiUrl(href.slice(href.indexOf('?')));
    expect(decoded.error).toBeUndefined();
    expect(decoded.tab).toBe('calculate');
    expect(decoded.calc).toMatchObject({
      mode: 'EMI', principal: '30,00,000', ratePct: '8.35', tenure: '180', tenureUnit: 'M', firstEmiDate: '2026-11-05',
      feesOn: true, feeKind: 'PCT', feeValue: '0.5', gstPct: '0', otherCharges: '10000', loanKind: 'HOME_SELF',
    });
  });
  it('is null when the calculator cannot take the loan', () => {
    expect(calculatorHref({ ...CHECK, market: null }, DEFAULT_SWITCHING_INPUT)).toBeNull();
    expect(calculatorHref({ ...CHECK, remainingMonths: 481 }, DEFAULT_SWITCHING_INPUT)).toBeNull();
    expect(calculatorHref({ ...CHECK, remainingMonths: 0 }, DEFAULT_SWITCHING_INPUT)).toBeNull();
    expect(calculatorHref(CHECK, { processingPct: 'x', otherCharges: '0' })).toBeNull();
  });
});

describe('benchmarkLine', () => {
  it('repo with a change, MCLR with a rise, and no change', () => {
    expect(benchmarkLine({ kind: 'REPO', lender: null, tenor: null, ratePct: '5.25', effectiveDate: '2026-10-08', lastChange: { deltaPct: '-0.25', date: '2026-10-08' } }))
      .toBe('RBI repo rate 5.25% - cut by 0.25% on 08/10/2026');
    expect(benchmarkLine({ kind: 'MCLR', lender: 'SBI', tenor: '1Y', ratePct: '8.75', effectiveDate: '2026-11-01', lastChange: { deltaPct: '0.10', date: '2026-11-01' } }))
      .toBe('SBI 1-year MCLR 8.75% - raised by 0.10% on 01/11/2026');
    expect(benchmarkLine({ kind: 'REPO', lender: null, tenor: null, ratePct: '5.50', effectiveDate: '2026-06-06', lastChange: null }))
      .toBe('RBI repo rate 5.50% (as of 06/06/2026)');
  });
});
```

`apps/web/src/pages/loans/MarketCheckCard.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { LoanMarketCheckWire } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { loansApi } from '@/api/loans.api';
import { MarketCheckCard } from './MarketCheckCard';

vi.mock('@/api/loans.api', () => ({ loansApi: { getMarketCheck: vi.fn(), update: vi.fn() } }));

const CHECK: LoanMarketCheckWire = {
  loanId: 'l1', status: 'ACTIVE', loanType: 'HOME', rateLoanType: 'HOME', lender: 'HDFC Bank',
  rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null, currentRatePct: '9.10',
  outstanding: '3000000.00', remainingMonths: 180, nextEmiDate: '2026-11-05',
  market: { sourceId: 'sbi.home', lender: 'SBI', minRatePct: '8.35', asOf: '2026-10-12T02:00:00.000Z', sourceUrl: 'https://sbi.bank.in/x' },
  benchmark: null,
};
const LOAN = { id: 'l1', status: 'ACTIVE' };
const text = (id: string) => screen.getByTestId(id).textContent ?? '';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('MarketCheckCard', () => {
  it('shows the market rate, new EMI, savings net of switching costs, break-even and the calculator link', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue(CHECK);
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    await screen.findByTestId('market-net');
    expect(text('market-rate')).toBe('Market from 8.35% (SBI, as of 12/10/2026)');
    expect(text('market-new-emi')).toBe('₹29,280 (now ₹30,607) over 180 months');
    expect(text('market-gross')).toBe('₹2,39,109');
    expect(text('market-costs')).toBe('₹25,000');
    expect(text('market-net')).toBe('₹2,14,109');
    expect(text('market-break-even')).toBe('Break-even in month 19');
    const link = screen.getByRole('link', { name: /open in calculator/i });
    expect(link.getAttribute('href')?.startsWith('/emi?v=1')).toBe(true);
  });

  it('switching costs are editable and recompute the result', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue(CHECK);
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    await screen.findByTestId('market-net');
    fireEvent.change(screen.getByLabelText('Processing fee (%)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Other charges (₹)'), { target: { value: '0' } });
    expect(text('market-net')).toBe('₹2,39,109');
    expect(text('market-break-even')).toBe('Break-even in month 1');
  });

  it('invalid costs show an error and hide the result and the link', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue(CHECK);
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    await screen.findByTestId('market-net');
    fireEvent.change(screen.getByLabelText('Processing fee (%)'), { target: { value: 'abc' } });
    expect(screen.getByText('Enter a processing fee between 0 and 10%')).toBeTruthy();
    expect(screen.queryByTestId('market-net')).toBeNull();
    expect(screen.queryByRole('link', { name: /open in calculator/i })).toBeNull();
  });

  it('when switching does not pay, says so', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue({ ...CHECK, outstanding: '200000.00', remainingMonths: 12, currentRatePct: '9.00', market: { ...CHECK.market!, minRatePct: '8.50' } });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('market-break-even')).textContent).toBe('Switching would not pay off at these costs');
  });

  it('asks "Fixed or floating?" for an UNKNOWN loan and saves the answer', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue({ ...CHECK, rateType: 'UNKNOWN' });
    vi.mocked(loansApi.update).mockResolvedValue({} as never);
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Floating' }));
    await waitFor(() => expect(loansApi.update).toHaveBeenCalledWith('l1', { rateType: 'FLOATING' }));
  });

  it('floating loans show their benchmark; an untracked MCLR lender is explained', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue({
      ...CHECK, rateType: 'FLOATING', rateBenchmark: 'MCLR', lender: null,
      benchmark: { kind: 'REPO', lender: null, tenor: null, ratePct: '5.25', effectiveDate: '2026-10-08', lastChange: { deltaPct: '-0.25', date: '2026-10-08' } },
    });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('benchmark-line')).textContent).toBe('RBI repo rate 5.25% - cut by 0.25% on 08/10/2026');
    expect(screen.getByText(/isn't on our MCLR list/)).toBeTruthy();
  });

  it('empty states: no market data, rates not available, already at or below the market', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValueOnce({ ...CHECK, loanType: 'OTHER', rateLoanType: null, market: null });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('market-empty')).textContent).toBe('No market data for this loan type.');
    cleanup();
    vi.mocked(loansApi.getMarketCheck).mockResolvedValueOnce({ ...CHECK, market: null });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('market-empty')).textContent).toBe('Market rates are not available yet.');
    cleanup();
    vi.mocked(loansApi.getMarketCheck).mockResolvedValueOnce({ ...CHECK, currentRatePct: '8.25' });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('market-empty')).textContent).toBe('Your rate is already at or below the lowest market rate.');
  });

  it('renders nothing and fetches nothing for a closed loan', () => {
    const { container } = renderWithProviders(<MarketCheckCard loan={{ id: 'l1', status: 'CLOSED' }} />);
    expect(container.textContent).toBe('');
    expect(loansApi.getMarketCheck).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/loans/marketCheck.test.ts src/pages/loans/MarketCheckCard.test.tsx`
Expected: FAIL - cannot resolve `./marketCheck` and `./MarketCheckCard`.

- [ ] **Step 3: Card logic**

`apps/web/src/pages/loans/marketCheck.ts`:
```ts
import {
  DEFAULT_SWITCHING_COSTS, Decimal, EMI_LIMITS, cleanNumber, compareWithMarket, formatDateOnly, switchingCost,
  type BenchmarkSummaryWire, type LoanMarketCheckWire, type MarketComparison, type MarketRateWire,
} from '@everypaisa/shared';
import { NUMBER_TEXT, defaultCalcState, defaultCompareState, groupedWhole, type CalcState } from '@/pages/emi/emiState';
import { encodeEmiUrl } from '@/pages/emi/emiUrl';
import { loanKindForRate } from '@/pages/emi/liveRates';

/** Editable on the card, never stored (spec s6.2). Text as typed. */
export interface SwitchingInput {
  processingPct: string;
  otherCharges: string;
}

export const DEFAULT_SWITCHING_INPUT: SwitchingInput = {
  processingPct: DEFAULT_SWITCHING_COSTS.processingPct,
  otherCharges: groupedWhole(DEFAULT_SWITCHING_COSTS.otherCharges),
};

type CostField = 'processingPct' | 'otherCharges';

export function parseCosts(
  c: SwitchingInput,
): { ok: true; processingPct: Decimal; otherCharges: Decimal } | { ok: false; field: CostField; message: string } {
  const pct = cleanNumber(c.processingPct);
  if (!NUMBER_TEXT.test(pct) || new Decimal(pct).greaterThan(EMI_LIMITS.maxFeePct)) {
    return { ok: false, field: 'processingPct', message: 'Enter a processing fee between 0 and 10%' };
  }
  const other = cleanNumber(c.otherCharges);
  if (!NUMBER_TEXT.test(other) || new Decimal(other).greaterThan(EMI_LIMITS.maxPrincipal)) {
    return { ok: false, field: 'otherCharges', message: 'Enter other charges in rupees' };
  }
  return { ok: true, processingPct: new Decimal(pct), otherCharges: new Decimal(other) };
}

export type CardModel =
  | { kind: 'NO_MARKET_DATA' }
  | { kind: 'NO_RATES' }
  | { kind: 'CLOSED' }
  | { kind: 'AT_OR_BELOW'; current: Decimal; market: MarketRateWire }
  | { kind: 'INVALID_COSTS'; current: Decimal; market: MarketRateWire; field: CostField; message: string }
  | { kind: 'READY'; current: Decimal; market: MarketRateWire; result: MarketComparison };

export function cardModel(check: LoanMarketCheckWire, costs: SwitchingInput): CardModel {
  if (check.rateLoanType === null) return { kind: 'NO_MARKET_DATA' };
  if (check.market === null) return { kind: 'NO_RATES' };
  const outstanding = new Decimal(check.outstanding);
  if (check.remainingMonths < 1 || !outstanding.greaterThan(0)) return { kind: 'CLOSED' };
  const current = new Decimal(check.currentRatePct);
  const marketRate = new Decimal(check.market.minRatePct);
  if (!marketRate.lessThan(current)) return { kind: 'AT_OR_BELOW', current, market: check.market };
  const parsed = parseCosts(costs);
  if (!parsed.ok) return { kind: 'INVALID_COSTS', current, market: check.market, field: parsed.field, message: parsed.message };
  const result = compareWithMarket({
    outstanding,
    remainingMonths: check.remainingMonths,
    currentRatePct: current,
    marketRatePct: marketRate,
    switchingCost: switchingCost(outstanding, parsed.processingPct, parsed.otherCharges),
  });
  return result === null ? { kind: 'CLOSED' } : { kind: 'READY', current, market: check.market, result };
}

/**
 * "Open in calculator" (spec s6.2): the Plan 1 share URL with the outstanding balance at the market rate over
 * the remaining months, the switching costs as a processing fee (GST 0 - plan ruling 5) plus other charges.
 * Null when the calculator could not take it (no market rate, 0 or > 480 months, invalid costs).
 */
export function calculatorHref(check: LoanMarketCheckWire, costs: SwitchingInput, today: Date = new Date()): string | null {
  if (check.market === null || check.rateLoanType === null) return null;
  if (check.remainingMonths < 1 || check.remainingMonths > EMI_LIMITS.maxTenureMonths) return null;
  const outstanding = new Decimal(check.outstanding);
  if (!outstanding.greaterThan(0)) return null;
  const parsed = parseCosts(costs);
  if (!parsed.ok) return null;
  const base = defaultCalcState(today);
  const calc: CalcState = {
    ...base,
    mode: 'EMI',
    principal: groupedWhole(outstanding.toFixed(0)),
    ratePct: check.market.minRatePct,
    tenure: String(check.remainingMonths),
    tenureUnit: 'M',
    firstEmiDate: check.nextEmiDate ?? base.firstEmiDate,
    feesOn: true,
    feeKind: 'PCT',
    feeValue: parsed.processingPct.toString(),
    gstPct: '0',
    otherCharges: parsed.otherCharges.toString(),
    loanKind: loanKindForRate(check.rateLoanType, base.loanKind),
  };
  return `/emi?${encodeEmiUrl('calculate', calc, defaultCompareState())}`;
}

/** "RBI repo rate 5.25% - cut by 0.25% on 08/10/2026"; a zero or missing change reads "(as of ...)". */
export function benchmarkLine(b: BenchmarkSummaryWire): string {
  const name = b.kind === 'REPO' ? 'RBI repo rate' : `${b.lender ?? 'Lender'} 1-year MCLR`;
  const delta = b.lastChange === null ? null : new Decimal(b.lastChange.deltaPct);
  if (b.lastChange === null || delta === null || delta.isZero()) return `${name} ${b.ratePct}% (as of ${formatDateOnly(b.effectiveDate)})`;
  return `${name} ${b.ratePct}% - ${delta.isNegative() ? 'cut' : 'raised'} by ${delta.abs().toFixed(2)}% on ${formatDateOnly(b.lastChange.date)}`;
}
```

- [ ] **Step 4: The card**

`apps/web/src/pages/loans/MarketCheckCard.tsx`:
```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Calculator, Loader2, TrendingDown } from 'lucide-react';
import { formatDateIST, type LoanMarketCheckWire, type LoanRateType } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loansApi, type LoanDTO } from '@/api/loans.api';
import { apiErrorMessage } from '@/api/client';
import { moneyWhole } from '@/pages/emi/emiState';
import { DEFAULT_SWITCHING_INPUT, benchmarkLine, calculatorHref, cardModel, type SwitchingInput } from './marketCheck';

/** spec s6.2: the loan against today's lowest market rate, net of switching costs. ACTIVE loans only. */
export function MarketCheckCard({ loan }: { loan: Pick<LoanDTO, 'id' | 'status'> }) {
  const qc = useQueryClient();
  const active = loan.status === 'ACTIVE';
  const [costs, setCosts] = useState<SwitchingInput>(DEFAULT_SWITCHING_INPUT);
  const query = useQuery({
    queryKey: ['loan-market-check', loan.id],
    queryFn: () => loansApi.getMarketCheck(loan.id),
    enabled: active,
  });
  const setRateType = useMutation({
    mutationFn: (rateType: LoanRateType) => loansApi.update(loan.id, { rateType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan', loan.id] });
      qc.invalidateQueries({ queryKey: ['loan-market-check', loan.id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save the rate type")),
  });

  if (!active) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-accent-ink/70" />
          <CardTitle className="text-xl sm:text-2xl">Compare with market</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {query.isLoading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : query.isError || !query.data ? (
          <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
            <span>Couldn't load market rates.</span>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>Try again</Button>
          </div>
        ) : (
          <CardBody
            check={query.data}
            costs={costs}
            onCosts={setCosts}
            onRateType={(t) => setRateType.mutate(t)}
            savingRateType={setRateType.isPending}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CardBody({ check, costs, onCosts, onRateType, savingRateType }: {
  check: LoanMarketCheckWire;
  costs: SwitchingInput;
  onCosts: (c: SwitchingInput) => void;
  onRateType: (t: LoanRateType) => void;
  savingRateType: boolean;
}) {
  const model = cardModel(check, costs);
  const href = calculatorHref(check, costs);
  const showCosts = model.kind === 'READY' || model.kind === 'INVALID_COSTS';
  return (
    <>
      <RateTypeLine check={check} onRateType={onRateType} saving={savingRateType} />

      {model.kind === 'NO_MARKET_DATA' && <p data-testid="market-empty" className="text-muted-foreground">No market data for this loan type.</p>}
      {model.kind === 'NO_RATES' && <p data-testid="market-empty" className="text-muted-foreground">Market rates are not available yet.</p>}
      {model.kind === 'CLOSED' && <p data-testid="market-empty" className="text-muted-foreground">Nothing left to refinance on this loan.</p>}

      {(model.kind === 'AT_OR_BELOW' || model.kind === 'INVALID_COSTS' || model.kind === 'READY') && (
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <p>Your rate <span className="font-medium tabular-nums">{model.current.toFixed(2)}%</span></p>
          <p data-testid="market-rate" className="text-muted-foreground">
            {`Market from ${model.market.minRatePct}% (${model.market.lender}, as of ${formatDateIST(model.market.asOf)})`}
          </p>
        </div>
      )}
      {model.kind === 'AT_OR_BELOW' && (
        <p data-testid="market-empty" className="text-muted-foreground">Your rate is already at or below the lowest market rate.</p>
      )}

      {showCosts && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="switch-processing">Processing fee (%)</Label>
            <Input id="switch-processing" inputMode="decimal" className="mt-1" value={costs.processingPct}
              onChange={(e) => onCosts({ ...costs, processingPct: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="switch-other">Other charges (₹)</Label>
            <Input id="switch-other" inputMode="decimal" className="mt-1" value={costs.otherCharges}
              onChange={(e) => onCosts({ ...costs, otherCharges: e.target.value })} />
          </div>
          {model.kind === 'INVALID_COSTS' && <p className="text-xs text-negative sm:col-span-2">{model.message}</p>}
        </div>
      )}

      {model.kind === 'READY' && (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">New EMI</dt>
          <dd data-testid="market-new-emi" className="text-right tabular-nums">
            {`${moneyWhole(model.result.newEmi)} (now ${moneyWhole(model.result.currentEmi)}) over ${check.remainingMonths} months`}
          </dd>
          <dt className="text-muted-foreground">Interest saved</dt>
          <dd data-testid="market-gross" className="text-right tabular-nums">{moneyWhole(model.result.grossSaving)}</dd>
          <dt className="text-muted-foreground">Switching costs</dt>
          <dd data-testid="market-costs" className="text-right tabular-nums">{moneyWhole(model.result.switchingCost)}</dd>
          <dt className="font-medium">Net saving</dt>
          <dd data-testid="market-net" className={`text-right font-medium tabular-nums ${model.result.netSaving.greaterThan(0) ? 'text-positive' : 'text-negative'}`}>
            {moneyWhole(model.result.netSaving)}
          </dd>
          <dt className="text-muted-foreground">Break-even</dt>
          <dd data-testid="market-break-even" className="text-right">
            {model.result.breakEvenMonth !== null ? `Break-even in month ${model.result.breakEvenMonth}` : 'Switching would not pay off at these costs'}
          </dd>
        </dl>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-muted-foreground">Indicative. Lenders price by credit score, amount and tenure; switching costs are estimates.</p>
        {href !== null && model.kind !== 'INVALID_COSTS' && (
          <Button asChild size="sm" variant="outline">
            <Link to={href}><Calculator className="mr-1 h-4 w-4" />Open in calculator</Link>
          </Button>
        )}
      </div>
    </>
  );
}

function RateTypeLine({ check, onRateType, saving }: { check: LoanMarketCheckWire; onRateType: (t: LoanRateType) => void; saving: boolean }) {
  if (check.rateType === 'UNKNOWN') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2">
        <span>Fixed or floating?</span>
        <Button size="sm" variant="outline" disabled={saving} onClick={() => onRateType('FIXED')}>Fixed</Button>
        <Button size="sm" variant="outline" disabled={saving} onClick={() => onRateType('FLOATING')}>Floating</Button>
        <span className="basis-full text-[11px] text-muted-foreground">Floating loans get an alert when the repo rate or your lender's MCLR changes.</span>
      </div>
    );
  }
  if (check.rateType === 'FIXED') return <p className="text-muted-foreground">Fixed rate - no benchmark alerts.</p>;
  if (check.benchmark === null) {
    return check.rateBenchmark === 'REPO' || check.rateBenchmark === 'MCLR'
      ? null
      : <p className="text-muted-foreground">Set what the rate is linked to (repo or MCLR) in Edit to get change alerts.</p>;
  }
  return (
    <div>
      <p data-testid="benchmark-line">{benchmarkLine(check.benchmark)}</p>
      {check.rateBenchmark === 'MCLR' && check.benchmark.kind === 'REPO' && (
        <p className="text-[11px] text-muted-foreground">Your lender isn't on our MCLR list, so this shows the repo rate.</p>
      )}
    </div>
  );
}
```

(`Button` supports `asChild` via Radix `Slot`, so the link keeps the outline button's look.)

In `apps/web/src/pages/loans/LoanDetailPage.tsx`:
1. Add `import { MarketCheckCard } from './MarketCheckCard';`.
2. Immediately after the Tax benefit block (`{summary && summary.taxBenefit && ( ... )}`), add:
```tsx
      {/* Compare with market (EMI plan 3, spec s6.2) */}
      {loan.status === 'ACTIVE' && (
        <div className="mb-4">
          <MarketCheckCard loan={loan} />
        </div>
      )}
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run:
```bash
cd portfolioos/apps/web
npx vitest run src/pages/loans src/pages/emi
npx tsc --noEmit
npx eslint src/pages/loans
```
Expected: all PASS; no type or lint errors.

- [ ] **Step 6: Commit**

```bash
cd portfolioos
git add apps/web/src/pages/loans/marketCheck.ts apps/web/src/pages/loans/marketCheck.test.ts apps/web/src/pages/loans/MarketCheckCard.tsx apps/web/src/pages/loans/MarketCheckCard.test.tsx apps/web/src/pages/loans/LoanDetailPage.tsx
git commit -m "feat(loan-checks): Compare with market card on the loan page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Full verification and browser check

**Wave 5** (after everything).

**Files:**
- No new source files. Fixes found here go into the file that owns them, each with a test, in their own commit.

- [ ] **Step 1: Every API suite this plan touches, plus Plan 2's, in ONE vitest run**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/loanChecks test/loanRates test/jobs/loanChecksJob.test.ts test/jobs/dailyLoanJobs.test.ts test/jobs/loanRatesJob.test.ts test/routes/loanMarketCheck.routes.test.ts test/routes/notificationPrefs.routes.test.ts test/routes/loanRates.routes.test.ts test/routes/adminLoanRates.routes.test.ts test/routes/emi.routes.test.ts test/invariants/loan-rate-check-columns.test.ts test/invariants/loan-rates-not-user-scoped.test.ts test/invariants/user-scoped-coverage.test.ts test/services/loanPaymentSplit.test.ts src/services/loanMath.test.ts
npx tsc --noEmit
npx eslint src/services/loanChecks src/jobs/loanChecksJob.ts src/jobs/loanRatesJob.ts src/services/loans.service.ts src/controllers/loans.controller.ts src/controllers/alertPrefs.controller.ts src/services/notifications/alertPrefs.service.ts src/routes/loans.routes.ts src/routes/notifications.routes.ts
```
Expected: all PASS in the single run (no cross-file leaks); no type or lint errors.

- [ ] **Step 2: Shared and web**

Run:
```bash
cd portfolioos/packages/shared && npx vitest run && npx tsc --noEmit
cd ../../apps/web
npx vitest run src/pages/loans src/pages/emi src/pages/settings src/pages/alerts
npx vitest run
npx tsc --noEmit
npx eslint src/pages/loans src/pages/settings src/pages/alerts src/pages/dashboard/DashboardPage.tsx src/api/loans.api.ts src/api/notifications.api.ts src/api/alerts.api.ts
```
Expected: all PASS (the whole web suite once); no type or lint errors.

- [ ] **Step 3: Encoding check on every changed text file**

Run:
```bash
cd portfolioos
for f in $(git diff --name-only main...HEAD); do iconv -f UTF-8 -t UTF-8 "$f" >/dev/null || echo "BAD $f"; done
git diff main...HEAD -- '*.ts' '*.tsx' | grep -nP '^\+.*[\x{2013}\x{2014}\x{2212}]' || echo "no en/em dashes or minus signs added"
```
Expected: no `BAD` lines; the second command prints `no en/em dashes or minus signs added`.

- [ ] **Step 4: Browser check at 1280 px and 375 px, light and dark**

1. Seed rates from the saved real pages (no network): `cd portfolioos/packages/api && DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx tsx scripts/seed-loan-rates-from-fixtures.ts`.
2. Start the API with `ENABLE_LOAN_RATES_CRON=false ENABLE_STARTUP_SYNC=false ENABLE_ALERT_CRONS=false` and the web dev server against the same isolated DB, as in Plans 1-2. Sign in as a local test user. Note the PIDs you start.
3. Loans -> Add loan: the Rate type select defaults to "Not sure"; choosing Floating shows "Linked to" and "Next rate reset (optional)"; save a HOME loan from "HDFC Bank" at 9.10 %, 3,00,000 x 180 months, first EMI next month, Fixed. Edit it: the fields round-trip; switching to Floating + Repo + a reset date saves.
4. That loan's page: the Compare with market card shows the market rate with lender and dd/mm/yyyy date, new EMI, savings, switching-cost inputs, break-even, and "Open in calculator" opens `/emi` with the outstanding amount, market rate, remaining months and the fees filled in. Type junk into Processing fee: the error shows and the link hides. Add an OTHER-type loan: "No market data for this loan type." Add an UNKNOWN loan: "Fixed or floating?" buttons work.
5. Run the checks once for that user (no network; reads the seeded rates):
   ```bash
   cd portfolioos/packages/api
   DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx tsx -e "import('./src/jobs/loanChecksJob.ts').then(async (m) => { console.log(await m.runLoanChecks({ userIds: [process.argv[1]] })); process.exit(0); })" <that user's id>
   ```
   Then the Alerts page shows the "Loan refinance" alert ("Home loan with HDFC Bank at 9.10%; market from ...%", description with "≈ ₹... lakh"); the type filter lists "Loan refinance" and "Loan rate change". Running it again prints `refinance: 0`.
6. Settings -> Notifications: the "Loan rate alerts" card shows the checkbox on; turning it off and reloading keeps it off; running step 5 again now prints `users: 0`. Turn it back on.
7. At 375 px: the card, the forms and the settings card have no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`); screenshot every section of the loan page and the settings page in light and dark.
8. Stop only the PIDs you started. Save screenshots under `.superpowers/sdd/2026-10-12-emi-calculator-03-loan-checks/screens/`.

- [ ] **Step 5: Commit any fixes** (one logical fix per commit, each with its test, trailer as usual). If nothing needed fixing, there is nothing to commit.

---

## Spec conflicts and notes for the reviewer

- **Daily digest email (spec s6.3) does not exist** in the codebase (only the Split digests). Alerts are delivered in-app only; an alert email needs its own design (sender, opt-in, rate limits) and is out of this plan. Ruling 1.
- **Existing alert cron runs without an RLS context.** `jobs/alertJobs.ts` calls `runAllAlertScans()` with no `runAsUser`/`runAsSystem`, so under the NOBYPASSRLS runtime role its user-scoped queries see no rows. The spec says to follow that pattern; this plan follows the pattern the spec describes (system context to list users, `runAsUser` per user) rather than copying the defect. The existing cron is a separate pre-existing bug worth its own fix.
- **Plain hyphens.** The spec's sample alert text uses an em dash and a Unicode minus; the alert text uses "-" per the project rule. "≈" and "₹" are kept.
- **Loan types.** `Loan.loanType` has no TWO_WHEELER or LAP, so those market types are never compared against; the spec's mapping is otherwise implemented as written.

## Execution notes

- Start after Plan 2 (`feat/emi-live-rates`) is merged to `main`: create a fresh worktree from `main` (e.g. `C:\Users\ST269\Desktop\mProfit-loanchecks-wt`, branch `feat/emi-loan-checks`). Project root `portfolioos/`. Never push.
- Fresh worktree setup first: `pnpm install`, `pnpm --filter @everypaisa/shared build`, then `npx prisma generate` in `packages/api`, before trusting any type or test error. Rebuild shared after Tasks 1 and 2.
- Database: only the isolated local DB `portfolioos_split` (migration overrides and test env exactly as in Global Constraints). Never use `packages/api/.env`; never touch production or Neon. The production migration is a separate, owner-approved step after merge.
- Docker containers `everypaisa-postgres` and `portfolioos-redis` must be running for API tests.
- Nothing here fetches a live bank page; the browser check seeds rates from Plan 2's saved captures.
