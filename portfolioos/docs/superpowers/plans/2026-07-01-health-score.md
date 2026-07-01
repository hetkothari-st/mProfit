# Financial Health Score — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `GET /api/intelligence/health-score` and a dashboard `HealthScore` component computing a 0-100 financial health score across 6 weighted sub-scores (emergency fund, investment rate, debt burden, diversification, insurance, goal progress), per `docs/superpowers/specs/2026-07-01-intelligence-layer-design.md` Module 1.

**Architecture:** Pure scoring math lives in `healthScoreMath.ts` (unit-tested, no DB — mirrors the existing `goalMath.ts` split from `goals.service.ts`). `healthScore.service.ts` fetches the six raw inputs (reusing `getDashboardNetWorth` for allocation/liabilities/insurance totals where its shape already fits, direct Prisma queries for anything it doesn't expose) and calls the pure functions. Result is upserted into a new `HealthScoreSnapshot` row (one per user) so repeat dashboard loads within 24h don't recompute. Route → controller → service, following the existing `goals.routes.ts` / `goals.controller.ts` / `goals.service.ts` three-file split exactly.

**Tech Stack:** Express + Prisma + Zod (API), React + Recharts-adjacent hand-rolled SVG (no new chart lib for the gauge), Vitest, `decimal.js`.

## Global Constraints

- Money: `Decimal` throughout, never JS `Number` for anything monetary — `serializeMoney()` at the API boundary (from `@portfolioos/shared`), matching every existing calculator in this repo.
- No new Redis/cache infra — cache via the `HealthScoreSnapshot.computedAt` column + a staleness check in the service (repo's established DB-cache pattern; see `INTELLIGENCE_LAYER_AUDIT.md` finding #4).
- Follow the existing routes → controllers → services split; no business logic in route files.
- All new backend files get co-located `*.test.ts` (Vitest) for pure-function logic — DB-orchestration code (the `service.ts` file itself) is not directly unit tested in this repo's convention (see `goals.service.ts` — untested directly; only `goalMath.ts` has tests). Follow that same split.

---

### Task 1: Schema — `HealthScoreSnapshot` model + migration

**Files:**
- Modify: `packages/api/prisma/schema.prisma` (add model near `Goal`, e.g. after line 2779)

**Interfaces:**
- Produces: `prisma.healthScoreSnapshot` client accessor used by Task 4.

- [ ] **Step 1: Add the model**

```prisma
model HealthScoreSnapshot {
  id         String   @id @default(cuid())
  userId     String   @unique
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  overallScore Int
  grade      String
  subScores  Json
  computedAt DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([userId])
}
```

Also add `healthScoreSnapshot HealthScoreSnapshot?` to the `User` model's relation block (next to `insurancePolicies InsurancePolicy[]` at schema.prisma:56).

- [ ] **Step 2: Generate and apply the migration**

Run: `cd packages/api && npx prisma migrate dev --name add_health_score_snapshot`
Expected: migration file created under `prisma/migrations/`, applies cleanly, `npx prisma generate` runs automatically as part of `migrate dev`.

- [ ] **Step 3: Commit**

```bash
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations
git commit -m "feat(db): add HealthScoreSnapshot model"
```

---

### Task 2: Pure scoring math — `healthScoreMath.ts`

**Files:**
- Create: `packages/api/src/services/healthScoreMath.ts`
- Test: `packages/api/src/services/healthScoreMath.test.ts`

**Interfaces:**
- Consumes: `Decimal` from `decimal.js` (already a dependency).
- Produces (consumed by Task 3's `healthScore.service.ts`):
  - `emergencyFundScore(liquidAssets: Decimal, monthlyExpenses: Decimal): { score: number; monthsCovered: number }`
  - `investmentRateScore(monthlyInvestment: Decimal, monthlyIncome: Decimal): { score: number; ratePct: number }`
  - `debtBurdenScore(monthlyDebtPayments: Decimal, monthlyIncome: Decimal): { score: number; burdenPct: number }`
  - `diversificationScore(input: { classPercents: Array<{ assetClass: string; percent: number }>; largestSingleHoldingPct: number; equityPct: number; age: number | null }): { score: number }`
  - `insuranceScore(totalLifeSumAssured: Decimal, annualIncome: Decimal, hasLifePolicies: boolean): { score: number }`
  - `goalProgressScore(progressPcts: number[]): { score: number }`
  - `weightedOverall(subScores: { emergencyFund: number; investmentRate: number; debtBurden: number; diversification: number; insurance: number; goalProgress: number }): { overall: number; grade: string }`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  emergencyFundScore, investmentRateScore, debtBurdenScore,
  diversificationScore, insuranceScore, goalProgressScore, weightedOverall,
} from './healthScoreMath.js';

const D = (n: number | string) => new Decimal(n);

describe('emergencyFundScore', () => {
  it('is 100 when liquid assets cover 6+ months of expenses', () => {
    expect(emergencyFundScore(D(600000), D(100000)).score).toBe(100);
    expect(emergencyFundScore(D(600000), D(100000)).monthsCovered).toBeCloseTo(6, 6);
  });
  it('is 0 when there are no liquid assets', () => {
    expect(emergencyFundScore(D(0), D(100000)).score).toBe(0);
  });
  it('scales linearly between 0 and 6 months', () => {
    expect(emergencyFundScore(D(300000), D(100000)).score).toBeCloseTo(50, 6);
  });
  it('is 100 (not undefined/NaN) when monthly expenses are 0', () => {
    expect(emergencyFundScore(D(100000), D(0)).score).toBe(100);
  });
});

describe('investmentRateScore', () => {
  it('is 100 at or above 20% of income', () => {
    expect(investmentRateScore(D(20000), D(100000)).score).toBe(100);
    expect(investmentRateScore(D(30000), D(100000)).score).toBe(100);
  });
  it('scales linearly below 20%', () => {
    expect(investmentRateScore(D(10000), D(100000)).score).toBeCloseTo(50, 6);
  });
  it('is 0 when income is 0 (cannot compute a rate)', () => {
    expect(investmentRateScore(D(5000), D(0)).score).toBe(0);
  });
});

describe('debtBurdenScore', () => {
  it('is 100 at or below 20% of income', () => {
    expect(debtBurdenScore(D(20000), D(100000)).score).toBe(100);
    expect(debtBurdenScore(D(10000), D(100000)).score).toBe(100);
  });
  it('is 0 at or above 60% of income', () => {
    expect(debtBurdenScore(D(60000), D(100000)).score).toBe(0);
    expect(debtBurdenScore(D(80000), D(100000)).score).toBe(0);
  });
  it('scales linearly between 20% and 60%', () => {
    expect(debtBurdenScore(D(40000), D(100000)).score).toBeCloseTo(50, 6);
  });
  it('is 100 when income is 0 and there is no debt', () => {
    expect(debtBurdenScore(D(0), D(0)).score).toBe(100);
  });
});

describe('diversificationScore', () => {
  it('is 100 for a well-spread portfolio with no concentration and matching equity guideline', () => {
    const r = diversificationScore({
      classPercents: [{ assetClass: 'EQUITY', percent: 40 }, { assetClass: 'MUTUAL_FUND', percent: 30 }, { assetClass: 'FIXED_DEPOSIT', percent: 30 }],
      largestSingleHoldingPct: 10,
      equityPct: 40,
      age: 60, // (100-60)=40 target equity, exact match
    });
    expect(r.score).toBe(100);
  });
  it('penalises a single asset class over 60%', () => {
    const r = diversificationScore({
      classPercents: [{ assetClass: 'EQUITY', percent: 90 }, { assetClass: 'FIXED_DEPOSIT', percent: 10 }],
      largestSingleHoldingPct: 20,
      equityPct: 90,
      age: null,
    });
    expect(r.score).toBeLessThan(100);
  });
  it('penalises a single holding over 50%', () => {
    const r = diversificationScore({
      classPercents: [{ assetClass: 'EQUITY', percent: 50 }, { assetClass: 'FIXED_DEPOSIT', percent: 50 }],
      largestSingleHoldingPct: 55,
      equityPct: 50,
      age: null,
    });
    expect(r.score).toBeLessThan(100);
  });
  it('skips the age-guideline sub-rule when age is unknown, without crashing', () => {
    // 60/40 split sits exactly at the ≤60% concentration threshold — no
    // penalty triggers, isolating this test to "does it crash" rather than
    // also asserting a concentration-penalty outcome.
    const r = diversificationScore({
      classPercents: [{ assetClass: 'EQUITY', percent: 60 }, { assetClass: 'FIXED_DEPOSIT', percent: 40 }],
      largestSingleHoldingPct: 15,
      equityPct: 60,
      age: null,
    });
    expect(r.score).toBe(100);
  });
});

describe('insuranceScore', () => {
  it('is 50 when there are no life policies at all (data unavailable)', () => {
    expect(insuranceScore(D(0), D(1000000), false).score).toBe(50);
  });
  it('is 100 when sum assured is at least 10x annual income', () => {
    expect(insuranceScore(D(10000000), D(1000000), true).score).toBe(100);
  });
  it('scales linearly below 10x income (1x income = 10% of target = score 10)', () => {
    expect(insuranceScore(D(1000000), D(1000000), true).score).toBeCloseTo(10, 6);
  });
  it('is 0 when policies exist but sum assured is 0', () => {
    expect(insuranceScore(D(0), D(1000000), true).score).toBe(0);
  });
});

describe('goalProgressScore', () => {
  it('is 50 with a nudge when there are no goals', () => {
    expect(goalProgressScore([]).score).toBe(50);
  });
  it('averages progress percentages across goals, capped at 100', () => {
    expect(goalProgressScore([50, 100, 150]).score).toBeCloseTo((50 + 100 + 100) / 3, 6);
  });
});

describe('weightedOverall', () => {
  it('weights emergency/investment/debt/diversification at 20% each, insurance/goal at 10% each', () => {
    const r = weightedOverall({
      emergencyFund: 100, investmentRate: 100, debtBurden: 100,
      diversification: 100, insurance: 100, goalProgress: 100,
    });
    expect(r.overall).toBe(100);
    expect(r.grade).toBe('A');
  });
  it('assigns grade thresholds A85 B70 C55 D40 F<40', () => {
    expect(weightedOverall({ emergencyFund: 85, investmentRate: 85, debtBurden: 85, diversification: 85, insurance: 85, goalProgress: 85 }).grade).toBe('A');
    expect(weightedOverall({ emergencyFund: 70, investmentRate: 70, debtBurden: 70, diversification: 70, insurance: 70, goalProgress: 70 }).grade).toBe('B');
    expect(weightedOverall({ emergencyFund: 55, investmentRate: 55, debtBurden: 55, diversification: 55, insurance: 55, goalProgress: 55 }).grade).toBe('C');
    expect(weightedOverall({ emergencyFund: 40, investmentRate: 40, debtBurden: 40, diversification: 40, insurance: 40, goalProgress: 40 }).grade).toBe('D');
    expect(weightedOverall({ emergencyFund: 0, investmentRate: 0, debtBurden: 0, diversification: 0, insurance: 0, goalProgress: 0 }).grade).toBe('F');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/api && npx vitest run src/services/healthScoreMath.test.ts`
Expected: FAIL — `healthScoreMath.ts` does not exist yet.

- [ ] **Step 3: Implement `healthScoreMath.ts`**

```typescript
import { Decimal } from 'decimal.js';

/**
 * Pure health-score math, extracted so formulas are unit-testable without a
 * DB (mirrors the goalMath.ts / goals.service.ts split). All monetary
 * inputs are Decimal; callers (healthScore.service.ts) supply pre-aggregated
 * totals.
 */

const ZERO = new Decimal(0);

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Liquid assets ÷ (6 × monthly expenses) × 100, capped [0,100]. */
export function emergencyFundScore(
  liquidAssets: Decimal,
  monthlyExpenses: Decimal,
): { score: number; monthsCovered: number } {
  if (monthlyExpenses.lessThanOrEqualTo(0)) {
    return { score: 100, monthsCovered: liquidAssets.greaterThan(0) ? Infinity : 0 };
  }
  const monthsCovered = liquidAssets.dividedBy(monthlyExpenses).toNumber();
  const score = clampScore((monthsCovered / 6) * 100);
  return { score, monthsCovered };
}

/** Monthly investment ÷ monthly income, target 20%. */
export function investmentRateScore(
  monthlyInvestment: Decimal,
  monthlyIncome: Decimal,
): { score: number; ratePct: number } {
  if (monthlyIncome.lessThanOrEqualTo(0)) return { score: 0, ratePct: 0 };
  const ratePct = monthlyInvestment.dividedBy(monthlyIncome).times(100).toNumber();
  const score = clampScore((ratePct / 20) * 100);
  return { score, ratePct };
}

/** EMIs + CC minimums ÷ monthly income. 100 at ≤20%, 0 at ≥60%, linear between. */
export function debtBurdenScore(
  monthlyDebtPayments: Decimal,
  monthlyIncome: Decimal,
): { score: number; burdenPct: number } {
  if (monthlyIncome.lessThanOrEqualTo(0)) {
    return { score: monthlyDebtPayments.lessThanOrEqualTo(0) ? 100 : 0, burdenPct: 0 };
  }
  const burdenPct = monthlyDebtPayments.dividedBy(monthlyIncome).times(100).toNumber();
  if (burdenPct <= 20) return { score: 100, burdenPct };
  if (burdenPct >= 60) return { score: 0, burdenPct };
  const score = clampScore(100 - ((burdenPct - 20) / 40) * 100);
  return { score, burdenPct };
}

export interface DiversificationInput {
  classPercents: Array<{ assetClass: string; percent: number }>;
  largestSingleHoldingPct: number;
  equityPct: number;
  age: number | null;
}

/**
 * Weighted average of three sub-rules: no asset class >60%, equity% within
 * 10pts of (100-age), no single holding >50%. The age sub-rule is dropped
 * (weight redistributed) when age is unknown — we don't have User.dob for
 * every account.
 */
export function diversificationScore(input: DiversificationInput): { score: number } {
  const maxClassPct = input.classPercents.reduce((m, c) => Math.max(m, c.percent), 0);
  const subClassConcentration = clampScore(maxClassPct <= 60 ? 100 : 100 - (maxClassPct - 60) * 2.5);
  const subHoldingConcentration = clampScore(
    input.largestSingleHoldingPct <= 50 ? 100 : 100 - (input.largestSingleHoldingPct - 50) * 2,
  );

  if (input.age == null) {
    const score = (subClassConcentration + subHoldingConcentration) / 2;
    return { score: clampScore(score) };
  }

  const targetEquityPct = Math.max(0, 100 - input.age);
  const equityGap = Math.abs(input.equityPct - targetEquityPct);
  const subEquityGuideline = clampScore(100 - equityGap * 5);

  const score = (subClassConcentration + subHoldingConcentration + subEquityGuideline) / 3;
  return { score: clampScore(score) };
}

/** Sum-assured (life-type policies only) ÷ 10x annual income. 50 if no policies at all. */
export function insuranceScore(
  totalLifeSumAssured: Decimal,
  annualIncome: Decimal,
  hasLifePolicies: boolean,
): { score: number } {
  if (!hasLifePolicies) return { score: 50 };
  if (annualIncome.lessThanOrEqualTo(0)) return { score: totalLifeSumAssured.greaterThan(0) ? 100 : 0 };
  const requiredCover = annualIncome.times(10);
  const ratio = totalLifeSumAssured.dividedBy(requiredCover).toNumber();
  return { score: clampScore(ratio * 100) };
}

/** Average of per-goal progressPct (already capped at 100 each). 50 with no goals. */
export function goalProgressScore(progressPcts: number[]): { score: number } {
  if (progressPcts.length === 0) return { score: 50 };
  const capped = progressPcts.map((p) => Math.min(100, p));
  const avg = capped.reduce((s, p) => s + p, 0) / capped.length;
  return { score: clampScore(avg) };
}

export interface SubScores {
  emergencyFund: number;
  investmentRate: number;
  debtBurden: number;
  diversification: number;
  insurance: number;
  goalProgress: number;
}

const WEIGHTS: SubScores = {
  emergencyFund: 0.2, investmentRate: 0.2, debtBurden: 0.2,
  diversification: 0.2, insurance: 0.1, goalProgress: 0.1,
};

export function weightedOverall(subScores: SubScores): { overall: number; grade: string } {
  const overall = Math.round(
    subScores.emergencyFund * WEIGHTS.emergencyFund +
    subScores.investmentRate * WEIGHTS.investmentRate +
    subScores.debtBurden * WEIGHTS.debtBurden +
    subScores.diversification * WEIGHTS.diversification +
    subScores.insurance * WEIGHTS.insurance +
    subScores.goalProgress * WEIGHTS.goalProgress,
  );
  const grade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';
  return { overall, grade };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/api && npx vitest run src/services/healthScoreMath.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/healthScoreMath.ts packages/api/src/services/healthScoreMath.test.ts
git commit -m "feat(health-score): pure sub-score math with tests"
```

---

### Task 3: Data orchestration — `healthScore.service.ts`

**Files:**
- Create: `packages/api/src/services/healthScore.service.ts`

**Interfaces:**
- Consumes: `getDashboardNetWorth` from `./dashboard.service.js` (existing, returns `.allocationBreakdown`, `.liabilities.monthlyEmiTotal`, `.insurance.totalSumAssured` — see `dashboard.service.ts:422-474`), `listGoals` from `./goals.service.js` (existing, each item has `.progressPct: number`), all six pure functions from `./healthScoreMath.js` (Task 2).
- Produces: `computeHealthScore(userId: string, opts?: { force?: boolean }): Promise<HealthScoreResult>` — consumed by Task 4's controller. `HealthScoreResult` shape:
```typescript
interface HealthScoreResult {
  overallScore: number;
  grade: string;
  subScores: {
    emergencyFund: { score: number; insight: string; action: string };
    investmentRate: { score: number; insight: string; action: string };
    debtBurden: { score: number; insight: string; action: string };
    diversification: { score: number; insight: string; action: string };
    insurance: { score: number; insight: string; action: string };
    goalProgress: { score: number; insight: string; action: string };
  };
  computedAt: string;
}
```

- [ ] **Step 1: Implement the service**

```typescript
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { getDashboardNetWorth } from './dashboard.service.js';
import { listGoals } from './goals.service.js';
import {
  emergencyFundScore, investmentRateScore, debtBurdenScore,
  diversificationScore, insuranceScore, goalProgressScore, weightedOverall,
} from './healthScoreMath.js';

const ZERO = new Decimal(0);
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const LIQUID_CLASSES = new Set(['CASH', 'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'POST_OFFICE_SAVINGS', 'POST_OFFICE_RD', 'POST_OFFICE_TD']);
const LIFE_POLICY_TYPES = new Set(['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT']);

function d(v: { toString(): string } | null | undefined): Decimal {
  if (v == null) return ZERO;
  return new Decimal(v.toString());
}

function monthsAgo(n: number): Date {
  const dt = new Date();
  dt.setUTCMonth(dt.getUTCMonth() - n);
  return dt;
}

async function estimateMonthlyIncome(userId: string): Promise<Decimal> {
  const events = await prisma.canonicalEvent.findMany({
    where: { userId, eventType: { in: ['NEFT_CREDIT', 'UPI_CREDIT'] }, eventDate: { gte: monthsAgo(3) } },
    select: { amount: true },
  });
  const total = events.reduce((s, e) => s.plus(d(e.amount)), ZERO);
  return total.dividedBy(3);
}

async function estimateMonthlyExpenses(userId: string): Promise<Decimal> {
  const events = await prisma.canonicalEvent.findMany({
    where: { userId, eventType: { in: ['CARD_PURCHASE', 'UPI_DEBIT', 'NEFT_DEBIT'] }, eventDate: { gte: monthsAgo(3) } },
    select: { amount: true },
  });
  const total = events.reduce((s, e) => s.plus(d(e.amount)), ZERO);
  return total.dividedBy(3);
}

async function estimateMonthlyInvestment(userId: string): Promise<Decimal> {
  const events = await prisma.canonicalEvent.findMany({
    where: { userId, eventType: { in: ['SIP_INSTALLMENT', 'BUY'] }, eventDate: { gte: monthsAgo(3) } },
    select: { amount: true },
  });
  const total = events.reduce((s, e) => s.plus(d(e.amount)), ZERO);
  return total.dividedBy(3);
}

async function liquidAssetsTotal(userId: string): Promise<Decimal> {
  const rows = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId }, assetClass: { in: Array.from(LIQUID_CLASSES) as never } },
    select: { currentValue: true, totalCost: true },
  });
  return rows.reduce((s, h) => s.plus(h.currentValue !== null ? d(h.currentValue) : d(h.totalCost)), ZERO);
}

async function largestSingleHoldingPct(userId: string): Promise<number> {
  const rows = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId } },
    select: { currentValue: true, totalCost: true },
  });
  const values = rows.map((h) => (h.currentValue !== null ? d(h.currentValue) : d(h.totalCost)));
  const total = values.reduce((s, v) => s.plus(v), ZERO);
  if (total.lessThanOrEqualTo(0)) return 0;
  const max = values.reduce((m, v) => (v.greaterThan(m) ? v : m), ZERO);
  return max.dividedBy(total).times(100).toNumber();
}

async function monthlyCcMinimums(userId: string): Promise<Decimal> {
  const cards = await prisma.creditCard.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { statements: { orderBy: { forMonth: 'desc' }, take: 1 } },
  });
  return cards.reduce((s, c) => s.plus(d(c.statements[0]?.minimumDue)), ZERO);
}

