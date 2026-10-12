# EMI Calculator — Plan 1 (Calculator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tools → EMI Calculator page (`/emi`) with EMI / max-loan / tenure modes, prepayments, rate changes, fees + APR, home/education-loan tax benefit, 2–3 offer comparison, a shareable URL and PDF/Excel export.

**Architecture:** All loan maths is pure `Decimal` code in `packages/shared/src/loans/` so the browser computes live and the API reuses it for export. The web page holds form state as strings, validates with the shared validator, converts to `Decimal` and calls `summariseLoan`. The API has one stateless endpoint, `POST /api/emi/export`, that re-validates, recomputes and streams a PDF (pdfkit) or Excel (exceljs) file.

**Tech Stack:** decimal.js (via `@everypaisa/shared`), vitest, React 18 + react-router + recharts + shadcn UI, Express + zod, pdfkit, exceljs.

**Spec:** `portfolioos/docs/superpowers/specs/2026-10-12-emi-calculator-design.md` (§3, §4, §7, §8, §9 calculator rows). Plans 2 (live rates) and 3 (existing-loan checks) are separate.

## Global Constraints

- Money and rates are `Decimal`; never `Number`/`parseFloat` on money. Counts (months) are plain `number` integers.
- EMI rounded UP to the next rupee; monthly interest rounded to the paisa HALF_UP; final instalment absorbs the remainder; closing balance reaches exactly `0.00`, never negative.
- Limits: principal > 0 and ≤ 1,000,000,000 (₹100 crore); rate 0–50 %; tenure 1–480 months; GST 0–28 %; processing fee ≤ 10 % when PCT; slab 0–30 %; remaining 80C 0–150000.
- Tax: old regime only gives benefit; home self-occupied interest ≤ 200000 per FY (24(b)); principal ≤ remaining 80C; let-out interest deduction capped at 200000 set-off per FY with excess reported as carried forward; education interest (80E) only for the first 8 FYs; cess 4 % on slab; new regime → 0 with a note.
- Indian FY = 1 April – 31 March, label `2026-27`.
- Dates shown dd/mm/yyyy (`formatDateOnly` from `@everypaisa/shared`); Excel date cells are real dates with `numFmt 'dd/mm/yyyy'`; PDF uses `Rs.` not `₹` (Helvetica lacks the glyph — use `inr()` from `packages/api/src/services/receipts/format.ts`).
- API: standard envelope via `lib/response.ts`; errors via `BadRequestError`; money as strings on the wire; rate limit 10/min/user on export.
- Nav: Tools → **EMI Calculator**, path `/emi`, lucide icon `Percent`.
- Responsive at 375 px with no horizontal page scroll; the schedule table scrolls inside its card.
- Commits: Conventional Commits, each ending with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Strings must be valid UTF-8 (check with `iconv -f UTF-8 -t UTF-8 <file> >/dev/null`); use plain `-` rather than em dashes in new code strings.

## Review Focus

1. **Day-of-month overflow:** first EMI on the 31st → later months clamp to the month's last day (28/29/30) and return to 31 when the month has one; never drift to the 28th forever. Test in Task 1 (`addMonthsIso`).
2. **Prepayment or rate change after the loan already closed** (e.g. month 200 on a loan that a big prepayment closed at month 90) → ignored with warning `PREPAYMENT_AFTER_CLOSE` / `RATE_CHANGE_AFTER_CLOSE`, no crash, no extra rows. Test in Task 2.
3. **Indian-formatted input** like `10,00,000` or `₹ 25,00,000` typed into amount fields → accepted as 1000000 / 2500000. Test in Task 4 (`cleanNumber`, `validateLoanWire`).
4. **Tampered or stale share URL** (`?v=1&s=garbage`, `v=99`, valid JSON with wrong shape) → page loads defaults and shows one toast, never a blank page. Test in Task 6.
5. **Rate rise with "keep EMI" that no longer covers interest** → EMI recomputed, warning `NEGATIVE_AMORTISATION_AVOIDED`, loan still closes. Test in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/loans/emi.types.ts` | Domain types + `EmiError` |
| `packages/shared/src/loans/emiDates.ts` | `addMonthsIso`, `indianFy` (string-only date maths, no timezone) |
| `packages/shared/src/loans/emi.ts` | `emiFor`, `maxLoanFor`, `tenureForEmi`, `buildEmiSchedule` |
| `packages/shared/src/loans/apr.ts` | `loanFees`, `loanApr` |
| `packages/shared/src/loans/emiTax.ts` | `loanTaxBenefit` |
| `packages/shared/src/loans/summary.ts` | `summariseLoan`, `compareLoanOffers`, `groupScheduleByFy` |
| `packages/shared/src/loans/emiWire.ts` | wire types, `cleanNumber`, `validateLoanWire`, `validateTaxWire`, `loanFromWire`, `taxFromWire` |
| `packages/shared/src/loans/index.ts` | barrel |
| `packages/api/src/services/emi/emiExport.ts` | `buildEmiXlsx`, `buildEmiPdf` |
| `packages/api/src/controllers/emi.controller.ts` | `exportHandler` |
| `packages/api/src/routes/emi.routes.ts` | `emiRouter` |
| `apps/web/src/pages/emi/emiState.ts` | form state types, defaults, `computeCalc`, `computeCompare` |
| `apps/web/src/pages/emi/emiUrl.ts` | `encodeEmiUrl`, `decodeEmiUrl` |
| `apps/web/src/pages/emi/EmiCalculatorPage.tsx` | tabs, URL sync, share/export buttons |
| `apps/web/src/pages/emi/CalculateTab.tsx` | inputs + results layout |
| `apps/web/src/pages/emi/AdvancedInputs.tsx` | prepayments, rate changes, fees, tax |
| `apps/web/src/pages/emi/EmiResults.tsx` | summary tiles, donut, balance chart |
| `apps/web/src/pages/emi/ScheduleTable.tsx` | FY-grouped expandable schedule |
| `apps/web/src/pages/emi/CompareTab.tsx` | 2–3 offers |
| `apps/web/src/api/emi.api.ts` | `emiApi.export` |

---

### Task 1: Core EMI maths and dates (shared)

**Files:**
- Create: `packages/shared/src/loans/emi.types.ts`, `packages/shared/src/loans/emiDates.ts`, `packages/shared/src/loans/emi.ts`, `packages/shared/src/loans/index.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './loans/index.js';`)
- Test: `packages/shared/src/loans/emiDates.test.ts`, `packages/shared/src/loans/emi.test.ts`

**Interfaces:**
- Produces:
  - `type EmiMode = 'REDUCE_EMI' | 'REDUCE_TENURE'`
  - `interface Prepayment { month: number; amount: Decimal; recurrence: 'ONCE' | 'YEARLY'; mode: EmiMode }`
  - `interface RateChange { fromMonth: number; annualRatePct: Decimal; mode: EmiMode }`
  - `interface Fees { processingFeeKind: 'PCT' | 'AMOUNT'; processingFeeValue: Decimal; gstPct: Decimal; otherCharges: Decimal }`
  - `interface LoanInput { principal: Decimal; annualRatePct: Decimal; tenureMonths: number; firstEmiDate: string; emiOverride?: Decimal; prepayments?: Prepayment[]; rateChanges?: RateChange[]; fees?: Fees }`
  - `interface ScheduleRow { month: number; date: string; opening: Decimal; emi: Decimal; interest: Decimal; principal: Decimal; prepayment: Decimal; closing: Decimal; ratePct: Decimal }`
  - `type EmiWarning = 'PREPAYMENT_CAPPED' | 'NEGATIVE_AMORTISATION_AVOIDED' | 'PREPAYMENT_AFTER_CLOSE' | 'RATE_CHANGE_AFTER_CLOSE'`
  - `interface ScheduleResult { emi: Decimal; months: number; schedule: ScheduleRow[]; totalInterest: Decimal; totalPrincipal: Decimal; totalPrepaid: Decimal; totalPaid: Decimal; warnings: EmiWarning[] }`
  - `class EmiError extends Error { code: 'EMI_TOO_LOW' | 'INVALID_INPUT'; field?: string }`
  - `addMonthsIso(iso: string, months: number): string`, `indianFy(iso: string): string`
  - `emiFor(principal: Decimal, annualRatePct: Decimal, months: number): Decimal`
  - `maxLoanFor(emi: Decimal, annualRatePct: Decimal, months: number): Decimal`
  - `tenureForEmi(principal: Decimal, emi: Decimal, annualRatePct: Decimal): number`
  - `buildEmiSchedule(input: LoanInput): ScheduleResult` (Task 1 handles no prepayments / rate changes; Task 2 extends it)

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/loans/emiDates.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { addMonthsIso, indianFy } from './emiDates.js';

describe('addMonthsIso', () => {
  it('adds months within a year', () => expect(addMonthsIso('2026-11-05', 1)).toBe('2026-12-05'));
  it('rolls the year', () => expect(addMonthsIso('2026-12-05', 1)).toBe('2027-01-05'));
  it('clamps the 31st to the month end and returns to 31 later', () => {
    expect(addMonthsIso('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsIso('2027-01-31', 2)).toBe('2027-03-31');
    expect(addMonthsIso('2027-01-31', 3)).toBe('2027-04-30');
  });
  it('handles zero and large offsets', () => {
    expect(addMonthsIso('2026-10-12', 0)).toBe('2026-10-12');
    expect(addMonthsIso('2026-10-12', 480)).toBe('2066-10-12');
  });
  it('rejects malformed dates', () => expect(() => addMonthsIso('12/10/2026', 1)).toThrow(/date/i));
});

describe('indianFy', () => {
  it('April starts the FY', () => expect(indianFy('2026-04-01')).toBe('2026-27'));
  it('March belongs to the previous FY', () => expect(indianFy('2027-03-31')).toBe('2026-27'));
  it('century wrap', () => expect(indianFy('2099-05-01')).toBe('2099-00'));
});
```

`packages/shared/src/loans/emi.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import { emiFor, maxLoanFor, tenureForEmi, buildEmiSchedule } from './emi.js';
import { EmiError } from './emi.types.js';

const D = (v: string | number) => new Decimal(v);

describe('emiFor', () => {
  // Reference values computed with the standard formula at 40-digit precision, then rounded UP to the rupee.
  it.each([
    ['1000000', '8.5', 240, '8679'],   // 8678.23
    ['500000', '10.5', 60, '10747'],   // 10746.95
    ['2500000', '9', 360, '20116'],    // 20115.57
    ['100000', '12', 12, '8885'],      // 8884.88
    ['120000', '0', 12, '10000'],
  ])('P=%s r=%s n=%s -> %s', (p, r, n, want) => {
    expect(emiFor(D(p), D(r), n).toFixed(0)).toBe(want);
  });
  it('rejects tenure < 1', () => expect(() => emiFor(D(1000), D(10), 0)).toThrow(EmiError));
});

describe('reverse solvers', () => {
  it('maxLoanFor rounds down to the rupee', () => {
    expect(maxLoanFor(D(8679), D('8.5'), 240).toFixed(0)).toBe('1000088');
    expect(maxLoanFor(D(10000), D(0), 12).toFixed(0)).toBe('120000');
  });
  it('tenureForEmi rounds months up', () => {
    expect(tenureForEmi(D(1000000), D(10000), D('8.5'))).toBe(175);
    expect(tenureForEmi(D(120000), D(10000), D(0))).toBe(12);
    expect(tenureForEmi(D(120000), D(7000), D(0))).toBe(18);
  });
  it('tenureForEmi throws EMI_TOO_LOW when EMI does not cover interest', () => {
    try { tenureForEmi(D(1000000), D(7083), D('8.5')); expect.unreachable(); }
    catch (e) { expect((e as EmiError).code).toBe('EMI_TOO_LOW'); }
  });
});

describe('buildEmiSchedule (plain)', () => {
  const base = { principal: D(1000000), annualRatePct: D('8.5'), tenureMonths: 240, firstEmiDate: '2026-11-05' };

  it('matches reference totals and closes at exactly 0', () => {
    const r = buildEmiSchedule(base);
    expect(r.emi.toFixed(0)).toBe('8679');
    expect(r.months).toBe(240);
    expect(r.totalInterest.toFixed(2)).toBe('1082478.64');
    expect(r.schedule.at(-1)!.emi.toFixed(2)).toBe('8197.64');
    expect(r.schedule.at(-1)!.closing.toFixed(2)).toBe('0.00');
    expect(r.totalPrincipal.toFixed(2)).toBe('1000000.00');
    expect(r.totalPaid.equals(r.totalPrincipal.plus(r.totalInterest))).toBe(true);
    expect(r.schedule[0]!.date).toBe('2026-11-05');
    expect(r.schedule[1]!.date).toBe('2026-12-05');
  });

  it('short loan reference', () => {
    const r = buildEmiSchedule({ ...base, principal: D(100000), annualRatePct: D(12), tenureMonths: 12 });
    expect(r.totalInterest.toFixed(2)).toBe('6618.46');
    expect(r.schedule.at(-1)!.emi.toFixed(2)).toBe('8883.46');
  });

  it('zero-rate loan', () => {
    const r = buildEmiSchedule({ ...base, principal: D(120000), annualRatePct: D(0), tenureMonths: 12 });
    expect(r.totalInterest.toFixed(2)).toBe('0.00');
    expect(r.months).toBe(12);
  });

  it('closing is never negative and every row is internally consistent', () => {
    const r = buildEmiSchedule({ ...base, principal: D('2500000'), annualRatePct: D(9), tenureMonths: 360 });
    for (const row of r.schedule) {
      expect(row.closing.gte(0)).toBe(true);
      expect(row.opening.minus(row.principal).minus(row.prepayment).equals(row.closing)).toBe(true);
      expect(row.emi.equals(row.interest.plus(row.principal))).toBe(true);
    }
  });

  it('emiOverride drives tenure', () => {
    const r = buildEmiSchedule({ ...base, emiOverride: D(10000) });
    expect(r.emi.toFixed(0)).toBe('10000');
    expect(r.months).toBe(175);
    expect(r.schedule.at(-1)!.closing.toFixed(2)).toBe('0.00');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd portfolioos/packages/shared && npx vitest run src/loans`
Expected: FAIL — cannot resolve `./emiDates.js` / `./emi.js`.

- [ ] **Step 3: Implement**

`packages/shared/src/loans/emi.types.ts`:
```ts
import type { Decimal } from '../decimal.js';

export type EmiMode = 'REDUCE_EMI' | 'REDUCE_TENURE';

export interface Prepayment {
  /** Applied right after this month's EMI. */
  month: number;
  amount: Decimal;
  recurrence: 'ONCE' | 'YEARLY';
  mode: EmiMode;
}

export interface RateChange {
  /** The new rate applies to this month's interest onwards. */
  fromMonth: number;
  annualRatePct: Decimal;
  /** REDUCE_TENURE = keep the EMI and let the tenure move (banks' default). */
  mode: EmiMode;
}

export interface Fees {
  processingFeeKind: 'PCT' | 'AMOUNT';
  processingFeeValue: Decimal;
  gstPct: Decimal;
  otherCharges: Decimal;
}

export interface LoanInput {
  principal: Decimal;
  annualRatePct: Decimal;
  tenureMonths: number;
  /** 'YYYY-MM-DD' */
  firstEmiDate: string;
  /** Fixed starting EMI; tenure is then derived from it. */
  emiOverride?: Decimal;
  prepayments?: Prepayment[];
  rateChanges?: RateChange[];
  fees?: Fees;
}

export interface ScheduleRow {
  month: number;
  date: string;
  opening: Decimal;
  /** Amount actually paid as EMI this month (last row may be smaller). */
  emi: Decimal;
  interest: Decimal;
  principal: Decimal;
  prepayment: Decimal;
  closing: Decimal;
  ratePct: Decimal;
}

export type EmiWarning =
  | 'PREPAYMENT_CAPPED'
  | 'NEGATIVE_AMORTISATION_AVOIDED'
  | 'PREPAYMENT_AFTER_CLOSE'
  | 'RATE_CHANGE_AFTER_CLOSE';

export interface ScheduleResult {
  /** Starting EMI. */
  emi: Decimal;
  months: number;
  schedule: ScheduleRow[];
  totalInterest: Decimal;
  totalPrincipal: Decimal;
  totalPrepaid: Decimal;
  /** Every rupee paid: EMIs + prepayments. */
  totalPaid: Decimal;
  warnings: EmiWarning[];
}

export class EmiError extends Error {
  constructor(
    public readonly code: 'EMI_TOO_LOW' | 'INVALID_INPUT',
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'EmiError';
  }
}
```

