# Section 1 — Valuation Correctness & Trust — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate every misleading or unguarded number on the dashboard/analytics so the product is trustworthy enough to charge for.

**Architecture:** Targeted fixes, not rewrites. Backend calc engines already exist and are mostly correct (`xirr.service.ts`, `holdingsProjection.ts`, `dashboard.service.ts`). We add edge-guards (XIRR short-span), provenance (price as-of + staleness), an auto-apply layer for corporate actions, and a `valuationMethod` tag that the frontend uses to label/suppress misleading deltas. Pure-function logic is TDD'd in `packages/shared`/`packages/api` without DB; DB-touching logic uses the existing Vitest + Prisma harness (`packages/api/test/helpers`).

**Tech Stack:** TypeScript, Decimal.js, Prisma 5.22, Vitest 2.1, Express, React 18 + React Query + Tailwind.

**Prereqs for DB-touching tasks (3,5,6,7):** `pnpm docker:up && pnpm db:migrate` so a Postgres test DB is reachable. Pure tasks (1,2,4-helper) need no DB.

---

## File Structure

- **Create** `packages/api/src/services/xirr.reliability.ts` — pure span/reliability helpers for XIRR.
- **Create** `packages/api/src/services/xirr.reliability.test.ts` — unit tests.
- **Modify** `packages/api/src/services/xirr.service.ts` — extend `XirrResult` with `spanDays`, `reliable`.
- **Modify** `packages/api/src/services/analytics.service.ts` — surface reliability into `KpiBlock`.
- **Modify** `packages/shared/src/types/...` (KpiBlock) + `apps/web/src/api/analytics.api.ts` — type additions.
- **Modify** `apps/web/src/pages/analytics/widgets/KpiCards.tsx` — relabel XIRR when unreliable.
- **Create** `packages/api/src/services/valuationMethod.ts` (+ test) — map AssetClass → `MARKET|ACCRUAL|PAYOUT|MARKET_FX|COST`.
- **Modify** holdings API response + Stocks/holdings + dashboard top-holdings UI — use `valuationMethod` to label/suppress daily change.
- **Create** `packages/api/src/services/priceStaleness.ts` (+ test) — `isPriceStale()` pure helper.
- **Modify** `packages/api/prisma/schema.prisma` — add `priceAsOf DateTime?` to `HoldingProjection`; new migration.
- **Modify** `packages/api/src/services/holdingsProjection.ts` — stamp `priceAsOf` during price refresh.
- **Modify** dashboard payload + cards — scope metadata + tooltips (1e).
- **Create** `packages/api/src/services/corporateActionApply.service.ts` (+ test) — auto-generate CA transactions.
- **Create** `packages/api/src/jobs/corporateActionApplyJob.ts` — scheduled trigger.

---

## Task 1: XIRR short-span reliability guard (1a)

**Files:**
- Create: `packages/api/src/services/xirr.reliability.ts`
- Test: `packages/api/src/services/xirr.reliability.test.ts`
- Modify: `packages/api/src/services/xirr.service.ts` (XirrResult interface ~177-185; `computePortfolioXirr` return ~222-227; `computeUserXirr` ~251-256)

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/services/xirr.reliability.test.ts
import { describe, it, expect } from 'vitest';
import { spanDays, isXirrReliable, MIN_XIRR_DAYS } from './xirr.reliability.js';