async function lifeInsuranceTotals(userId: string): Promise<{ sumAssured: Decimal; hasPolicies: boolean }> {
  const policies = await prisma.insurancePolicy.findMany({
    where: { userId, status: 'ACTIVE', type: { in: Array.from(LIFE_POLICY_TYPES) } },
    select: { sumAssured: true },
  });
  return {
    sumAssured: policies.reduce((s, p) => s.plus(d(p.sumAssured)), ZERO),
    hasPolicies: policies.length > 0,
  };
}

async function userAge(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dob: true } });
  if (!user?.dob) return null;
  const ageMs = Date.now() - user.dob.getTime();
  return Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
}

export interface HealthScoreResult {
  overallScore: number;
  grade: string;
  subScores: Record<
    'emergencyFund' | 'investmentRate' | 'debtBurden' | 'diversification' | 'insurance' | 'goalProgress',
    { score: number; insight: string; action: string }
  >;
  computedAt: string;
}

export async function computeHealthScore(userId: string, opts: { force?: boolean } = {}): Promise<HealthScoreResult> {
  if (!opts.force) {
    const cached = await prisma.healthScoreSnapshot.findUnique({ where: { userId } });
    if (cached && Date.now() - cached.computedAt.getTime() < STALE_AFTER_MS) {
      return {
        overallScore: cached.overallScore,
        grade: cached.grade,
        subScores: cached.subScores as HealthScoreResult['subScores'],
        computedAt: cached.computedAt.toISOString(),
      };
    }
  }

  const [netWorth, goals, monthlyIncome, monthlyExpenses, monthlyInvestment, liquidAssets, largestHoldingPct, ccMinimums, life, age] =
    await Promise.all([
      getDashboardNetWorth(userId),
      listGoals(userId),
      estimateMonthlyIncome(userId),
      estimateMonthlyExpenses(userId),
      estimateMonthlyInvestment(userId),
      liquidAssetsTotal(userId),
      largestSingleHoldingPct(userId),
      monthlyCcMinimums(userId),
      lifeInsuranceTotals(userId),
      userAge(userId),
    ]);

  const monthlyEmi = new Decimal(netWorth.liabilities.monthlyEmiTotal);
  const monthlyDebtPayments = monthlyEmi.plus(ccMinimums);
  const equityPct = netWorth.allocationBreakdown.find((a) => a.key === 'EQUITY')?.percent ?? 0;
  const annualIncome = monthlyIncome.times(12);

  const ef = emergencyFundScore(liquidAssets, monthlyExpenses);
  const ir = investmentRateScore(monthlyInvestment, monthlyIncome);
  const db = debtBurdenScore(monthlyDebtPayments, monthlyIncome);
  const dv = diversificationScore({
    classPercents: netWorth.allocationBreakdown.map((a) => ({ assetClass: a.key, percent: a.percent })),
    largestSingleHoldingPct: largestHoldingPct,
    equityPct,
    age,
  });
  const ins = insuranceScore(life.sumAssured, annualIncome, life.hasPolicies);
  const gp = goalProgressScore(goals.map((g) => g.progressPct));

  const { overall, grade } = weightedOverall({
    emergencyFund: ef.score, investmentRate: ir.score, debtBurden: db.score,
    diversification: dv.score, insurance: ins.score, goalProgress: gp.score,
  });

  const subScores: HealthScoreResult['subScores'] = {
    emergencyFund: {
      score: Math.round(ef.score),
      insight: `You have ${ef.monthsCovered === Infinity ? '20+' : ef.monthsCovered.toFixed(1)} months of expenses covered. Target is 6 months.`,
      action: 'Build your emergency fund toward 6 months of expenses in liquid assets (savings, FDs).',
    },
    investmentRate: {
      score: Math.round(ir.score),
      insight: `You're investing ${ir.ratePct.toFixed(1)}% of income. Target is 20%.`,
      action: 'Increase your monthly SIP or equity investment toward 20% of income.',
    },
    debtBurden: {
      score: Math.round(db.score),
      insight: `Your EMIs and card payments consume ${db.burdenPct.toFixed(1)}% of income. Keep it under 40%.`,
      action: 'Consider prepaying high-interest debt or consolidating loans.',
    },
    diversification: {
      score: Math.round(dv.score),
      insight: `Your equity allocation is ${equityPct.toFixed(1)}% of your portfolio.`,
      action: 'Rebalance so no single asset class or holding dominates your portfolio.',
    },
    insurance: {
      score: Math.round(ins.score),
      insight: life.hasPolicies
        ? `Your life cover is ₹${life.sumAssured.toFixed(0)}. Target is 10x annual income.`
        : 'No life insurance policies found — add one manually to get scored.',
      action: 'Review whether your life cover is at least 10x your annual income.',
    },
    goalProgress: {
      score: Math.round(gp.score),
      insight: goals.length > 0
        ? `You are averaging ${Math.round(gp.score)}% progress across your active goals.`
        : 'You have not set any financial goals yet.',
      action: goals.length > 0 ? 'Review goals that are falling behind.' : 'Set your first financial goal.',
    },
  };

  const computedAt = new Date();
  await prisma.healthScoreSnapshot.upsert({
    where: { userId },
    create: { userId, overallScore: overall, grade, subScores: subScores as never, computedAt },
    update: { overallScore: overall, grade, subScores: subScores as never, computedAt },
  });

  return { overallScore: overall, grade, subScores, computedAt: computedAt.toISOString() };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/api && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors from `healthScore.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/services/healthScore.service.ts
git commit -m "feat(health-score): orchestration service with 24h snapshot cache"
```

---

### Task 4: Route + controller — `GET /api/intelligence/health-score`

**Files:**
- Create: `packages/api/src/controllers/intelligence.controller.ts`
- Create: `packages/api/src/routes/intelligence.routes.ts`
- Modify: `packages/api/src/routes/index.ts` (add import near line 42, mount near line 89)

**Interfaces:**
- Consumes: `computeHealthScore` from `../services/healthScore.service.js` (Task 3), `ok` from `../lib/response.js`, `UnauthorizedError` from `../lib/errors.js`, `authenticate` from `../middleware/authenticate.js`, `asyncHandler` from `../middleware/validate.js` — all existing, same imports `goals.routes.ts`/`goals.controller.ts` use.

- [ ] **Step 1: Write the controller**

```typescript
import type { Request, Response } from 'express';
import { computeHealthScore } from '../services/healthScore.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

export async function getHealthScore(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const force = req.query['force'] === 'true';
  const data = await computeHealthScore(req.user.id, { force });
  return ok(res, data);
}
```

- [ ] **Step 2: Write the route**

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { getHealthScore } from '../controllers/intelligence.controller.js';

export const intelligenceRouter = Router();
intelligenceRouter.use(authenticate);

intelligenceRouter.get('/health-score', asyncHandler(getHealthScore));
```

- [ ] **Step 3: Mount the router**

In `packages/api/src/routes/index.ts`, add near the existing `import { goalsRouter } from './goals.routes.js';` (line 42):

```typescript
import { intelligenceRouter } from './intelligence.routes.js';
```

And near `app.use('/api/goals', goalsRouter);` (line 89):

```typescript
  app.use('/api/intelligence', intelligenceRouter);
```

- [ ] **Step 4: Manual smoke test**

Run: `cd packages/api && npm run dev` (in background), then in another shell:
```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/intelligence/health-score | head -c 2000
```
Expected: JSON `{"success":true,"data":{"overallScore":...,"grade":"...","subScores":{...},"computedAt":"..."}}`. (Get `$TOKEN` from an existing logged-in session's dev tools, or via the existing `/api/auth/login` endpoint.)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/controllers/intelligence.controller.ts packages/api/src/routes/intelligence.routes.ts packages/api/src/routes/index.ts
git commit -m "feat(health-score): GET /api/intelligence/health-score endpoint"
```

---

### Task 5: Frontend API client

**Files:**
- Create: `apps/web/src/api/intelligence.api.ts`

**Interfaces:**
- Consumes: `api` (axios instance) from `./client`, `ApiResponse<T>` from `@portfolioos/shared` — exact pattern copied from `apps/web/src/api/dashboard.api.ts:1-2,102-114` (the `unwrap()` + `dashboardApi.netWorth()` shape).
- Produces: `intelligenceApi.healthScore(force?: boolean): Promise<HealthScoreResult>` — consumed by Task 7.

- [ ] **Step 1: Add the client function**

```typescript
import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

export interface HealthSubScore {
  score: number;
  insight: string;
  action: string;
}

export interface HealthScoreResult {
  overallScore: number;
  grade: string;
  subScores: {
    emergencyFund: HealthSubScore;
    investmentRate: HealthSubScore;
    debtBurden: HealthSubScore;
    diversification: HealthSubScore;
    insurance: HealthSubScore;
    goalProgress: HealthSubScore;
  };
  computedAt: string;
}

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const intelligenceApi = {
  async healthScore(force = false): Promise<HealthScoreResult> {
    const { data } = await api.get<ApiResponse<HealthScoreResult>>('/api/intelligence/health-score', {
      params: force ? { force: 'true' } : undefined,
    });
    return unwrap(data);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/api/intelligence.api.ts
git commit -m "feat(health-score): frontend API client"
```

---

### Task 6: Frontend gauge — `HealthScoreGauge.tsx`

**Files:**
- Create: `apps/web/src/components/intelligence/HealthScoreGauge.tsx`

**Interfaces:**
- Consumes: nothing external — pure presentational SVG component.
- Produces: `<HealthScoreGauge score={number} grade={string} />` — consumed by Task 7.

- [ ] **Step 1: Implement the gauge**

```tsx
interface HealthScoreGaugeProps {
  score: number;
  grade: string;
  size?: number;
}

function gaugeColor(score: number): string {
  if (score < 40) return '#ef4444';
  if (score < 70) return '#f97316';
  return '#22c55e';
}

export function HealthScoreGauge({ score, grade, size = 200 }: HealthScoreGaugeProps) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const color = gaugeColor(clamped);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Health score ${score} out of 100, grade ${grade}`}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.22} fontWeight={700} fill="currentColor">
        {Math.round(clamped)}
      </text>
      <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.12} fill={color} fontWeight={600}>
        {grade}
      </text>
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/intelligence/HealthScoreGauge.tsx
git commit -m "feat(health-score): SVG circular gauge component"
```

---

### Task 7: Frontend container + dimension grid — `HealthScore.tsx`

**Files:**
- Create: `apps/web/src/components/intelligence/HealthScore.tsx`

**Interfaces:**
- Consumes: `intelligenceApi.healthScore` (Task 5), `HealthScoreGauge` (Task 6), `Card` from `@/components/ui/card`, `useQuery` from `@tanstack/react-query` — exact pattern copied from `apps/web/src/pages/dashboard/DashboardPage.tsx:343-346` (`netWorthQuery`).
- Produces: `<HealthScore />` — consumed by Task 8 (DashboardPage slot).

- [ ] **Step 1: Implement the component**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { intelligenceApi, type HealthSubScore } from '@/api/intelligence.api';
import { HealthScoreGauge } from './HealthScoreGauge';
import { useState } from 'react';

const DIMENSION_LABELS: Record<string, string> = {
  emergencyFund: 'Emergency Fund',
  investmentRate: 'Investment Rate',
  debtBurden: 'Debt Burden',
  diversification: 'Diversification',
  insurance: 'Insurance Coverage',
  goalProgress: 'Goal Progress',
};

function dimensionColor(score: number): string {
  if (score < 40) return 'bg-negative';
  if (score < 70) return 'bg-orange-500';
  return 'bg-positive';
}

function DimensionCard({ id, sub }: { id: string; sub: HealthSubScore }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{DIMENSION_LABELS[id] ?? id}</span>
        <span className="numeric-display text-sm font-semibold">{sub.score}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted/60">
        <div className={`h-full ${dimensionColor(sub.score)}`} style={{ width: `${sub.score}%` }} />
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">{sub.insight}</p>
      <button
        type="button"
        className="mt-1 text-[11.5px] font-medium text-accent-ink hover:underline"
        onClick={() => setExpanded((e) => !e)}
      >
        Fix this →
      </button>
      {expanded && <p className="mt-1 text-[11.5px] text-muted-foreground">{sub.action}</p>}
    </Card>
  );
}

export function HealthScore() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['intelligence', 'health-score'],
    queryFn: () => intelligenceApi.healthScore(),
  });

  if (isLoading) return <Card className="p-6 animate-pulse text-sm text-muted-foreground">Computing your financial health score…</Card>;
  if (error || !data) return <Card className="p-6 text-sm text-negative">Couldn't load your health score. Try again shortly.</Card>;

  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center gap-2 p-6">
        <HealthScoreGauge score={data.overallScore} grade={data.grade} />
        <p className="text-xs text-muted-foreground">
          Updated {new Date(data.computedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(data.subScores).map(([id, sub]) => (
          <DimensionCard key={id} id={id} sub={sub} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/intelligence/HealthScore.tsx
git commit -m "feat(health-score): gauge + dimension grid component"
```

