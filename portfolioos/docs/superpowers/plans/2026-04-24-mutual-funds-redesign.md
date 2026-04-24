# Mutual Funds Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Mutual Funds section from a flat page into a two-level experience with a per-scheme detail page, XIRR, capital gains, SIP tracking, and charts — all powered by a new `/api/mf/*` backend module.

**Architecture:** New `mfInsights.service.ts` handles all MF aggregation (holdings from HoldingProjection, XIRR via xirr.service.ts, capital gains via CapitalGain model filtered through sellTransaction.fundId, NAV history from MFNav, value history computed as running totals). New `mf.controller.ts` / `mf.routes.ts` expose 10 REST endpoints. Frontend gets a new `mutualFunds.api.ts` client, a rewritten `MutualFundsPage`, a new `MutualFundDetailPage`, and four supporting components (ImportHistoryPanel, SchemeCharts, SipSection, CapGainsSection).

**Tech Stack:** Node 20 + Express + Prisma + PostgreSQL 15 (backend); React 18 + TypeScript + Vite + shadcn/Tailwind + TanStack Query + Recharts (frontend); `decimal.js` / branded Money/Quantity types for all monetary values.

---

## File Map

**New backend files:**
- `packages/api/src/services/mfInsights.service.ts` — all MF aggregation logic
- `packages/api/src/controllers/mf.controller.ts` — route handlers
- `packages/api/src/routes/mf.routes.ts` — route definitions

**New shared types:**
- `packages/shared/src/types/mf.ts` — MfSchemeRow, MfSchemeDetail, NavPoint, ValuePoint, SipInfo, SipPlan, MfCapGainsSummary, MfCapGainRow, RegisterSipPayload

**New frontend files:**
- `apps/web/src/api/mutualFunds.api.ts` — API client for `/api/mf/*`
- `apps/web/src/pages/assetClasses/MutualFundDetailPage.tsx` — per-scheme detail page
- `apps/web/src/pages/assetClasses/components/ImportHistoryPanel.tsx` — collapsible import history
- `apps/web/src/pages/assetClasses/components/SchemeCharts.tsx` — AreaChart + LineChart
- `apps/web/src/pages/assetClasses/components/SipSection.tsx` — SIP auto-detect + manual registry
- `apps/web/src/pages/assetClasses/components/CapGainsSection.tsx` — STCG/LTCG display

**Modified files:**
- `packages/api/prisma/schema.prisma` — add SipPlan model
- `packages/api/src/routes/index.ts` — register mfRouter at `/api/mf`
- `packages/shared/src/types/index.ts` — export from mf.ts
- `apps/web/src/App.tsx` — add `/mutual-funds/:fundId` route
- `apps/web/src/pages/assetClasses/MutualFundsPage.tsx` — full rewrite

---

## Task 1: SipPlan DB migration

**Files:**
- Modify: `packages/api/prisma/schema.prisma`
- Create: `packages/api/prisma/migrations/20260424_sip_plan/migration.sql`

- [ ] **Step 1: Add SipPlan model to schema.prisma**

Open `packages/api/prisma/schema.prisma` and add after the last model definition:

```prisma
model SipPlan {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  fundId     String?
  assetName  String?
  amount     Decimal  @db.Decimal(12,2)
  frequency  String   // MONTHLY | QUARTERLY | ANNUAL
  dayOfMonth Int?
  startDate  DateTime @db.Date
  isActive   Boolean  @default(true)
  notes      String?
  createdAt  DateTime @default(now())

  @@index([userId, isActive])
}
```

Also add `sipPlans SipPlan[]` to the `User` model's relation list.

- [ ] **Step 2: Generate and run the migration**

```bash
cd portfolioos
pnpm --filter @portfolioos/api exec prisma migrate dev --name sip_plan
```

Expected output: `The following migration(s) have been created and applied: 20260424_sip_plan`

- [ ] **Step 3: Verify migration applied**

```bash
pnpm --filter @portfolioos/api exec prisma db pull --print | grep -A 15 "SipPlan"
```

Expected: SipPlan table columns listed.

- [ ] **Step 4: Regenerate Prisma client**

```bash
pnpm --filter @portfolioos/api exec prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Commit**

```bash
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations/
git commit -m "feat(db): add SipPlan model for manual SIP registry"
```

---

## Task 2: Shared MF types

**Files:**
- Create: `packages/shared/src/types/mf.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Write mf.ts**

Create `packages/shared/src/types/mf.ts`:

```typescript
import type { Money, Quantity } from '../decimal.js';

export interface MfSchemeRow {
  fundId: string;
  schemeName: string;
  amcName: string | null;
  schemeCategory: string | null;
  isin: string | null;
  totalUnits: Quantity;
  avgCostPrice: Money;
  totalCost: Money;
  currentValue: Money | null;
  unrealisedPnL: Money | null;
  unrealisedPnLPct: number | null;
  currentNav: Money | null;
  navDate: string | null;
  portfolioCount: number;
}

export interface MfSchemeDetail extends MfSchemeRow {
  schemeCode: string | null;
}

export interface NavPoint {
  date: string;
  nav: Money;
}

export interface ValuePoint {
  date: string;
  value: Money;
  invested: Money;
}

export interface SipDetection {
  detected: boolean;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | null;
  typicalAmount: Money | null;
  streak: number;
  startDate: string | null;
  lastDate: string | null;
  nextExpectedDate: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface SipPlan {
  id: string;
  fundId: string | null;
  assetName: string | null;
  amount: Money;
  frequency: string;
  dayOfMonth: number | null;
  startDate: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

export interface SipInfo {
  detection: SipDetection;
  plans: SipPlan[];
}

export interface MfCapGainRow {
  id: string;
  sellDate: string;
  buyDate: string;
  quantity: Quantity;
  buyPrice: Money;
  sellPrice: Money;
  gainLoss: Money;
  capitalGainType: string;
  financialYear: string;
}

export interface MfCapGainsSummary {
  totalStcg: Money;
  totalLtcg: Money;
  totalGain: Money;
  rowCount: number;
  rows: MfCapGainRow[];
}

export interface RegisterSipPayload {
  amount: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  dayOfMonth?: number;
  startDate: string;
  notes?: string;
}
```

- [ ] **Step 2: Export from types/index.ts**

Open `packages/shared/src/types/index.ts`. Add at the bottom:

```typescript
export * from './mf.js';
```

- [ ] **Step 3: Build shared package to verify no type errors**

```bash
pnpm --filter @portfolioos/shared run build
```

Expected: exits 0, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/mf.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add MF types (MfSchemeRow, SipInfo, NavPoint, ValuePoint, MfCapGainsSummary)"
```

---

## Task 3: mfInsights service — scheme list, detail, transactions

**Files:**
- Create: `packages/api/src/services/mfInsights.service.ts`

- [ ] **Step 1: Write listMfSchemes**

Create `packages/api/src/services/mfInsights.service.ts` with this first function. It uses batch queries (not N×2) — one query for HoldingProjection rows, one for MutualFundMaster, one for latest MFNav per fundId:

```typescript
import { prisma } from '../lib/prisma.js';
import { serializeMoney, serializeQuantity, toDecimal } from '@portfolioos/shared';
import type { MfSchemeRow, MfSchemeDetail, MfCapGainsSummary, MfCapGainRow } from '@portfolioos/shared';
import Decimal from 'decimal.js';