`packages/shared/src/loans/emiDates.ts`:
```ts
import { EmiError } from './emi.types.js';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Add calendar months to a 'YYYY-MM-DD' date without any timezone. The day
 * is clamped to the target month's length, always from the ORIGINAL day, so
 * a 31st schedule goes 31 Jan → 28 Feb → 31 Mar rather than sticking at 28.
 */
export function addMonthsIso(iso: string, months: number): string {
  const m = ISO.exec(iso);
  if (!m) throw new EmiError('INVALID_INPUT', 'Invalid date, expected YYYY-MM-DD', 'firstEmiDate');
  const y = Number(m[1]);
  const mo0 = Number(m[2]) - 1 + months;
  const day = Number(m[3]);
  const year = y + Math.floor(mo0 / 12);
  const month0 = ((mo0 % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Indian financial year label for a 'YYYY-MM-DD' date, e.g. '2026-27'. */
export function indianFy(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const mo = Number(iso.slice(5, 7));
  const start = mo >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
```

`packages/shared/src/loans/emi.ts`:
```ts
import { Decimal } from '../decimal.js';
import { addMonthsIso } from './emiDates.js';
import { EmiError, type EmiWarning, type LoanInput, type RateChange, type ScheduleResult, type ScheduleRow } from './emi.types.js';

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
/** Safety cap; inputs are limited to 480 months but rate rises can stretch a loan. */
const MAX_ROWS = 1200;

const monthlyRate = (annualRatePct: Decimal) => annualRatePct.div(1200);
const paise = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Standard reducing-balance EMI, rounded UP to the rupee so the final
 * instalment is never larger than the EMI. Never below ₹1 for a positive
 * balance (a tiny balance spread over many months would otherwise round to 0).
 */
export function emiFor(principal: Decimal, annualRatePct: Decimal, months: number): Decimal {
  if (!Number.isInteger(months) || months < 1) {
    throw new EmiError('INVALID_INPUT', 'Tenure must be at least 1 month', 'tenureMonths');
  }
  const r = monthlyRate(annualRatePct);
  let emi: Decimal;
  if (r.isZero()) {
    emi = principal.div(months);
  } else {
    const f = r.plus(1).pow(months);
    emi = principal.times(r).times(f).div(f.minus(1));
  }
  emi = emi.toDecimalPlaces(0, Decimal.ROUND_CEIL);
  return principal.gt(0) ? Decimal.max(emi, ONE) : emi;
}

/** Largest loan (whole rupees, rounded down) this EMI pays off in `months`. */
export function maxLoanFor(emi: Decimal, annualRatePct: Decimal, months: number): Decimal {
  const r = monthlyRate(annualRatePct);
  if (r.isZero()) return emi.times(months).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  const f = r.plus(1).pow(months);
  return emi.times(f.minus(1)).div(r.times(f)).toDecimalPlaces(0, Decimal.ROUND_DOWN);
}

/** Months needed to repay `principal` at a fixed `emi` (rounded up). */
export function tenureForEmi(principal: Decimal, emi: Decimal, annualRatePct: Decimal): number {
  const r = monthlyRate(annualRatePct);
  if (r.isZero()) return principal.div(emi).toDecimalPlaces(0, Decimal.ROUND_CEIL).toNumber();
  const interest = principal.times(r);
  if (emi.lte(interest)) {
    throw new EmiError('EMI_TOO_LOW', 'EMI never pays off the loan - it does not cover the monthly interest', 'emi');
  }
  const n = emi.div(emi.minus(interest)).ln().div(r.plus(1).ln());
  // Trim float-ish noise so an exact 120 does not become 121.
  return n.toDecimalPlaces(9).toDecimalPlaces(0, Decimal.ROUND_CEIL).toNumber();
}

export function buildEmiSchedule(input: LoanInput): ScheduleResult {
  const warnings = new Set<EmiWarning>();
  let rate = input.annualRatePct;
  let balance = input.principal;
  let emi = input.emiOverride ?? emiFor(balance, rate, input.tenureMonths);
  const startEmi = emi;
  /** Month in which the loan is planned to close; moves with prepayments and rate changes. */
  let plannedEnd = input.emiOverride ? tenureForEmi(balance, emi, rate) : input.tenureMonths;

  const changes = new Map<number, RateChange>();
  for (const c of input.rateChanges ?? []) changes.set(c.fromMonth, c);
  const prepays = input.prepayments ?? [];

  const rows: ScheduleRow[] = [];
  for (let m = 1; balance.gt(0) && m <= MAX_ROWS; m++) {
    const change = changes.get(m);
    if (change) {
      rate = change.annualRatePct;
      const remaining = Math.max(plannedEnd - m + 1, 1);
      if (change.mode === 'REDUCE_EMI') {
        emi = emiFor(balance, rate, remaining);
      } else if (emi.lte(balance.times(monthlyRate(rate)))) {
        emi = emiFor(balance, rate, remaining);
        warnings.add('NEGATIVE_AMORTISATION_AVOIDED');
      } else {
        plannedEnd = m - 1 + tenureForEmi(balance, emi, rate);
      }
    }

    const opening = balance;
    const interest = paise(opening.times(monthlyRate(rate)));
    let principal = emi.minus(interest);
    let paid = emi;
    if (m >= plannedEnd || principal.gte(opening)) {
      principal = opening;
      paid = opening.plus(interest);
    }
    balance = opening.minus(principal);

    let prepaid = ZERO;
    for (const p of prepays) {
      const due = p.month === m || (p.recurrence === 'YEARLY' && m > p.month && (m - p.month) % 12 === 0);
      if (!due || balance.lte(0)) continue;
      let amount = p.amount;
      if (amount.gt(balance)) {
        warnings.add('PREPAYMENT_CAPPED');
        amount = balance;
      }
      balance = balance.minus(amount);
      prepaid = prepaid.plus(amount);
      if (balance.gt(0)) {
        if (p.mode === 'REDUCE_EMI') emi = emiFor(balance, rate, Math.max(plannedEnd - m, 1));
        else plannedEnd = m + tenureForEmi(balance, emi, rate);
      }
    }

    rows.push({
      month: m,
      date: addMonthsIso(input.firstEmiDate, m - 1),
      opening,
      emi: paid,
      interest,
      principal,
      prepayment: prepaid,
      closing: balance,
      ratePct: rate,
    });
  }

  const months = rows.length;
  if (prepays.some((p) => p.month > months)) warnings.add('PREPAYMENT_AFTER_CLOSE');
  if ((input.rateChanges ?? []).some((c) => c.fromMonth > months)) warnings.add('RATE_CHANGE_AFTER_CLOSE');

  const sum = (pick: (r: ScheduleRow) => Decimal) => rows.reduce((acc, r) => acc.plus(pick(r)), ZERO);
  const totalInterest = sum((r) => r.interest);
  const totalPrincipal = sum((r) => r.principal);
  const totalPrepaid = sum((r) => r.prepayment);
  const totalEmi = sum((r) => r.emi);

  return {
    emi: startEmi,
    months,
    schedule: rows,
    totalInterest,
    totalPrincipal,
    totalPrepaid,
    totalPaid: totalEmi.plus(totalPrepaid),
    warnings: [...warnings],
  };
}
```

`packages/shared/src/loans/index.ts`:
```ts
export * from './emi.types.js';
export * from './emiDates.js';
export * from './emi.js';
```

Add to `packages/shared/src/index.ts` (end of file):
```ts
export * from './loans/index.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd portfolioos/packages/shared && npx vitest run src/loans && npx tsc -p tsconfig.build.json --noEmit`
Expected: PASS; no type errors. If a reference value is off by a paisa, recheck the rounding rule against Global Constraints — do NOT edit expected values to match.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/loans packages/shared/src/index.ts
git commit -m "feat(emi): core EMI maths, reverse solvers and schedule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Prepayments and rate changes

**Files:**
- Modify: `packages/shared/src/loans/emi.ts` (already implemented in Task 1 — this task proves it)
- Test: `packages/shared/src/loans/emiAdjust.test.ts`

**Interfaces:**
- Consumes: `buildEmiSchedule`, `Prepayment`, `RateChange` from Task 1.
- Produces: no new names; locks behaviour later tasks rely on.

- [ ] **Step 1: Write the tests**

`packages/shared/src/loans/emiAdjust.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import { buildEmiSchedule } from './emi.js';
import type { LoanInput } from './emi.types.js';

const D = (v: string | number) => new Decimal(v);
const base: LoanInput = { principal: D(1000000), annualRatePct: D('8.5'), tenureMonths: 240, firstEmiDate: '2026-11-05' };
const plain = buildEmiSchedule(base);

function invariants(r: ReturnType<typeof buildEmiSchedule>, principal: Decimal) {
  expect(r.schedule.at(-1)!.closing.toFixed(2)).toBe('0.00');
  expect(r.totalPrincipal.plus(r.totalPrepaid).equals(principal)).toBe(true);
  for (const row of r.schedule) expect(row.closing.gte(0)).toBe(true);
}

describe('prepayments', () => {
  it('REDUCE_TENURE keeps the EMI and shortens the loan', () => {
    const r = buildEmiSchedule({ ...base, prepayments: [{ month: 12, amount: D(100000), recurrence: 'ONCE', mode: 'REDUCE_TENURE' }] });
    invariants(r, base.principal);
    expect(r.months).toBeLessThan(240);
    expect(r.schedule[20]!.emi.equals(plain.emi)).toBe(true);
    expect(r.totalInterest.lt(plain.totalInterest)).toBe(true);
    expect(r.schedule[11]!.prepayment.toFixed(2)).toBe('100000.00');
  });

  it('REDUCE_EMI keeps the tenure and lowers the EMI', () => {
    const r = buildEmiSchedule({ ...base, prepayments: [{ month: 12, amount: D(100000), recurrence: 'ONCE', mode: 'REDUCE_EMI' }] });
    invariants(r, base.principal);
    expect(r.months).toBe(240);
    expect(r.schedule[12]!.emi.lt(plain.emi)).toBe(true);
  });

  it('YEARLY repeats every 12 months', () => {
    const r = buildEmiSchedule({ ...base, prepayments: [{ month: 12, amount: D(50000), recurrence: 'YEARLY', mode: 'REDUCE_TENURE' }] });
    invariants(r, base.principal);
    expect(r.schedule[11]!.prepayment.toFixed(0)).toBe('50000');
    expect(r.schedule[23]!.prepayment.toFixed(0)).toBe('50000');
    expect(r.schedule[22]!.prepayment.toFixed(0)).toBe('0');
  });

  it('a prepayment larger than the balance closes the loan and warns', () => {
    const r = buildEmiSchedule({ ...base, prepayments: [{ month: 3, amount: D(5000000), recurrence: 'ONCE', mode: 'REDUCE_TENURE' }] });
    invariants(r, base.principal);
    expect(r.months).toBe(3);
    expect(r.warnings).toContain('PREPAYMENT_CAPPED');
  });

  it('a prepayment after closure is ignored with a warning', () => {
    const r = buildEmiSchedule({
      ...base,
      prepayments: [
        { month: 3, amount: D(990000), recurrence: 'ONCE', mode: 'REDUCE_TENURE' },
        { month: 200, amount: D(1000), recurrence: 'ONCE', mode: 'REDUCE_TENURE' },
      ],
    });
    invariants(r, base.principal);
    expect(r.months).toBeLessThan(200);
    expect(r.warnings).toContain('PREPAYMENT_AFTER_CLOSE');
  });
});

describe('rate changes', () => {
  it('REDUCE_TENURE (keep EMI): a cut shortens the loan, EMI unchanged', () => {
    const r = buildEmiSchedule({ ...base, rateChanges: [{ fromMonth: 25, annualRatePct: D('7.5'), mode: 'REDUCE_TENURE' }] });
    invariants(r, base.principal);
    expect(r.months).toBeLessThan(240);
    expect(r.schedule[30]!.emi.equals(plain.emi)).toBe(true);
    expect(r.schedule[24]!.ratePct.toString()).toBe('7.5');
  });

  it('REDUCE_EMI (keep tenure): a rise raises the EMI, tenure unchanged', () => {
    const r = buildEmiSchedule({ ...base, rateChanges: [{ fromMonth: 25, annualRatePct: D('10'), mode: 'REDUCE_EMI' }] });
    invariants(r, base.principal);
    expect(r.months).toBe(240);
    expect(r.schedule[30]!.emi.gt(plain.emi)).toBe(true);
  });

  it('a rise that the kept EMI cannot cover recomputes the EMI and warns', () => {
    const r = buildEmiSchedule({ ...base, rateChanges: [{ fromMonth: 13, annualRatePct: D('15'), mode: 'REDUCE_TENURE' }] });
    invariants(r, base.principal);
    expect(r.warnings).toContain('NEGATIVE_AMORTISATION_AVOIDED');
    expect(r.schedule[20]!.emi.gt(plain.emi)).toBe(true);
  });

  it('a change after closure is ignored with a warning', () => {
    const r = buildEmiSchedule({ ...base, tenureMonths: 12, principal: D(100000), rateChanges: [{ fromMonth: 30, annualRatePct: D(9), mode: 'REDUCE_EMI' }] });
    expect(r.months).toBe(12);
    expect(r.warnings).toContain('RATE_CHANGE_AFTER_CLOSE');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd portfolioos/packages/shared && npx vitest run src/loans/emiAdjust.test.ts`
Expected: PASS (Task 1 implemented the logic). If any FAIL, the bug is in `buildEmiSchedule` — fix the code, not the test, and keep Task 1's tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/loans
git commit -m "test(emi): prepayment and rate-change behaviour

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Fees, APR, tax, summary and comparison (shared)

**Files:**
- Create: `packages/shared/src/loans/apr.ts`, `packages/shared/src/loans/emiTax.ts`, `packages/shared/src/loans/summary.ts`
- Modify: `packages/shared/src/loans/index.ts`
- Test: `packages/shared/src/loans/apr.test.ts`, `packages/shared/src/loans/emiTax.test.ts`, `packages/shared/src/loans/summary.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `buildEmiSchedule`, `indianFy`.
- Produces:
  - `interface FeeSummary { processingFee: Decimal; gst: Decimal; otherCharges: Decimal; total: Decimal }`
  - `loanFees(principal: Decimal, fees?: Fees): FeeSummary`
  - `loanApr(netReceived: Decimal, schedule: ScheduleRow[]): Decimal` — APR % to 2 dp
  - `type TaxRegime = 'OLD' | 'NEW'`; `type TaxLoanKind = 'HOME_SELF' | 'HOME_LET_OUT' | 'EDUCATION' | 'NONE'`
  - `interface TaxInput { regime: TaxRegime; loanKind: TaxLoanKind; slabPct: Decimal; remaining80C: Decimal }`
  - `interface TaxYear { fy: string; interest: Decimal; principal: Decimal; interestDeduction: Decimal; principalDeduction: Decimal; carriedForward: Decimal; taxSaved: Decimal }`
  - `interface TaxSummary { years: TaxYear[]; totalTaxSaved: Decimal; note?: string }`
  - `loanTaxBenefit(schedule: ScheduleRow[], tax: TaxInput): TaxSummary`
  - `interface LoanSummary extends ScheduleResult { fees: FeeSummary; aprPct: Decimal; totalCost: Decimal; tax?: TaxSummary; postTaxCost?: Decimal }`
  - `summariseLoan(input: LoanInput, tax?: TaxInput): LoanSummary`
  - `interface FyGroup { fy: string; rows: ScheduleRow[]; emi: Decimal; interest: Decimal; principal: Decimal; prepayment: Decimal; closing: Decimal }`
  - `groupScheduleByFy(rows: ScheduleRow[]): FyGroup[]`
  - `interface OfferInput { label: string; input: LoanInput; tax?: TaxInput }`
  - `interface OfferComparison { offers: (LoanSummary & { label: string })[]; cheapestTotal: number; cheapestPostTax: number | null }`
  - `compareLoanOffers(offers: OfferInput[]): OfferComparison`

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/loans/apr.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import { buildEmiSchedule } from './emi.js';
import { loanApr, loanFees } from './apr.js';

const D = (v: string | number) => new Decimal(v);
const sched = buildEmiSchedule({ principal: D(100000), annualRatePct: D(12), tenureMonths: 12, firstEmiDate: '2026-11-05' }).schedule;

describe('loanFees', () => {
  it('percentage fee with GST', () => {
    const f = loanFees(D(100000), { processingFeeKind: 'PCT', processingFeeValue: D(2), gstPct: D(18), otherCharges: D(0) });
    expect(f.processingFee.toFixed(2)).toBe('2000.00');
    expect(f.gst.toFixed(2)).toBe('360.00');
    expect(f.total.toFixed(2)).toBe('2360.00');
  });
  it('flat fee plus other charges', () => {
    const f = loanFees(D(100000), { processingFeeKind: 'AMOUNT', processingFeeValue: D(1000), gstPct: D(18), otherCharges: D(500) });
    expect(f.total.toFixed(2)).toBe('1680.00');
  });
  it('no fees', () => expect(loanFees(D(100000)).total.toFixed(2)).toBe('0.00'));
});

describe('loanApr', () => {
  // Reference: monthly IRR by bisection at 40 digits, annualised as (1+i)^12-1.
  it('no fees -> effective annual rate of the nominal 12%', () => {
    expect(loanApr(D(100000), sched).toFixed(2)).toBe('12.68');
  });
  it('2% fee + GST raises APR to 17.88%', () => {
    expect(loanApr(D(100000 - 2360), sched).toFixed(2)).toBe('17.88');
  });
  it('zero-rate loan without fees has 0% APR', () => {
    const s = buildEmiSchedule({ principal: D(120000), annualRatePct: D(0), tenureMonths: 12, firstEmiDate: '2026-11-05' }).schedule;
    expect(loanApr(D(120000), s).toFixed(2)).toBe('0.00');
  });
});
```