describe('xirr reliability', () => {
  const d = (s: string) => new Date(s);
  it('computes span between earliest and latest flow date', () => {
    expect(spanDays([d('2026-01-01'), d('2026-04-01')])).toBe(90);
  });
  it('returns 0 for empty or single date', () => {
    expect(spanDays([])).toBe(0);
    expect(spanDays([d('2026-01-01')])).toBe(0);
  });
  it('marks sub-90-day windows unreliable', () => {
    expect(isXirrReliable(spanDays([d('2026-05-01'), d('2026-05-22')]))).toBe(false);
  });
  it('marks >=90-day windows reliable', () => {
    expect(isXirrReliable(MIN_XIRR_DAYS)).toBe(true);
    expect(isXirrReliable(400)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @portfolioos/api exec vitest run src/services/xirr.reliability.test.ts`
Expected: FAIL — cannot find module `./xirr.reliability.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/services/xirr.reliability.ts
/**
 * XIRR annualizes a return. Over a very short holding window a small absolute
 * move explodes into an absurd annualized rate (a -6% move over 3 weeks → -78%
 * "XIRR"). We surface a reliability flag so the UI can show the absolute return
 * instead until enough history exists.
 */
export const MIN_XIRR_DAYS = 90;

export function spanDays(dates: Date[]): number {
  if (dates.length < 2) return 0;
  let min = dates[0]!.getTime();
  let max = min;
  for (const dt of dates) {
    const t = dt.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return Math.round((max - min) / (24 * 60 * 60 * 1000));
}

export function isXirrReliable(span: number): boolean {
  return span >= MIN_XIRR_DAYS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @portfolioos/api exec vitest run src/services/xirr.reliability.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire reliability into XirrResult**

In `xirr.service.ts`, extend the interface (after line 185) and both return sites. Add import at top: `import { spanDays, isXirrReliable } from './xirr.reliability.js';`

```ts
export interface XirrResult {
  xirr: number | null;
  cashflowCount: number;
  totalInvested: string;
  terminalValue: string;
  spanDays: number;      // calendar days between earliest and latest cashflow
  reliable: boolean;     // false when span < MIN_XIRR_DAYS (annualization unstable)
}
```

In `computePortfolioXirr` (replace the return at ~222-227):

```ts
  const span = spanDays(flows.map((f) => f.date));
  return {
    xirr: xirr(flows),
    cashflowCount: flows.length,
    totalInvested: invested.toFixed(4),
    terminalValue: tv.toFixed(4),
    spanDays: span,
    reliable: isXirrReliable(span),
  };
```

In `computeUserXirr` (replace return at ~251-256):

```ts
  const span = spanDays(allFlows.map((f) => f.date));
  return {
    xirr: xirr(allFlows),
    cashflowCount: allFlows.length,
    totalInvested: invested.toFixed(4),
    terminalValue: tv.toFixed(4),
    spanDays: span,
    reliable: isXirrReliable(span),
  };
```

- [ ] **Step 6: Run typecheck + xirr tests**

Run: `pnpm --filter @portfolioos/api exec vitest run src/services/` then `pnpm --filter @portfolioos/api exec tsc -p tsconfig.json --noEmit`
Expected: PASS; no type errors. (Fix any other XirrResult consumers the compiler flags by reading `reliable`/`spanDays` as optional or supplying them.)

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/services/xirr.reliability.ts packages/api/src/services/xirr.reliability.test.ts packages/api/src/services/xirr.service.ts
git commit -m "fix(analytics): flag XIRR as unreliable for sub-90-day windows"
```

---

## Task 2: Surface XIRR reliability in KPIs + relabel UI (1a)

**Files:**
- Modify: `packages/api/src/services/analytics.service.ts` (`getKpis`, both scopes — add fields to returned object; KpiBlock type)
- Modify: KpiBlock type (find with `grep -rn "xirrOverall" packages/api/src packages/shared/src apps/web/src`)
- Modify: `apps/web/src/api/analytics.api.ts` (KpiBlock client type)
- Modify: `apps/web/src/pages/analytics/widgets/KpiCards.tsx:35-40`

- [ ] **Step 1: Add reliability to KpiBlock type**

Wherever `KpiBlock` is declared (likely `packages/api/src/services/analytics.service.ts` or a types file — confirm via grep), add:

```ts
  xirrReliable: boolean;
  xirrSpanDays: number;
```

- [ ] **Step 2: Populate in getKpis (portfolio scope)**

In `analytics.service.ts` portfolio-scope return (~123-133), add from the `overall` result:

```ts
      xirrReliable: overall.reliable,
      xirrSpanDays: overall.spanDays,
```

In user-scope return (~186-196), add from `userXirr`:

```ts
      xirrReliable: userXirr.reliable,
      xirrSpanDays: userXirr.spanDays,
```

- [ ] **Step 3: Mirror type on the web client**

In `apps/web/src/api/analytics.api.ts`, add `xirrReliable: boolean;` and `xirrSpanDays: number;` to the `KpiBlock` interface.

- [ ] **Step 4: Relabel the XIRR card when unreliable**

In `KpiCards.tsx`, replace the "XIRR overall" `MetricCard` (lines 35-40):

```tsx
      <MetricCard
        label="XIRR overall"
        value={kpis.xirrReliable ? pct(kpis.xirrOverall) : '—'}
        icon={TrendingUp}
        hint={
          kpis.xirrReliable
            ? `1Y ${pct(kpis.xirr1y, 1)} · 3Y ${pct(kpis.xirr3y, 1)} · 5Y ${pct(kpis.xirr5y, 1)}`
            : `Annualized return needs ${90 - kpis.xirrSpanDays > 0 ? 90 - kpis.xirrSpanDays : 0} more days · absolute ${formatPercent(unrealisedPct, 2, true)}`
        }
      />
```

- [ ] **Step 5: Typecheck web + api**

Run: `pnpm --filter @portfolioos/web exec tsc -b --noEmit` and `pnpm --filter @portfolioos/api exec tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/analytics.service.ts apps/web/src/api/analytics.api.ts apps/web/src/pages/analytics/widgets/KpiCards.tsx
git commit -m "feat(analytics): show absolute return + hide unstable XIRR until 90d history"
```

---

## Task 3: Price-staleness helper + provenance (1d)

**Files:**
- Create: `packages/api/src/services/priceStaleness.ts`
- Test: `packages/api/src/services/priceStaleness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/services/priceStaleness.test.ts
import { describe, it, expect } from 'vitest';
import { isPriceStale } from './priceStaleness.js';

describe('isPriceStale', () => {
  const now = new Date('2026-05-29T12:00:00Z'); // Friday
  it('fresh equity price (same day) is not stale', () => {
    expect(isPriceStale('EQUITY', new Date('2026-05-29T06:00:00Z'), now)).toBe(false);
  });
  it('equity price >3 days old is stale', () => {
    expect(isPriceStale('EQUITY', new Date('2026-05-25T06:00:00Z'), now)).toBe(true);
  });
  it('crypto price >1 day old is stale (24x7 market)', () => {
    expect(isPriceStale('CRYPTOCURRENCY', new Date('2026-05-27T12:00:00Z'), now)).toBe(true);
  });
  it('null as-of is treated as stale', () => {
    expect(isPriceStale('EQUITY', null, now)).toBe(true);
  });
  it('accrual classes are never stale (no market price)', () => {
    expect(isPriceStale('FIXED_DEPOSIT', null, now)).toBe(false);
    expect(isPriceStale('NSC', null, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @portfolioos/api exec vitest run src/services/priceStaleness.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/services/priceStaleness.ts
import type { AssetClass } from '@prisma/client';

// Accrual / cost / appraisal classes carry no market price — staleness is N/A.
const NON_MARKET: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'NSC', 'KVP', 'SCSS', 'SSY',
  'POST_OFFICE_MIS', 'POST_OFFICE_RD', 'POST_OFFICE_TD', 'POST_OFFICE_SAVINGS',
  'PPF', 'EPF', 'NPS', 'PMS', 'AIF', 'INSURANCE', 'ULIP',
  'REAL_ESTATE', 'PRIVATE_EQUITY', 'ART_COLLECTIBLES', 'CASH', 'OTHER',
  'BOND', 'GOVT_BOND', 'CORPORATE_BOND',
]);

const DAY = 24 * 60 * 60 * 1000;

/** Max age before a market price is considered stale, by class. */
function maxAgeDays(assetClass: AssetClass): number {
  // Crypto trades 24x7; equities/MF/commodity refresh on trading sessions
  // (allow a weekend + a holiday → 3 days).
  return assetClass === 'CRYPTOCURRENCY' ? 1 : 3;
}

export function isPriceStale(
  assetClass: AssetClass,
  asOf: Date | null,
  now: Date = new Date(),
): boolean {
  if (NON_MARKET.has(assetClass)) return false;
  if (!asOf) return true;
  return now.getTime() - asOf.getTime() > maxAgeDays(assetClass) * DAY;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @portfolioos/api exec vitest run src/services/priceStaleness.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Add `priceAsOf` to HoldingProjection schema**

In `packages/api/prisma/schema.prisma`, in `model HoldingProjection`, add after `currentPrice`:

```prisma
  priceAsOf     DateTime?
```

Run: `pnpm db:migrate --name add_holding_price_asof` (requires docker DB up). Then `pnpm db:generate`.

- [ ] **Step 6: Stamp priceAsOf during refresh**

In `holdingsProjection.ts` `refreshPricesForRows` (~563-572), the price feeds return a value but not a date. Extend `currentPriceFor`/`routePriceLookup` to also return the source row's date, OR fetch the latest price date alongside. Minimal approach: when `price` is set, also set `patch.priceAsOf = new Date();` as the refresh time (interim), and follow up by threading the true source date from the price feed in a later iteration. For now:

```ts
    if (price) {
      const qty = new Decimal(row.quantity.toString());
      const totalCost = new Decimal(row.totalCost.toString());
      const currentValue = qty.times(price);
      const pnl = currentValue.minus(totalCost);
      patch.currentPrice = price.toString();
      patch.currentValue = currentValue.toString();
      patch.unrealisedPnL = pnl.toString();
      patch.priceAsOf = new Date();
      didPatch = true;
    }
```

- [ ] **Step 7: Run api tests + typecheck**

Run: `pnpm --filter @portfolioos/api exec vitest run src/services/ test/` then `pnpm --filter @portfolioos/api exec tsc -p tsconfig.json --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/services/priceStaleness.ts packages/api/src/services/priceStaleness.test.ts packages/api/prisma/schema.prisma packages/api/prisma/migrations packages/api/src/services/holdingsProjection.ts
git commit -m "feat(prices): add price-staleness helper + priceAsOf provenance"
```

---

## Task 4: Surface price as-of + stale badge in holdings API & UI (1d)

**Files:**
- Modify: holdings controller/service that builds the `/holdings` + dashboard top-holdings response (find: `grep -rn "currentValue" packages/api/src/controllers packages/api/src/services/dashboard.service.ts | grep -i holding`)
- Modify: `apps/web/src/pages/assetClasses/*` holdings table + `apps/web/src/components/dashboard/*` top-holdings + `DashboardPage.tsx`

- [ ] **Step 1: Include priceAsOf + stale in holdings response**

In the holdings-list service, add `priceAsOf` to the selected fields and compute `stale: isPriceStale(h.assetClass, h.priceAsOf)` per row. Import `isPriceStale` from `../services/priceStaleness.js`.

- [ ] **Step 2: Add a stale indicator component (web)**

Create `apps/web/src/components/common/PriceAsOf.tsx`:

```tsx
import { formatDistanceToNow } from 'date-fns';

export function PriceAsOf({ asOf, stale }: { asOf: string | null; stale: boolean }) {
  if (!asOf) return null;
  return (
    <span
      title={`Price as of ${new Date(asOf).toLocaleString()}`}
      className={`text-[10px] ${stale ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
    >
      {stale ? '⚠ ' : ''}as of {formatDistanceToNow(new Date(asOf), { addSuffix: true })}
    </span>
  );
}
```

(Confirm `date-fns` is a dependency; if not, format `new Date(asOf).toLocaleDateString()` instead.)

- [ ] **Step 2b: Verify date-fns availability**

Run: `grep -n "date-fns" apps/web/package.json`
Expected: present. If absent, use `toLocaleDateString()` and skip the import.

- [ ] **Step 3: Render in the Stocks holdings table**

In `apps/web/src/pages/assetClasses/` Stocks page row, render `<PriceAsOf asOf={row.priceAsOf} stale={row.stale} />` under the LTP/Value cell.

- [ ] **Step 4: Typecheck + web test**

Run: `pnpm --filter @portfolioos/web exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src apps/web/src
git commit -m "feat(ui): show price as-of timestamp + stale-price badge on holdings"
```

---

## Task 5: valuationMethod tag — relabel accrual rows (1b)

**Files:**
- Create: `packages/api/src/services/valuationMethod.ts`
- Test: `packages/api/src/services/valuationMethod.test.ts`
- Modify: holdings response service (add `valuationMethod` per row)
- Modify: Stocks/holdings + dashboard top-holdings UI (label "Accrued" + suppress today's-change for non-MARKET rows)

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/services/valuationMethod.test.ts
import { describe, it, expect } from 'vitest';
import { valuationMethodFor } from './valuationMethod.js';

describe('valuationMethodFor', () => {
  it('equities/MF/crypto/gold are MARKET', () => {
    expect(valuationMethodFor('EQUITY')).toBe('MARKET');
    expect(valuationMethodFor('MUTUAL_FUND')).toBe('MARKET');
    expect(valuationMethodFor('CRYPTOCURRENCY')).toBe('MARKET');
    expect(valuationMethodFor('PHYSICAL_GOLD')).toBe('MARKET');
  });
  it('FD/RD/NSC/KVP/PO-compounding are ACCRUAL', () => {
    expect(valuationMethodFor('FIXED_DEPOSIT')).toBe('ACCRUAL');
    expect(valuationMethodFor('NSC')).toBe('ACCRUAL');
    expect(valuationMethodFor('POST_OFFICE_TD')).toBe('ACCRUAL');
  });
  it('SCSS/MIS/savings are PAYOUT', () => {
    expect(valuationMethodFor('SCSS')).toBe('PAYOUT');
    expect(valuationMethodFor('POST_OFFICE_MIS')).toBe('PAYOUT');
  });
  it('real estate/insurance/other are COST', () => {
    expect(valuationMethodFor('REAL_ESTATE')).toBe('COST');
    expect(valuationMethodFor('INSURANCE')).toBe('COST');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @portfolioos/api exec vitest run src/services/valuationMethod.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/api/src/services/valuationMethod.ts
import type { AssetClass } from '@prisma/client';

export type ValuationMethod = 'MARKET' | 'ACCRUAL' | 'PAYOUT' | 'COST';

const ACCRUAL: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'NSC', 'KVP', 'POST_OFFICE_TD', 'SSY', 'POST_OFFICE_RD',
]);
const PAYOUT: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'SCSS', 'POST_OFFICE_MIS', 'POST_OFFICE_SAVINGS',
]);
const MARKET: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'EQUITY', 'ETF', 'MUTUAL_FUND', 'CRYPTOCURRENCY', 'PHYSICAL_GOLD', 'PHYSICAL_SILVER',
  'GOLD_ETF', 'GOLD_BOND', 'REIT', 'INVIT', 'FOREIGN_EQUITY', 'FOREX_PAIR',
]);

/** How a holding's current value is derived — drives UI labeling. */
export function valuationMethodFor(assetClass: AssetClass): ValuationMethod {
  if (MARKET.has(assetClass)) return 'MARKET';
  if (ACCRUAL.has(assetClass)) return 'ACCRUAL';
  if (PAYOUT.has(assetClass)) return 'PAYOUT';
  return 'COST';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @portfolioos/api exec vitest run src/services/valuationMethod.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add valuationMethod to holdings response**

In the holdings-list service, map each row: `valuationMethod: valuationMethodFor(h.assetClass)`. Add to the API/type and the web `analytics.api.ts`/holdings types.

- [ ] **Step 6: UI — label accrued, suppress daily change**

In the holdings table row: when `valuationMethod !== 'MARKET'`, render the P&L column header/value with an "Accrued" tag (e.g. small caption "accrued interest") and DO NOT render any today's-change / daily-% element for that row. For `PAYOUT`/`COST`, show "—" for unrealised %.

- [ ] **Step 7: Typecheck (web + api)**

Run: `pnpm --filter @portfolioos/api exec tsc -p tsconfig.json --noEmit && pnpm --filter @portfolioos/web exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src apps/web/src
git commit -m "feat(holdings): tag valuation method; label accrual returns, suppress MTM deltas"
```

---

## Task 6: Net-worth denominator scope labels (1e)

**Files:**
- Modify: `packages/api/src/services/dashboard.service.ts` (`getDashboardNetWorth` return — add a `scope` descriptor block)
- Modify: `apps/web/src/pages/dashboard/DashboardPage.tsx` + dashboard metric cards (add scope tooltips)

- [ ] **Step 1: Add scope metadata to the dashboard payload**

In `getDashboardNetWorth` return object, add a static descriptor so the UI can render exactly what each number includes:

```ts
    scope: {
      totalNetWorth: 'Investments + vehicles + real estate (gross, before liabilities)',
      netWorthAfterLiabilities: 'Total net worth minus loans & credit-card outstanding',
      portfolioValue: 'Tradable + accrual holdings only (excludes real estate, vehicles)',
    },
```

- [ ] **Step 2: Render scope as tooltips on cards**

In `DashboardPage.tsx`, pass each `scope.*` string as a `title`/tooltip on the matching value card (Total Net Worth, Portfolio value, etc.). Reuse the existing Radix `Tooltip` already imported in the design system.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @portfolioos/api exec tsc -p tsconfig.json --noEmit && pnpm --filter @portfolioos/web exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/services/dashboard.service.ts apps/web/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat(dashboard): label the scope of every net-worth figure"
```

---

## Task 7: Corporate-actions auto-application (1c)  *(largest — DB-touching)*

**Files:**
- Create: `packages/api/src/services/corporateActionApply.service.ts`
- Test: `packages/api/test/services/corporateActionApply.test.ts`
- Create: `packages/api/src/jobs/corporateActionApplyJob.ts`
- Reference: `priceFeeds/corporateActions.service.ts` (CA source), `holdingsProjection.ts` `replayTransactions` (SPLIT/BONUS already replayed)

- [ ] **Step 1: Write the failing test (split keeps P&L continuous)**

```ts
// packages/api/test/services/corporateActionApply.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { withTestUser } from '../helpers/auth.js';          // confirm helper names via test/helpers
import { prisma } from '../../src/lib/prisma.js';
import { applyCorporateActionsForPortfolio } from '../../src/services/corporateActionApply.service.js';
import { recomputeForPortfolio } from '../../src/services/holdingsProjection.js';

describe('corporate action auto-apply', () => {
  it('1:2 split on 10 shares → 20 shares, avg cost halved, totalCost unchanged', async () => {
    await withTestUser(async ({ portfolioId, stockId }) => {
      // BUY 10 @ 1000 (totalCost 10000)
      await prisma.transaction.create({ data: /* BUY fixture: qty 10, price 1000, stockId, assetClass EQUITY */ {} as any });
      // CorporateAction: SPLIT ratio 2 (1→2) with exDate in the past
      await prisma.corporateAction.create({ data: /* type SPLIT, ratio 2, stockId, exDate past */ {} as any });

      await applyCorporateActionsForPortfolio(portfolioId);
      await recomputeForPortfolio(portfolioId);

      const h = await prisma.holdingProjection.findFirst({ where: { portfolioId, stockId } });
      expect(Number(h!.quantity)).toBe(20);
      expect(Number(h!.totalCost)).toBe(10000);          // cost basis preserved
      expect(Number(h!.avgCostPrice)).toBeCloseTo(500, 2); // halved
    });
  });
});
```

(Before writing, READ `packages/api/test/helpers/*` and an existing service test to copy the exact fixture/seed + RLS-context pattern; replace the `{} as any` placeholders with real transaction/CA fixtures matching the Prisma schema fields.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @portfolioos/api exec vitest run test/services/corporateActionApply.test.ts`
Expected: FAIL — `applyCorporateActionsForPortfolio` not exported.

- [ ] **Step 3: Implement the apply service**

```ts
// packages/api/src/services/corporateActionApply.service.ts
import { Decimal } from '@portfolioos/shared';
import { prisma } from '../lib/prisma.js';
import { recomputeForAsset } from './holdingsProjection.js';
import { assetKeyFromTransaction } from './assetKey.js';

/**
 * Turn stored CorporateAction rows into idempotent Transaction rows so the
 * weighted-average replay in holdingsProjection picks them up. Idempotency:
 * a deterministic sourceHash per (holding, corporateActionId) prevents the
 * same split/bonus/dividend being applied twice on re-runs.
 */
export async function applyCorporateActionsForPortfolio(portfolioId: string): Promise<number> {
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId, stockId: { not: null } },
  });
  let applied = 0;
  for (const h of holdings) {
    const actions = await prisma.corporateAction.findMany({
      where: { stockId: h.stockId!, exDate: { lte: new Date() } },
    });
    for (const ca of actions) {
      const sourceHash = `ca:${ca.id}:${h.id}`;
      const exists = await prisma.transaction.findFirst({ where: { sourceHash } });
      if (exists) continue;

      const qty = new Decimal(h.quantity.toString());
      const ratio = ca.ratio ? new Decimal(ca.ratio.toString()) : null;

      if (ca.type === 'SPLIT' && ratio && ratio.gt(0)) {
        // post-split delta qty = qty*(ratio-1); cost unchanged (SPLIT branch in replay)
        const deltaQty = qty.times(ratio.minus(1));
        await prisma.transaction.create({
          data: buildCaTx(h, ca, 'SPLIT', deltaQty, sourceHash),
        });
        applied++;
      } else if (ca.type === 'BONUS' && ratio && ratio.gt(0)) {
        const deltaQty = qty.times(ratio); // bonus n:m already expressed as ratio
        await prisma.transaction.create({
          data: buildCaTx(h, ca, 'BONUS', deltaQty, sourceHash),
        });
        applied++;
      }
      // DIVIDEND / MERGER / RIGHTS handled in a follow-up iteration.
    }
    await recomputeForAsset(portfolioId, h.assetKey);
  }
  return applied;
}

function buildCaTx(h: any, ca: any, type: string, qty: any, sourceHash: string) {
  // Fill required Transaction fields per schema. READ the schema's Transaction
  // model and an existing creation site (transaction.service.ts) to mirror
  // mandatory columns (portfolioId, assetClass, tradeDate, price, netAmount,
  // assetKey, stockId, etc.). SPLIT/BONUS carry price 0 / netAmount 0.
  return {
    portfolioId: h.portfolioId,
    assetClass: h.assetClass,
    assetKey: h.assetKey,
    stockId: h.stockId,
    assetName: h.assetName,
    isin: h.isin,
    transactionType: type,
    tradeDate: ca.exDate,
    quantity: qty.toString(),
    price: '0',
    netAmount: '0',
    sourceHash,
    sourceAdapter: 'CORPORATE_ACTION',
  } as any;
}
```

(Replace `any` with the proper Prisma types after reading the schema; the structure above is the contract.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @portfolioos/api exec vitest run test/services/corporateActionApply.test.ts`
Expected: PASS — qty 20, totalCost 10000, avgCost 500.

- [ ] **Step 5: Add the scheduled job**

```ts
// packages/api/src/jobs/corporateActionApplyJob.ts
import { prisma } from '../lib/prisma.js';
import { applyCorporateActionsForPortfolio } from '../services/corporateActionApply.service.js';

export async function runCorporateActionApplyAll(): Promise<{ portfolios: number; applied: number }> {
  const portfolios = await prisma.portfolio.findMany({ select: { id: true } });
  let applied = 0;
  for (const p of portfolios) applied += await applyCorporateActionsForPortfolio(p.id);
  return { portfolios: portfolios.length, applied };
}
```

Wire into the existing scheduler the same way `priceJobs`/`catalogJobs` register (READ `packages/api/src/jobs/index` or the scheduler bootstrap and mirror the pattern). Run after the daily corporate-action fetch.

- [ ] **Step 6: Full api test run + typecheck**

Run: `pnpm --filter @portfolioos/api exec vitest run && pnpm --filter @portfolioos/api exec tsc -p tsconfig.json --noEmit`
Expected: PASS; no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/services/corporateActionApply.service.ts packages/api/test/services/corporateActionApply.test.ts packages/api/src/jobs/corporateActionApplyJob.ts
git commit -m "feat(corp-actions): auto-apply splits & bonuses to holdings idempotently"
```

---

## Self-Review

**Spec coverage:** 1a → Tasks 1,2. 1b → Task 5. 1c → Task 7. 1d → Tasks 3,4. 1e → Task 6. All five covered.

**Placeholder scan:** Task 7 fixtures + `buildCaTx` carry explicit "READ the schema and mirror" instructions because the exact Transaction column set must be copied from the live schema — these are directed lookups, not vague TODOs. All other tasks contain complete code.

**Type consistency:** `XirrResult.reliable`/`spanDays` (Task 1) consumed in Task 2 `getKpis`; `KpiBlock.xirrReliable`/`xirrSpanDays` (Task 2) consumed in `KpiCards`; `valuationMethodFor`→`ValuationMethod` (Task 5) consistent; `isPriceStale` signature consistent across Tasks 3-4. Verified.

**Risks:** Tasks 3,5,6,7 touch the holdings/dashboard response shape — run the existing `test/` suite after each to catch contract breaks. Task 7 needs Postgres (`pnpm docker:up`).