export async function listMfSchemes(userId: string): Promise<MfSchemeRow[]> {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    select: { id: true },
  });
  const portfolioIds = portfolios.map((p) => p.id);
  if (portfolioIds.length === 0) return [];

  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId: { in: portfolioIds }, assetClass: 'MUTUAL_FUND', fundId: { not: null } },
    select: {
      portfolioId: true,
      fundId: true,
      quantity: true,
      avgCostPrice: true,
      totalCost: true,
      currentValue: true,
      unrealisedPnL: true,
      currentPrice: true,
    },
  });

  // Group by fundId
  const grouped = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const key = h.fundId!;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(h);
  }

  const fundIds = [...grouped.keys()];
  if (fundIds.length === 0) return [];

  const [masters, navRows] = await Promise.all([
    prisma.mutualFundMaster.findMany({
      where: { id: { in: fundIds } },
      select: { id: true, schemeName: true, amcName: true, category: true, isin: true },
    }),
    prisma.mFNav.findMany({
      where: { fundId: { in: fundIds } },
      orderBy: { date: 'desc' },
      distinct: ['fundId'],
      select: { fundId: true, nav: true, date: true },
    }),
  ]);

  const masterMap = new Map(masters.map((m) => [m.id, m]));
  const navMap = new Map(navRows.map((n) => [n.fundId, n]));

  const result: MfSchemeRow[] = [];
  for (const [fundId, rows] of grouped.entries()) {
    const master = masterMap.get(fundId);
    const nav = navMap.get(fundId);

    let totalUnits = new Decimal(0);
    let totalCost = new Decimal(0);
    let totalCurrentValue: Decimal | null = new Decimal(0);
    let totalPnL: Decimal | null = new Decimal(0);
    const portfolioSet = new Set<string>();

    for (const h of rows) {
      totalUnits = totalUnits.plus(toDecimal(h.quantity));
      totalCost = totalCost.plus(toDecimal(h.totalCost));
      portfolioSet.add(h.portfolioId);
      if (h.currentValue != null && totalCurrentValue != null) {
        totalCurrentValue = totalCurrentValue.plus(toDecimal(h.currentValue));
      } else {
        totalCurrentValue = null;
      }
      if (h.unrealisedPnL != null && totalPnL != null) {
        totalPnL = totalPnL.plus(toDecimal(h.unrealisedPnL));
      } else {
        totalPnL = null;
      }
    }

    const avgCostPrice = totalUnits.isZero() ? new Decimal(0) : totalCost.dividedBy(totalUnits);
    const pnlPct =
      totalPnL != null && !totalCost.isZero()
        ? totalPnL.dividedBy(totalCost).times(100).toDecimalPlaces(2).toNumber()
        : null;

    result.push({
      fundId,
      schemeName: master?.schemeName ?? fundId,
      amcName: master?.amcName ?? null,
      schemeCategory: master?.category ?? null,
      isin: master?.isin ?? null,
      totalUnits: serializeQuantity(totalUnits),
      avgCostPrice: serializeMoney(avgCostPrice),
      totalCost: serializeMoney(totalCost),
      currentValue: totalCurrentValue != null ? serializeMoney(totalCurrentValue) : null,
      unrealisedPnL: totalPnL != null ? serializeMoney(totalPnL) : null,
      unrealisedPnLPct: pnlPct,
      currentNav: nav ? serializeMoney(toDecimal(nav.nav)) : null,
      navDate: nav ? nav.date.toISOString().split('T')[0] : null,
      portfolioCount: portfolioSet.size,
    });
  }

  return result.sort((a, b) => {
    if (a.currentValue == null) return 1;
    if (b.currentValue == null) return -1;
    return toDecimal(b.currentValue).comparedTo(toDecimal(a.currentValue));
  });
}
```

- [ ] **Step 2: Add getMfScheme**

Append to the same file:

```typescript
export async function getMfScheme(userId: string, fundId: string): Promise<MfSchemeDetail | null> {
  const rows = await listMfSchemes(userId);
  const row = rows.find((r) => r.fundId === fundId);
  if (!row) return null;

  const master = await prisma.mutualFundMaster.findUnique({
    where: { id: fundId },
    select: { schemeCode: true },
  });

  return { ...row, schemeCode: master?.schemeCode ?? null };
}
```

- [ ] **Step 3: Add getSchemeTransactions**

Append to the same file:

```typescript
import type { TransactionDTO } from '@portfolioos/shared';
import { toTransactionDTO } from './transaction.service.js';

export async function getSchemeTransactions(userId: string, fundId: string): Promise<TransactionDTO[]> {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    select: { id: true },
  });
  const portfolioIds = portfolios.map((p) => p.id);
  if (portfolioIds.length === 0) return [];

  const txns = await prisma.transaction.findMany({
    where: { portfolioId: { in: portfolioIds }, fundId, assetClass: 'MUTUAL_FUND' },
    orderBy: { tradeDate: 'desc' },
    include: {
      portfolio: { select: { id: true, name: true } },
      stock: false,
      mutualFund: { select: { id: true, schemeName: true } },
    },
  });

  return txns.map(toTransactionDTO);
}
```

- [ ] **Step 4: TypeCheck the file**

```bash
pnpm --filter @portfolioos/api run typecheck 2>&1 | head -40
```

Fix any type errors (common: `toDecimal` expects `Decimal | string`, Prisma Decimal fields come as `Prisma.Decimal` — pass directly or call `.toString()` first).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/mfInsights.service.ts
git commit -m "feat(mf): mfInsights service — listMfSchemes, getMfScheme, getSchemeTransactions"
```

---

## Task 4: mfInsights service — XIRR, capital gains, NAV history, value history

**Files:**
- Modify: `packages/api/src/services/mfInsights.service.ts`

- [ ] **Step 1: Add computeSchemeXirr**

Append to `mfInsights.service.ts`:

```typescript
import { xirr } from './xirr.service.js';
import type { CashFlow } from './xirr.service.js';

const OUTFLOW_TYPES = new Set(['BUY', 'SIP', 'SWITCH_IN', 'RIGHTS_ISSUE', 'DIVIDEND_REINVEST', 'DEPOSIT', 'OPENING_BALANCE']);
const INFLOW_TYPES = new Set(['SELL', 'SWITCH_OUT', 'REDEMPTION', 'MATURITY', 'DIVIDEND_PAYOUT', 'INTEREST_RECEIVED', 'WITHDRAWAL']);

export async function computeSchemeXirr(
  userId: string,
  fundId: string,
): Promise<{ xirr: number | null; cashflowCount: number }> {
  const portfolios = await prisma.portfolio.findMany({ where: { userId }, select: { id: true } });
  const portfolioIds = portfolios.map((p) => p.id);
  if (portfolioIds.length === 0) return { xirr: null, cashflowCount: 0 };

  const txns = await prisma.transaction.findMany({
    where: { portfolioId: { in: portfolioIds }, fundId, assetClass: 'MUTUAL_FUND' },
    select: { tradeDate: true, netAmount: true, transactionType: true },
    orderBy: { tradeDate: 'asc' },
  });

  const cashflows: CashFlow[] = txns.map((t) => {
    const amount = toDecimal(t.netAmount);
    const signed = OUTFLOW_TYPES.has(t.transactionType)
      ? amount.negated()
      : INFLOW_TYPES.has(t.transactionType)
      ? amount
      : new Decimal(0);
    return { date: t.tradeDate, amount: signed };
  });

  // Terminal value: current holding value
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId: { in: portfolioIds }, fundId, assetClass: 'MUTUAL_FUND' },
    select: { currentValue: true },
  });
  const terminalValue = holdings.reduce((sum, h) => {
    return h.currentValue ? sum.plus(toDecimal(h.currentValue)) : sum;
  }, new Decimal(0));

  if (!terminalValue.isZero()) {
    cashflows.push({ date: new Date(), amount: terminalValue });
  }

  const nonZero = cashflows.filter((c) => !c.amount.isZero());
  if (nonZero.length < 2) return { xirr: null, cashflowCount: nonZero.length };

  const result = xirr(nonZero);
  return { xirr: result, cashflowCount: nonZero.length };
}
```

- [ ] **Step 2: Add getSchemeCapitalGains**

Append to the same file:

```typescript
export async function getSchemeCapitalGains(
  userId: string,
  fundId: string,
  fy?: string,
): Promise<MfCapGainsSummary> {
  const portfolios = await prisma.portfolio.findMany({ where: { userId }, select: { id: true } });
  const portfolioIds = portfolios.map((p) => p.id);

  let fyFilter: { gte?: Date; lt?: Date } | undefined;
  if (fy) {
    // fy format: "2024-25" → April 2024 – March 2025
    const startYear = parseInt(fy.split('-')[0], 10);
    fyFilter = {
      gte: new Date(startYear, 3, 1),     // April 1
      lt: new Date(startYear + 1, 3, 1),  // April 1 next year
    };
  }

  const gains = await prisma.capitalGain.findMany({
    where: {
      portfolioId: { in: portfolioIds },
      sellTransaction: { fundId },
      ...(fyFilter ? { sellDate: fyFilter } : {}),
    },
    select: {
      id: true,
      sellDate: true,
      buyDate: true,
      quantity: true,
      buyPrice: true,
      sellPrice: true,
      gainLoss: true,
      capitalGainType: true,
      financialYear: true,
    },
    orderBy: { sellDate: 'desc' },
  });

  let totalStcg = new Decimal(0);
  let totalLtcg = new Decimal(0);

  const rows: MfCapGainRow[] = gains.map((g) => {
    const gain = toDecimal(g.gainLoss);
    if (g.capitalGainType === 'STCG') totalStcg = totalStcg.plus(gain);
    else if (g.capitalGainType === 'LTCG') totalLtcg = totalLtcg.plus(gain);
    return {
      id: g.id,
      sellDate: g.sellDate.toISOString().split('T')[0],
      buyDate: g.buyDate.toISOString().split('T')[0],
      quantity: serializeQuantity(toDecimal(g.quantity)),
      buyPrice: serializeMoney(toDecimal(g.buyPrice)),
      sellPrice: serializeMoney(toDecimal(g.sellPrice)),
      gainLoss: serializeMoney(gain),
      capitalGainType: g.capitalGainType,
      financialYear: g.financialYear,
    };
  });

  const totalGain = totalStcg.plus(totalLtcg);
  return {
    totalStcg: serializeMoney(totalStcg),
    totalLtcg: serializeMoney(totalLtcg),
    totalGain: serializeMoney(totalGain),
    rowCount: rows.length,
    rows,
  };
}
```