`packages/shared/src/loans/emiTax.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import { loanTaxBenefit } from './emiTax.js';
import type { ScheduleRow } from './emi.types.js';

const D = (v: string | number) => new Decimal(v);
/** One row per month from `start`, fixed interest/principal, for clean FY sums. */
function rows(start: string, count: number, interest: number, principal: number): ScheduleRow[] {
  const out: ScheduleRow[] = [];
  let y = Number(start.slice(0, 4));
  let mo = Number(start.slice(5, 7));
  for (let i = 0; i < count; i++) {
    out.push({
      month: i + 1, date: `${y}-${String(mo).padStart(2, '0')}-05`,
      opening: D(0), emi: D(interest + principal), interest: D(interest), principal: D(principal),
      prepayment: D(0), closing: D(0), ratePct: D(9),
    });
    mo += 1; if (mo === 13) { mo = 1; y += 1; }
  }
  return out;
}

describe('loanTaxBenefit', () => {
  const old30 = { regime: 'OLD' as const, slabPct: D(30), remaining80C: D(150000) };

  it('home self-occupied: interest capped at 2L, principal at 80C room, cess 4%', () => {
    // 12 months Apr-Mar: interest 2.4L, principal 1.2L.
    const t = loanTaxBenefit(rows('2026-04-05', 12, 20000, 10000), { ...old30, loanKind: 'HOME_SELF' });
    expect(t.years).toHaveLength(1);
    const y = t.years[0]!;
    expect(y.fy).toBe('2026-27');
    expect(y.interestDeduction.toFixed(0)).toBe('200000');
    expect(y.principalDeduction.toFixed(0)).toBe('120000');
    // (200000 + 120000) * 30% * 1.04 = 99840
    expect(y.taxSaved.toFixed(2)).toBe('99840.00');
  });

  it('principal limited by remaining 80C room', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 12, 1000, 20000), { ...old30, remaining80C: D(50000), loanKind: 'HOME_SELF' });
    expect(t.years[0]!.principalDeduction.toFixed(0)).toBe('50000');
  });

  it('let-out: set-off capped at 2L, excess carried forward', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 12, 30000, 0), { ...old30, loanKind: 'HOME_LET_OUT' });
    expect(t.years[0]!.interestDeduction.toFixed(0)).toBe('200000');
    expect(t.years[0]!.carriedForward.toFixed(0)).toBe('160000');
  });

  it('education: interest only, first 8 FYs only, no 80C', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 120, 5000, 5000), { ...old30, loanKind: 'EDUCATION' });
    expect(t.years).toHaveLength(10);
    expect(t.years[0]!.interestDeduction.toFixed(0)).toBe('60000');
    expect(t.years[0]!.principalDeduction.toFixed(0)).toBe('0');
    expect(t.years[7]!.interestDeduction.toFixed(0)).toBe('60000');
    expect(t.years[8]!.interestDeduction.toFixed(0)).toBe('0');
  });

  it('splits by FY across a March/April boundary', () => {
    const t = loanTaxBenefit(rows('2027-02-05', 3, 1000, 1000), { ...old30, loanKind: 'HOME_SELF' });
    expect(t.years.map((y) => y.fy)).toEqual(['2026-27', '2027-28']);
    expect(t.years[0]!.interest.toFixed(0)).toBe('2000');
    expect(t.years[1]!.interest.toFixed(0)).toBe('1000');
  });

  it('new regime gives zero with a note', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 12, 20000, 10000), { ...old30, regime: 'NEW', loanKind: 'HOME_SELF' });
    expect(t.totalTaxSaved.toFixed(2)).toBe('0.00');
    expect(t.note).toMatch(/new tax regime/i);
  });

  it('NONE loan kind gives zero', () => {
    const t = loanTaxBenefit(rows('2026-04-05', 12, 20000, 10000), { ...old30, loanKind: 'NONE' });
    expect(t.totalTaxSaved.toFixed(2)).toBe('0.00');
  });
});
```

`packages/shared/src/loans/summary.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import { summariseLoan, compareLoanOffers, groupScheduleByFy } from './summary.js';
import type { LoanInput } from './emi.types.js';

const D = (v: string | number) => new Decimal(v);
const base: LoanInput = { principal: D(100000), annualRatePct: D(12), tenureMonths: 12, firstEmiDate: '2026-11-05' };

describe('summariseLoan', () => {
  it('adds fees, APR and total cost', () => {
    const s = summariseLoan({ ...base, fees: { processingFeeKind: 'PCT', processingFeeValue: D(2), gstPct: D(18), otherCharges: D(0) } });
    expect(s.fees.total.toFixed(2)).toBe('2360.00');
    expect(s.aprPct.toFixed(2)).toBe('17.88');
    expect(s.totalCost.equals(s.totalPaid.plus(s.fees.total))).toBe(true);
    expect(s.tax).toBeUndefined();
  });
  it('with tax: post-tax cost = total cost - tax saved', () => {
    const s = summariseLoan(base, { regime: 'OLD', loanKind: 'HOME_SELF', slabPct: D(30), remaining80C: D(150000) });
    expect(s.tax).toBeDefined();
    expect(s.postTaxCost!.equals(s.totalCost.minus(s.tax!.totalTaxSaved))).toBe(true);
  });
});

describe('groupScheduleByFy', () => {
  it('groups rows by Indian FY with sums and FY-end closing', () => {
    const s = summariseLoan(base); // Nov 2026 .. Oct 2027
    const g = groupScheduleByFy(s.schedule);
    expect(g.map((x) => x.fy)).toEqual(['2026-27', '2027-28']);
    expect(g[0]!.rows).toHaveLength(5);
    expect(g[1]!.rows).toHaveLength(7);
    expect(g[0]!.interest.plus(g[1]!.interest).equals(s.totalInterest)).toBe(true);
    expect(g[1]!.closing.toFixed(2)).toBe('0.00');
  });
});

describe('compareLoanOffers', () => {
  it('flags the cheapest by total cost and post-tax cost', () => {
    const c = compareLoanOffers([
      { label: 'A', input: { ...base, annualRatePct: D(12) } },
      { label: 'B', input: { ...base, annualRatePct: D(11), fees: { processingFeeKind: 'AMOUNT', processingFeeValue: D(5000), gstPct: D(18), otherCharges: D(0) } } },
      { label: 'C', input: { ...base, annualRatePct: D('11.5') } },
    ]);
    expect(c.offers.map((o) => o.label)).toEqual(['A', 'B', 'C']);
    expect(c.cheapestTotal).toBe(2);
    expect(c.cheapestPostTax).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd portfolioos/packages/shared && npx vitest run src/loans`
Expected: FAIL — `./apr.js`, `./emiTax.js`, `./summary.js` not found.

- [ ] **Step 3: Implement**

`packages/shared/src/loans/apr.ts`:
```ts
import { Decimal } from '../decimal.js';
import type { Fees, ScheduleRow } from './emi.types.js';

export interface FeeSummary { processingFee: Decimal; gst: Decimal; otherCharges: Decimal; total: Decimal }

const ZERO = new Decimal(0);
const paise = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function loanFees(principal: Decimal, fees?: Fees): FeeSummary {
  if (!fees) return { processingFee: ZERO, gst: ZERO, otherCharges: ZERO, total: ZERO };
  const processingFee = paise(
    fees.processingFeeKind === 'PCT' ? principal.times(fees.processingFeeValue).div(100) : fees.processingFeeValue,
  );
  const gst = paise(processingFee.times(fees.gstPct).div(100));
  const otherCharges = paise(fees.otherCharges);
  return { processingFee, gst, otherCharges, total: processingFee.plus(gst).plus(otherCharges) };
}

/**
 * APR from actual cash flows: the borrower receives `netReceived` at t0 and
 * pays each row's EMI + prepayment at month k. Monthly IRR by bisection,
 * annualised as (1+i)^12 - 1. Returns a percentage to 2 dp.
 */
export function loanApr(netReceived: Decimal, schedule: ScheduleRow[]): Decimal {
  const payments = schedule.map((r) => r.emi.plus(r.prepayment));
  const pv = (i: Decimal) => {
    const d = new Decimal(1).div(i.plus(1));
    let factor = new Decimal(1);
    let total = ZERO;
    for (const p of payments) {
      factor = factor.times(d);
      total = total.plus(p.times(factor));
    }
    return total;
  };
  // Payments never exceed what was received -> no cost of borrowing.
  if (pv(ZERO).lte(netReceived)) return ZERO.toDecimalPlaces(2);
  let lo = ZERO;
  let hi = new Decimal(1); // 100% a month - far above any real loan
  const tolerance = new Decimal('1e-12');
  for (let k = 0; k < 200 && hi.minus(lo).gt(tolerance); k++) {
    const mid = lo.plus(hi).div(2);
    if (pv(mid).gt(netReceived)) lo = mid;
    else hi = mid;
  }
  return lo.plus(1).pow(12).minus(1).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
```

`packages/shared/src/loans/emiTax.ts`:
```ts
import { Decimal } from '../decimal.js';
import { indianFy } from './emiDates.js';
import type { ScheduleRow } from './emi.types.js';

export type TaxRegime = 'OLD' | 'NEW';
export type TaxLoanKind = 'HOME_SELF' | 'HOME_LET_OUT' | 'EDUCATION' | 'NONE';
export interface TaxInput { regime: TaxRegime; loanKind: TaxLoanKind; slabPct: Decimal; remaining80C: Decimal }
export interface TaxYear {
  fy: string;
  interest: Decimal;
  principal: Decimal;
  interestDeduction: Decimal;
  principalDeduction: Decimal;
  carriedForward: Decimal;
  taxSaved: Decimal;
}
export interface TaxSummary { years: TaxYear[]; totalTaxSaved: Decimal; note?: string }

const ZERO = new Decimal(0);
const CAP_24B = new Decimal(200000);
const CESS = new Decimal('1.04');
const EDUCATION_YEARS = 8;

export function loanTaxBenefit(schedule: ScheduleRow[], tax: TaxInput): TaxSummary {
  const byFy = new Map<string, { interest: Decimal; principal: Decimal }>();
  for (const r of schedule) {
    const fy = indianFy(r.date);
    const acc = byFy.get(fy) ?? { interest: ZERO, principal: ZERO };
    // Section 80C counts every principal repayment, prepayments included.
    byFy.set(fy, { interest: acc.interest.plus(r.interest), principal: acc.principal.plus(r.principal).plus(r.prepayment) });
  }
  const rate = tax.slabPct.div(100).times(CESS);
  const noBenefit = tax.regime === 'NEW' || tax.loanKind === 'NONE';

  const years: TaxYear[] = [...byFy.entries()].map(([fy, s], index) => {
    let interestDeduction = ZERO;
    let principalDeduction = ZERO;
    let carriedForward = ZERO;
    if (!noBenefit) {
      if (tax.loanKind === 'HOME_SELF') {
        interestDeduction = Decimal.min(s.interest, CAP_24B);
        principalDeduction = Decimal.min(s.principal, tax.remaining80C);
      } else if (tax.loanKind === 'HOME_LET_OUT') {
        interestDeduction = Decimal.min(s.interest, CAP_24B);
        carriedForward = s.interest.minus(interestDeduction);
        principalDeduction = Decimal.min(s.principal, tax.remaining80C);
      } else if (tax.loanKind === 'EDUCATION' && index < EDUCATION_YEARS) {
        interestDeduction = s.interest;
      }
    }
    const taxSaved = interestDeduction.plus(principalDeduction).times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return { fy, interest: s.interest, principal: s.principal, interestDeduction, principalDeduction, carriedForward, taxSaved };
  });

  const totalTaxSaved = years.reduce((a, y) => a.plus(y.taxSaved), ZERO);
  const note = tax.regime === 'NEW'
    ? 'No deduction under the new tax regime for this loan (self-occupied home loan interest and 80C/80E are not allowed).'
    : undefined;
  return { years, totalTaxSaved, note };
}
```

`packages/shared/src/loans/summary.ts`:
```ts
import { Decimal } from '../decimal.js';
import { buildEmiSchedule } from './emi.js';
import { indianFy } from './emiDates.js';
import { loanApr, loanFees, type FeeSummary } from './apr.js';
import { loanTaxBenefit, type TaxInput, type TaxSummary } from './emiTax.js';
import type { LoanInput, ScheduleResult, ScheduleRow } from './emi.types.js';

export interface LoanSummary extends ScheduleResult {
  fees: FeeSummary;
  aprPct: Decimal;
  /** totalPaid + fees */
  totalCost: Decimal;
  tax?: TaxSummary;
  postTaxCost?: Decimal;
}

export function summariseLoan(input: LoanInput, tax?: TaxInput): LoanSummary {
  const result = buildEmiSchedule(input);
  const fees = loanFees(input.principal, input.fees);
  const aprPct = loanApr(input.principal.minus(fees.total), result.schedule);
  const totalCost = result.totalPaid.plus(fees.total);
  const summary: LoanSummary = { ...result, fees, aprPct, totalCost };
  if (tax) {
    summary.tax = loanTaxBenefit(result.schedule, tax);
    summary.postTaxCost = totalCost.minus(summary.tax.totalTaxSaved);
  }
  return summary;
}

export interface FyGroup {
  fy: string;
  rows: ScheduleRow[];
  emi: Decimal;
  interest: Decimal;
  principal: Decimal;
  prepayment: Decimal;
  /** Balance at the end of the FY (last row's closing). */
  closing: Decimal;
}

export function groupScheduleByFy(rows: ScheduleRow[]): FyGroup[] {
  const groups: FyGroup[] = [];
  for (const r of rows) {
    const fy = indianFy(r.date);
    let g = groups.at(-1);
    if (!g || g.fy !== fy) {
      g = { fy, rows: [], emi: new Decimal(0), interest: new Decimal(0), principal: new Decimal(0), prepayment: new Decimal(0), closing: r.closing };
      groups.push(g);
    }
    g.rows.push(r);
    g.emi = g.emi.plus(r.emi);
    g.interest = g.interest.plus(r.interest);
    g.principal = g.principal.plus(r.principal);
    g.prepayment = g.prepayment.plus(r.prepayment);
    g.closing = r.closing;
  }
  return groups;
}

export interface OfferInput { label: string; input: LoanInput; tax?: TaxInput }
export interface OfferComparison {
  offers: (LoanSummary & { label: string })[];
  /** Index of the lowest total cost (EMIs + prepayments + fees). */
  cheapestTotal: number;
  /** Index of the lowest post-tax cost; null unless every offer has tax input. */
  cheapestPostTax: number | null;
}

const argMin = (values: Decimal[]) => values.reduce((best, v, i) => (v.lt(values[best]!) ? i : best), 0);

export function compareLoanOffers(offers: OfferInput[]): OfferComparison {
  const summaries = offers.map((o) => ({ ...summariseLoan(o.input, o.tax), label: o.label }));
  const allTaxed = summaries.every((s) => s.postTaxCost !== undefined);
  return {
    offers: summaries,
    cheapestTotal: argMin(summaries.map((s) => s.totalCost)),
    cheapestPostTax: allTaxed ? argMin(summaries.map((s) => s.postTaxCost!)) : null,
  };
}
```