---

### Task 8: Wire into the dashboard

**Files:**
- Modify: `apps/web/src/pages/dashboard/DashboardPage.tsx` (insert after the existing Net Worth Hero section, ~line 539, per `INTELLIGENCE_LAYER_AUDIT.md`/design-spec slotting notes)

**Interfaces:**
- Consumes: `HealthScore` from `../../components/intelligence/HealthScore` (Task 7).

- [ ] **Step 1: Import and render**

Add `import { HealthScore } from '@/components/intelligence/HealthScore';` near the other component imports at the top of `DashboardPage.tsx`, then render `<HealthScore />` immediately after the closing tag of the Net Worth Hero section (the block ending around line 539) and before the Alerts bar section (~line 541).

- [ ] **Step 2: Manual verification**

Run: `cd apps/web && npm run dev`, open `/dashboard` in a browser, confirm:
- Gauge renders with a real score (not NaN/undefined).
- 6 dimension cards render with insight text.
- "Fix this →" expands to show the action text.
- No console errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat(health-score): slot into dashboard below net worth hero"
```

---

## Explicitly out of scope for this plan

- Share-as-PNG button (`html-to-image`) — spec Module 3 asks for it; deferred to a follow-up task once the core score ships and is verified correct, to keep this plan's review surface focused on the scoring math (the part most likely to have bugs worth catching early).
- `/intelligence` central dashboard page — Task 8 slots `HealthScore` into the existing `/dashboard` only, per the design spec's "upgrade pieces in place on /dashboard too" note. The dedicated `/intelligence` route is built once Net Worth history (Module 4) and Insights (Module 5) also exist to fill it.