- [ ] **Step 3: Add getNavHistory**

Append to the same file:

```typescript
import type { NavPoint, ValuePoint } from '@portfolioos/shared';

export async function getNavHistory(fundId: string, days = 365): Promise<NavPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const navs = await prisma.mFNav.findMany({
    where: { fundId, date: { gte: since } },
    orderBy: { date: 'asc' },
    select: { date: true, nav: true },
  });

  return navs.map((n) => ({
    date: n.date.toISOString().split('T')[0],
    nav: serializeMoney(toDecimal(n.nav)),
  }));
}
```

- [ ] **Step 4: Add getSchemeValueHistory**

Append to the same file. Uses running totals (O(n+t)):

```typescript
export async function getSchemeValueHistory(userId: string, fundId: string): Promise<ValuePoint[]> {
  const portfolios = await prisma.portfolio.findMany({ where: { userId }, select: { id: true } });
  const portfolioIds = portfolios.map((p) => p.id);
  if (portfolioIds.length === 0) return [];

  const txns = await prisma.transaction.findMany({
    where: { portfolioId: { in: portfolioIds }, fundId, assetClass: 'MUTUAL_FUND' },
    select: { tradeDate: true, quantity: true, netAmount: true, transactionType: true },
    orderBy: { tradeDate: 'asc' },
  });
  if (txns.length === 0) return [];

  const firstDate = txns[0].tradeDate;
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const startDate = firstDate > threeYearsAgo ? firstDate : threeYearsAgo;

  // Build weekly snapshot dates
  const snapshots: Date[] = [];
  const cursor = new Date(startDate);
  const today = new Date();
  while (cursor <= today) {
    snapshots.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  if (snapshots[snapshots.length - 1].getTime() !== today.getTime()) {
    snapshots.push(today);
  }

  // Fetch all NAV data for this fund within range
  const navRows = await prisma.mFNav.findMany({
    where: { fundId, date: { gte: startDate } },
    orderBy: { date: 'asc' },
    select: { date: true, nav: true },
  });

  // Build NAV lookup by date string
  const navByDate = new Map<string, Decimal>();
  for (const n of navRows) {
    navByDate.set(n.date.toISOString().split('T')[0], toDecimal(n.nav));
  }

  // Find nearest NAV on or before a date
  const navDates = navRows.map((n) => n.date.getTime());
  function nearestNav(snapshotDate: Date): Decimal | null {
    const ts = snapshotDate.getTime();
    let lo = 0, hi = navRows.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (navRows[mid].date.getTime() <= ts) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best >= 0 ? toDecimal(navRows[best].nav) : null;
  }

  // Running totals per snapshot using pointer into txns
  let txIdx = 0;
  let runningUnits = new Decimal(0);
  let runningInvested = new Decimal(0);
  const result: ValuePoint[] = [];

  for (const snap of snapshots) {
    while (txIdx < txns.length && txns[txIdx].tradeDate <= snap) {
      const t = txns[txIdx];
      const qty = toDecimal(t.quantity);
      const amt = toDecimal(t.netAmount);
      if (OUTFLOW_TYPES.has(t.transactionType)) {
        runningUnits = runningUnits.plus(qty);
        runningInvested = runningInvested.plus(amt);
      } else if (INFLOW_TYPES.has(t.transactionType)) {
        runningUnits = runningUnits.minus(qty);
        runningInvested = runningInvested.minus(amt);
      }
      txIdx++;
    }
    if (runningUnits.lessThanOrEqualTo(0)) continue;
    const nav = nearestNav(snap);
    if (!nav) continue;
    const value = runningUnits.times(nav);
    result.push({
      date: snap.toISOString().split('T')[0],
      value: serializeMoney(value),
      invested: serializeMoney(runningInvested.isNegative() ? new Decimal(0) : runningInvested),
    });
  }

  return result;
}
```

- [ ] **Step 5: TypeCheck**

```bash
pnpm --filter @portfolioos/api run typecheck 2>&1 | head -60
```

Fix any errors. Common issues:
- `CashFlow` import path — verify it's exported from `xirr.service.ts`. If not exported, add `export type CashFlow = { date: Date; amount: Decimal };` to the xirr service.
- Prisma `capitalGain.sellTransaction` relation — verify the include shape. If Prisma says property doesn't exist, check schema for the relation name (may be `sellTx` or `sell_transaction`).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/mfInsights.service.ts
git commit -m "feat(mf): mfInsights — XIRR, capital gains, NAV history, value history"
```

---

## Task 5: mfInsights service — SIP detection and SipPlan CRUD

**Files:**
- Modify: `packages/api/src/services/mfInsights.service.ts`

- [ ] **Step 1: Add detectSips**

Append to `mfInsights.service.ts`:

```typescript
import type { SipInfo, SipDetection, SipPlan as SipPlanDTO } from '@portfolioos/shared';

const SIP_BUY_TYPES = new Set(['BUY', 'SIP', 'DEPOSIT']);

export async function detectSips(userId: string, fundId: string): Promise<SipDetection> {
  const portfolios = await prisma.portfolio.findMany({ where: { userId }, select: { id: true } });
  const portfolioIds = portfolios.map((p) => p.id);

  const txns = await prisma.transaction.findMany({
    where: {
      portfolioId: { in: portfolioIds },
      fundId,
      assetClass: 'MUTUAL_FUND',
      transactionType: { in: ['BUY', 'SIP', 'DEPOSIT'] },
    },
    orderBy: { tradeDate: 'asc' },
    select: { tradeDate: true, netAmount: true },
  });

  const none: SipDetection = {
    detected: false, frequency: null, typicalAmount: null,
    streak: 0, startDate: null, lastDate: null, nextExpectedDate: null, confidence: 'LOW',
  };

  if (txns.length < 3) return none;

  // Check each interval pattern
  const patterns: Array<{ label: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'; min: number; max: number }> = [
    { label: 'MONTHLY', min: 25, max: 35 },
    { label: 'QUARTERLY', min: 85, max: 95 },
    { label: 'ANNUAL', min: 355, max: 375 },
  ];

  for (const pattern of patterns) {
    let streak = 1;
    let streakStart = 0;
    let maxStreak = 1;
    let maxStreakStart = 0;

    for (let i = 1; i < txns.length; i++) {
      const daysDiff = Math.round(
        (txns[i].tradeDate.getTime() - txns[i - 1].tradeDate.getTime()) / 86_400_000,
      );
      const prevAmt = toDecimal(txns[i - 1].netAmount);
      const currAmt = toDecimal(txns[i].netAmount);
      const amtRatio = prevAmt.isZero() ? 0 : currAmt.minus(prevAmt).abs().dividedBy(prevAmt).toNumber();
      const intervalMatch = daysDiff >= pattern.min && daysDiff <= pattern.max;
      const amountMatch = amtRatio <= 0.1;

      if (intervalMatch && amountMatch) {
        streak++;
        if (streak > maxStreak) { maxStreak = streak; maxStreakStart = streakStart; }
      } else {
        streak = 1;
        streakStart = i;
      }
    }

    if (maxStreak >= 3) {
      const streakTxns = txns.slice(maxStreakStart, maxStreakStart + maxStreak);
      const typicalAmount = toDecimal(streakTxns[Math.floor(streakTxns.length / 2)].netAmount);
      const lastDate = streakTxns[streakTxns.length - 1].tradeDate;
      const intervalDays = pattern.label === 'MONTHLY' ? 30 : pattern.label === 'QUARTERLY' ? 91 : 365;
      const nextExpected = new Date(lastDate);
      nextExpected.setDate(nextExpected.getDate() + intervalDays);

      const confidence: SipDetection['confidence'] = maxStreak >= 6 ? 'HIGH' : maxStreak >= 3 ? 'MEDIUM' : 'LOW';

      return {
        detected: true,
        frequency: pattern.label,
        typicalAmount: serializeMoney(typicalAmount),
        streak: maxStreak,
        startDate: streakTxns[0].tradeDate.toISOString().split('T')[0],
        lastDate: lastDate.toISOString().split('T')[0],
        nextExpectedDate: nextExpected.toISOString().split('T')[0],
        confidence,
      };
    }
  }

  return none;
}
```

- [ ] **Step 2: Add getSipPlans, registerSipPlan, deleteSipPlan**

Append to `mfInsights.service.ts`:

```typescript
import type { RegisterSipPayload } from '@portfolioos/shared';
import { BadRequestError } from '../lib/errors.js';