Update `packages/shared/src/loans/index.ts`:
```ts
export * from './emi.types.js';
export * from './emiDates.js';
export * from './emi.js';
export * from './apr.js';
export * from './emiTax.js';
export * from './summary.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd portfolioos/packages/shared && npx vitest run src/loans && npx tsc -p tsconfig.build.json --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/loans
git commit -m "feat(emi): fees, APR, tax benefit, summary and offer comparison

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wire format and validation (shared)

**Files:**
- Create: `packages/shared/src/loans/emiWire.ts`
- Modify: `packages/shared/src/loans/index.ts` (add `export * from './emiWire.js';`)
- Test: `packages/shared/src/loans/emiWire.test.ts`

**Interfaces:**
- Consumes: Task 1/3 types.
- Produces:
  - `interface PrepaymentWire { month: number; amount: string; recurrence: 'ONCE' | 'YEARLY'; mode: EmiMode }`
  - `interface RateChangeWire { fromMonth: number; annualRatePct: string; mode: EmiMode }`
  - `interface FeesWire { processingFeeKind: 'PCT' | 'AMOUNT'; processingFeeValue: string; gstPct: string; otherCharges: string }`
  - `interface LoanInputWire { principal: string; annualRatePct: string; tenureMonths: number; firstEmiDate: string; emiOverride?: string; prepayments?: PrepaymentWire[]; rateChanges?: RateChangeWire[]; fees?: FeesWire }`
  - `interface TaxInputWire { regime: TaxRegime; loanKind: TaxLoanKind; slabPct: string; remaining80C: string }`
  - `interface FieldError { field: string; message: string }`
  - `cleanNumber(s: string): string` — strips commas, spaces, `₹`
  - `validateLoanWire(w: LoanInputWire): FieldError[]`, `validateTaxWire(t: TaxInputWire): FieldError[]`
  - `loanFromWire(w: LoanInputWire): LoanInput`, `taxFromWire(t: TaxInputWire): TaxInput` (call only after validation passes)

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/loans/emiWire.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cleanNumber, validateLoanWire, validateTaxWire, loanFromWire, taxFromWire, type LoanInputWire } from './emiWire.js';

const ok: LoanInputWire = { principal: '1000000', annualRatePct: '8.5', tenureMonths: 240, firstEmiDate: '2026-11-05' };
const fields = (w: LoanInputWire) => validateLoanWire(w).map((e) => e.field);

describe('cleanNumber', () => {
  it('accepts Indian grouping and the rupee sign', () => {
    expect(cleanNumber('10,00,000')).toBe('1000000');
    expect(cleanNumber(' ₹ 25,00,000.50 ')).toBe('2500000.50');
  });
});

describe('validateLoanWire', () => {
  it('accepts a valid loan', () => expect(validateLoanWire(ok)).toEqual([]));
  it('accepts Indian-formatted amounts', () => expect(validateLoanWire({ ...ok, principal: '₹ 10,00,000' })).toEqual([]));
  it.each([
    [{ principal: '0' }, 'principal'],
    [{ principal: 'abc' }, 'principal'],
    [{ principal: '1000000001' }, 'principal'],
    [{ annualRatePct: '51' }, 'annualRatePct'],
    [{ annualRatePct: '-1' }, 'annualRatePct'],
    [{ tenureMonths: 0 }, 'tenureMonths'],
    [{ tenureMonths: 481 }, 'tenureMonths'],
    [{ tenureMonths: 12.5 }, 'tenureMonths'],
    [{ firstEmiDate: '2026-02-30' }, 'firstEmiDate'],
    [{ firstEmiDate: '05/11/2026' }, 'firstEmiDate'],
    [{ emiOverride: '0' }, 'emiOverride'],
  ])('rejects %o', (patch, field) => expect(fields({ ...ok, ...patch } as LoanInputWire)).toContain(field));
  it('names the failing prepayment / rate change / fee field', () => {
    const errs = fields({
      ...ok,
      prepayments: [{ month: 0, amount: '-5', recurrence: 'ONCE', mode: 'REDUCE_TENURE' }],
      rateChanges: [{ fromMonth: 3, annualRatePct: '99', mode: 'REDUCE_EMI' }],
      fees: { processingFeeKind: 'PCT', processingFeeValue: '11', gstPct: '30', otherCharges: 'x' },
    });
    expect(errs).toEqual(expect.arrayContaining([
      'prepayments.0.month', 'prepayments.0.amount', 'rateChanges.0.annualRatePct',
      'fees.processingFeeValue', 'fees.gstPct', 'fees.otherCharges',
    ]));
  });
});

describe('validateTaxWire', () => {
  it('limits slab and 80C room', () => {
    const errs = validateTaxWire({ regime: 'OLD', loanKind: 'HOME_SELF', slabPct: '31', remaining80C: '150001' }).map((e) => e.field);
    expect(errs).toEqual(['tax.slabPct', 'tax.remaining80C']);
  });
});

describe('fromWire', () => {
  it('converts to Decimals after cleaning', () => {
    const l = loanFromWire({ ...ok, principal: '10,00,000', fees: { processingFeeKind: 'PCT', processingFeeValue: '0.5', gstPct: '18', otherCharges: '1,000' } });
    expect(l.principal.toString()).toBe('1000000');
    expect(l.fees!.otherCharges.toString()).toBe('1000');
    const t = taxFromWire({ regime: 'OLD', loanKind: 'HOME_SELF', slabPct: '30', remaining80C: '1,50,000' });
    expect(t.remaining80C.toString()).toBe('150000');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd portfolioos/packages/shared && npx vitest run src/loans/emiWire.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/shared/src/loans/emiWire.ts`:
```ts
import { Decimal } from '../decimal.js';
import type { EmiMode, LoanInput } from './emi.types.js';
import type { TaxInput, TaxLoanKind, TaxRegime } from './emiTax.js';

export interface PrepaymentWire { month: number; amount: string; recurrence: 'ONCE' | 'YEARLY'; mode: EmiMode }
export interface RateChangeWire { fromMonth: number; annualRatePct: string; mode: EmiMode }
export interface FeesWire { processingFeeKind: 'PCT' | 'AMOUNT'; processingFeeValue: string; gstPct: string; otherCharges: string }
export interface LoanInputWire {
  principal: string;
  annualRatePct: string;
  tenureMonths: number;
  firstEmiDate: string;
  emiOverride?: string;
  prepayments?: PrepaymentWire[];
  rateChanges?: RateChangeWire[];
  fees?: FeesWire;
}
export interface TaxInputWire { regime: TaxRegime; loanKind: TaxLoanKind; slabPct: string; remaining80C: string }
export interface FieldError { field: string; message: string }

export const EMI_LIMITS = {
  maxPrincipal: new Decimal(1_000_000_000),
  maxRatePct: new Decimal(50),
  maxTenureMonths: 480,
  maxGstPct: new Decimal(28),
  maxFeePct: new Decimal(10),
  maxSlabPct: new Decimal(30),
  max80C: new Decimal(150000),
} as const;

const NUMBER = /^\d+(\.\d+)?$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "₹ 10,00,000.50" → "1000000.50". */
export function cleanNumber(s: string): string {
  return s.replace(/[,\s₹]/g, '');
}

function num(s: string | undefined): Decimal | null {
  if (s === undefined) return null;
  const c = cleanNumber(s);
  return NUMBER.test(c) ? new Decimal(c) : null;
}

function validDate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

const isMonth = (n: number) => Number.isInteger(n) && n >= 1 && n <= EMI_LIMITS.maxTenureMonths;

export function validateLoanWire(w: LoanInputWire): FieldError[] {
  const errors: FieldError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });

  const p = num(w.principal);
  if (!p || p.lte(0)) add('principal', 'Enter a loan amount above 0');
  else if (p.gt(EMI_LIMITS.maxPrincipal)) add('principal', 'Loan amount can be at most Rs. 100 crore');

  const r = num(w.annualRatePct);
  if (!r || r.gt(EMI_LIMITS.maxRatePct)) add('annualRatePct', 'Rate must be between 0% and 50%');

  if (!isMonth(w.tenureMonths)) add('tenureMonths', 'Tenure must be 1-480 months');
  if (!validDate(w.firstEmiDate)) add('firstEmiDate', 'Pick a valid first EMI date');

  if (w.emiOverride !== undefined) {
    const e = num(w.emiOverride);
    if (!e || e.lte(0)) add('emiOverride', 'Enter an EMI above 0');
  }

  (w.prepayments ?? []).forEach((pp, i) => {
    if (!isMonth(pp.month)) add(`prepayments.${i}.month`, 'Month must be 1-480');
    const a = num(pp.amount);
    if (!a || a.lte(0)) add(`prepayments.${i}.amount`, 'Enter an amount above 0');
  });

  (w.rateChanges ?? []).forEach((rc, i) => {
    if (!isMonth(rc.fromMonth)) add(`rateChanges.${i}.fromMonth`, 'Month must be 1-480');
    const nr = num(rc.annualRatePct);
    if (!nr || nr.gt(EMI_LIMITS.maxRatePct)) add(`rateChanges.${i}.annualRatePct`, 'Rate must be between 0% and 50%');
  });

  if (w.fees) {
    const fv = num(w.fees.processingFeeValue);
    if (!fv) add('fees.processingFeeValue', 'Enter a fee (0 if none)');
    else if (w.fees.processingFeeKind === 'PCT' && fv.gt(EMI_LIMITS.maxFeePct)) add('fees.processingFeeValue', 'Fee can be at most 10%');
    const g = num(w.fees.gstPct);
    if (!g || g.gt(EMI_LIMITS.maxGstPct)) add('fees.gstPct', 'GST must be 0-28%');
    if (!num(w.fees.otherCharges)) add('fees.otherCharges', 'Enter other charges (0 if none)');
  }
  return errors;
}

export function validateTaxWire(t: TaxInputWire): FieldError[] {
  const errors: FieldError[] = [];
  const s = num(t.slabPct);
  if (!s || s.gt(EMI_LIMITS.maxSlabPct)) errors.push({ field: 'tax.slabPct', message: 'Tax slab must be 0-30%' });
  const c = num(t.remaining80C);
  if (!c || c.gt(EMI_LIMITS.max80C)) errors.push({ field: 'tax.remaining80C', message: '80C room must be Rs. 0 - 1,50,000' });
  return errors;
}

const dec = (s: string) => new Decimal(cleanNumber(s));

/** Call only after `validateLoanWire` returned no errors. */
export function loanFromWire(w: LoanInputWire): LoanInput {
  return {
    principal: dec(w.principal),
    annualRatePct: dec(w.annualRatePct),
    tenureMonths: w.tenureMonths,
    firstEmiDate: w.firstEmiDate,
    emiOverride: w.emiOverride !== undefined ? dec(w.emiOverride) : undefined,
    prepayments: w.prepayments?.map((p) => ({ month: p.month, amount: dec(p.amount), recurrence: p.recurrence, mode: p.mode })),
    rateChanges: w.rateChanges?.map((c) => ({ fromMonth: c.fromMonth, annualRatePct: dec(c.annualRatePct), mode: c.mode })),
    fees: w.fees && {
      processingFeeKind: w.fees.processingFeeKind,
      processingFeeValue: dec(w.fees.processingFeeValue),
      gstPct: dec(w.fees.gstPct),
      otherCharges: dec(w.fees.otherCharges),
    },
  };
}

/** Call only after `validateTaxWire` returned no errors. */
export function taxFromWire(t: TaxInputWire): TaxInput {
  return { regime: t.regime, loanKind: t.loanKind, slabPct: dec(t.slabPct), remaining80C: dec(t.remaining80C) };
}
```

Add `export * from './emiWire.js';` to `packages/shared/src/loans/index.ts`.

- [ ] **Step 4: Run tests to verify they pass, then build shared**

Run: `cd portfolioos/packages/shared && npx vitest run src/loans && pnpm build`
Expected: PASS; `dist/` rebuilt (the web and API consume the built package).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/loans
git commit -m "feat(emi): wire format and shared input validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Export endpoint (API)

**Files:**
- Create: `packages/api/src/services/emi/emiExport.ts`, `packages/api/src/controllers/emi.controller.ts`, `packages/api/src/routes/emi.routes.ts`
- Modify: `packages/api/src/middleware/rateLimit.ts` (add `emiExportLimiter`), `packages/api/src/routes/index.ts` (mount `/api/emi`)
- Test: `packages/api/test/emi/emiExport.test.ts`, `packages/api/test/routes/emi.routes.test.ts`

**Interfaces:**
- Consumes: `summariseLoan`, `groupScheduleByFy`, `validateLoanWire`, `validateTaxWire`, `loanFromWire`, `taxFromWire`, `LoanInputWire`, `TaxInputWire`, `formatDateOnly`, `EmiError` from `@everypaisa/shared`; `inr` from `services/receipts/format.ts`.
- Produces:
  - `POST /api/emi/export?format=pdf|xlsx` body `{ input: LoanInputWire; tax?: TaxInputWire; title?: string }` → file download (`application/pdf` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), `Content-Disposition: attachment; filename="emi-schedule.<ext>"`. Validation errors → 400 `{ success:false, error:'<message>', code:'BAD_REQUEST', details:{ field } }`.
  - `buildEmiXlsx(summary: LoanSummary, meta: ExportMeta): Promise<Buffer>`, `buildEmiPdf(summary: LoanSummary, meta: ExportMeta): Promise<Buffer>`, `interface ExportMeta { title: string; input: LoanInputWire }`

- [ ] **Step 1: Write the failing tests**

`packages/api/test/emi/emiExport.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { summariseLoan, loanFromWire, type LoanInputWire } from '@everypaisa/shared';
import { buildEmiXlsx, buildEmiPdf } from '../../src/services/emi/emiExport.js';

const input: LoanInputWire = { principal: '100000', annualRatePct: '12', tenureMonths: 12, firstEmiDate: '2026-11-05' };
const summary = summariseLoan(loanFromWire(input));

describe('buildEmiXlsx', () => {
  it('writes a summary sheet and a schedule with real date and number cells', async () => {
    const buf = await buildEmiXlsx(summary, { title: 'Home loan', input });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sched = wb.getWorksheet('Schedule')!;
    expect(sched.rowCount).toBe(1 + 12);
    const first = sched.getRow(2);
    expect(first.getCell(2).value).toBeInstanceOf(Date);
    expect(first.getCell(2).numFmt).toBe('dd/mm/yyyy');
    expect(typeof first.getCell(4).value).toBe('number');
    const s = wb.getWorksheet('Summary')!;
    expect(String(s.getCell('A1').value)).toContain('Home loan');
  });
});

describe('buildEmiPdf', () => {
  it('produces a PDF', async () => {
    const buf = await buildEmiPdf(summary, { title: 'Home loan', input });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });
});
```

`packages/api/test/routes/emi.routes.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { emiRouter } from '../../src/routes/emi.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
const token = () => signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token;
const input = { principal: '100000', annualRatePct: '12', tenureMonths: 12, firstEmiDate: '2026-11-05' };

function post(format: string, body: unknown, auth = true) {
  return fetch(`${base}/api/emi/export?format=${format}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${token()}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  user = await createTestScope('emi-http');
  const app = express();
  app.use(express.json());
  app.use('/api/emi', emiRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await user.cleanup();
});

