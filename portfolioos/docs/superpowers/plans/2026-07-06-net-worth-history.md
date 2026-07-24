# Net Worth History / Trend Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a daily net-worth snapshot per user, expose a period-filtered history API, and render a trend chart on the dashboard immediately after the net-worth headline.

**Architecture:** A new `NetWorthSnapshot` table (one row per user per day) is populated by a nightly `node-cron` job that reuses the existing `getDashboardNetWorth()` calculator (no re-implementation of net-worth math). A manual-trigger endpoint and a one-off backfill script both funnel through the same per-user snapshot logic. A read endpoint queries the table with a period filter and computes a first-vs-last summary. A Recharts area chart on the dashboard consumes it, matching the visual language of the existing "Portfolio value over time" chart.

**Tech Stack:** Node 20 + Express + Prisma 5 + PostgreSQL (existing RLS setup) / node-cron / decimal.js / React 18 + TanStack Query + Recharts (all already in use in this repo).

## Global Constraints

- Money is always `decimal.js` `Decimal` on the backend; API responses serialize money as strings via `serializeMoney()` from `@portfolioos/shared` — never raw `Number()`/`parseFloat()` on monetary fields (ESLint rule `portfolioos/no-money-coercion` will flag violations).
- Every new user-scoped Prisma model must be added to `USER_SCOPED_MODELS` in `packages/api/src/lib/prisma.ts` AND get a Postgres RLS policy in a migration, following the exact pattern in `prisma/migrations/20260421140000_phase_4_5_rls/migration.sql` (`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `CREATE POLICY ... USING (app_is_system() OR "userId" = app_current_user_id()) WITH CHECK (...)`).
- System/cron jobs that touch user-scoped tables across all users MUST run inside `runAsSystem()` (cross-tenant reads) or `runAsUser(userId, fn)` (single-user scope) from `packages/api/src/lib/requestContext.ts` — never as an unauthenticated request, or RLS silently returns zero rows / rejects writes.
- Maintenance/backfill scripts that need to write to an RLS-enabled table without going through the app's `portfolioos_app` DB role use a second `PrismaClient` constructed with `DIRECT_URL` (which connects as the `postgres` superuser role and is exempt from RLS regardless of session context) — see `prisma/migrations/20260421150000_phase_4_5_rls_app_role/migration.sql` for why, and `src/scripts/seedFmv.ts` for the existing pattern.
- Do not touch `getDashboardNetWorth` or `getDashboardNetWorthForScope`'s existing signature/return shape.
- No family-scoped history in this task — personal net-worth history only.
- Don't try to backfill real historical data — the backfill script seeds **today only**.

---

### Task 1: Schema — `NetWorthSnapshot` model + RLS migration

**Files:**
- Modify: `packages/api/prisma/schema.prisma` (add model near the FMV/AiUsage section, ~line 150 for the `User` back-relation, and a new model block after the `FmvSource` enum around line ~3081)
- Modify: `packages/api/src/lib/prisma.ts:18-60` (add `'NetWorthSnapshot'` to `USER_SCOPED_MODELS`)
- Create: `packages/api/prisma/migrations/20260706170000_net_worth_snapshot/migration.sql`

**Interfaces:**
- Produces: Prisma model `NetWorthSnapshot` with fields `id, userId, asOf (Date), totalNetWorth (Decimal 18,4), totalLiabilities (Decimal 18,4), netWorthAfterLiabilities (Decimal 18,4), breakdownJson (Json), createdAt, updatedAt`, unique on `(userId, asOf)`, delegate name `prisma.netWorthSnapshot`.

- [ ] **Step 1: Add the `User` back-relation**

Edit `packages/api/prisma/schema.prisma`. Find the end of the `User` model (currently ends with `fmvOverrides FmvOverride[]` around line 149, closing brace at line 150):

```prisma
  // Sec 55(2)(ac) grandfathering — user-entered/overridden FMV per ISIN as
  // on 31-Jan-2018. See FmvOverride model below.
  fmvOverrides FmvOverride[]

  // Net-worth history — one daily snapshot per user, powers the dashboard
  // trend chart. See NetWorthSnapshot model below.
  netWorthSnapshots NetWorthSnapshot[]
}
```

- [ ] **Step 2: Add the `NetWorthSnapshot` model**

Find the end of the `FmvSource` enum (after `USER // entered manually by the user`) and append:

```prisma

// ─── NET WORTH HISTORY ───────────────────────────────────────────────────
// One row per user per calendar day, computed from getDashboardNetWorth().
// Powers the dashboard trend chart. Real historical reconstruction is not
// possible (no daily historical prices for FDs/real estate/etc.), so the
// series starts from whenever the nightly cron (or the day-1 backfill
// script) first ran for that user.

model NetWorthSnapshot {
  id                       String   @id @default(cuid())
  userId                   String
  user                     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  asOf                     DateTime @db.Date
  totalNetWorth            Decimal  @db.Decimal(18, 4)
  totalLiabilities         Decimal  @db.Decimal(18, 4)
  netWorthAfterLiabilities Decimal  @db.Decimal(18, 4)
  // Snapshot of getDashboardNetWorth().allocationBreakdown at asOf — lets a
  // future stacked-by-asset-class chart render without widening this schema.
  breakdownJson            Json
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  @@unique([userId, asOf])
  @@index([userId, asOf])
}
```

- [ ] **Step 3: Register the model as user-scoped**

Edit `packages/api/src/lib/prisma.ts`. In the `USER_SCOPED_MODELS` set, add the new model right after `'FmvOverride'`:

```ts
  // Sec 55(2)(ac) grandfathering — user-entered FMV overrides. SystemFmvSeed
  // is deliberately excluded: it's shared reference data, not user-scoped.
  'FmvOverride',
  // Net-worth history — one row per user per day.
  'NetWorthSnapshot',
]);
```

- [ ] **Step 4: Generate the table-creation migration (create-only, don't apply yet)**

Run:
```bash
pnpm --filter @portfolioos/api exec prisma migrate dev --name net_worth_snapshot --create-only
```
Expected: creates `packages/api/prisma/migrations/<timestamp>_net_worth_snapshot/migration.sql` containing a `CREATE TABLE "NetWorthSnapshot" (...)`, a unique index, a non-unique index, and the FK to `User`. It should **not** yet be applied (no `Your database is now in sync` message — that's Step 6).

- [ ] **Step 5: Append the RLS policy to the generated migration**

Open the migration file generated in Step 4 and append this block at the end (mirrors `prisma/migrations/20260702140000_fmv_override_rls/migration.sql` exactly, and the same single-migration table+RLS bundling used in `20260701130000_family_hof_foundation`):

```sql

-- RLS: NetWorthSnapshot carries a direct userId column (§3.6). Bundled into
-- the same migration as the table creation (same pattern as
-- 20260701130000_family_hof_foundation and 20260603120000_aa_consent).
ALTER TABLE "NetWorthSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NetWorthSnapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY networthsnapshot_owner ON "NetWorthSnapshot"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
```

- [ ] **Step 6: Apply the migration**

Run:
```bash
pnpm db:migrate
```
Expected: prompts to apply the pending `net_worth_snapshot` migration (or applies immediately since it was already generated); ends with `Your database is now in sync with your schema.` Prisma Client is regenerated automatically.

- [ ] **Step 7: Verify RLS is live**

Run:
```bash
pnpm --filter @portfolioos/api exec prisma db execute --stdin <<'EOF'
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'NetWorthSnapshot';
EOF
```
Expected: one row, both columns `t` (true).

- [ ] **Step 8: Commit**

```bash
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations packages/api/src/lib/prisma.ts
git commit -m "feat(db): add NetWorthSnapshot model with RLS"
```

---

### Task 2: Read service — `netWorthHistory.service.ts`

**Files:**
- Create: `packages/api/src/services/netWorthHistory.service.ts`
- Test: `packages/api/test/services/netWorthHistory.test.ts`

**Interfaces:**
- Consumes: `prisma.netWorthSnapshot` (Task 1), `serializeMoney`/`toDecimal` from `@portfolioos/shared`, `createTestScope`/`runAsSystem` from test helpers.
- Produces: `export type NetWorthHistoryPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL'`, `export async function getNetWorthHistory(userId: string, period: NetWorthHistoryPeriod): Promise<NetWorthHistoryResult>` where `NetWorthHistoryResult = { points: NetWorthHistoryPoint[]; summary: { changeAbsolute: string; changePct: number | null; periodLabel: NetWorthHistoryPeriod } }` and `NetWorthHistoryPoint = { asOf: string; totalNetWorth: string; totalLiabilities: string; netWorthAfterLiabilities: string }`. Later tasks (controller, frontend) import these exact names.

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/services/netWorthHistory.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getNetWorthHistory } from '../../src/services/netWorthHistory.service.js';

describe('netWorthHistory.service', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('nw-history');

    // Seed snapshots at day-100, day-50, day-10, day-1 (relative to "today")
    // so period filtering has something to cut against.
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - n);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    };

    await runAsSystem(() =>
      prisma.netWorthSnapshot.createMany({
        data: [
          { userId: scope.userId, asOf: daysAgo(100), totalNetWorth: '1000000', totalLiabilities: '0', netWorthAfterLiabilities: '1000000', breakdownJson: [] },
          { userId: scope.userId, asOf: daysAgo(50), totalNetWorth: '1100000', totalLiabilities: '0', netWorthAfterLiabilities: '1100000', breakdownJson: [] },
          { userId: scope.userId, asOf: daysAgo(10), totalNetWorth: '1200000', totalLiabilities: '0', netWorthAfterLiabilities: '1200000', breakdownJson: [] },
          { userId: scope.userId, asOf: daysAgo(1), totalNetWorth: '1250000', totalLiabilities: '0', netWorthAfterLiabilities: '1250000', breakdownJson: [] },
        ],
      }),
    );
  });

  afterAll(async () => {
    await runAsSystem(() => prisma.netWorthSnapshot.deleteMany({ where: { userId: scope.userId } }));
    await scope.cleanup();
  });

  it('ALL returns every snapshot ordered by asOf ascending', async () => {
    const result = await scope.runAs(() => getNetWorthHistory(scope.userId, 'ALL'));
    expect(result.points).toHaveLength(4);
    expect(result.points[0].netWorthAfterLiabilities).toBe('1000000.0000');
    expect(result.points[3].netWorthAfterLiabilities).toBe('1250000.0000');
  });

  it('1M excludes snapshots older than 30 days', async () => {
    const result = await scope.runAs(() => getNetWorthHistory(scope.userId, '1M'));
    expect(result.points).toHaveLength(2); // day-10 and day-1
  });

  it('summary compares first vs last point in the window', async () => {
    const result = await scope.runAs(() => getNetWorthHistory(scope.userId, 'ALL'));
    // 1250000 - 1000000 = 250000
    expect(result.summary.changeAbsolute).toBe('250000.0000');
    expect(result.summary.changePct).toBeCloseTo(25, 5);
    expect(result.summary.periodLabel).toBe('ALL');
  });

  it('returns a null changePct (not zero-div) with a single point', async () => {
    const result = await scope.runAs(() => getNetWorthHistory(scope.userId, '1M'));
    // 1M window has 2 points here, so force a single-point case with a fresh scope
    const single = await createTestScope('nw-history-single');
    try {
      const daysAgo0 = new Date();
      const asOf = new Date(Date.UTC(daysAgo0.getUTCFullYear(), daysAgo0.getUTCMonth(), daysAgo0.getUTCDate()));
      await runAsSystem(() =>
        prisma.netWorthSnapshot.create({
          data: { userId: single.userId, asOf, totalNetWorth: '500000', totalLiabilities: '0', netWorthAfterLiabilities: '500000', breakdownJson: [] },
        }),
      );
      const r = await single.runAs(() => getNetWorthHistory(single.userId, 'ALL'));
      expect(r.points).toHaveLength(1);
      expect(r.summary.changePct).toBeNull();
      expect(r.summary.changeAbsolute).toBe('0.0000');
    } finally {
      await runAsSystem(() => prisma.netWorthSnapshot.deleteMany({ where: { userId: single.userId } }));
      await single.cleanup();
    }
    expect(result.points.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @portfolioos/api exec vitest run test/services/netWorthHistory.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/netWorthHistory.service.js'`

- [ ] **Step 3: Write the implementation**

Create `packages/api/src/services/netWorthHistory.service.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { serializeMoney, toDecimal } from '@portfolioos/shared';

export type NetWorthHistoryPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL';

const PERIOD_DAYS: Record<Exclude<NetWorthHistoryPeriod, 'ALL'>, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
};

export interface NetWorthHistoryPoint {
  asOf: string;
  totalNetWorth: string;
  totalLiabilities: string;
  netWorthAfterLiabilities: string;
}

export interface NetWorthHistorySummary {
  changeAbsolute: string;
  changePct: number | null;
  periodLabel: NetWorthHistoryPeriod;
}

export interface NetWorthHistoryResult {
  points: NetWorthHistoryPoint[];
  summary: NetWorthHistorySummary;
}

export async function getNetWorthHistory(
  userId: string,
  period: NetWorthHistoryPeriod,
): Promise<NetWorthHistoryResult> {
  const where: Prisma.NetWorthSnapshotWhereInput = { userId };
  if (period !== 'ALL') {
    const days = PERIOD_DAYS[period];
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    where.asOf = { gte: from };
  }

  const rows = await prisma.netWorthSnapshot.findMany({
    where,
    orderBy: { asOf: 'asc' },
    select: { asOf: true, totalNetWorth: true, totalLiabilities: true, netWorthAfterLiabilities: true },
  });

  const points: NetWorthHistoryPoint[] = rows.map((r) => ({
    asOf: r.asOf.toISOString().slice(0, 10),
    totalNetWorth: serializeMoney(r.totalNetWorth),
    totalLiabilities: serializeMoney(r.totalLiabilities),
    netWorthAfterLiabilities: serializeMoney(r.netWorthAfterLiabilities),
  }));

  let changeAbsolute = toDecimal(0);
  let changePct: number | null = null;
  if (rows.length >= 2) {
    const first = toDecimal(rows[0]!.netWorthAfterLiabilities);
    const last = toDecimal(rows[rows.length - 1]!.netWorthAfterLiabilities);
    changeAbsolute = last.minus(first);
    changePct = first.isZero() ? null : changeAbsolute.dividedBy(first.abs()).times(100).toNumber();
  }

  return {
    points,
    summary: {
      changeAbsolute: serializeMoney(changeAbsolute),
      changePct,
      periodLabel: period,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @portfolioos/api exec vitest run test/services/netWorthHistory.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/netWorthHistory.service.ts packages/api/test/services/netWorthHistory.test.ts
git commit -m "feat(intelligence): net worth history read service with period filtering"
```

---

### Task 3: Snapshot job — `netWorthSnapshotJob.ts`

**Files:**
- Create: `packages/api/src/jobs/netWorthSnapshotJob.ts`
- Modify: `packages/api/src/index.ts` (wire `startNetWorthSnapshotJob()`)
- Test: `packages/api/test/invariants/net-worth-snapshot-idempotency.test.ts`

**Interfaces:**
- Consumes: `getDashboardNetWorth(userId)` from `../services/dashboard.service.js` (existing, unchanged), `runAsSystem`/`runAsUser` from `../lib/requestContext.js`.
- Produces: `export async function runNetWorthSnapshotForUser(userId: string, asOf?: Date): Promise<NetWorthSnapshot>` (Prisma row type), `export async function runNetWorthSnapshotJob(): Promise<void>`, `export function startNetWorthSnapshotJob(): void`. Task 4 (controller) imports `runNetWorthSnapshotForUser`.

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/invariants/net-worth-snapshot-idempotency.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { runNetWorthSnapshotForUser } from '../../src/jobs/netWorthSnapshotJob.js';

/**
 * INVARIANT: running the daily net-worth snapshot job twice for the same
 * user on the same day must upsert, never duplicate (§3.3 / spec Task 4).
 */
describe('net worth snapshot idempotency', () => {
  let scope: TestScope;

  afterAll(async () => {
    await runAsSystem(() => prisma.netWorthSnapshot.deleteMany({ where: { userId: scope.userId } }));
    await scope.cleanup();
  });

  it('running the job twice the same day yields exactly one row', async () => {
    scope = await createTestScope('nw-snapshot-idem');
    const fixedAsOf = new Date(Date.UTC(2026, 5, 1)); // 2026-06-01, fixed so re-runs land on the same day

    await runNetWorthSnapshotForUser(scope.userId, fixedAsOf);
    await runNetWorthSnapshotForUser(scope.userId, fixedAsOf);

    const rows = await runAsSystem(() =>
      prisma.netWorthSnapshot.findMany({ where: { userId: scope.userId } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.asOf.toISOString().slice(0, 10)).toBe('2026-06-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @portfolioos/api exec vitest run test/invariants/net-worth-snapshot-idempotency.test.ts`
Expected: FAIL — `Cannot find module '../../src/jobs/netWorthSnapshotJob.js'`

- [ ] **Step 3: Write the implementation**

Create `packages/api/src/jobs/netWorthSnapshotJob.ts`:

```ts
/**
 * Daily net-worth snapshot cron.
 *
 * Iterates every active user, reuses getDashboardNetWorth() (no re-implementing
 * net-worth math), and upserts one NetWorthSnapshot row per user per day so the
 * dashboard trend chart has a time series to render.
 *
 * Scheduled comfortably after the last EOD price refresh of the day
 * (commodities @23:30 IST — see priceJobs.ts) so today's closing prices have
 * landed in HoldingProjection before the snapshot reads it.
 */

import cron from 'node-cron';
import type { NetWorthSnapshot } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import { prisma } from '../lib/prisma.js';
import { getDashboardNetWorth } from '../services/dashboard.service.js';

const TZ = 'Asia/Kolkata';
let running = false;

function todayAsOf(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function runNetWorthSnapshotForUser(
  userId: string,
  asOf: Date = todayAsOf(),
): Promise<NetWorthSnapshot> {
  return runAsUser(userId, async () => {
    const nw = await getDashboardNetWorth(userId);
    return prisma.netWorthSnapshot.upsert({
      where: { userId_asOf: { userId, asOf } },
      create: {
        userId,
        asOf,
        totalNetWorth: nw.totalNetWorth,
        totalLiabilities: nw.totalLiabilities,
        netWorthAfterLiabilities: nw.netWorthAfterLiabilities,
        breakdownJson: nw.allocationBreakdown,
      },
      update: {
        totalNetWorth: nw.totalNetWorth,
        totalLiabilities: nw.totalLiabilities,
        netWorthAfterLiabilities: nw.netWorthAfterLiabilities,
        breakdownJson: nw.allocationBreakdown,
      },
    });
  });
}

export async function runNetWorthSnapshotJob(): Promise<void> {
  if (running) {
    logger.warn('[cron] net worth snapshot job already running — skipping');
    return;
  }
  running = true;
  const t0 = Date.now();
  let ok = 0;
  let failed = 0;
  try {
    const users = await runAsSystem(() =>
      prisma.user.findMany({ where: { isActive: true }, select: { id: true } }),
    );
    const asOf = todayAsOf();
    for (const u of users) {
      try {
        await runNetWorthSnapshotForUser(u.id, asOf);
        ok++;
      } catch (err) {
        failed++;
        logger.error({ err, userId: u.id }, '[cron] net worth snapshot failed for user');
      }
    }
    logger.info({ ok, failed, ms: Date.now() - t0 }, '[cron] net worth snapshot job done');
  } catch (err) {
    logger.error({ err }, '[cron] net worth snapshot job failed');
  } finally {
    running = false;
  }
}

export function startNetWorthSnapshotJob(): void {
  if (process.env.ENABLE_NET_WORTH_SNAPSHOT_CRON === 'false') {
    logger.info('[cron] net worth snapshot job disabled via ENABLE_NET_WORTH_SNAPSHOT_CRON=false');
    return;
  }
  // 23:45 IST daily — after AMFI NAV (22:00), stock EOD (16:30 Mon-Fri) and
  // commodities EOD (23:30) so today's closing prices have landed first.
  cron.schedule('45 23 * * *', () => void runNetWorthSnapshotJob(), { timezone: TZ });
  logger.info('[cron] scheduled: net worth snapshot @23:45 IST');
}
```

- [ ] **Step 4: Wire into `index.ts`**

Edit `packages/api/src/index.ts`. Add the import near the other job imports (after `import { startAlertJobs } from './jobs/alertJobs.js';`):

```ts
import { startAlertJobs } from './jobs/alertJobs.js';
import { startNetWorthSnapshotJob } from './jobs/netWorthSnapshotJob.js';
import { startFoExpiryJob } from './jobs/foExpiryClose.job.js';
```

And add the call in the `server.listen` callback, next to `startAlertJobs()`:

```ts
  startAlertJobs();
  startNetWorthSnapshotJob();
  startFoExpiryJob();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @portfolioos/api exec vitest run test/invariants/net-worth-snapshot-idempotency.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/jobs/netWorthSnapshotJob.ts packages/api/src/index.ts packages/api/test/invariants/net-worth-snapshot-idempotency.test.ts
git commit -m "feat(intelligence): daily net worth snapshot cron job"
```

---

### Task 4: RLS isolation test for `NetWorthSnapshot`

**Files:**
- Create: `packages/api/test/invariants/net-worth-snapshot-rls.test.ts`

**Interfaces:**
- Consumes: `createTestScope`, `runAsSystem`, `runAsUser` (same helpers as `test/invariants/rls-isolation.test.ts`).

- [ ] **Step 1: Write the test (this exercises the RLS policy from Task 1 — no new implementation needed, so there's no "make it fail then pass" cycle; run it once to confirm the policy from Task 1 actually holds)**

Create `packages/api/test/invariants/net-worth-snapshot-rls.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser, runAsSystem } from '../../src/lib/requestContext.js';

/**
 * INVARIANT: Postgres RLS isolates NetWorthSnapshot rows by owner, same as
 * every other user-scoped table (§3.6). Follows the pattern established in
 * test/invariants/rls-isolation.test.ts.
 */
describe('invariant: NetWorthSnapshot RLS isolation (§3.6)', () => {
  let scopeA: TestScope;
  let scopeB: TestScope;
  const asOf = new Date(Date.UTC(2026, 5, 15));

  beforeAll(async () => {
    scopeA = await createTestScope('nw-rls-a');
    scopeB = await createTestScope('nw-rls-b');

    await runAsSystem(async () => {
      await prisma.netWorthSnapshot.create({
        data: {
          userId: scopeA.userId, asOf,
          totalNetWorth: '100', totalLiabilities: '0', netWorthAfterLiabilities: '100',
          breakdownJson: [],
        },
      });
      await prisma.netWorthSnapshot.create({
        data: {
          userId: scopeB.userId, asOf,
          totalNetWorth: '200', totalLiabilities: '0', netWorthAfterLiabilities: '200',
          breakdownJson: [],
        },
      });
    });
  });

  afterAll(async () => {
    await runAsSystem(() =>
      prisma.netWorthSnapshot.deleteMany({ where: { userId: { in: [scopeA.userId, scopeB.userId] } } }),
    );
    await scopeA.cleanup();
    await scopeB.cleanup();
  });

  it("user A cannot read user B's snapshot", async () => {
    const rows = await runAsUser(scopeA.userId, () =>
      prisma.netWorthSnapshot.findMany({ where: { asOf } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(scopeA.userId);
  });

  it("user A cannot update user B's snapshot", async () => {
    const result = await runAsUser(scopeA.userId, () =>
      prisma.netWorthSnapshot.updateMany({
        where: { userId: scopeB.userId },
        data: { totalNetWorth: '999999' },
      }),
    );
    expect(result.count).toBe(0);
  });

  it('runAsSystem sees both rows', async () => {
    const rows = await runAsSystem(() =>
      prisma.netWorthSnapshot.findMany({ where: { asOf } }),
    );
    expect(rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @portfolioos/api exec vitest run test/invariants/net-worth-snapshot-rls.test.ts`
Expected: PASS (3 tests). If it fails, the RLS policy from Task 1 Step 5 was not applied correctly — go back and re-check `pg_class.relrowsecurity`.

- [ ] **Step 3: Commit**

```bash
git add packages/api/test/invariants/net-worth-snapshot-rls.test.ts
git commit -m "test(invariants): RLS isolation coverage for NetWorthSnapshot"
```

---

### Task 5: Backend read + manual-trigger API

**Files:**
- Modify: `packages/api/src/controllers/intelligence.controller.ts`
- Modify: `packages/api/src/routes/intelligence.routes.ts`

**Interfaces:**
- Consumes: `getNetWorthHistory` (Task 2), `runNetWorthSnapshotForUser` (Task 3), `ok` from `../lib/response.js`, `UnauthorizedError`/`BadRequestError` from `../lib/errors.js`.
- Produces: `GET /api/intelligence/net-worth/history?period=...` and `POST /api/intelligence/net-worth/snapshot`, both mounted under the existing `authenticate`-gated `intelligenceRouter`.

- [ ] **Step 1: Add controller handlers**

Edit `packages/api/src/controllers/intelligence.controller.ts`. Current full file:

```ts
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

Replace with:

```ts
import type { Request, Response } from 'express';
import { computeHealthScore } from '../services/healthScore.service.js';
import { getNetWorthHistory, type NetWorthHistoryPeriod } from '../services/netWorthHistory.service.js';
import { runNetWorthSnapshotForUser } from '../jobs/netWorthSnapshotJob.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError, BadRequestError } from '../lib/errors.js';
import { serializeMoney } from '@portfolioos/shared';

export async function getHealthScore(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const force = req.query['force'] === 'true';
  const data = await computeHealthScore(req.user.id, { force });
  return ok(res, data);
}

const VALID_PERIODS: NetWorthHistoryPeriod[] = ['1M', '3M', '6M', '1Y', 'ALL'];

export async function getNetWorthHistoryHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const period = (req.query['period'] as string | undefined) ?? '1Y';
  if (!VALID_PERIODS.includes(period as NetWorthHistoryPeriod)) {
    throw new BadRequestError(`Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`);
  }
  const data = await getNetWorthHistory(req.user.id, period as NetWorthHistoryPeriod);
  return ok(res, data);
}

// Manual trigger — same pattern as insurance.controller.ts's
// triggerRenewalAlertsHandler: scoped to the calling user only, no
// admin/role gate (there is no admin UserRole in this codebase; this
// repo's existing manual-trigger endpoints are all self-service).
export async function triggerNetWorthSnapshotHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const snapshot = await runNetWorthSnapshotForUser(req.user.id);
  return ok(res, {
    asOf: snapshot.asOf.toISOString().slice(0, 10),
    totalNetWorth: serializeMoney(snapshot.totalNetWorth),
    totalLiabilities: serializeMoney(snapshot.totalLiabilities),
    netWorthAfterLiabilities: serializeMoney(snapshot.netWorthAfterLiabilities),
  });
}
```

- [ ] **Step 2: Add routes**

Edit `packages/api/src/routes/intelligence.routes.ts`. Current full file:

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { getHealthScore } from '../controllers/intelligence.controller.js';

export const intelligenceRouter = Router();
intelligenceRouter.use(authenticate);

intelligenceRouter.get('/health-score', asyncHandler(getHealthScore));
```

Replace with:

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getHealthScore,
  getNetWorthHistoryHandler,
  triggerNetWorthSnapshotHandler,
} from '../controllers/intelligence.controller.js';

export const intelligenceRouter = Router();
intelligenceRouter.use(authenticate);

intelligenceRouter.get('/health-score', asyncHandler(getHealthScore));
intelligenceRouter.get('/net-worth/history', asyncHandler(getNetWorthHistoryHandler));
// Manual trigger — lets QA/backfill create a snapshot without waiting for
// the 23:45 IST cron (spec §Goal 2).
intelligenceRouter.post('/net-worth/snapshot', asyncHandler(triggerNetWorthSnapshotHandler));
```

- [ ] **Step 3: Manual smoke test**

Start the API (`pnpm dev:api`), then with a valid access token:

```bash
curl -X POST http://localhost:3000/api/intelligence/net-worth/snapshot -H "Authorization: Bearer <token>"
curl "http://localhost:3000/api/intelligence/net-worth/history?period=ALL" -H "Authorization: Bearer <token>"
```

Expected: first call returns `{ success: true, data: { asOf, totalNetWorth, ... } }`; second returns `{ success: true, data: { points: [...at least one...], summary: {...} } }`.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/controllers/intelligence.controller.ts packages/api/src/routes/intelligence.routes.ts
git commit -m "feat(intelligence): net worth history + manual snapshot trigger endpoints"
```

---

### Task 6: Backfill script

**Files:**
- Create: `packages/api/src/scripts/backfillNetWorthHistory.ts`
- Modify: `packages/api/package.json` (add a script entry)

**Interfaces:**
- Consumes: `getDashboardNetWorth` (existing), `runAsUser` (existing).
- Produces: a standalone script runnable via `pnpm --filter @portfolioos/api backfill:net-worth-history`.

- [ ] **Step 1: Write the script**

Create `packages/api/src/scripts/backfillNetWorthHistory.ts`:

```ts
/**
 * One-off backfill: seeds a NetWorthSnapshot for TODAY ONLY, for every
 * existing active user. There is no reliable source for real historical
 * net worth (no daily historical valuations for FDs/real estate/vehicles),
 * so this only gives the trend chart a day-1 starting point instead of an
 * empty state right after deploy — the nightly cron (netWorthSnapshotJob)
 * takes over from here.
 *
 * Follows the direct-DB-connection pattern from prisma/seed.ts and
 * src/scripts/seedFmv.ts: a second PrismaClient pointed at DIRECT_URL
 * (connects as the `postgres` superuser role, which is exempt from RLS
 * regardless of session context — see
 * prisma/migrations/20260421150000_phase_4_5_rls_app_role/migration.sql).
 * That client is used ONLY for the NetWorthSnapshot write; getDashboardNetWorth
 * still reads through the shared RLS-wrapped client via runAsUser so its
 * internal HoldingProjection/Vehicle/RentalProperty/etc. queries stay
 * correctly scoped to each user.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { runAsUser } from '../lib/requestContext.js';
import { getDashboardNetWorth } from '../services/dashboard.service.js';

const directPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' } },
});

function todayAsOf(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function backfill() {
  const asOf = todayAsOf();
  const users = await directPrisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  console.log(`Backfilling day-1 net worth snapshot for ${users.length} users (asOf=${asOf.toISOString().slice(0, 10)})...`);

  let done = 0;
  let failed = 0;
  for (const u of users) {
    try {
      const nw = await runAsUser(u.id, () => getDashboardNetWorth(u.id));
      await directPrisma.netWorthSnapshot.upsert({
        where: { userId_asOf: { userId: u.id, asOf } },
        create: {
          userId: u.id,
          asOf,
          totalNetWorth: nw.totalNetWorth,
          totalLiabilities: nw.totalLiabilities,
          netWorthAfterLiabilities: nw.netWorthAfterLiabilities,
          breakdownJson: nw.allocationBreakdown,
        },
        update: {
          totalNetWorth: nw.totalNetWorth,
          totalLiabilities: nw.totalLiabilities,
          netWorthAfterLiabilities: nw.netWorthAfterLiabilities,
          breakdownJson: nw.allocationBreakdown,
        },
      });
      done++;
    } catch (err) {
      failed++;
      console.error(`Failed for user ${u.id}:`, err);
    }
  }
  console.log(`Done. ${done} succeeded, ${failed} failed.`);
}

backfill()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await directPrisma.$disconnect();
  });
```

- [ ] **Step 2: Add the npm script**

Edit `packages/api/package.json`. In `"scripts"`, add a line after `"seed:fmv": "tsx src/scripts/seedFmv.ts"`:

```json
    "seed:fmv": "tsx src/scripts/seedFmv.ts",
    "backfill:net-worth-history": "tsx src/scripts/backfillNetWorthHistory.ts"
```

- [ ] **Step 3: Run it against the dev DB**

Run:
```bash
pnpm --filter @portfolioos/api backfill:net-worth-history
```
Expected: `Backfilling day-1 net worth snapshot for N users...` then `Done. N succeeded, 0 failed.`

- [ ] **Step 4: Verify idempotent re-run**

Run the same command again.
Expected: still `Done. N succeeded, 0 failed.` and `SELECT count(*) FROM "NetWorthSnapshot"` unchanged (upsert, not insert).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/scripts/backfillNetWorthHistory.ts packages/api/package.json
git commit -m "feat(intelligence): day-1 net worth history backfill script"
```

---

### Task 7: Frontend API client

**Files:**
- Modify: `apps/web/src/api/intelligence.api.ts`

**Interfaces:**
- Produces: `export type NetWorthHistoryPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL'`, `export interface NetWorthHistoryPoint`, `export interface NetWorthHistoryResponse`, `intelligenceApi.netWorthHistory(period): Promise<NetWorthHistoryResponse>`. Task 8's `NetWorthTrendChart.tsx` imports all of these.

- [ ] **Step 1: Extend the API client**

Current full file `apps/web/src/api/intelligence.api.ts`:

```ts
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

Replace with:

```ts
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

export type NetWorthHistoryPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL';

export interface NetWorthHistoryPoint {
  asOf: string;
  totalNetWorth: string;
  totalLiabilities: string;
  netWorthAfterLiabilities: string;
}

export interface NetWorthHistoryResponse {
  points: NetWorthHistoryPoint[];
  summary: {
    changeAbsolute: string;
    changePct: number | null;
    periodLabel: NetWorthHistoryPeriod;
  };
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

  async netWorthHistory(period: NetWorthHistoryPeriod = '1Y'): Promise<NetWorthHistoryResponse> {
    const { data } = await api.get<ApiResponse<NetWorthHistoryResponse>>(
      '/api/intelligence/net-worth/history',
      { params: { period } },
    );
    return unwrap(data);
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @portfolioos/web typecheck`
Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/intelligence.api.ts
git commit -m "feat(web): net worth history API client"
```

---

### Task 8: `NetWorthTrendChart` component + dashboard wiring

**Files:**
- Create: `apps/web/src/components/dashboard/NetWorthTrendChart.tsx`
- Modify: `apps/web/src/pages/dashboard/DashboardPage.tsx` (import + render)

**Interfaces:**
- Consumes: `intelligenceApi.netWorthHistory` + `NetWorthHistoryPeriod` (Task 7), `formatINR`/`toDecimal` from `@portfolioos/shared`, `Card`/`CardContent`/`CardHeader`/`CardTitle` from `@/components/ui/card`.
- Produces: `export function NetWorthTrendChart(): JSX.Element`, a self-contained widget with its own period state and query — no props.

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/dashboard/NetWorthTrendChart.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { intelligenceApi, type NetWorthHistoryPeriod } from '@/api/intelligence.api';
import { formatINR, toDecimal } from '@portfolioos/shared';

const PERIOD_OPTIONS: { label: string; value: NetWorthHistoryPeriod }[] = [
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: 'All', value: 'ALL' },
];

/**
 * Personal net-worth trend — the "look how far you've come" dashboard
 * element. Backed by the daily NetWorthSnapshot cron; a brand-new user (or
 * one just past the day-1 backfill) will only have a single point, so this
 * intentionally shows a friendly placeholder instead of a broken/flat chart.
 */
export function NetWorthTrendChart() {
  const [period, setPeriod] = useState<NetWorthHistoryPeriod>('1Y');

  const { data, isLoading } = useQuery({
    queryKey: ['intelligence', 'net-worth-history', period],
    queryFn: () => intelligenceApi.netWorthHistory(period),
  });

  const points = data?.points ?? [];
  const chartData = points.map((p) => ({
    label: new Date(p.asOf).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
    value: toDecimal(p.netWorthAfterLiabilities).toNumber(),
  }));

  const changeAbsolute = data ? toDecimal(data.summary.changeAbsolute) : null;
  const changePct = data?.summary.changePct ?? null;
  const isPositive = changeAbsolute ? !changeAbsolute.isNegative() : true;
  const isFlat = changeAbsolute ? changeAbsolute.isZero() : true;
  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? period;

  return (
    <Card className="reveal">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <div>
          <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Trend</p>
          <CardTitle className="text-[16px]">Net worth over time</CardTitle>
        </div>
        <div className="flex gap-0.5 rounded-md border border-border/70 bg-background/40 p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={`px-2.5 py-1 rounded-[5px] text-[11px] font-medium tracking-wide transition-all ${
                period === opt.value
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {!isLoading && changeAbsolute && chartData.length >= 2 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
            {isFlat ? (
              <Minus className="h-4 w-4 text-muted-foreground" />
            ) : isPositive ? (
              <TrendingUp className="h-4 w-4 text-positive" />
            ) : (
              <TrendingDown className="h-4 w-4 text-negative" />
            )}
            <span
              className={`font-medium tabular-nums ${
                isFlat ? 'text-muted-foreground' : isPositive ? 'text-positive' : 'text-negative'
              }`}
            >
              {isPositive && !isFlat ? '+' : ''}
              {formatINR(changeAbsolute.toFixed(4))}
            </span>
            {changePct !== null && (
              <span className="text-muted-foreground">
                ({isPositive && !isFlat ? '+' : ''}
                {changePct.toFixed(1)}%)
              </span>
            )}
            <span className="text-muted-foreground">this {periodLabel}</span>
          </div>
        )}

        {isLoading ? (
          <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : chartData.length < 2 ? (
          <div className="h-56 grid place-items-center text-center text-sm text-muted-foreground border border-dashed rounded-md px-4">
            <div>
              <p>Come back tomorrow to see your net worth trend.</p>
              <p className="mt-1 text-xs">We snapshot your net worth once a day.</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradNetWorthTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.22} />
                  <stop offset="55%" stopColor="hsl(var(--foreground))" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={64}
                dy={6}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                width={72}
                tickFormatter={(v: number) =>
                  v >= 10_000_000
                    ? `₹${(v / 10_000_000).toFixed(1)}Cr`
                    : v >= 100_000
                      ? `₹${(v / 100_000).toFixed(1)}L`
                      : v >= 1_000
                        ? `₹${(v / 1_000).toFixed(0)}K`
                        : `₹${v.toFixed(0)}`
                }
              />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--foreground))', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.4 }}
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: 12,
                  padding: '10px 12px',
                }}
                formatter={(v: number) => [formatINR(v.toFixed(4)), 'Net worth']}
                labelStyle={{
                  color: 'hsl(var(--muted-foreground))',
                  marginBottom: 4,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                fill="url(#gradNetWorthTrend)"
                dot={chartData.length <= 10 ? { r: 2.5, fill: 'hsl(var(--foreground))', stroke: 'hsl(var(--card))', strokeWidth: 1.5 } : false}
                activeDot={{ r: 5, fill: 'hsl(var(--foreground))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into `DashboardPage.tsx`**

Edit `apps/web/src/pages/dashboard/DashboardPage.tsx`. Add the import next to the other dashboard-component imports (after `import { DashboardTaxStrip } from '@/components/dashboard/DashboardTaxStrip';` around line 34):

```tsx
import { DashboardTaxStrip } from '@/components/dashboard/DashboardTaxStrip';
import { NetWorthTrendChart } from '@/components/dashboard/NetWorthTrendChart';
```

Then render it immediately after the Net Worth Hero card closes. Find this closing (around line 825):

```tsx
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Live FX rates strip — quick glance + click-through to /forex */}
      <DashboardFxStrip />
```

Replace with:

```tsx
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Net worth trend — placed right after the headline number, the
          "look how far you've come" element per the feature spec. */}
      <NetWorthTrendChart />

      {/* Live FX rates strip — quick glance + click-through to /forex */}
      <DashboardFxStrip />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @portfolioos/web typecheck`
Expected: 0 new errors.

- [ ] **Step 4: Manual QA in the browser**

Start both servers (`pnpm dev`), log in, open the dashboard. Confirm:
- The "Net worth over time" card renders immediately below the Total Net Worth hero card.
- Period buttons (1M/3M/6M/1Y/All) are clickable and refetch.
- With 0-1 snapshot rows for the logged-in user, it shows "Come back tomorrow to see your net worth trend." instead of a broken chart.
- After calling `POST /api/intelligence/net-worth/snapshot` twice on two different `asOf` values (or after the backfill + one manual trigger a day apart), the chart renders a 2+ point line with the stat callout ("+₹X this 1Y (+Y%)").

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/NetWorthTrendChart.tsx apps/web/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat(web): net worth trend chart on dashboard"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full API test suite**

```bash
pnpm --filter @portfolioos/api exec vitest run
```
Expected: all tests pass, including the new ones from Tasks 2, 3, 4.

- [ ] **Step 2: Typecheck + lint everywhere**

```bash
pnpm typecheck
pnpm lint
```
Expected: 0 new errors. Any new `Number()`/`parseFloat()` lint warnings must be on non-monetary code only (there should be none introduced by this feature — all money flows through `serializeMoney`/`toDecimal`/raw Decimal strings).

- [ ] **Step 3: Build**

```bash
pnpm build
```
Expected: both `packages/api` and `apps/web` build cleanly.

- [ ] **Step 4: Final manual QA checklist**

- [ ] Migration applies cleanly on a fresh `pnpm db:migrate`, including RLS.
- [ ] `POST /api/intelligence/net-worth/snapshot` creates a row; calling it twice same day does not duplicate.
- [ ] `GET /api/intelligence/net-worth/history?period=1M` (and 3M/6M/1Y/ALL) all return 200 with correctly filtered points.
- [ ] Cross-user isolation: user A's token cannot see user B's snapshots via any endpoint (covered by Task 4's test, but worth eyeballing once via curl with two accounts if available).
- [ ] All monetary fields in the API response are strings, not numbers.
- [ ] Frontend chart renders with 1 point (friendly empty state) and with 2+ points (real chart + stat callout), without crashing either way.

- [ ] **Step 5: Note for follow-up (not part of this task — flag only)**

While gathering context for this plan, `HealthScoreSnapshot` (an existing per-user table added in migration `20260702140000_add_health_score_snapshot`) was found **missing** from `USER_SCOPED_MODELS` in `packages/api/src/lib/prisma.ts` and has no RLS policy — unlike `NetWorthSnapshot`, which this plan correctly registers. This is a pre-existing gap unrelated to net-worth history; it is out of scope here, but worth a follow-up ticket since it means `HealthScoreSnapshot` rows are not currently tenant-isolated at the database layer (defense-in-depth only, not exploitable unless a query also forgets its `userId` filter — but per §3.6 it shouldn't rely on that).

---

## Summary of new/changed files

- `packages/api/prisma/schema.prisma` — `NetWorthSnapshot` model + `User` back-relation
- `packages/api/prisma/migrations/20260706170000_net_worth_snapshot/migration.sql` — table + RLS
- `packages/api/src/lib/prisma.ts` — `USER_SCOPED_MODELS` registration
- `packages/api/src/services/netWorthHistory.service.ts` — read + period filter + summary
- `packages/api/src/jobs/netWorthSnapshotJob.ts` — cron + per-user snapshot logic
- `packages/api/src/index.ts` — wire the cron
- `packages/api/src/scripts/backfillNetWorthHistory.ts` — day-1 backfill
- `packages/api/package.json` — `backfill:net-worth-history` script
- `packages/api/src/controllers/intelligence.controller.ts` — 2 new handlers
- `packages/api/src/routes/intelligence.routes.ts` — 2 new routes
- `apps/web/src/api/intelligence.api.ts` — `netWorthHistory()` client call + types
- `apps/web/src/components/dashboard/NetWorthTrendChart.tsx` — new component
- `apps/web/src/pages/dashboard/DashboardPage.tsx` — wire the component in
- Tests: `test/services/netWorthHistory.test.ts`, `test/invariants/net-worth-snapshot-idempotency.test.ts`, `test/invariants/net-worth-snapshot-rls.test.ts`