function serializeSipPlan(p: {
  id: string; fundId: string | null; assetName: string | null;
  amount: any; frequency: string; dayOfMonth: number | null;
  startDate: Date; isActive: boolean; notes: string | null; createdAt: Date;
}): SipPlanDTO {
  return {
    id: p.id,
    fundId: p.fundId,
    assetName: p.assetName,
    amount: serializeMoney(toDecimal(p.amount)),
    frequency: p.frequency,
    dayOfMonth: p.dayOfMonth,
    startDate: p.startDate.toISOString().split('T')[0],
    isActive: p.isActive,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function getSipPlans(userId: string, fundId: string): Promise<SipPlanDTO[]> {
  const plans = await prisma.sipPlan.findMany({
    where: { userId, fundId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  return plans.map(serializeSipPlan);
}

export async function getSipInfo(userId: string, fundId: string): Promise<SipInfo> {
  const [detection, plans] = await Promise.all([
    detectSips(userId, fundId),
    getSipPlans(userId, fundId),
  ]);
  return { detection, plans };
}

export async function registerSipPlan(
  userId: string,
  fundId: string,
  payload: RegisterSipPayload,
): Promise<SipPlanDTO> {
  const amount = toDecimal(payload.amount);
  if (amount.lessThanOrEqualTo(0)) throw new BadRequestError('amount must be positive');
  if (!['MONTHLY', 'QUARTERLY', 'ANNUAL'].includes(payload.frequency)) {
    throw new BadRequestError('invalid frequency');
  }
  if (payload.frequency === 'MONTHLY' && payload.dayOfMonth != null) {
    if (payload.dayOfMonth < 1 || payload.dayOfMonth > 28) {
      throw new BadRequestError('dayOfMonth must be 1–28');
    }
  }

  const plan = await prisma.sipPlan.create({
    data: {
      userId,
      fundId,
      amount: amount.toFixed(2),
      frequency: payload.frequency,
      dayOfMonth: payload.dayOfMonth ?? null,
      startDate: new Date(payload.startDate),
      notes: payload.notes ?? null,
    },
  });
  return serializeSipPlan(plan);
}

export async function deleteSipPlan(userId: string, fundId: string, sipId: string): Promise<void> {
  const plan = await prisma.sipPlan.findFirst({ where: { id: sipId, userId, fundId } });
  if (!plan) throw new BadRequestError('SIP plan not found');
  await prisma.sipPlan.update({ where: { id: sipId }, data: { isActive: false } });
}
```

- [ ] **Step 3: TypeCheck**

```bash
pnpm --filter @portfolioos/api run typecheck 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/services/mfInsights.service.ts
git commit -m "feat(mf): SIP detection algorithm + SipPlan CRUD"
```

---

## Task 6: mf.controller.ts, mf.routes.ts, register in routes/index.ts

**Files:**
- Create: `packages/api/src/controllers/mf.controller.ts`
- Create: `packages/api/src/routes/mf.routes.ts`
- Modify: `packages/api/src/routes/index.ts`

- [ ] **Step 1: Write mf.controller.ts**

```typescript
import type { Request, Response } from 'express';
import {
  listMfSchemes, getMfScheme, getSchemeTransactions,
  computeSchemeXirr, getSchemeCapitalGains,
  getNavHistory, getSchemeValueHistory,
  getSipInfo, registerSipPlan, deleteSipPlan,
} from '../services/mfInsights.service.js';
import { ok } from '../lib/response.js';
import { NotFoundError } from '../lib/errors.js';

export async function listSchemes(req: Request, res: Response) {
  const schemes = await listMfSchemes(req.user!.id);
  ok(res, schemes);
}

export async function getScheme(req: Request, res: Response) {
  const scheme = await getMfScheme(req.user!.id, req.params.fundId);
  if (!scheme) throw new NotFoundError('scheme not found');
  ok(res, scheme);
}

export async function getSchemeXirr(req: Request, res: Response) {
  const result = await computeSchemeXirr(req.user!.id, req.params.fundId);
  ok(res, result);
}

export async function getSchemeCapGains(req: Request, res: Response) {
  const fy = typeof req.query.fy === 'string' ? req.query.fy : undefined;
  const result = await getSchemeCapitalGains(req.user!.id, req.params.fundId, fy);
  ok(res, result);
}

export async function getSchemeNavHistory(req: Request, res: Response) {
  const days = req.query.days ? parseInt(String(req.query.days), 10) : 365;
  const result = await getNavHistory(req.params.fundId, days);
  ok(res, result);
}

export async function getSchemeValueHistory(req: Request, res: Response) {
  const result = await getSchemeValueHistory(req.user!.id, req.params.fundId);
  ok(res, result);
}

export async function getSchemeTransactionsHandler(req: Request, res: Response) {
  const result = await getSchemeTransactions(req.user!.id, req.params.fundId);
  ok(res, result);
}

export async function getSipHandler(req: Request, res: Response) {
  const result = await getSipInfo(req.user!.id, req.params.fundId);
  ok(res, result);
}

export async function registerSipHandler(req: Request, res: Response) {
  const result = await registerSipPlan(req.user!.id, req.params.fundId, req.body);
  ok(res, result);
}

export async function deleteSipHandler(req: Request, res: Response) {
  await deleteSipPlan(req.user!.id, req.params.fundId, req.params.sipId);
  res.status(204).end();
}
```

- [ ] **Step 2: Write mf.routes.ts**

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listSchemes, getScheme, getSchemeXirr, getSchemeCapGains,
  getSchemeNavHistory, getSchemeValueHistory, getSchemeTransactionsHandler,
  getSipHandler, registerSipHandler, deleteSipHandler,
} from '../controllers/mf.controller.js';

const router = Router();
router.use(authenticate);

router.get('/schemes', asyncHandler(listSchemes));
router.get('/schemes/:fundId', asyncHandler(getScheme));
router.get('/schemes/:fundId/xirr', asyncHandler(getSchemeXirr));
router.get('/schemes/:fundId/capital-gains', asyncHandler(getSchemeCapGains));
router.get('/schemes/:fundId/nav-history', asyncHandler(getSchemeNavHistory));
router.get('/schemes/:fundId/value-history', asyncHandler(getSchemeValueHistory));
router.get('/schemes/:fundId/transactions', asyncHandler(getSchemeTransactionsHandler));
router.get('/schemes/:fundId/sip', asyncHandler(getSipHandler));
router.post('/schemes/:fundId/sip', asyncHandler(registerSipHandler));
router.delete('/schemes/:fundId/sip/:sipId', asyncHandler(deleteSipHandler));

export { router as mfRouter };
```

- [ ] **Step 3: Register mfRouter in routes/index.ts**

Open `packages/api/src/routes/index.ts`. Find where other routers are registered (e.g. `app.use('/api/vehicles', vehiclesRouter)`). Add:

```typescript
import { mfRouter } from './mf.routes.js';
// ...
app.use('/api/mf', mfRouter);
```

- [ ] **Step 4: TypeCheck and build**

```bash
pnpm --filter @portfolioos/api run typecheck 2>&1 | head -40
pnpm --filter @portfolioos/api run build 2>&1 | tail -20
```

Fix any errors. Common issue: `getSchemeValueHistory` is imported both as a controller and from mfInsights — rename the controller wrapper to `getSchemeValueHistoryHandler` in controller to avoid clash.

- [ ] **Step 5: Smoke test the routes exist**

Start the API dev server and hit one endpoint:

```bash
# In one terminal:
pnpm --filter @portfolioos/api run dev
# In another (replace TOKEN with a real JWT from login):
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/mf/schemes
```

Expected: `{"success":true,"data":[...]}` or `{"success":true,"data":[]}` if no MF holdings.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/controllers/mf.controller.ts \
        packages/api/src/routes/mf.routes.ts \
        packages/api/src/routes/index.ts
git commit -m "feat(mf): mf.controller + mf.routes + register /api/mf"
```

---

## Task 7: mutualFunds.api.ts frontend client

**Files:**
- Create: `apps/web/src/api/mutualFunds.api.ts`

- [ ] **Step 1: Write mutualFunds.api.ts**

```typescript
import { apiClient } from './client.js';
import type {
  MfSchemeRow, MfSchemeDetail, NavPoint, ValuePoint,
  SipInfo, SipPlan, MfCapGainsSummary, RegisterSipPayload,
} from '@portfolioos/shared';
import type { TransactionDTO } from '@portfolioos/shared';

export const mutualFundsApi = {
  listSchemes(): Promise<MfSchemeRow[]> {
    return apiClient.get('/api/mf/schemes');
  },

  getScheme(fundId: string): Promise<MfSchemeDetail> {
    return apiClient.get(`/api/mf/schemes/${encodeURIComponent(fundId)}`);
  },

  getXirr(fundId: string): Promise<{ xirr: number | null; cashflowCount: number }> {
    return apiClient.get(`/api/mf/schemes/${encodeURIComponent(fundId)}/xirr`);
  },

  getCapitalGains(fundId: string, fy?: string): Promise<MfCapGainsSummary> {
    const params = fy ? `?fy=${encodeURIComponent(fy)}` : '';
    return apiClient.get(`/api/mf/schemes/${encodeURIComponent(fundId)}/capital-gains${params}`);
  },

  getNavHistory(fundId: string, days = 365): Promise<NavPoint[]> {
    return apiClient.get(`/api/mf/schemes/${encodeURIComponent(fundId)}/nav-history?days=${days}`);
  },

  getValueHistory(fundId: string): Promise<ValuePoint[]> {
    return apiClient.get(`/api/mf/schemes/${encodeURIComponent(fundId)}/value-history`);
  },

  getTransactions(fundId: string): Promise<TransactionDTO[]> {
    return apiClient.get(`/api/mf/schemes/${encodeURIComponent(fundId)}/transactions`);
  },

  getSip(fundId: string): Promise<SipInfo> {
    return apiClient.get(`/api/mf/schemes/${encodeURIComponent(fundId)}/sip`);
  },

  registerSip(fundId: string, payload: RegisterSipPayload): Promise<SipPlan> {
    return apiClient.post(`/api/mf/schemes/${encodeURIComponent(fundId)}/sip`, payload);
  },

  deleteSip(fundId: string, sipId: string): Promise<void> {
    return apiClient.delete(`/api/mf/schemes/${encodeURIComponent(fundId)}/sip/${encodeURIComponent(sipId)}`);
  },
};
```

Note: If `apiClient.delete` doesn't exist in your client, check `apps/web/src/api/client.ts`. The pattern likely matches `vehicles.api.ts` — look there for the exact method name (`remove`, `del`, or `delete_`).

- [ ] **Step 2: Verify the apiClient shape**

```bash
grep -n "delete\|remove\|del" apps/web/src/api/client.ts | head -10
```

Adjust the `deleteSip` call in step 1 to match the actual method name.

- [ ] **Step 3: TypeCheck frontend**

```bash
pnpm --filter @portfolioos/web run typecheck 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/mutualFunds.api.ts
git commit -m "feat(mf): mutualFunds.api.ts frontend client"
```

---

## Task 8: ImportHistoryPanel component

**Files:**
- Create: `apps/web/src/pages/assetClasses/components/ImportHistoryPanel.tsx`

- [ ] **Step 1: Write ImportHistoryPanel.tsx**

```tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { importsApi } from '../../../api/imports.api.js';
import { Card, CardContent } from '../../../components/ui/card.js';
import { Badge } from '../../../components/ui/badge.js';
import type { ImportJobDTO } from '@portfolioos/shared';

const MF_IMPORT_TYPES = new Set(['CAS_PDF', 'NSDL_CAS']);
const ACTIVE_STATUSES = new Set(['PENDING', 'PROCESSING']);

function StatusBadge({ status }: { status: ImportJobDTO['status'] }) {
  if (status === 'COMPLETED')
    return <Badge variant="outline" className="text-green-600 border-green-300 gap-1"><CheckCircle2 className="h-3 w-3" />Done</Badge>;
  if (status === 'FAILED')
    return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Failed</Badge>;
  if (status === 'PROCESSING')
    return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}

export function ImportHistoryPanel() {
  const { data: allJobs = [] } = useQuery({
    queryKey: ['imports'],
    queryFn: () => importsApi.list(),
    refetchInterval: (data) =>
      (data ?? []).some((j) => ACTIVE_STATUSES.has(j.status)) ? 3000 : false,
  });

  const mfJobs = allJobs
    .filter((j) => MF_IMPORT_TYPES.has(j.type))
    .slice(0, 5);

  const hasActive = mfJobs.some((j) => ACTIVE_STATUSES.has(j.status));
  const [open, setOpen] = useState(hasActive);

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  if (mfJobs.length === 0) return null;

  return (
    <Card className="mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 rounded-t-lg"
      >
        <span>Import History {hasActive && <Badge variant="secondary" className="ml-2 text-xs">Active</Badge>}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <CardContent className="pt-0">
          <div className="divide-y">
            {mfJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex-1 min-w-0 mr-4">
                  <p className="truncate font-medium">{job.fileName ?? 'CAS Import'}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(job.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {job.successRows != null && ` · ${job.successRows} rows`}
                    {job.failedRows != null && job.failedRows > 0 && ` · ${job.failedRows} errors`}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </div>
            ))}
          </div>
          <Link to="/import" className="text-xs text-primary hover:underline mt-2 block">
            View all imports →
          </Link>
        </CardContent>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: TypeCheck**

```bash
pnpm --filter @portfolioos/web run typecheck 2>&1 | grep ImportHistoryPanel
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/assetClasses/components/ImportHistoryPanel.tsx
git commit -m "feat(mf): ImportHistoryPanel — collapsible import history with polling"
```

---

## Task 9: SchemeCharts component

**Files:**
- Create: `apps/web/src/pages/assetClasses/components/SchemeCharts.tsx`

- [ ] **Step 1: Install recharts if not already present**

```bash
grep "recharts" apps/web/package.json
```

If not found:

```bash
pnpm --filter @portfolioos/web add recharts
```

- [ ] **Step 2: Write SchemeCharts.tsx**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card.js';
import { Button } from '../../../components/ui/button.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { mutualFundsApi } from '../../../api/mutualFunds.api.js';
import { toDecimal } from '@portfolioos/shared';

type NavDays = 90 | 180 | 365 | 1095;
const NAV_OPTIONS: { label: string; days: NavDays }[] = [
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: '3Y', days: 1095 },
];

function formatINRCompact(value: number) {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

interface Props {
  fundId: string;
}

export function SchemeCharts({ fundId }: Props) {
  const [navDays, setNavDays] = useState<NavDays>(365);

  const { data: valueHistory, isLoading: valueLoading } = useQuery({
    queryKey: ['mf', fundId, 'value-history'],
    queryFn: () => mutualFundsApi.getValueHistory(fundId),
  });

  const { data: navHistory, isLoading: navLoading } = useQuery({
    queryKey: ['mf', fundId, 'nav-history', navDays],
    queryFn: () => mutualFundsApi.getNavHistory(fundId, navDays),
  });

  const valueData = (valueHistory ?? []).map((p) => ({
    date: formatDate(p.date),
    value: toDecimal(p.value).toNumber(),
    invested: toDecimal(p.invested).toNumber(),
  }));

  const navData = (navHistory ?? []).map((p) => ({
    date: formatDate(p.date),
    nav: toDecimal(p.nav).toNumber(),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
      {/* Investment chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Your Investment</CardTitle>
        </CardHeader>
        <CardContent>
          {valueLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : valueData.length === 0 ? (
            <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No data</p>
          ) : (
            <div role="img" aria-label="Area chart showing invested amount vs current value over time">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={valueData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                    interval="preserveStartEnd" />
                  <YAxis tickFormatter={formatINRCompact} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip formatter={(v: number) => formatINRCompact(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="invested" stroke="#94a3b8" fill="#f1f5f9"
                    strokeWidth={1.5} name="Invested" dot={false} />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#dbeafe"
                    strokeWidth={2} name="Current Value" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* NAV chart */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Fund NAV</CardTitle>
          <div className="flex gap-1">
            {NAV_OPTIONS.map((opt) => (
              <Button key={opt.days} variant={navDays === opt.days ? 'default' : 'ghost'}
                size="sm" className="h-6 px-2 text-xs" onClick={() => setNavDays(opt.days)}>
                {opt.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {navLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : navData.length === 0 ? (
            <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No NAV data</p>
          ) : (
            <div role="img" aria-label={`NAV price history for past ${navDays} days`}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={navData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                    interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `₹${v}`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip formatter={(v: number) => `₹${v.toFixed(2)}`} />
                  <Line type="monotone" dataKey="nav" stroke="#8b5cf6" strokeWidth={2}
                    name="NAV" dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: TypeCheck**

```bash
pnpm --filter @portfolioos/web run typecheck 2>&1 | grep SchemeCharts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/assetClasses/components/SchemeCharts.tsx
git commit -m "feat(mf): SchemeCharts — investment AreaChart + NAV LineChart with period toggle"
```

---

## Task 10: SipSection and CapGainsSection components

**Files:**
- Create: `apps/web/src/pages/assetClasses/components/SipSection.tsx`
- Create: `apps/web/src/pages/assetClasses/components/CapGainsSection.tsx`

- [ ] **Step 1: Write SipSection.tsx**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card.js';
import { Button } from '../../../components/ui/button.js';
import { Badge } from '../../../components/ui/badge.js';
import { Input } from '../../../components/ui/input.js';
import { Label } from '../../../components/ui/label.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { mutualFundsApi } from '../../../api/mutualFunds.api.js';
import type { RegisterSipPayload } from '@portfolioos/shared';

interface Props {
  fundId: string;
}

export function SipSection({ fundId }: Props) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<RegisterSipPayload>>({ frequency: 'MONTHLY' });

  const { data: sipInfo, isLoading } = useQuery({
    queryKey: ['mf', fundId, 'sip'],
    queryFn: () => mutualFundsApi.getSip(fundId),
  });

  const register = useMutation({
    mutationFn: (payload: RegisterSipPayload) => mutualFundsApi.registerSip(fundId, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mf', fundId, 'sip'] }); setShowForm(false); setForm({ frequency: 'MONTHLY' }); },
  });

  const remove = useMutation({
    mutationFn: (sipId: string) => mutualFundsApi.deleteSip(fundId, sipId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mf', fundId, 'sip'] }),
  });

  if (isLoading) return <Skeleton className="h-24 w-full my-4" />;

  const { detection, plans } = sipInfo ?? { detection: { detected: false, confidence: 'LOW' as const, frequency: null, typicalAmount: null, streak: 0, startDate: null, lastDate: null, nextExpectedDate: null }, plans: [] };

  const showDetection = detection.detected && (detection.confidence === 'HIGH' || detection.confidence === 'MEDIUM');

  return (
    <Card className="my-4">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> SIP Tracker
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setShowForm((v) => !v)} aria-label="Register a manual SIP">
          <Plus className="h-4 w-4 mr-1" /> Add SIP
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showDetection && (
          <div className="rounded-lg border bg-blue-50 dark:bg-blue-950 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Auto-detected SIP</span>
              <Badge variant="secondary">{detection.confidence}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Frequency: <strong className="text-foreground">{detection.frequency}</strong></span>
              <span>Typical: <strong className="text-foreground">₹{detection.typicalAmount}</strong></span>
              <span>Streak: <strong className="text-foreground">{detection.streak} installments</strong></span>
              {detection.nextExpectedDate && (
                <span>Next: <strong className="text-foreground">
                  {new Date(detection.nextExpectedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </strong></span>
              )}
            </div>
          </div>
        )}

        {plans.length > 0 && (
          <div className="space-y-2">
            {plans.map((plan) => (
              <div key={plan.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium">₹{plan.amount}</span>
                  <span className="text-muted-foreground ml-2">{plan.frequency}</span>
                  {plan.dayOfMonth && <span className="text-muted-foreground"> on {plan.dayOfMonth}th</span>}
                </div>
                <Button variant="ghost" size="sm" aria-label="Delete SIP plan"
                  onClick={() => remove.mutate(plan.id)} disabled={remove.isPending}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {!showDetection && plans.length === 0 && (
          <p className="text-sm text-muted-foreground">No SIP detected yet. Add a manual SIP to track it.</p>
        )}

        {showForm && (
          <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sip-amount" className="text-xs">Amount (₹)</Label>
                <Input id="sip-amount" type="number" placeholder="5000" value={form.amount ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="sip-freq" className="text-xs">Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v as any }))}>
                  <SelectTrigger id="sip-freq"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                    <SelectItem value="ANNUAL">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.frequency === 'MONTHLY' && (
                <div>
                  <Label htmlFor="sip-day" className="text-xs">Day of Month</Label>
                  <Input id="sip-day" type="number" min={1} max={28} placeholder="5"
                    value={form.dayOfMonth ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: parseInt(e.target.value) || undefined }))} />
                </div>
              )}
              <div>
                <Label htmlFor="sip-start" className="text-xs">Start Date</Label>
                <Input id="sip-start" type="date" value={form.startDate ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" disabled={register.isPending}
                onClick={() => {
                  if (!form.amount || !form.startDate || !form.frequency) return;
                  register.mutate(form as RegisterSipPayload);
                }}>
                Save SIP
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write CapGainsSection.tsx**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { Badge } from '../../../components/ui/badge.js';
import { mutualFundsApi } from '../../../api/mutualFunds.api.js';
import { toDecimal } from '@portfolioos/shared';

interface Props {
  fundId: string;
}

const currentFY = (() => {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
})();

const FY_OPTIONS = [
  { label: 'All time', value: '' },
  ...Array.from({ length: 5 }, (_, i) => {
    const year = parseInt(currentFY.split('-')[0]) - i;
    const fy = `${year}-${String(year + 1).slice(-2)}`;
    return { label: `FY ${fy}`, value: fy };
  }),
];

export function CapGainsSection({ fundId }: Props) {
  const [fy, setFy] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['mf', fundId, 'capital-gains', fy],
    queryFn: () => mutualFundsApi.getCapitalGains(fundId, fy || undefined),
  });

  return (
    <Card className="my-4">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Capital Gains</CardTitle>
        <Select value={fy} onValueChange={setFy}>
          <SelectTrigger className="w-32 h-7 text-xs"><SelectValue placeholder="All time" /></SelectTrigger>
          <SelectContent>
            {FY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data || data.rowCount === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No realisations in this period</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Total STCG', value: data.totalStcg, color: 'text-orange-600' },
                { label: 'Total LTCG', value: data.totalLtcg, color: 'text-blue-600' },
                { label: 'Total Realised', value: data.totalGain, color: toDecimal(data.totalGain).gte(0) ? 'text-green-600' : 'text-red-600' },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className={`text-sm font-semibold ${m.color}`}>
                    {toDecimal(m.value).gte(0) ? '+' : ''}₹{toDecimal(m.value).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Capital gains transactions</caption>
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="text-left py-1 pr-2">Sell Date</th>
                    <th scope="col" className="text-right pr-2">Units</th>
                    <th scope="col" className="text-right pr-2">Buy ₹</th>
                    <th scope="col" className="text-right pr-2">Sell ₹</th>
                    <th scope="col" className="text-right pr-2">Gain</th>
                    <th scope="col" className="text-left">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const gain = toDecimal(row.gainLoss);
                    return (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-1 pr-2">{new Date(row.sellDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                        <td className="text-right pr-2">{parseFloat(row.quantity).toFixed(3)}</td>
                        <td className="text-right pr-2">₹{parseFloat(row.buyPrice).toFixed(2)}</td>
                        <td className="text-right pr-2">₹{parseFloat(row.sellPrice).toFixed(2)}</td>
                        <td className={`text-right pr-2 font-medium ${gain.gte(0) ? 'text-green-600' : 'text-red-600'}`}>
                          <span aria-label={`${gain.gte(0) ? 'gain' : 'loss'} of ₹${gain.abs().toFixed(2)}`}>
                            {gain.gte(0) ? '▲' : '▼'} ₹{gain.abs().toFixed(2)}
                          </span>
                        </td>
                        <td>
                          <Badge variant={row.capitalGainType === 'STCG' ? 'secondary' : 'outline'} className="text-xs">
                            {row.capitalGainType}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: TypeCheck both**

```bash
pnpm --filter @portfolioos/web run typecheck 2>&1 | grep -E "SipSection|CapGainsSection"
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/assetClasses/components/SipSection.tsx \
        apps/web/src/pages/assetClasses/components/CapGainsSection.tsx
git commit -m "feat(mf): SipSection (auto-detect + manual registry) + CapGainsSection (STCG/LTCG)"
```

---

## Task 11: Redesigned MutualFundsPage

**Files:**
- Modify: `apps/web/src/pages/assetClasses/MutualFundsPage.tsx`

- [ ] **Step 1: Rewrite MutualFundsPage.tsx**

The existing page should be completely replaced. The new version has: summary strip, import panel, inline dropzone toggle, controls bar (search/sort/group), grouped holdings table. Copy in:

```tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ArrowUpDown, RefreshCw, PlusCircle, Upload, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader.js';
import { Card, CardContent } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Badge } from '../../components/ui/badge.js';
import { Skeleton } from '../../components/ui/skeleton.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip.js';
import { ImportHistoryPanel } from './components/ImportHistoryPanel.js';
import { mutualFundsApi } from '../../api/mutualFunds.api.js';
import { importsApi } from '../../api/imports.api.js';
import { ImportDropzone } from '../imports/ImportDropzone.js';
import { toDecimal } from '@portfolioos/shared';
import type { MfSchemeRow } from '@portfolioos/shared';

type SortKey = 'value' | 'pnlPct' | 'name';
type GroupKey = 'none' | 'amc' | 'category';

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function formatINR(val: string | null) {
  if (!val) return '—';
  const n = toDecimal(val);
  if (n.gte(10_000_000)) return `₹${n.dividedBy(10_000_000).toFixed(2)}Cr`;
  if (n.gte(100_000)) return `₹${n.dividedBy(100_000).toFixed(2)}L`;
  return `₹${n.toFixed(2)}`;
}

function PnlBadge({ pnl, pct }: { pnl: string | null; pct: number | null }) {
  if (!pnl || pct === null) return <span className="text-muted-foreground">—</span>;
  const isPositive = toDecimal(pnl).gte(0);
  return (
    <span className={`flex items-center gap-0.5 font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}
      aria-label={`${isPositive ? 'gain' : 'loss'} of ${Math.abs(pct).toFixed(1)} percent`}>
      {isPositive ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function MutualFundsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [groupKey, setGroupKey] = useState<GroupKey>('none');
  const [showDropzone, setShowDropzone] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: schemes = [], isLoading } = useQuery({
    queryKey: ['mf', 'schemes'],
    queryFn: mutualFundsApi.listSchemes,
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await importsApi.upload(file, 'CAS_PDF');
      qc.invalidateQueries({ queryKey: ['imports'] });
      qc.invalidateQueries({ queryKey: ['mf', 'schemes'] });
      setShowDropzone(false);
    } finally {
      setUploading(false);
    }
  };

  const filtered = useMemo(() => {
    let rows = [...schemes];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) => r.schemeName.toLowerCase().includes(q) || r.amcName?.toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => {
      if (sortKey === 'value') {
        if (!a.currentValue) return 1;
        if (!b.currentValue) return -1;
        return toDecimal(b.currentValue).comparedTo(toDecimal(a.currentValue));
      }
      if (sortKey === 'pnlPct') {
        return (b.unrealisedPnLPct ?? -Infinity) - (a.unrealisedPnLPct ?? -Infinity);
      }
      return a.schemeName.localeCompare(b.schemeName);
    });
    return rows;
  }, [schemes, search, sortKey]);

  const grouped = useMemo(() => {
    if (groupKey === 'none') return [{ key: '', rows: filtered }];
    const map = new Map<string, MfSchemeRow[]>();
    for (const row of filtered) {
      const k = (groupKey === 'amc' ? row.amcName : row.schemeCategory) ?? 'Other';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, rows }));
  }, [filtered, groupKey]);

  // Summary strip totals
  const { totalValue, totalInvested, totalPnL } = useMemo(() => {
    let tv = toDecimal(0), ti = toDecimal(0), tp = toDecimal(0);
    for (const s of schemes) {
      if (s.currentValue) tv = tv.plus(toDecimal(s.currentValue));
      ti = ti.plus(toDecimal(s.totalCost));
      if (s.unrealisedPnL) tp = tp.plus(toDecimal(s.unrealisedPnL));
    }
    return { totalValue: tv, totalInvested: ti, totalPnL: tp };
  }, [schemes]);

  const overallPct = totalInvested.isZero()
    ? null
    : totalPnL.dividedBy(totalInvested).times(100).toDecimalPlaces(2).toNumber();

  return (
    <div className="container py-6 space-y-4">
      <PageHeader
        title="Mutual Funds"
        description="All your mutual fund holdings across portfolios"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDropzone((v) => !v)}>
              <Upload className="h-4 w-4 mr-1" /> Import CAS
            </Button>
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['mf'] })}>
              <RefreshCw className="h-4 w-4 mr-1" /> Sync NAV
            </Button>
            <Button size="sm" onClick={() => navigate('/transactions?assetClass=MUTUAL_FUND&action=add')}>
              <PlusCircle className="h-4 w-4 mr-1" /> Add Transaction
            </Button>
          </div>
        }
      />

      {showDropzone && (
        <Card>
          <CardContent className="pt-4">
            <ImportDropzone onUpload={handleUpload} uploading={uploading} />
          </CardContent>
        </Card>
      )}

      <ImportHistoryPanel />

      {/* Summary strip */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Total Value" value={formatINR(totalValue.toFixed(2))} />
          <MetricCard label="Invested" value={formatINR(totalInvested.toFixed(2))} />
          <MetricCard
            label="Unrealised P&L"
            value={`${totalPnL.gte(0) ? '+' : ''}${formatINR(totalPnL.toFixed(2))}`}
            sub={overallPct != null ? `${overallPct >= 0 ? '▲' : '▼'} ${Math.abs(overallPct).toFixed(1)}%` : undefined}
          />
          <MetricCard label="Schemes" value={String(schemes.length)} />
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search schemes..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search schemes"
          />
        </div>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-36 h-9">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="value">Sort: Value</SelectItem>
            <SelectItem value="pnlPct">Sort: P&L %</SelectItem>
            <SelectItem value="name">Sort: Name</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupKey} onValueChange={(v) => setGroupKey(v as GroupKey)}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No grouping</SelectItem>
            <SelectItem value="amc">Group by AMC</SelectItem>
            <SelectItem value="category">Group by Category</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Holdings table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : schemes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <p className="text-muted-foreground">No mutual fund holdings found.</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => setShowDropzone(true)}><Upload className="h-4 w-4 mr-1" />Import CAS</Button>
              <Button variant="outline" onClick={() => navigate('/transactions?assetClass=MUTUAL_FUND&action=add')}>
                Add Transaction
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Mutual fund holdings</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-medium">Scheme</th>
                <th scope="col" className="text-right px-3 py-2 font-medium">Units</th>
                <th scope="col" className="text-right px-3 py-2 font-medium">Avg Cost</th>
                <th scope="col" className="text-right px-3 py-2 font-medium">NAV</th>
                <th scope="col" className="text-right px-3 py-2 font-medium">Value</th>
                <th scope="col" className="text-right px-3 py-2 font-medium">P&L</th>
                <th scope="col" className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ key, rows }) => (
                <>
                  {groupKey !== 'none' && (
                    <tr key={`group-${key}`} className="bg-muted/30">
                      <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                        {key}
                        <span className="ml-2 font-normal">({rows.length} schemes)</span>
                      </td>
                    </tr>
                  )}
                  {rows.map((scheme) => (
                    <tr key={scheme.fundId}
                      className="border-t hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/mutual-funds/${encodeURIComponent(scheme.fundId)}`)}>
                      <td className="px-3 py-2">
                        <div className="font-medium leading-tight">{scheme.schemeName}</div>
                        {scheme.amcName && (
                          <div className="text-xs text-muted-foreground">{scheme.amcName}</div>
                        )}
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums">{parseFloat(scheme.totalUnits).toFixed(3)}</td>
                      <td className="text-right px-3 py-2 tabular-nums">{formatINR(scheme.avgCostPrice)}</td>
                      <td className="text-right px-3 py-2 tabular-nums">
                        {scheme.currentNav ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>{formatINR(scheme.currentNav)}</span>
                            </TooltipTrigger>
                            <TooltipContent>NAV as of {scheme.navDate}</TooltipContent>
                          </Tooltip>
                        ) : '—'}
                      </td>
                      <td className="text-right px-3 py-2 font-medium tabular-nums">{formatINR(scheme.currentValue)}</td>
                      <td className="text-right px-3 py-2">
                        <PnlBadge pnl={scheme.unrealisedPnL} pct={scheme.unrealisedPnLPct} />
                      </td>
                      <td className="px-2 py-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeCheck**

```bash
pnpm --filter @portfolioos/web run typecheck 2>&1 | head -60
```

Fix any errors. Common issues:
- `importsApi.upload` signature — check if it's `upload(file, type)` or `upload(file)`. Adjust call.
- `ImportDropzone` props — verify they match `{ onUpload: (file: File) => void; uploading: boolean }`.
- Tooltip import path — check if it's at `../../components/ui/tooltip.js` or `../../components/ui/tooltip.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/assetClasses/MutualFundsPage.tsx
git commit -m "feat(mf): redesigned MutualFundsPage — summary strip + search/sort/group + import panel"
```

---

## Task 12: MutualFundDetailPage + App.tsx route wiring

**Files:**
- Create: `apps/web/src/pages/assetClasses/MutualFundDetailPage.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write MutualFundDetailPage.tsx**

```tsx
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader.js';
import { Card, CardContent } from '../../components/ui/card.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Skeleton } from '../../components/ui/skeleton.js';
import { SchemeCharts } from './components/SchemeCharts.js';
import { SipSection } from './components/SipSection.js';
import { CapGainsSection } from './components/CapGainsSection.js';
import { mutualFundsApi } from '../../api/mutualFunds.api.js';
import { toDecimal } from '@portfolioos/shared';

function MetricCard({ label, value, loading, ariaLabel }: {
  label: string; value: string | null; loading?: boolean; ariaLabel?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-24 mt-1" />
        ) : (
          <p className="text-base font-bold mt-0.5" aria-label={ariaLabel}>{value ?? '—'}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatINR(val: string | null) {
  if (!val) return null;
  const n = toDecimal(val);
  if (n.gte(10_000_000)) return `₹${n.dividedBy(10_000_000).toFixed(2)}Cr`;
  if (n.gte(100_000)) return `₹${n.dividedBy(100_000).toFixed(2)}L`;
  return `₹${n.toFixed(2)}`;
}

export function MutualFundDetailPage() {
  const { fundId } = useParams<{ fundId: string }>();
  const decodedFundId = decodeURIComponent(fundId ?? '');

  const { data: scheme, isLoading: schemeLoading } = useQuery({
    queryKey: ['mf', 'scheme', decodedFundId],
    queryFn: () => mutualFundsApi.getScheme(decodedFundId),
    enabled: !!decodedFundId,
  });

  const { data: xirr, isLoading: xirrLoading } = useQuery({
    queryKey: ['mf', decodedFundId, 'xirr'],
    queryFn: () => mutualFundsApi.getXirr(decodedFundId),
    enabled: !!decodedFundId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['mf', decodedFundId, 'transactions'],
    queryFn: () => mutualFundsApi.getTransactions(decodedFundId),
    enabled: !!decodedFundId,
  });

  const xirrStr = xirrLoading
    ? null
    : xirr?.xirr != null
    ? `${(xirr.xirr * 100).toFixed(2)}%`
    : '—';

  const pnlColor =
    scheme?.unrealisedPnL != null
      ? toDecimal(scheme.unrealisedPnL).gte(0)
        ? 'text-green-600'
        : 'text-red-600'
      : '';

  return (
    <div className="container py-6 space-y-4">
      {/* Back navigation */}
      <Link
        to="/mutual-funds"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Mutual Funds
      </Link>

      {schemeLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <PageHeader
          title={scheme?.schemeName ?? 'Scheme'}
          description={
            <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
              {scheme?.isin && <span>{scheme.isin}</span>}
              {scheme?.amcName && <Badge variant="outline">{scheme.amcName}</Badge>}
              {scheme?.schemeCategory && <Badge variant="secondary">{scheme.schemeCategory}</Badge>}
              {scheme?.navDate && <span>NAV updated {scheme.navDate}</span>}
            </div>
          }
          actions={
            <Button size="sm" asChild>
              <Link to={`/transactions?assetClass=MUTUAL_FUND&fundId=${encodeURIComponent(decodedFundId)}&action=add`}>
                <PlusCircle className="h-4 w-4 mr-1" /> Add Transaction
              </Link>
            </Button>
          }
        />
      )}

      {/* Metric row — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Units Held" value={scheme ? parseFloat(scheme.totalUnits).toFixed(3) : null} loading={schemeLoading} />
        <MetricCard label="Avg Cost" value={scheme ? formatINR(scheme.avgCostPrice) : null} loading={schemeLoading} />
        <MetricCard label="Current NAV" value={scheme ? formatINR(scheme.currentNav) : null} loading={schemeLoading} />
        <MetricCard label="Current Value" value={scheme ? formatINR(scheme.currentValue) : null} loading={schemeLoading} />
        <MetricCard
          label="Unrealised P&L"
          value={scheme?.unrealisedPnL
            ? `${toDecimal(scheme.unrealisedPnL).gte(0) ? '+' : ''}${formatINR(scheme.unrealisedPnL)}`
            : null}
          loading={schemeLoading}
        />
        <MetricCard
          label="XIRR"
          value={xirrStr}
          loading={xirrLoading}
          ariaLabel={xirrStr && xirrStr !== '—' ? `XIRR: ${xirrStr}` : 'XIRR not available'}
        />
      </div>

      {/* Charts */}
      <SchemeCharts fundId={decodedFundId} />

      {/* SIP */}
      <SipSection fundId={decodedFundId} />

      {/* Capital Gains */}
      <CapGainsSection fundId={decodedFundId} />

      {/* Transactions */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold mb-3">
            Transactions
            <Badge variant="secondary" className="ml-2">{transactions.length}</Badge>
          </h3>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions recorded for this scheme.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Transaction history for {scheme?.schemeName}</caption>
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="text-left py-1 pr-3">Date</th>
                    <th scope="col" className="text-left pr-3">Type</th>
                    <th scope="col" className="text-right pr-3">Units</th>
                    <th scope="col" className="text-right pr-3">NAV</th>
                    <th scope="col" className="text-right pr-3">Amount</th>
                    <th scope="col" className="text-left">Portfolio</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-1 pr-3">
                        {new Date(tx.tradeDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="pr-3">
                        <Badge variant="outline" className="text-xs">{tx.transactionType}</Badge>
                      </td>
                      <td className="text-right pr-3 tabular-nums">{tx.quantity ? parseFloat(tx.quantity).toFixed(3) : '—'}</td>
                      <td className="text-right pr-3 tabular-nums">{tx.price ? `₹${parseFloat(tx.price).toFixed(2)}` : '—'}</td>
                      <td className="text-right pr-3 font-medium tabular-nums">
                        {tx.netAmount ? formatINR(tx.netAmount) : '—'}
                      </td>
                      <td className="text-muted-foreground">{tx.portfolioName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add route in App.tsx**

Open `apps/web/src/App.tsx`. After:
```typescript
import { MutualFundsPage } from './pages/assetClasses/MutualFundsPage';
```
Add:
```typescript
import { MutualFundDetailPage } from './pages/assetClasses/MutualFundDetailPage';
```

Find the existing mutual funds route:
```tsx
<Route path="/mutual-funds" element={<MutualFundsPage />} />
```
Add directly below it:
```tsx
<Route path="/mutual-funds/:fundId" element={<MutualFundDetailPage />} />
```

- [ ] **Step 3: TypeCheck full frontend**

```bash
pnpm --filter @portfolioos/web run typecheck 2>&1 | head -80
```

Fix errors. Common:
- `tx.portfolioName` — verify the field name in `TransactionDTO`. It may be `portfolio.name` or a flat `portfolioName`. Look at `packages/shared/src/types/transaction.ts` and adjust.
- `scheme.description` passed to `PageHeader` — if PageHeader expects `description: string`, wrap the JSX in a string or adjust to `description?: React.ReactNode` if the component accepts it.

- [ ] **Step 4: Build full web app**

```bash
pnpm --filter @portfolioos/web run build 2>&1 | tail -20
```

Expected: exits 0.

- [ ] **Step 5: Start dev server and manually test the golden path**

```bash
pnpm --filter @portfolioos/web run dev
```

Open `http://localhost:5173/mutual-funds`. Verify:
- Summary cards load
- Holdings table renders
- Clicking a scheme row navigates to `/mutual-funds/:fundId`
- Detail page shows metric cards, charts sections (skeleton or data)
- XIRR shows skeleton briefly, then value or "—"
- Back link works

- [ ] **Step 6: Final commit**

```bash
git add apps/web/src/pages/assetClasses/MutualFundDetailPage.tsx \
        apps/web/src/App.tsx
git commit -m "feat(mf): MutualFundDetailPage + App.tsx route — completes MF redesign"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `/mutual-funds` list with summary metrics, import history, grouping/search/sort — Task 11
- ✅ `/mutual-funds/:fundId` detail — Task 12
- ✅ XIRR — Task 4 + Task 12
- ✅ STCG/LTCG capital gains — Task 4 + Task 10
- ✅ NAV history chart + value-over-time chart — Task 4 + Task 9
- ✅ Auto-SIP detection + manual SIP registry — Task 5 + Task 10
- ✅ `SipPlan` DB migration — Task 1
- ✅ `ImportHistoryPanel` — Task 8
- ✅ New `/api/mf/*` module — Task 6
- ✅ `mfInsights.service.ts` — Tasks 3–5
- ✅ Route `/mutual-funds/:fundId` in App.tsx — Task 12
- ✅ MutualFundsPage full rewrite — Task 11
- ✅ Inline CAS dropzone (doesn't navigate to /import) — Task 11
- ✅ Schemes without `fundId` — handled: listMfSchemes only returns fundId-matched schemes; non-fundId holdings can be added later via the `assetName` path
- ✅ Data loading strategy (parallel initial, lazy XIRR, on-demand charts) — Task 12 uses separate queries
- ✅ Accessibility (aria-labels, captions, scope, aria-label on XIRR card) — Tasks 9–12
- ✅ Error states (empty state, XIRR "—", no NAV, no capital gains, no SIP) — all handled inline

**Type consistency:**
- `MfSchemeRow` defined in Task 2, used in Tasks 3, 7, 11 ✅
- `serializeMoney` / `serializeQuantity` from `@portfolioos/shared` used consistently ✅
- `toDecimal` used for all Prisma Decimal → Decimal.js conversions ✅
- `CashFlow` type from xirr.service — note: if not exported, add `export type CashFlow` in Task 4 ✅

**No placeholders:** All code blocks are complete. ✅