describe('POST /api/emi/export', () => {
  it('requires auth', async () => expect((await post('pdf', { input }, false)).status).toBe(401));
  it('returns a PDF', async () => {
    const res = await post('pdf', { input, title: 'Car loan' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('emi-schedule.pdf');
  });
  it('returns an xlsx', async () => {
    const res = await post('xlsx', { input });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
  });
  it('rejects an unknown format', async () => expect((await post('csv', { input })).status).toBe(400));
  it('rejects invalid input with the field name', async () => {
    const res = await post('pdf', { input: { ...input, tenureMonths: 999 } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details.field).toBe('tenureMonths');
  });
  it('maps EMI_TOO_LOW to 400', async () => {
    const res = await post('pdf', { input: { ...input, emiOverride: '100' } });
    expect(res.status).toBe(400);
  });
});
```

Before writing, read `packages/api/test/helpers/db.ts` to confirm `createTestScope` returns `{ userId, cleanup }`; adapt the `afterAll` to its real cleanup API if it differs, and read `packages/api/src/middleware/errorHandler.ts` to confirm `details` is serialised for `AppError` (if it is not, assert on the message text containing the field label instead — do not change the error handler).

- [ ] **Step 2: Run tests to verify they fail**

Run (from `portfolioos/packages/api`, with the env exports in the plan's Execution notes):
`npx vitest run test/emi test/routes/emi.routes.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`packages/api/src/services/emi/emiExport.ts`:
```ts
/**
 * EMI schedule as a file. Stateless: the caller's input is re-validated and
 * recomputed by the route; this module only lays out a LoanSummary.
 *
 * Excel keeps machine-friendly cells (real Date cells shown dd/mm/yyyy,
 * numeric money) so sorting and formulas work. PDF uses `Rs.` because
 * PDFKit's Helvetica has no rupee glyph (see receipts/format.ts).
 */
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { groupScheduleByFy, formatDateOnly, type LoanSummary, type LoanInputWire } from '@everypaisa/shared';
import { inr } from '../receipts/format.js';

export interface ExportMeta { title: string; input: LoanInputWire }

const MONEY_FMT = '#,##,##0.00';
const money2 = (d: { toFixed(dp: number): string }) => d.toFixed(2);
/** Excel stores doubles; converting here, at the file boundary, is the only Number on money. */
const cellMoney = (d: { toFixed(dp: number): string }) => Number(d.toFixed(2));
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function buildEmiXlsx(s: LoanSummary, meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet('Summary');
  sum.getCell('A1').value = `${meta.title} - EMI summary`;
  sum.getCell('A1').font = { bold: true, size: 14 };
  const lines: [string, number | string][] = [
    ['Loan amount', cellMoney(s.schedule[0]?.opening ?? s.totalPrincipal)],
    ['Interest rate (% p.a.)', meta.input.annualRatePct],
    ['Tenure (months)', s.months],
    ['EMI', cellMoney(s.emi)],
    ['Total interest', cellMoney(s.totalInterest)],
    ['Total prepaid', cellMoney(s.totalPrepaid)],
    ['Fees and charges', cellMoney(s.fees.total)],
    ['Total cost', cellMoney(s.totalCost)],
    ['APR (%)', s.aprPct.toFixed(2)],
  ];
  if (s.tax && s.postTaxCost) {
    lines.push(['Tax saved', cellMoney(s.tax.totalTaxSaved)], ['Cost after tax', cellMoney(s.postTaxCost)]);
  }
  lines.forEach(([k, v], i) => {
    const row = sum.getRow(i + 3);
    row.getCell(1).value = k;
    row.getCell(2).value = v;
    if (typeof v === 'number' && !/months/.test(k)) row.getCell(2).numFmt = MONEY_FMT;
  });
  sum.getColumn(1).width = 26;
  sum.getColumn(2).width = 18;

  const sh = wb.addWorksheet('Schedule');
  sh.addRow(['Month', 'Date', 'Opening', 'EMI', 'Interest', 'Principal', 'Prepayment', 'Closing', 'Rate %']);
  sh.getRow(1).font = { bold: true };
  for (const r of s.schedule) {
    const row = sh.addRow([
      r.month, isoToDate(r.date), cellMoney(r.opening), cellMoney(r.emi), cellMoney(r.interest),
      cellMoney(r.principal), cellMoney(r.prepayment), cellMoney(r.closing), r.ratePct.toString(),
    ]);
    row.getCell(2).numFmt = 'dd/mm/yyyy';
    for (let c = 3; c <= 8; c++) row.getCell(c).numFmt = MONEY_FMT;
  }
  sh.columns.forEach((col) => { col.width = 14; });
  sh.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildEmiPdf(s: LoanSummary, meta: ExportMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text(`${meta.title} - EMI schedule`);
    doc.moveDown(0.5).fontSize(10).font('Helvetica');
    const facts: [string, string][] = [
      ['Loan amount', inr(money2(s.totalPrincipal.plus(s.totalPrepaid)))],
      ['Interest rate', `${meta.input.annualRatePct}% p.a.`],
      ['Tenure', `${s.months} months`],
      ['First EMI', formatDateOnly(meta.input.firstEmiDate)],
      ['EMI', inr(money2(s.emi))],
      ['Total interest', inr(money2(s.totalInterest))],
      ['Fees and charges', inr(money2(s.fees.total))],
      ['Total cost', inr(money2(s.totalCost))],
      ['APR', `${s.aprPct.toFixed(2)}%`],
    ];
    if (s.tax && s.postTaxCost) facts.push(['Tax saved', inr(money2(s.tax.totalTaxSaved))], ['Cost after tax', inr(money2(s.postTaxCost))]);
    for (const [k, v] of facts) doc.text(`${k}: ${v}`);

    const cols = [40, 70, 80, 75, 75, 80, 95];
    const header = ['#', 'Date', 'EMI', 'Interest', 'Principal', 'Prepaid', 'Balance'];
    const drawRow = (cells: string[], bold = false) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      let x = doc.page.margins.left;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      cells.forEach((c, i) => { doc.text(c, x, y, { width: cols[i]!, align: i < 2 ? 'left' : 'right' }); x += cols[i]!; });
      doc.x = doc.page.margins.left;
      doc.y = y + 12;
    };

    for (const g of groupScheduleByFy(s.schedule)) {
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).text(`FY ${g.fy}`, doc.page.margins.left);
      drawRow(header, true);
      for (const r of g.rows) {
        drawRow([String(r.month), formatDateOnly(r.date), inr(money2(r.emi)), inr(money2(r.interest)), inr(money2(r.principal)), inr(money2(r.prepayment)), inr(money2(r.closing))]);
      }
    }
    doc.moveDown().fontSize(8).font('Helvetica').fillColor('#5B6572')
      .text('Indicative calculation. Your lender\'s schedule may differ slightly by rounding and dates.', doc.page.margins.left);
    doc.end();
  });
}
```

`packages/api/src/controllers/emi.controller.ts`:
```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  EmiError, summariseLoan, validateLoanWire, validateTaxWire, loanFromWire, taxFromWire,
  type LoanInputWire, type TaxInputWire,
} from '@everypaisa/shared';
import { BadRequestError } from '../lib/errors.js';
import { buildEmiPdf, buildEmiXlsx } from '../services/emi/emiExport.js';

const mode = z.enum(['REDUCE_EMI', 'REDUCE_TENURE']);
// Shape only; value rules live in the shared validator so web and API agree.
const body = z.object({
  title: z.string().trim().max(80).optional(),
  input: z.object({
    principal: z.string().max(30),
    annualRatePct: z.string().max(10),
    tenureMonths: z.number(),
    firstEmiDate: z.string().max(10),
    emiOverride: z.string().max(30).optional(),
    prepayments: z.array(z.object({ month: z.number(), amount: z.string().max(30), recurrence: z.enum(['ONCE', 'YEARLY']), mode })).max(50).optional(),
    rateChanges: z.array(z.object({ fromMonth: z.number(), annualRatePct: z.string().max(10), mode })).max(50).optional(),
    fees: z.object({ processingFeeKind: z.enum(['PCT', 'AMOUNT']), processingFeeValue: z.string().max(30), gstPct: z.string().max(10), otherCharges: z.string().max(30) }).optional(),
  }),
  tax: z.object({
    regime: z.enum(['OLD', 'NEW']),
    loanKind: z.enum(['HOME_SELF', 'HOME_LET_OUT', 'EDUCATION', 'NONE']),
    slabPct: z.string().max(10),
    remaining80C: z.string().max(30),
  }).optional(),
});

const FORMATS = {
  pdf: { type: 'application/pdf', build: buildEmiPdf },
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', build: buildEmiXlsx },
} as const;

export async function exportHandler(req: Request, res: Response): Promise<void> {
  const format = String(req.query['format'] ?? '');
  if (format !== 'pdf' && format !== 'xlsx') throw new BadRequestError('format must be pdf or xlsx', { field: 'format' });
  const parsed = body.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid request body', { field: parsed.error.issues[0]?.path.join('.') });
  const input = parsed.data.input as LoanInputWire;
  const tax = parsed.data.tax as TaxInputWire | undefined;
  const errors = [...validateLoanWire(input), ...(tax ? validateTaxWire(tax) : [])];
  if (errors.length > 0) throw new BadRequestError(errors[0]!.message, { field: errors[0]!.field });

  let summary;
  try {
    summary = summariseLoan(loanFromWire(input), tax ? taxFromWire(tax) : undefined);
  } catch (err) {
    if (err instanceof EmiError) throw new BadRequestError(err.message, { field: err.field });
    throw err;
  }
  const f = FORMATS[format];
  const file = await f.build(summary, { title: parsed.data.title || 'Loan', input });
  res.setHeader('Content-Type', f.type);
  res.setHeader('Content-Disposition', `attachment; filename="emi-schedule.${format}"`);
  res.send(file);
}
```

`packages/api/src/routes/emi.routes.ts`:
```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { emiExportLimiter } from '../middleware/rateLimit.js';
import { exportHandler } from '../controllers/emi.controller.js';

export const emiRouter = Router();
emiRouter.use(authenticate);
emiRouter.post('/export', emiExportLimiter, asyncHandler(exportHandler));
```

Add to `packages/api/src/middleware/rateLimit.ts` (after `receiptUploadLimiter`):
```ts
/** EMI schedule PDF/Excel export: CPU-bound file building, 10 a minute per user. */
export const emiExportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  store: makeStore('emi-export'),
  message: { success: false, error: 'Too many exports - please wait a minute', code: 'RATE_LIMITED' },
});
```

In `packages/api/src/routes/index.ts`: add `import { emiRouter } from './emi.routes.js';` next to the split import and `app.use('/api/emi', emiRouter);` next to `app.use('/api/split', splitRouter);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/emi test/routes/emi.routes.test.ts && npx tsc --noEmit -p .`
Expected: PASS; no new type errors (pre-existing `scripts/backfillRentalLedger.ts` TS2322 is not yours).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/emi packages/api/src/controllers/emi.controller.ts packages/api/src/routes/emi.routes.ts packages/api/src/routes/index.ts packages/api/src/middleware/rateLimit.ts packages/api/test/emi packages/api/test/routes/emi.routes.test.ts
git commit -m "feat(emi): PDF and Excel schedule export endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Web state, computation and share URL

**Files:**
- Create: `apps/web/src/pages/emi/emiState.ts`, `apps/web/src/pages/emi/emiUrl.ts`
- Test: `apps/web/src/pages/emi/emiState.test.ts`, `apps/web/src/pages/emi/emiUrl.test.ts`

**Interfaces:**
- Consumes: shared `validateLoanWire`, `validateTaxWire`, `loanFromWire`, `taxFromWire`, `summariseLoan`, `compareLoanOffers`, `maxLoanFor`, `tenureForEmi`, `cleanNumber`, `EmiError`, `Decimal`, `LoanSummary`, `OfferComparison`, `LoanInputWire`, `TaxInputWire`, `FieldError`, `EmiMode`, `TaxRegime`, `TaxLoanKind`.
- Produces:
  - `type CalcMode = 'EMI' | 'MAX_LOAN' | 'TENURE'`
  - `interface PrepaymentRow { id: string; month: string; amount: string; recurrence: 'ONCE' | 'YEARLY'; mode: EmiMode }`
  - `interface RateChangeRow { id: string; fromMonth: string; ratePct: string; mode: EmiMode }`
  - `interface CalcState { mode: CalcMode; principal: string; ratePct: string; tenure: string; tenureUnit: 'Y' | 'M'; emi: string; firstEmiDate: string; prepayments: PrepaymentRow[]; rateChanges: RateChangeRow[]; feesOn: boolean; feeKind: 'PCT' | 'AMOUNT'; feeValue: string; gstPct: string; otherCharges: string; taxOn: boolean; regime: TaxRegime; loanKind: TaxLoanKind; slabPct: string; remaining80C: string }`
  - `interface OfferState { label: string; principal: string; ratePct: string; tenure: string; tenureUnit: 'Y' | 'M'; feeKind: 'PCT' | 'AMOUNT'; feeValue: string; otherCharges: string }`
  - `interface CompareState { offers: OfferState[] }`
  - `money(d: Decimal): string` — Indian-grouped rupee text for display
  - `defaultCalcState(today?: Date): CalcState`, `defaultCompareState(): CompareState`
  - `type CalcOutcome = { ok: true; principal: Decimal; tenureMonths: number; summary: LoanSummary; wire: LoanInputWire; taxWire?: TaxInputWire } | { ok: false; errors: FieldError[] }`
  - `computeCalc(s: CalcState): CalcOutcome`
  - `type CompareOutcome = { ok: true; result: OfferComparison } | { ok: false; errors: FieldError[] }`
  - `computeCompare(c: CompareState, firstEmiDate: string): CompareOutcome`
  - `type EmiTab = 'calculate' | 'compare'`
  - `encodeEmiUrl(tab: EmiTab, calc: CalcState, compare: CompareState): string` (returns `v=1&tab=...&s=...&c=...` without the leading `?`)
  - `decodeEmiUrl(search: string): { tab: EmiTab; calc?: CalcState; compare?: CompareState; error?: string }`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/pages/emi/emiState.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeCalc, computeCompare, defaultCalcState, defaultCompareState } from './emiState';

const fixedToday = new Date(2026, 9, 12); // 12 Oct 2026, local

describe('defaultCalcState', () => {
  it('first EMI defaults to the 5th of next month (local calendar)', () => {
    expect(defaultCalcState(fixedToday).firstEmiDate).toBe('2026-11-05');
  });
});

describe('computeCalc', () => {
  const s = { ...defaultCalcState(fixedToday), principal: '10,00,000', ratePct: '8.5', tenure: '20', tenureUnit: 'Y' as const };

  it('EMI mode', () => {
    const o = computeCalc(s);
    if (!o.ok) throw new Error(JSON.stringify(o.errors));
    expect(o.summary.emi.toFixed(0)).toBe('8679');
    expect(o.tenureMonths).toBe(240);
  });

  it('MAX_LOAN mode derives the principal from the EMI', () => {
    const o = computeCalc({ ...s, mode: 'MAX_LOAN', emi: '8679' });
    if (!o.ok) throw new Error(JSON.stringify(o.errors));
    expect(o.principal.toFixed(0)).toBe('1000088');
  });

  it('TENURE mode derives months from the EMI', () => {
    const o = computeCalc({ ...s, mode: 'TENURE', emi: '10000' });
    if (!o.ok) throw new Error(JSON.stringify(o.errors));
    expect(o.tenureMonths).toBe(175);
  });

  it('TENURE mode with a too-small EMI reports an emi field error', () => {
    const o = computeCalc({ ...s, mode: 'TENURE', emi: '5000' });
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.errors[0]!.field).toBe('emi');
  });

  it('reports field errors instead of throwing', () => {
    const o = computeCalc({ ...s, principal: '', ratePct: '60' });
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['principal', 'annualRatePct']));
  });

  it('includes prepayments, fees and tax only when switched on', () => {
    const o = computeCalc({
      ...s,
      prepayments: [{ id: 'a', month: '12', amount: '1,00,000', recurrence: 'ONCE', mode: 'REDUCE_TENURE' }],
      feesOn: true, feeKind: 'PCT', feeValue: '0.5', gstPct: '18', otherCharges: '0',
      taxOn: false,
    });
    if (!o.ok) throw new Error(JSON.stringify(o.errors));
    expect(o.summary.months).toBeLessThan(240);
    expect(o.summary.fees.total.toFixed(2)).toBe('5900.00');
    expect(o.summary.tax).toBeUndefined();
  });

  it('a non-numeric prepayment month is a field error, not NaN', () => {
    const o = computeCalc({ ...s, prepayments: [{ id: 'a', month: 'x', amount: '100', recurrence: 'ONCE', mode: 'REDUCE_TENURE' }] });
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.errors[0]!.field).toBe('prepayments.0.month');
  });
});

describe('computeCompare', () => {
  it('compares offers and prefixes errors with the offer index', () => {
    const c = defaultCompareState();
    const good = computeCompare(c, '2026-11-05');
    expect(good.ok).toBe(true);
    const bad = computeCompare({ offers: [{ ...c.offers[0]!, ratePct: 'x' }, c.offers[1]!] }, '2026-11-05');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]!.field).toBe('offers.0.annualRatePct');
  });
});
```

`apps/web/src/pages/emi/emiUrl.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { encodeEmiUrl, decodeEmiUrl } from './emiUrl';
import { defaultCalcState, defaultCompareState } from './emiState';

const calc = { ...defaultCalcState(new Date(2026, 9, 12)), principal: '25,00,000', ratePct: '9', taxOn: true };
const compare = defaultCompareState();

describe('emi share URL', () => {
  it('round-trips state and tab', () => {
    const q = encodeEmiUrl('compare', calc, compare);
    expect(q.startsWith('v=1&')).toBe(true);
    const d = decodeEmiUrl(`?${q}`);
    expect(d.error).toBeUndefined();
    expect(d.tab).toBe('compare');
    expect(d.calc).toEqual(calc);
    expect(d.compare).toEqual(compare);
  });

  it('survives non-ASCII offer labels', () => {
    const c = { offers: [{ ...compare.offers[0]!, label: 'घर ऋण' }, compare.offers[1]!] };
    expect(decodeEmiUrl(`?${encodeEmiUrl('compare', calc, c)}`).compare).toEqual(c);
  });

  it('empty search is not an error', () => {
    expect(decodeEmiUrl('')).toEqual({ tab: 'calculate' });
  });

  it.each([
    '?v=1&s=%%%garbage',
    '?v=99&s=e30',
    `?v=1&s=${btoa(JSON.stringify({ principal: 5 }))}`,
  ])('rejects %s with an error and no state', (search) => {
    const d = decodeEmiUrl(search);
    expect(d.error).toBeDefined();
    expect(d.calc).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/emi`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/web/src/pages/emi/emiState.ts`:
```ts
import {
  Decimal, EmiError, cleanNumber, compareLoanOffers, formatINR, loanFromWire, maxLoanFor, summariseLoan, taxFromWire,
  tenureForEmi, validateLoanWire, validateTaxWire,
  type EmiMode, type FieldError, type LoanInputWire, type LoanSummary, type OfferComparison,
  type TaxInputWire, type TaxLoanKind, type TaxRegime,
} from '@everypaisa/shared';

export type CalcMode = 'EMI' | 'MAX_LOAN' | 'TENURE';
export interface PrepaymentRow { id: string; month: string; amount: string; recurrence: 'ONCE' | 'YEARLY'; mode: EmiMode }
export interface RateChangeRow { id: string; fromMonth: string; ratePct: string; mode: EmiMode }
export interface CalcState {
  mode: CalcMode;
  principal: string;
  ratePct: string;
  tenure: string;
  tenureUnit: 'Y' | 'M';
  emi: string;
  firstEmiDate: string;
  prepayments: PrepaymentRow[];
  rateChanges: RateChangeRow[];
  feesOn: boolean;
  feeKind: 'PCT' | 'AMOUNT';
  feeValue: string;
  gstPct: string;
  otherCharges: string;
  taxOn: boolean;
  regime: TaxRegime;
  loanKind: TaxLoanKind;
  slabPct: string;
  remaining80C: string;
}
/** `formatINR` takes number | string; money stays Decimal until this display boundary. */
export const money = (d: Decimal): string => formatINR(d.toFixed(2));

export interface OfferState { label: string; principal: string; ratePct: string; tenure: string; tenureUnit: 'Y' | 'M'; feeKind: 'PCT' | 'AMOUNT'; feeValue: string; otherCharges: string }
export interface CompareState { offers: OfferState[] }

const pad = (n: number) => String(n).padStart(2, '0');

/** First EMI defaults to the 5th of next month, from the LOCAL calendar (not UTC). */
export function defaultCalcState(today: Date = new Date()): CalcState {
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 5);
  return {
    mode: 'EMI', principal: '25,00,000', ratePct: '8.5', tenure: '20', tenureUnit: 'Y', emi: '25,000',
    firstEmiDate: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-05`,
    prepayments: [], rateChanges: [],
    feesOn: false, feeKind: 'PCT', feeValue: '0.5', gstPct: '18', otherCharges: '0',
    taxOn: false, regime: 'OLD', loanKind: 'HOME_SELF', slabPct: '30', remaining80C: '1,50,000',
  };
}

export function defaultCompareState(): CompareState {
  const offer = (label: string, ratePct: string, feeValue: string): OfferState => ({
    label, principal: '25,00,000', ratePct, tenure: '20', tenureUnit: 'Y', feeKind: 'PCT', feeValue, otherCharges: '0',
  });
  return { offers: [offer('Offer A', '8.5', '0.5'), offer('Offer B', '8.35', '1')] };
}

/** "20" years → 240; returns NaN for junk so the shared validator reports it. */
function months(value: string, unit: 'Y' | 'M'): number {
  const c = cleanNumber(value);
  if (!/^\d+$/.test(c)) return Number.NaN;
  return unit === 'Y' ? Number(c) * 12 : Number(c);
}
const intOrNaN = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);
const positive = (s: string) => /^\d+(\.\d+)?$/.test(cleanNumber(s)) && new Decimal(cleanNumber(s)).gt(0);

export type CalcOutcome =
  | { ok: true; principal: Decimal; tenureMonths: number; summary: LoanSummary; wire: LoanInputWire; taxWire?: TaxInputWire }
  | { ok: false; errors: FieldError[] };

export function computeCalc(s: CalcState): CalcOutcome {
  let principal = s.principal;
  let tenureMonths = months(s.tenure, s.tenureUnit);
  let emiOverride: string | undefined;

  if (s.mode !== 'EMI' && !positive(s.emi)) return { ok: false, errors: [{ field: 'emi', message: 'Enter an EMI above 0' }] };
  if (s.mode === 'MAX_LOAN') {
    const rateOk = /^\d+(\.\d+)?$/.test(cleanNumber(s.ratePct));
    if (rateOk && Number.isInteger(tenureMonths) && tenureMonths >= 1) {
      principal = maxLoanFor(new Decimal(cleanNumber(s.emi)), new Decimal(cleanNumber(s.ratePct)), tenureMonths).toString();
    }
  }
  if (s.mode === 'TENURE') {
    emiOverride = cleanNumber(s.emi);
    if (positive(s.principal) && /^\d+(\.\d+)?$/.test(cleanNumber(s.ratePct))) {
      try {
        tenureMonths = tenureForEmi(new Decimal(cleanNumber(s.principal)), new Decimal(emiOverride), new Decimal(cleanNumber(s.ratePct)));
      } catch (err) {
        if (err instanceof EmiError) return { ok: false, errors: [{ field: 'emi', message: err.message }] };
        throw err;
      }
    }
  }

  const wire: LoanInputWire = {
    principal,
    annualRatePct: s.ratePct,
    tenureMonths,
    firstEmiDate: s.firstEmiDate,
    emiOverride,
    prepayments: s.prepayments.map((p) => ({ month: intOrNaN(p.month), amount: p.amount, recurrence: p.recurrence, mode: p.mode })),
    rateChanges: s.rateChanges.map((c) => ({ fromMonth: intOrNaN(c.fromMonth), annualRatePct: c.ratePct, mode: c.mode })),
    fees: s.feesOn ? { processingFeeKind: s.feeKind, processingFeeValue: s.feeValue, gstPct: s.gstPct, otherCharges: s.otherCharges } : undefined,
  };
  const taxWire: TaxInputWire | undefined = s.taxOn
    ? { regime: s.regime, loanKind: s.loanKind, slabPct: s.slabPct, remaining80C: s.remaining80C }
    : undefined;

  const errors = [...validateLoanWire(wire), ...(taxWire ? validateTaxWire(taxWire) : [])];
  if (errors.length > 0) return { ok: false, errors };
  try {
    const input = loanFromWire(wire);
    const summary = summariseLoan(input, taxWire ? taxFromWire(taxWire) : undefined);
    return { ok: true, principal: input.principal, tenureMonths, summary, wire, taxWire };
  } catch (err) {
    if (err instanceof EmiError) return { ok: false, errors: [{ field: err.field ?? 'principal', message: err.message }] };
    throw err;
  }
}

export type CompareOutcome = { ok: true; result: OfferComparison } | { ok: false; errors: FieldError[] };

export function computeCompare(c: CompareState, firstEmiDate: string): CompareOutcome {
  const errors: FieldError[] = [];
  const wires = c.offers.map((o, i): LoanInputWire => {
    const w: LoanInputWire = {
      principal: o.principal, annualRatePct: o.ratePct, tenureMonths: months(o.tenure, o.tenureUnit), firstEmiDate,
      fees: { processingFeeKind: o.feeKind, processingFeeValue: o.feeValue, gstPct: '18', otherCharges: o.otherCharges },
    };
    for (const e of validateLoanWire(w)) errors.push({ field: `offers.${i}.${e.field}`, message: e.message });
    return w;
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, result: compareLoanOffers(wires.map((w, i) => ({ label: c.offers[i]!.label || `Offer ${i + 1}`, input: loanFromWire(w) }))) };
}
```

`apps/web/src/pages/emi/emiUrl.ts`:
```ts
import { z } from 'zod';
import type { CalcState, CompareState } from './emiState';

export type EmiTab = 'calculate' | 'compare';
const VERSION = '1';

const mode = z.enum(['REDUCE_EMI', 'REDUCE_TENURE']);
const unit = z.enum(['Y', 'M']);
const feeKind = z.enum(['PCT', 'AMOUNT']);
const str = z.string().max(40);

const calcSchema: z.ZodType<CalcState> = z.object({
  mode: z.enum(['EMI', 'MAX_LOAN', 'TENURE']),
  principal: str, ratePct: str, tenure: str, tenureUnit: unit, emi: str, firstEmiDate: str,
  prepayments: z.array(z.object({ id: str, month: str, amount: str, recurrence: z.enum(['ONCE', 'YEARLY']), mode })).max(50),
  rateChanges: z.array(z.object({ id: str, fromMonth: str, ratePct: str, mode })).max(50),
  feesOn: z.boolean(), feeKind, feeValue: str, gstPct: str, otherCharges: str,
  taxOn: z.boolean(), regime: z.enum(['OLD', 'NEW']), loanKind: z.enum(['HOME_SELF', 'HOME_LET_OUT', 'EDUCATION', 'NONE']),
  slabPct: str, remaining80C: str,
});
const compareSchema: z.ZodType<CompareState> = z.object({
  offers: z.array(z.object({ label: z.string().max(40), principal: str, ratePct: str, tenure: str, tenureUnit: unit, feeKind, feeValue: str, otherCharges: str })).min(2).max(3),
});

function toB64(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(s: string): unknown {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

export function encodeEmiUrl(tab: EmiTab, calc: CalcState, compare: CompareState): string {
  const p = new URLSearchParams({ v: VERSION, tab, s: toB64(JSON.stringify(calc)), c: toB64(JSON.stringify(compare)) });
  return p.toString();
}

export function decodeEmiUrl(search: string): { tab: EmiTab; calc?: CalcState; compare?: CompareState; error?: string } {
  const p = new URLSearchParams(search);
  const tab: EmiTab = p.get('tab') === 'compare' ? 'compare' : 'calculate';
  if (!p.has('s') && !p.has('c')) return { tab };
  const error = "This calculator link couldn't be opened - showing the default loan instead";
  if (p.get('v') !== VERSION) return { tab, error };
  try {
    const calc = p.has('s') ? calcSchema.parse(fromB64(p.get('s')!)) : undefined;
    const compare = p.has('c') ? compareSchema.parse(fromB64(p.get('c')!)) : undefined;
    return { tab, calc, compare };
  } catch {
    // A tampered or truncated link is expected input, not a bug: fall back to defaults and tell the user.
    return { tab, error };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/emi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/emi/emiState.ts apps/web/src/pages/emi/emiUrl.ts apps/web/src/pages/emi/*.test.ts
git commit -m "feat(emi-web): calculator state, computation and share URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Calculate tab UI

**Files:**
- Create: `apps/web/src/pages/emi/CalculateTab.tsx`, `apps/web/src/pages/emi/AdvancedInputs.tsx`, `apps/web/src/pages/emi/EmiResults.tsx`, `apps/web/src/pages/emi/ScheduleTable.tsx`, `apps/web/src/pages/emi/useDebounced.ts`
- Test: `apps/web/src/pages/emi/CalculateTab.test.tsx`

**Interfaces:**
- Consumes: `CalcState`, `computeCalc`, `CalcOutcome`, `money` (Task 6); shared `groupScheduleByFy`, `formatINR` (chart tooltips only), `formatDateOnly`, `FieldError`, `LoanSummary`.
- Produces:
  - `CalculateTab(props: { state: CalcState; onChange: (s: CalcState) => void; onOutcome?: (o: CalcOutcome) => void })`
  - `useDebounced<T>(value: T, ms: number): T`
  - `EmiResults(props: { outcome: Extract<CalcOutcome, { ok: true }> })`
  - `ScheduleTable(props: { summary: LoanSummary })`

Before writing, open `apps/web/src/pages/split/AddExpenseDialog.tsx` and `apps/web/src/components/dashboard/NetWorthTrendChart.tsx` to copy the input, label, select and recharts styling conventions (tokens such as `text-muted-foreground`, `Card`, `Input`, `Label`, `Select`, recharts `ResponsiveContainer`). Format money with `money()` from `emiState.ts`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/pages/emi/CalculateTab.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CalculateTab } from './CalculateTab';
import { defaultCalcState, type CalcState } from './emiState';

vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

function Harness({ initial }: { initial?: Partial<CalcState> }) {
  const [s, setS] = useState<CalcState>({ ...defaultCalcState(new Date(2026, 9, 12)), principal: '10,00,000', ratePct: '8.5', tenure: '20', ...initial });
  return <CalculateTab state={s} onChange={setS} />;
}

describe('CalculateTab', () => {
  it('shows the EMI for the default inputs', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('emi-value')).toHaveTextContent('8,679'));
  });

  it('recomputes when the rate changes', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/interest rate/i), { target: { value: '9' } });
    await waitFor(() => expect(screen.getByTestId('emi-value')).toHaveTextContent('8,998'));
  });

  it('shows a field error and keeps the last good result hidden', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/interest rate/i), { target: { value: '70' } });
    await waitFor(() => expect(screen.getByText(/between 0% and 50%/i)).toBeInTheDocument());
    expect(screen.queryByTestId('emi-value')).not.toBeInTheDocument();
  });

  it('max-loan mode shows the loan amount as the result', async () => {
    render(<Harness initial={{ mode: 'MAX_LOAN', emi: '8679' }} />);
    await waitFor(() => expect(screen.getByTestId('max-loan-value')).toHaveTextContent('10,00,088'));
  });

  it('adding a prepayment shows interest saved', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
    fireEvent.click(screen.getByRole('button', { name: /add prepayment/i }));
    const row = screen.getByTestId('prepayment-0');
    fireEvent.change(within(row).getByLabelText(/month/i), { target: { value: '12' } });
    fireEvent.change(within(row).getByLabelText(/amount/i), { target: { value: '1,00,000' } });
    await waitFor(() => expect(screen.getByTestId('interest-saved')).toBeInTheDocument());
  });

  it('schedule groups by FY and expands to months', async () => {
    render(<Harness />);
    const fy = await screen.findByRole('button', { name: /FY 2026-27/ });
    fireEvent.click(fy);
    expect(await screen.findByText('05/11/2026')).toBeInTheDocument();
  });
});
```

(`8,998` = 8997.26 rounded up; computed at 40-digit precision.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/emi/CalculateTab.test.tsx`
Expected: FAIL — `./CalculateTab` not found.

- [ ] **Step 3: Implement**

`apps/web/src/pages/emi/useDebounced.ts`:
```ts
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
```

`apps/web/src/pages/emi/CalculateTab.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { FieldError } from '@everypaisa/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { computeCalc, type CalcMode, type CalcOutcome, type CalcState } from './emiState';
import { useDebounced } from './useDebounced';
import { AdvancedInputs } from './AdvancedInputs';
import { EmiResults } from './EmiResults';
import { ScheduleTable } from './ScheduleTable';

const MODES: { value: CalcMode; label: string }[] = [
  { value: 'EMI', label: 'EMI' },
  { value: 'MAX_LOAN', label: 'Max loan' },
  { value: 'TENURE', label: 'Tenure' },
];

export function errorFor(errors: FieldError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

export function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; inputMode?: 'decimal' | 'numeric'; type?: string; suffix?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="relative">
        <Input
          id={props.id}
          type={props.type ?? 'text'}
          inputMode={props.inputMode}
          value={props.value}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? `${props.id}-err` : undefined}
          onChange={(e) => props.onChange(e.target.value)}
          className={props.suffix ? 'pr-10' : undefined}
        />
        {props.suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{props.suffix}</span>}
      </div>
      {props.error && <p id={`${props.id}-err`} className="text-xs text-destructive">{props.error}</p>}
    </div>
  );
}

export function CalculateTab({ state, onChange, onOutcome }: { state: CalcState; onChange: (s: CalcState) => void; onOutcome?: (o: CalcOutcome) => void }) {
  const [advanced, setAdvanced] = useState(state.prepayments.length > 0 || state.rateChanges.length > 0 || state.feesOn || state.taxOn);
  const debounced = useDebounced(state, 150);
  const outcome = useMemo(() => computeCalc(debounced), [debounced]);
  // Same inputs without prepayments/rate changes, for "interest saved".
  const baseline = useMemo(
    () => (debounced.prepayments.length > 0 ? computeCalc({ ...debounced, prepayments: [], rateChanges: [] }) : null),
    [debounced],
  );
  useEffect(() => { onOutcome?.(outcome); }, [outcome, onOutcome]);
  const errors = outcome.ok ? [] : outcome.errors;
  const set = <K extends keyof CalcState>(k: K, v: CalcState[K]) => onChange({ ...state, [k]: v });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div role="radiogroup" aria-label="Calculate" className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={state.mode === m.value}
                onClick={() => set('mode', m.value)}
                className={`rounded px-2 py-1.5 text-sm ${state.mode === m.value ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {state.mode !== 'MAX_LOAN' && (
            <Field id="emi-principal" label="Loan amount (Rs.)" inputMode="decimal" value={state.principal} onChange={(v) => set('principal', v)} error={errorFor(errors, 'principal')} />
          )}
          {state.mode !== 'EMI' && (
            <Field id="emi-emi" label="EMI you can pay (Rs.)" inputMode="decimal" value={state.emi} onChange={(v) => set('emi', v)} error={errorFor(errors, 'emi')} />
          )}
          <Field id="emi-rate" label="Interest rate (% p.a.)" inputMode="decimal" value={state.ratePct} onChange={(v) => set('ratePct', v)} error={errorFor(errors, 'annualRatePct')} suffix="%" />
          {state.mode !== 'TENURE' && (
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <Field id="emi-tenure" label="Tenure" inputMode="numeric" value={state.tenure} onChange={(v) => set('tenure', v)} error={errorFor(errors, 'tenureMonths')} />
              <div role="radiogroup" aria-label="Tenure unit" className="mb-[2px] flex rounded-md bg-muted p-1">
                {(['Y', 'M'] as const).map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={state.tenureUnit === u} onClick={() => set('tenureUnit', u)}
                    className={`rounded px-3 py-1 text-sm ${state.tenureUnit === u ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>
                    {u === 'Y' ? 'Years' : 'Months'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Field id="emi-first" label="First EMI date" type="date" value={state.firstEmiDate} onChange={(v) => set('firstEmiDate', v)} error={errorFor(errors, 'firstEmiDate')} />

          <Button type="button" variant="ghost" className="w-full justify-between px-2" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
            Advanced - prepayments, rate changes, fees, tax
            {advanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {advanced && <AdvancedInputs state={state} onChange={onChange} errors={errors} />}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        {outcome.ok ? (
          <>
            <EmiResults outcome={outcome} mode={state.mode} baseline={baseline && baseline.ok ? baseline : null} />
            <ScheduleTable summary={outcome.summary} />
          </>
        ) : (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Fix the highlighted fields to see your EMI.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
```

`apps/web/src/pages/emi/AdvancedInputs.tsx`:
```tsx
import { Plus, Trash2 } from 'lucide-react';
import type { FieldError } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Field, errorFor } from './CalculateTab';
import type { CalcState, PrepaymentRow, RateChangeRow } from './emiState';

const MODE_LABEL = { REDUCE_TENURE: 'Cut tenure', REDUCE_EMI: 'Cut EMI' } as const;
const newId = () => Math.random().toString(36).slice(2, 10);

function Select<T extends string>(props: { id: string; label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id}>{props.label}</Label>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Switch({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

export function AdvancedInputs({ state, onChange, errors }: { state: CalcState; onChange: (s: CalcState) => void; errors: FieldError[] }) {
  const set = <K extends keyof CalcState>(k: K, v: CalcState[K]) => onChange({ ...state, [k]: v });
  const setPre = (i: number, patch: Partial<PrepaymentRow>) => set('prepayments', state.prepayments.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setRc = (i: number, patch: Partial<RateChangeRow>) => set('rateChanges', state.rateChanges.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const modeOptions = (['REDUCE_TENURE', 'REDUCE_EMI'] as const).map((v) => ({ value: v, label: MODE_LABEL[v] }));

  return (
    <div className="space-y-6 border-t pt-4">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Prepayments</h3>
        {state.prepayments.map((p, i) => (
          <div key={p.id} data-testid={`prepayment-${i}`} className="grid grid-cols-2 gap-2 rounded-md border p-2">
            <Field id={`pre-${p.id}-m`} label="Month #" inputMode="numeric" value={p.month} onChange={(v) => setPre(i, { month: v })} error={errorFor(errors, `prepayments.${i}.month`)} />
            <Field id={`pre-${p.id}-a`} label="Amount (Rs.)" inputMode="decimal" value={p.amount} onChange={(v) => setPre(i, { amount: v })} error={errorFor(errors, `prepayments.${i}.amount`)} />
            <Select id={`pre-${p.id}-r`} label="Repeat" value={p.recurrence} onChange={(v) => setPre(i, { recurrence: v })} options={[{ value: 'ONCE', label: 'Once' }, { value: 'YEARLY', label: 'Every year' }]} />
            <Select id={`pre-${p.id}-mode`} label="Effect" value={p.mode} onChange={(v) => setPre(i, { mode: v })} options={modeOptions} />
            <Button type="button" variant="ghost" size="sm" className="col-span-2 justify-self-end" onClick={() => set('prepayments', state.prepayments.filter((_, j) => j !== i))}>
              <Trash2 className="mr-1 h-4 w-4" /> Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set('prepayments', [...state.prepayments, { id: newId(), month: '12', amount: '', recurrence: 'ONCE', mode: 'REDUCE_TENURE' }])}>
          <Plus className="mr-1 h-4 w-4" /> Add prepayment
        </Button>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Rate changes (floating loans)</h3>
        {state.rateChanges.map((c, i) => (
          <div key={c.id} data-testid={`ratechange-${i}`} className="grid grid-cols-2 gap-2 rounded-md border p-2">
            <Field id={`rc-${c.id}-m`} label="From month #" inputMode="numeric" value={c.fromMonth} onChange={(v) => setRc(i, { fromMonth: v })} error={errorFor(errors, `rateChanges.${i}.fromMonth`)} />
            <Field id={`rc-${c.id}-r`} label="New rate (%)" inputMode="decimal" value={c.ratePct} onChange={(v) => setRc(i, { ratePct: v })} error={errorFor(errors, `rateChanges.${i}.annualRatePct`)} />
            <Select id={`rc-${c.id}-mode`} label="Bank adjusts" value={c.mode} onChange={(v) => setRc(i, { mode: v })} options={[{ value: 'REDUCE_TENURE', label: 'Tenure (keep EMI)' }, { value: 'REDUCE_EMI', label: 'EMI (keep tenure)' }]} />
            <Button type="button" variant="ghost" size="sm" className="self-end justify-self-end" onClick={() => set('rateChanges', state.rateChanges.filter((_, j) => j !== i))}>
              <Trash2 className="mr-1 h-4 w-4" /> Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set('rateChanges', [...state.rateChanges, { id: newId(), fromMonth: '13', ratePct: state.ratePct, mode: 'REDUCE_TENURE' }])}>
          <Plus className="mr-1 h-4 w-4" /> Add rate change
        </Button>
      </section>

      <section className="space-y-3">
        <Switch id="fees-on" label="Processing fee and charges" checked={state.feesOn} onChange={(v) => set('feesOn', v)} />
        {state.feesOn && (
          <div className="grid grid-cols-2 gap-2">
            <Select id="fee-kind" label="Fee type" value={state.feeKind} onChange={(v) => set('feeKind', v)} options={[{ value: 'PCT', label: '% of loan' }, { value: 'AMOUNT', label: 'Fixed Rs.' }]} />
            <Field id="fee-value" label={state.feeKind === 'PCT' ? 'Fee (%)' : 'Fee (Rs.)'} inputMode="decimal" value={state.feeValue} onChange={(v) => set('feeValue', v)} error={errorFor(errors, 'fees.processingFeeValue')} />
            <Field id="fee-gst" label="GST on fee (%)" inputMode="decimal" value={state.gstPct} onChange={(v) => set('gstPct', v)} error={errorFor(errors, 'fees.gstPct')} />
            <Field id="fee-other" label="Other charges (Rs.)" inputMode="decimal" value={state.otherCharges} onChange={(v) => set('otherCharges', v)} error={errorFor(errors, 'fees.otherCharges')} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <Switch id="tax-on" label="Tax benefit" checked={state.taxOn} onChange={(v) => set('taxOn', v)} />
        {state.taxOn && (
          <div className="grid grid-cols-2 gap-2">
            <Select id="tax-regime" label="Tax regime" value={state.regime} onChange={(v) => set('regime', v)} options={[{ value: 'OLD', label: 'Old regime' }, { value: 'NEW', label: 'New regime' }]} />
            <Select id="tax-kind" label="Loan for" value={state.loanKind} onChange={(v) => set('loanKind', v)} options={[
              { value: 'HOME_SELF', label: 'Home - self-occupied' }, { value: 'HOME_LET_OUT', label: 'Home - let out' },
              { value: 'EDUCATION', label: 'Education' }, { value: 'NONE', label: 'Other (no benefit)' },
            ]} />
            <Field id="tax-slab" label="Your tax slab (%)" inputMode="decimal" value={state.slabPct} onChange={(v) => set('slabPct', v)} error={errorFor(errors, 'tax.slabPct')} />
            <Field id="tax-80c" label="80C room left (Rs.)" inputMode="decimal" value={state.remaining80C} onChange={(v) => set('remaining80C', v)} error={errorFor(errors, 'tax.remaining80C')} />
          </div>
        )}
      </section>
    </div>
  );
}
```

`apps/web/src/pages/emi/EmiResults.tsx`:
```tsx
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateOnly, formatINR, type EmiWarning } from '@everypaisa/shared';
import { money } from './emiState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CalcMode, CalcOutcome } from './emiState';

type Ok = Extract<CalcOutcome, { ok: true }>;

const WARNING_TEXT: Record<EmiWarning, string> = {
  PREPAYMENT_CAPPED: 'A prepayment was larger than the balance - it was capped and closes the loan.',
  NEGATIVE_AMORTISATION_AVOIDED: 'After a rate rise the old EMI would not cover the interest, so the EMI was raised.',
  PREPAYMENT_AFTER_CLOSE: 'Some prepayments fall after the loan is already repaid and were ignored.',
  RATE_CHANGE_AFTER_CLOSE: 'Some rate changes fall after the loan is already repaid and were ignored.',
};

function Tile({ label, value, testId, strong }: { label: string; value: string; testId?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div data-testid={testId} className={strong ? 'text-2xl font-semibold tabular-nums' : 'text-base font-medium tabular-nums'}>{value}</div>
    </div>
  );
}

export function EmiResults({ outcome, mode, baseline }: { outcome: Ok; mode: CalcMode; baseline: Ok | null }) {
  const s = outcome.summary;
  const years = Math.floor(s.months / 12);
  const rest = s.months % 12;
  const tenureText = `${years ? `${years} yr ` : ''}${rest ? `${rest} mo` : ''}`.trim();
  const saved = baseline ? baseline.summary.totalInterest.minus(s.totalInterest) : null;
  const pie = [
    { name: 'Principal', value: outcome.principal.toNumber() },
    { name: 'Interest', value: s.totalInterest.toNumber() },
  ];
  // Chart coordinates only; every displayed figure comes from Decimal.
  const balance = s.schedule.filter((_, i) => i % 3 === 0 || i === s.schedule.length - 1)
    .map((r) => ({ date: formatDateOnly(r.date), balance: r.closing.toNumber() }));

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Result</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {mode === 'MAX_LOAN' && <Tile label="You can borrow" value={money(outcome.principal)} testId="max-loan-value" strong />}
          {mode === 'TENURE' && <Tile label="Loan paid off in" value={tenureText} testId="tenure-value" strong />}
          <Tile label="Monthly EMI" value={money(s.emi)} testId="emi-value" strong={mode === 'EMI'} />
          <Tile label="Total interest" value={money(s.totalInterest)} />
          <Tile label="Total paid" value={money(s.totalPaid)} />
          {mode !== 'TENURE' && <Tile label="Tenure" value={tenureText} />}
          {s.fees.total.gt(0) && <Tile label="Fees + GST" value={money(s.fees.total)} />}
          <Tile label="APR (true yearly cost)" value={`${s.aprPct.toFixed(2)}%`} />
          {saved && saved.gt(0) && <Tile label="Interest saved by prepaying" value={money(saved)} testId="interest-saved" />}
          {s.tax && <Tile label="Tax saved" value={money(s.tax.totalTaxSaved)} />}
          {s.postTaxCost && <Tile label="Cost after tax" value={money(s.postTaxCost)} />}
        </div>
        {s.tax?.note && <p className="text-xs text-muted-foreground">{s.tax.note}</p>}
        {s.warnings.map((w) => <p key={w} className="text-xs text-amber-600 dark:text-amber-400">{WARNING_TEXT[w]}</p>)}

        <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" stroke="none">
                  <Cell fill="hsl(var(--primary))" />
                  <Cell fill="hsl(var(--muted-foreground) / 0.45)" />
                </Pie>
                <Tooltip formatter={(v: number) => formatINR(String(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="h-48 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balance} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => `${Math.round(v / 100000)}L`} />
                <Tooltip formatter={(v: number) => formatINR(String(v))} />
                <Area dataKey="balance" name="Balance" type="monotone" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

`money()` (Task 6) is the only path from Decimal to rupee text; recharts tooltips receive plain chart numbers and use `formatINR(String(v))`. Tests expect Indian grouping (`8,679`, `10,00,088`).

`apps/web/src/pages/emi/ScheduleTable.tsx`:
```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatDateOnly, groupScheduleByFy, type LoanSummary } from '@everypaisa/shared';
import { money } from './emiState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ScheduleTable({ summary }: { summary: LoanSummary }) {
  const groups = groupScheduleByFy(summary.schedule);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (fy: string) => setOpen((o) => { const n = new Set(o); if (n.has(fy)) n.delete(fy); else n.add(fy); return n; });
  const hasPrepay = summary.totalPrepaid.gt(0);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Repayment schedule</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm tabular-nums">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-right font-medium">EMI paid</th>
              <th className="px-3 py-2 text-right font-medium">Interest</th>
              <th className="px-3 py-2 text-right font-medium">Principal</th>
              {hasPrepay && <th className="px-3 py-2 text-right font-medium">Prepaid</th>}
              <th className="px-3 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FyRows key={g.fy} group={g} open={open.has(g.fy)} onToggle={() => toggle(g.fy)} hasPrepay={hasPrepay} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function FyRows({ group: g, open, onToggle, hasPrepay }: { group: ReturnType<typeof groupScheduleByFy>[number]; open: boolean; onToggle: () => void; hasPrepay: boolean }) {
  return (
    <>
      <tr className="border-b bg-muted/40">
        <td className="px-3 py-2">
          <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-center gap-1 font-medium">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            FY {g.fy}
          </button>
        </td>
        <td className="px-3 py-2 text-right">{money(g.emi)}</td>
        <td className="px-3 py-2 text-right">{money(g.interest)}</td>
        <td className="px-3 py-2 text-right">{money(g.principal)}</td>
        {hasPrepay && <td className="px-3 py-2 text-right">{money(g.prepayment)}</td>}
        <td className="px-3 py-2 text-right">{money(g.closing)}</td>
      </tr>
      {open && g.rows.map((r) => (
        <tr key={r.month} className="border-b text-xs">
          <td className="px-3 py-1.5 pl-9">{formatDateOnly(r.date)}</td>
          <td className="px-3 py-1.5 text-right">{money(r.emi)}</td>
          <td className="px-3 py-1.5 text-right">{money(r.interest)}</td>
          <td className="px-3 py-1.5 text-right">{money(r.principal)}</td>
          {hasPrepay && <td className="px-3 py-1.5 text-right">{money(r.prepayment)}</td>}
          <td className="px-3 py-1.5 text-right">{money(r.closing)}</td>
        </tr>
      ))}
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/emi && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/emi
git commit -m "feat(emi-web): calculate tab with results, charts and FY schedule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Compare tab

**Files:**
- Create: `apps/web/src/pages/emi/CompareTab.tsx`
- Test: `apps/web/src/pages/emi/CompareTab.test.tsx`

**Interfaces:**
- Consumes: `CompareState`, `OfferState`, `computeCompare`, `money` (Task 6); `Field`, `errorFor` (Task 7).
- Produces: `CompareTab(props: { state: CompareState; firstEmiDate: string; onChange: (s: CompareState) => void })`

- [ ] **Step 1: Write the failing test**

`apps/web/src/pages/emi/CompareTab.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CompareTab } from './CompareTab';
import { defaultCompareState, type CompareState } from './emiState';

function Harness() {
  const [s, setS] = useState<CompareState>(defaultCompareState());
  return <CompareTab state={s} firstEmiDate="2026-11-05" onChange={setS} />;
}

describe('CompareTab', () => {
  it('shows a result column per offer and marks the cheapest', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getAllByTestId(/^offer-result-/)).toHaveLength(2));
    expect(screen.getAllByText(/cheapest/i).length).toBeGreaterThan(0);
  });

  it('adds a third offer and no more', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /add offer/i }));
    await waitFor(() => expect(screen.getAllByTestId(/^offer-result-/)).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /add offer/i })).not.toBeInTheDocument();
  });

  it('removing keeps at least two offers', async () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /remove offer/i })).not.toBeInTheDocument();
  });

  it('shows the field error inside the offer that has it', async () => {
    render(<Harness />);
    const first = screen.getByTestId('offer-input-0');
    fireEvent.change(within(first).getByLabelText(/interest rate/i), { target: { value: 'abc' } });
    await waitFor(() => expect(within(first).getByText(/between 0% and 50%/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/emi/CompareTab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/web/src/pages/emi/CompareTab.tsx`:
```tsx
import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, errorFor } from './CalculateTab';
import { useDebounced } from './useDebounced';
import { computeCompare, money, type CompareState, type OfferState } from './emiState';

export function CompareTab({ state, firstEmiDate, onChange }: { state: CompareState; firstEmiDate: string; onChange: (s: CompareState) => void }) {
  const debounced = useDebounced(state, 150);
  const outcome = useMemo(() => computeCompare(debounced, firstEmiDate), [debounced, firstEmiDate]);
  const errors = outcome.ok ? [] : outcome.errors;
  const setOffer = (i: number, patch: Partial<OfferState>) => onChange({ offers: state.offers.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {state.offers.map((o, i) => (
          <Card key={i} data-testid={`offer-input-${i}`}>
            <CardContent className="space-y-3 pt-6">
              <Field id={`offer-${i}-label`} label="Name" value={o.label} onChange={(v) => setOffer(i, { label: v })} />
              <Field id={`offer-${i}-p`} label="Loan amount (Rs.)" inputMode="decimal" value={o.principal} onChange={(v) => setOffer(i, { principal: v })} error={errorFor(errors, `offers.${i}.principal`)} />
              <Field id={`offer-${i}-r`} label="Interest rate (% p.a.)" inputMode="decimal" value={o.ratePct} onChange={(v) => setOffer(i, { ratePct: v })} error={errorFor(errors, `offers.${i}.annualRatePct`)} />
              <Field id={`offer-${i}-t`} label={`Tenure (${o.tenureUnit === 'Y' ? 'years' : 'months'})`} inputMode="numeric" value={o.tenure} onChange={(v) => setOffer(i, { tenure: v })} error={errorFor(errors, `offers.${i}.tenureMonths`)} />
              <Field id={`offer-${i}-f`} label={o.feeKind === 'PCT' ? 'Processing fee (%)' : 'Processing fee (Rs.)'} inputMode="decimal" value={o.feeValue} onChange={(v) => setOffer(i, { feeValue: v })} error={errorFor(errors, `offers.${i}.fees.processingFeeValue`)} />
              <Field id={`offer-${i}-o`} label="Other charges (Rs.)" inputMode="decimal" value={o.otherCharges} onChange={(v) => setOffer(i, { otherCharges: v })} error={errorFor(errors, `offers.${i}.fees.otherCharges`)} />
              {state.offers.length > 2 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ offers: state.offers.filter((_, j) => j !== i) })}>
                  <Trash2 className="mr-1 h-4 w-4" /> Remove offer
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {state.offers.length < 3 && (
          <Button type="button" variant="outline" className="h-auto min-h-24 border-dashed" onClick={() => onChange({ offers: [...state.offers, { ...state.offers.at(-1)!, label: `Offer ${String.fromCharCode(65 + state.offers.length)}` }] })}>
            <Plus className="mr-1 h-4 w-4" /> Add offer
          </Button>
        )}
      </div>

      {outcome.ok && (
        <div className="grid gap-4 md:grid-cols-3">
          {outcome.result.offers.map((o, i) => (
            <Card key={i} data-testid={`offer-result-${i}`} className={i === outcome.result.cheapestTotal ? 'border-primary' : undefined}>
              <CardContent className="space-y-1 pt-6 text-sm tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{o.label}</span>
                  {i === outcome.result.cheapestTotal && <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">Cheapest overall</span>}
                </div>
                <Row k="EMI" v={money(o.emi)} />
                <Row k="Total interest" v={money(o.totalInterest)} />
                <Row k="Fees + GST" v={money(o.fees.total)} />
                <Row k="Total cost" v={money(o.totalCost)} />
                <Row k="APR" v={`${o.aprPct.toFixed(2)}%`} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/emi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/emi/CompareTab.tsx apps/web/src/pages/emi/CompareTab.test.tsx
git commit -m "feat(emi-web): compare 2-3 loan offers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Page, route, nav, share and export; browser check

**Files:**
- Create: `apps/web/src/pages/emi/EmiCalculatorPage.tsx`, `apps/web/src/api/emi.api.ts`
- Modify: `apps/web/src/App.tsx` (route `/emi`), `apps/web/src/components/layout/navItems.tsx` (Tools entry)
- Test: `apps/web/src/pages/emi/EmiCalculatorPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 6–8; `copyText(text): Promise<boolean>` from `apps/web/src/pages/split/clipboard.ts`; `apiErrorMessage(err, fallback)` from `apps/web/src/api/client.ts`; `api` axios instance (as used in `apps/web/src/api/accounting.api.ts`); `PageHeader`; `toast` from `react-hot-toast`.
- Produces: `EmiCalculatorPage`; `emiApi.export(format: 'pdf' | 'xlsx', body: { input: LoanInputWire; tax?: TaxInputWire; title?: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

`apps/web/src/pages/emi/EmiCalculatorPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderWithProviders } from '@/pages/split/testUtils';
import { EmiCalculatorPage } from './EmiCalculatorPage';
import { encodeEmiUrl } from './emiUrl';
import { defaultCalcState, defaultCompareState } from './emiState';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/emi.api', () => ({ emiApi: { export: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

beforeEach(() => vi.clearAllMocks());

describe('EmiCalculatorPage', () => {
  it('restores state from a share URL', async () => {
    const calc = { ...defaultCalcState(new Date(2026, 9, 12)), principal: '10,00,000', ratePct: '8.5', tenure: '20' };
    renderWithProviders(<EmiCalculatorPage />, { route: `/emi?${encodeEmiUrl('calculate', calc, defaultCompareState())}`, path: '/emi' });
    await waitFor(() => expect(screen.getByTestId('emi-value')).toHaveTextContent('8,679'));
  });

  it('a broken share URL shows a toast and the default loan', async () => {
    renderWithProviders(<EmiCalculatorPage />, { route: '/emi?v=1&s=%%%bad', path: '/emi' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/couldn't be opened/i)));
    expect(await screen.findByTestId('emi-value')).toBeInTheDocument();
  });

  it('switches to the compare tab', async () => {
    renderWithProviders(<EmiCalculatorPage />, { route: '/emi', path: '/emi' });
    fireEvent.click(screen.getByRole('tab', { name: /compare/i }));
    expect(await screen.findByTestId('offer-input-0')).toBeInTheDocument();
  });

  it('export calls the API with the validated wire input', async () => {
    const { emiApi } = await import('@/api/emi.api');
    renderWithProviders(<EmiCalculatorPage />, { route: '/emi', path: '/emi' });
    await screen.findByTestId('emi-value');
    fireEvent.click(screen.getByRole('button', { name: /excel/i }));
    await waitFor(() => expect(emiApi.export).toHaveBeenCalledWith('xlsx', expect.objectContaining({ input: expect.objectContaining({ tenureMonths: 240 }) })));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/emi/EmiCalculatorPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/web/src/api/emi.api.ts`:
```ts
import type { LoanInputWire, TaxInputWire } from '@everypaisa/shared';
import { api } from './client';

export const emiApi = {
  async export(format: 'pdf' | 'xlsx', body: { input: LoanInputWire; tax?: TaxInputWire; title?: string }): Promise<void> {
    const res = await api.post(`/api/emi/export`, body, { params: { format }, responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emi-schedule.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
```
(`api` is exported from `apps/web/src/api/client.ts`, as `accounting.api.ts` uses it.)

`apps/web/src/pages/emi/EmiCalculatorPage.tsx`:
```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, FileSpreadsheet, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { emiApi } from '@/api/emi.api';
import { copyText } from '@/pages/split/clipboard';
import { apiErrorMessage } from '@/api/client';
import { CalculateTab } from './CalculateTab';
import { CompareTab } from './CompareTab';
import { defaultCalcState, defaultCompareState, type CalcOutcome, type CalcState, type CompareState } from './emiState';
import { decodeEmiUrl, encodeEmiUrl, type EmiTab } from './emiUrl';

export function EmiCalculatorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initial = useRef(decodeEmiUrl(location.search));
  const [tab, setTab] = useState<EmiTab>(initial.current.tab);
  const [calc, setCalc] = useState<CalcState>(initial.current.calc ?? defaultCalcState());
  const [compare, setCompare] = useState<CompareState>(initial.current.compare ?? defaultCompareState());
  const [outcome, setOutcome] = useState<CalcOutcome | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  useEffect(() => {
    if (initial.current.error) toast.error(initial.current.error);
  }, []);

  // Keep the address bar shareable without adding history entries per keystroke.
  useEffect(() => {
    const t = setTimeout(() => navigate({ search: `?${encodeEmiUrl(tab, calc, compare)}` }, { replace: true }), 400);
    return () => clearTimeout(t);
  }, [tab, calc, compare, navigate]);

  const onOutcome = useCallback((o: CalcOutcome) => setOutcome(o), []);

  async function share() {
    const url = `${window.location.origin}/emi?${encodeEmiUrl(tab, calc, compare)}`;
    const ok = await copyText(url);
    if (ok) toast.success('Link copied');
    else toast.error("Couldn't copy - copy the address bar instead");
  }

  async function doExport(format: 'pdf' | 'xlsx') {
    if (!outcome?.ok) return;
    setExporting(format);
    try {
      await emiApi.export(format, { input: outcome.wire, tax: outcome.taxWire, title: 'Loan' });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't create the file"));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="EMI Calculator"
        description="Plan a loan: EMI, prepayments, rate changes, fees, tax benefit and offers side by side."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={share}><Link2 className="mr-1 h-4 w-4" />Share</Button>
            <Button type="button" variant="outline" size="sm" disabled={!outcome?.ok || exporting !== null || tab !== 'calculate'} onClick={() => doExport('pdf')}>
              <Download className="mr-1 h-4 w-4" />PDF
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!outcome?.ok || exporting !== null || tab !== 'calculate'} onClick={() => doExport('xlsx')}>
              <FileSpreadsheet className="mr-1 h-4 w-4" />Excel
            </Button>
          </div>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as EmiTab)}>
        <TabsList>
          <TabsTrigger value="calculate">Calculate</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>
        <TabsContent value="calculate" className="mt-4">
          <CalculateTab state={calc} onChange={setCalc} onOutcome={onOutcome} />
        </TabsContent>
        <TabsContent value="compare" className="mt-4">
          <CompareTab state={compare} firstEmiDate={calc.firstEmiDate} onChange={setCompare} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

Before writing, confirm `PageHeader` prop names (`title`, `description`, `actions`) in `apps/web/src/components/layout/PageHeader.tsx` and adapt if they differ.

`apps/web/src/App.tsx`: add `import { EmiCalculatorPage } from './pages/emi/EmiCalculatorPage';` beside the split imports and `<Route path="/emi" element={<EmiCalculatorPage />} />` beside the `/split` routes.

`apps/web/src/components/layout/navItems.tsx`: add `Percent` to the lucide import list and, in the Tools section after `Split Expenses`:
```ts
      { label: 'EMI Calculator', to: '/emi', icon: Percent },
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run:
```bash
cd portfolioos/apps/web && npx vitest run && npx tsc --noEmit && npx eslint src/pages/emi src/api/emi.api.ts src/App.tsx src/components/layout/navItems.tsx
```
Expected: whole web suite PASS; no type errors; no new lint errors.

- [ ] **Step 5: Browser check at 1280 px and 375 px**

Start the API and web dev servers against the isolated local DB (env in Execution notes), log in as a local test user, open `/emi`, and screenshot every section at 1280 and 375 px wide: inputs, results tiles, both charts, schedule collapsed and one FY expanded, Advanced with one prepayment, one rate change, fees on, tax on; Compare with 3 offers. Check: no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`), the schedule table scrolls inside its card, dates show dd/mm/yyyy, Share copies a URL that reopens the same state in a new tab, PDF and Excel download and open (Excel date column shows dd/mm/yyyy). Stop only the dev-server PIDs you started. Save screenshots under `.superpowers/sdd/2026-10-12-emi-calculator-01/screens/`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/emi apps/web/src/api/emi.api.ts apps/web/src/App.tsx apps/web/src/components/layout/navItems.tsx
git commit -m "feat(emi-web): EMI Calculator page with share link and export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Execution notes

- Worktree: `C:\Users\ST269\Desktop\mProfit-emi-wt` (branch `feat/emi-calculator`, no upstream). Project root `portfolioos/`.
- Fresh worktree setup first: `pnpm install`, `pnpm --filter @everypaisa/shared build`, and `pnpm --filter <api package> prisma:generate` before trusting any type or test error.
- API tests need a local database. Use the existing isolated DB:
  `DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false`. Plan 1 adds no migration. Never use `packages/api/.env`; never run `prisma migrate` in this plan.
- Docker containers `everypaisa-postgres` and `portfolioos-redis` must be running for API tests (Redis absence only degrades rate limiting).
- Pre-existing failures not caused by this plan: `scripts/backfillRentalLedger.ts` TS2322; 5 lint errors in `mf*` files.
- After every task: `iconv -f UTF-8 -t UTF-8` on each changed file.
