# Rental Khatabook Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every tenancy a Khatabook-style running-balance khata — separate charge and payment rows, partial payments, advances, deposits and adjustments — plus a collection loop (dues list, one-tap WhatsApp reminder, statement PDF).

**Architecture:** A new `RentLedgerEntry` table holds every money row except the monthly rent charge, which stays in the existing `RentReceipt` schedule. A pure allocation function (pinned month first, then FIFO by due date) decides how credits cover charges; a recompute service writes the result back onto `RentReceipt.status` / `receivedAmount` / `receivedOn` and onto new `Tenancy.balanceDue` / `depositHeld` columns. Every existing rent mutator becomes a thin wrapper that writes or deletes a ledger entry and then recomputes, so receipt state is a projection with exactly one write path.

**Tech Stack:** Node 20 + Express + Prisma + PostgreSQL 15, `Prisma.Decimal` for all money, Vitest, React 18 + TanStack Query + shadcn/Tailwind.

**Spec:** `portfolioos/docs/superpowers/specs/2026-09-08-rental-khatabook-ledger-design.md`

**Worktree:** `C:\Users\ST269\Desktop\mProfit-rental-khata-wt`, branch `feat/rental-khatabook-ledger`. All paths below are relative to `portfolioos/` inside that worktree.

## Global Constraints

- Money is `Prisma.Decimal` on the server and a decimal **string** across the API boundary. Never `Number`, never `parseFloat` on money. (CLAUDE.md §3.2)
- `RentReceipt.status`, `receivedAmount`, `receivedOn`, `cashFlowId` and `autoMatchedFromEventId` are **derived**. After Task 4 no code outside `rentalLedger.service.ts` may write them. (§3.1)
- Every new user-scoped table gets Postgres RLS with the `app_is_system() OR EXISTS(...)` owner-join pattern. (§3.6)
- No silent `catch`. Either handle meaningfully, write to the DLQ, or rethrow. (§3.10)
- Conventional Commits. One logical change per commit. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SYwmUVtFzZW4nu2rP6gn4L
  ```
- `OVERDUE_GRACE_DAYS = 7` — the existing constant at `packages/api/src/services/rental.service.ts:884`. The derived status must reproduce it exactly.
- Running a migration against the dev database is a **G2 review gate** (CLAUDE.md §16): stop, show the parity output, wait for the user. Production is **G3**.
- API tests need a live Postgres — `DATABASE_URL` must point at a dev/test DB. Pure-math tests do not.
- Run backend tests with `pnpm --filter @everypaisa/api exec vitest run <path>` from `portfolioos/`.

---

### Task 1: Schema, migration and RLS for the ledger table

**Files:**
- Modify: `packages/api/prisma/schema.prisma` (models `Tenancy` ~1715-1738, `RentReceipt` ~1740-1758)
- Create: `packages/api/prisma/migrations/20260908000000_rental_ledger/migration.sql`
- Test: `packages/api/test/invariants/rental-ledger-rls.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `RentLedgerEntry` (fields `id`, `tenancyId`, `entryType`, `amount`, `entryDate`, `forMonth`, `note`, `attachmentUrl`, `cashFlowId`, `canonicalEventId`, `sourceHash`, `createdAt`, `updatedAt`); `Tenancy.balanceDue`, `Tenancy.depositHeld`, `Tenancy.balanceComputedAt`; `RentReceipt.isSkipped`.

> **Why `RentReceipt.isSkipped`:** `SKIPPED` is a user *intent*, not something derivable from money. Once `status` becomes derived it can no longer store that intent, so the intent moves to its own boolean and `status` renders `SKIPPED` from it. `updateTenancy` (`rental.service.ts:487-497`) also sets `SKIPPED` when an `endDate` is shortened — that path writes the boolean instead.

- [ ] **Step 1: Add the models to `schema.prisma`**

Add to the `Tenancy` model, after `notes`:

```prisma
  // Derived by rentalLedger.service.recomputeTenancyLedger — never hand-edited.
  // Positive means the tenant owes; negative means they are in advance.
  balanceDue        Decimal   @db.Decimal(12, 2) @default(0)
  depositHeld       Decimal   @db.Decimal(12, 2) @default(0)
  balanceComputedAt DateTime?
```

Add to the `Tenancy` model's relation block, next to `rentReceipts`:

```prisma
  ledgerEntries RentLedgerEntry[]
```

Add to the `RentReceipt` model, after `notes`:

```prisma
  // User intent to skip this month (moved out of `status`, which is now
  // derived from the ledger). `status` renders SKIPPED when this is true.
  isSkipped Boolean @default(false)
```

Add a new model directly after `RentReceipt`:

```prisma
// Khatabook-style ledger row for a tenancy. Everything except the monthly
// rent charge lives here; the rent charge stays in RentReceipt. Payments
// allocate to charges (pinned month first, then FIFO) inside
// rentalLedger.service.recomputeTenancyLedger — there is no allocation table.
model RentLedgerEntry {
  id       String  @id @default(cuid())
  tenancyId String
  tenancy  Tenancy @relation(fields: [tenancyId], references: [id], onDelete: Cascade)

  // PAYMENT | DISCOUNT | LATE_FEE | OTHER_CHARGE | DEPOSIT | DEPOSIT_REFUND
  entryType     String
  amount        Decimal  @db.Decimal(12, 2)
  entryDate     DateTime @db.Date
  // "YYYY-MM" pin. Null means allocate FIFO to the oldest open charge.
  forMonth      String?
  note          String?
  attachmentUrl String?

  cashFlowId       String?
  canonicalEventId String?
  sourceHash       String? @unique

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenancyId, entryDate])
  @@index([tenancyId, forMonth])
}
```

- [ ] **Step 2: Write the migration SQL**

Create `packages/api/prisma/migrations/20260908000000_rental_ledger/migration.sql`:

```sql
-- Khatabook-style tenant ledger.
--
-- RentLedgerEntry holds payments, discounts, fees, deposits and deposit
-- refunds. The monthly rent charge stays in RentReceipt, whose status /
-- receivedAmount / receivedOn become a projection of the allocation.
--
-- RentReceipt.isSkipped carries the user's skip intent, which `status` can
-- no longer hold once it is derived.

ALTER TABLE "Tenancy"
  ADD COLUMN IF NOT EXISTS "balanceDue"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "depositHeld"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "balanceComputedAt" TIMESTAMP(3);

ALTER TABLE "RentReceipt"
  ADD COLUMN IF NOT EXISTS "isSkipped" BOOLEAN NOT NULL DEFAULT false;

UPDATE "RentReceipt" SET "isSkipped" = true WHERE "status" = 'SKIPPED';

CREATE TABLE IF NOT EXISTS "RentLedgerEntry" (
  "id"               TEXT NOT NULL,
  "tenancyId"        TEXT NOT NULL,
  "entryType"        TEXT NOT NULL,
  "amount"           DECIMAL(12,2) NOT NULL,
  "entryDate"        DATE NOT NULL,
  "forMonth"         TEXT,
  "note"             TEXT,
  "attachmentUrl"    TEXT,
  "cashFlowId"       TEXT,
  "canonicalEventId" TEXT,
  "sourceHash"       TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RentLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentLedgerEntry_tenancyId_fkey"
    FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RentLedgerEntry_sourceHash_key"
  ON "RentLedgerEntry"("sourceHash");
CREATE INDEX IF NOT EXISTS "RentLedgerEntry_tenancyId_entryDate_idx"
  ON "RentLedgerEntry"("tenancyId", "entryDate");
CREATE INDEX IF NOT EXISTS "RentLedgerEntry_tenancyId_forMonth_idx"
  ON "RentLedgerEntry"("tenancyId", "forMonth");

-- RLS rides on Tenancy → RentalProperty → User, the same pattern used by
-- RentReminder in 20260512150000_rent_reminders.
ALTER TABLE "RentLedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentLedgerEntry" FORCE  ROW LEVEL SECURITY;
CREATE POLICY rentledgerentry_owner ON "RentLedgerEntry"
  USING (
    app_is_system()
    OR EXISTS (
      SELECT 1
      FROM "Tenancy" t
      JOIN "RentalProperty" rp ON rp."id" = t."propertyId"
      WHERE t."id" = "RentLedgerEntry"."tenancyId"
        AND rp."userId" = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1
      FROM "Tenancy" t
      JOIN "RentalProperty" rp ON rp."id" = t."propertyId"
      WHERE t."id" = "RentLedgerEntry"."tenancyId"
        AND rp."userId" = app_current_user_id()
    )
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON "RentLedgerEntry" TO portfolioos_app;
```

- [ ] **Step 3: Write the failing RLS test**

Create `packages/api/test/invariants/rental-ledger-rls.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: RentLedgerEntry rows are visible only to the user who owns the
 * property the tenancy hangs off. A second user's session must see zero rows
 * even when it queries by the exact entry id.
 */
describe('invariant: RentLedgerEntry RLS isolation', () => {
  let alice: TestScope;
  let bob: TestScope;
  let entryId: string;

  beforeAll(async () => {
    alice = await createTestScope('rental-ledger-rls-a');
    bob = await createTestScope('rental-ledger-rls-b');

    await alice.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: alice.userId,
          name: 'RLS Test Property',
          propertyType: 'RESIDENTIAL',
        },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'RLS Tenant',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          monthlyRent: '10000',
          rentDueDay: 1,
        },
      });
      const entry = await prisma.rentLedgerEntry.create({
        data: {
          tenancyId: tenancy.id,
          entryType: 'PAYMENT',
          amount: '10000',
          entryDate: new Date('2026-01-05T00:00:00.000Z'),
        },
      });
      entryId = entry.id;
    });
  });

  afterAll(async () => {
    await alice.cleanup();
    await bob.cleanup();
  });

  it('lets the owner read the entry', async () => {
    await alice.runAs(async () => {
      const row = await prisma.rentLedgerEntry.findUnique({ where: { id: entryId } });
      expect(row).not.toBeNull();
    });
  });

  it('hides the entry from another user', async () => {
    await bob.runAs(async () => {
      const row = await prisma.rentLedgerEntry.findUnique({ where: { id: entryId } });
      expect(row).toBeNull();
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
pnpm --filter @everypaisa/api exec vitest run test/invariants/rental-ledger-rls.test.ts
```

Expected: FAIL — `prisma.rentLedgerEntry` is undefined, because the client has not been regenerated.

- [ ] **Step 5: Apply the migration and regenerate the client — G2 GATE**

**STOP.** This writes to the dev database. Tell the user what is about to run (the migration above, structural only — no recompute backfill yet, that is Task 3), then wait for approval.

After approval:

```bash
pnpm --filter @everypaisa/api exec prisma migrate dev --name rental_ledger
pnpm --filter @everypaisa/api exec prisma generate
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @everypaisa/api exec vitest run test/invariants/rental-ledger-rls.test.ts
```

Expected: PASS, both cases.

- [ ] **Step 7: Commit**

```bash
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations packages/api/test/invariants/rental-ledger-rls.test.ts
git commit
```

Message: `feat(rental): add RentLedgerEntry table, tenancy balance columns and RLS`

---

### Task 2: Pure allocation and status-derivation math

**Files:**
- Create: `packages/api/src/services/rentalLedgerMath.ts`
- Test: `packages/api/src/services/rentalLedgerMath.test.ts`

These are pure functions with no Prisma client access, colocated with a `.test.ts` the way `loanMath.ts`, `goalMath.ts` and `healthScoreMath.ts` already are in this directory. Vitest picks up `src/**/*.test.ts`. No database needed.

**Interfaces:**
- Consumes: `Prisma.Decimal` only.
- Produces:
  ```ts
  export interface ChargeInput { key: string; kind: 'RECEIPT' | 'FEE'; forMonth: string | null; due: Date; amount: Prisma.Decimal }
  export interface CreditInput { key: string; entryDate: Date; createdAt: Date; forMonth: string | null; amount: Prisma.Decimal }
  export interface ChargeAllocation { allocated: Prisma.Decimal; settledOn: Date | null; creditKeys: string[] }
  export interface AllocationResult { perCharge: Map<string, ChargeAllocation>; advance: Prisma.Decimal }
  export function allocateCredits(charges: ChargeInput[], credits: CreditInput[]): AllocationResult
  export type DerivedReceiptStatus = 'EXPECTED' | 'RECEIVED' | 'PARTIAL' | 'OVERDUE' | 'SKIPPED'
  export function deriveReceiptStatus(args: { isSkipped: boolean; expected: Prisma.Decimal; allocated: Prisma.Decimal; dueDate: Date; today: Date; graceDays: number }): DerivedReceiptStatus
  ```

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/services/rentalLedgerMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  allocateCredits,
  deriveReceiptStatus,
  type ChargeInput,
  type CreditInput,
} from './rentalLedgerMath.js';

const D = (v: string) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function charge(key: string, month: string, due: string, amount: string): ChargeInput {
  return { key, kind: 'RECEIPT', forMonth: month, due: day(due), amount: D(amount) };
}
function credit(key: string, date: string, amount: string, forMonth: string | null = null): CreditInput {
  return { key, entryDate: day(date), createdAt: day(date), forMonth, amount: D(amount) };
}

describe('allocateCredits', () => {
  it('fills one charge exactly', () => {
    const r = allocateCredits(
      [charge('r1', '2026-04', '2026-04-01', '45000')],
      [credit('c1', '2026-04-03', '45000')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('45000');
    expect(r.perCharge.get('r1')!.settledOn).toEqual(day('2026-04-03'));
    expect(r.advance.toString()).toBe('0');
  });

  it('sums two partial payments into one charge', () => {
    const r = allocateCredits(
      [charge('r1', '2026-04', '2026-04-01', '45000')],
      [credit('c1', '2026-04-03', '20000'), credit('c2', '2026-04-11', '25000')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('45000');
    expect(r.perCharge.get('r1')!.settledOn).toEqual(day('2026-04-11'));
  });

  it('leaves a charge partly covered and records no settle date', () => {
    const r = allocateCredits(
      [charge('r1', '2026-04', '2026-04-01', '45000')],
      [credit('c1', '2026-04-03', '20000')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('20000');
    expect(r.perCharge.get('r1')!.settledOn).toBeNull();
  });

  it('allocates FIFO across two arrears, oldest first', () => {
    const r = allocateCredits(
      [
        charge('r1', '2026-03', '2026-03-01', '45000'),
        charge('r2', '2026-04', '2026-04-01', '45000'),
      ],
      [credit('c1', '2026-04-20', '20000')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('20000');
    expect(r.perCharge.get('r2')!.allocated.toString()).toBe('0');
  });

  it('spills one large credit across charges in due order', () => {
    const r = allocateCredits(
      [
        charge('r1', '2026-03', '2026-03-01', '45000'),
        charge('r2', '2026-04', '2026-04-01', '45000'),
      ],
      [credit('c1', '2026-04-20', '60000')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('45000');
    expect(r.perCharge.get('r2')!.allocated.toString()).toBe('15000');
  });

  it('honours a forMonth pin ahead of older arrears, then spills FIFO', () => {
    const r = allocateCredits(
      [
        charge('r1', '2026-03', '2026-03-01', '45000'),
        charge('r2', '2026-04', '2026-04-01', '45000'),
      ],
      [credit('c1', '2026-04-05', '50000', '2026-04')],
    );
    expect(r.perCharge.get('r2')!.allocated.toString()).toBe('45000');
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('5000');
  });

  it('reports leftover credit as an advance', () => {
    const r = allocateCredits(
      [charge('r1', '2026-04', '2026-04-01', '45000')],
      [credit('c1', '2026-04-03', '50000')],
    );
    expect(r.advance.toString()).toBe('5000');
  });

  it('orders a fee charge among receipts by its date', () => {
    const fee: ChargeInput = {
      key: 'f1', kind: 'FEE', forMonth: null, due: day('2026-03-15'), amount: D('500'),
    };
    const r = allocateCredits(
      [charge('r1', '2026-03', '2026-03-01', '1000'), fee, charge('r2', '2026-04', '2026-04-01', '1000')],
      [credit('c1', '2026-04-02', '1600')],
    );
    expect(r.perCharge.get('r1')!.allocated.toString()).toBe('1000');
    expect(r.perCharge.get('f1')!.allocated.toString()).toBe('500');
    expect(r.perCharge.get('r2')!.allocated.toString()).toBe('100');
  });

  it('is order-independent — shuffled input yields the same allocation', () => {
    const charges = [
      charge('r1', '2026-03', '2026-03-01', '45000'),
      charge('r2', '2026-04', '2026-04-01', '45000'),
    ];
    const credits = [credit('c1', '2026-04-20', '20000'), credit('c2', '2026-03-10', '30000')];
    const a = allocateCredits(charges, credits);
    const b = allocateCredits([...charges].reverse(), [...credits].reverse());
    expect(b.perCharge.get('r1')!.allocated.toString()).toBe(a.perCharge.get('r1')!.allocated.toString());
    expect(b.perCharge.get('r2')!.allocated.toString()).toBe(a.perCharge.get('r2')!.allocated.toString());
  });
});

describe('deriveReceiptStatus', () => {
  const base = {
    expected: D('45000'),
    dueDate: day('2026-04-01'),
    today: day('2026-04-02'),
    graceDays: 7,
  };

  it('is SKIPPED whenever the skip flag is set, regardless of money', () => {
    expect(deriveReceiptStatus({ ...base, isSkipped: true, allocated: D('45000') })).toBe('SKIPPED');
  });

  it('is RECEIVED when fully allocated', () => {
    expect(deriveReceiptStatus({ ...base, isSkipped: false, allocated: D('45000') })).toBe('RECEIVED');
  });

  it('is RECEIVED when over-allocated', () => {
    expect(deriveReceiptStatus({ ...base, isSkipped: false, allocated: D('46000') })).toBe('RECEIVED');
  });

  it('is PARTIAL when partly allocated and not yet due', () => {
    expect(deriveReceiptStatus({ ...base, isSkipped: false, allocated: D('20000') })).toBe('PARTIAL');
  });

  it('stays PARTIAL rather than OVERDUE once past the grace window', () => {
    expect(deriveReceiptStatus({
      ...base, isSkipped: false, allocated: D('20000'), today: day('2026-05-01'),
    })).toBe('PARTIAL');
  });

  it('is EXPECTED when unpaid and inside the grace window', () => {
    expect(deriveReceiptStatus({ ...base, isSkipped: false, allocated: D('0') })).toBe('EXPECTED');
  });

  it('is OVERDUE when unpaid and past dueDate + graceDays', () => {
    expect(deriveReceiptStatus({
      ...base, isSkipped: false, allocated: D('0'), today: day('2026-04-09'),
    })).toBe('OVERDUE');
  });

  it('is still EXPECTED exactly on the grace boundary', () => {
    expect(deriveReceiptStatus({
      ...base, isSkipped: false, allocated: D('0'), today: day('2026-04-08'),
    })).toBe('EXPECTED');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @everypaisa/api exec vitest run src/services/rentalLedgerMath.test.ts
```

Expected: FAIL — `Cannot find module './rentalLedgerMath.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/api/src/services/rentalLedgerMath.ts`:

```ts
/**
 * Pure allocation and status math for the tenant khata ledger.
 *
 * No Prisma client, no clock, no I/O — every input is passed in so the
 * whole thing is exercisable without a database. `rentalLedger.service.ts`
 * loads rows, calls these, and writes the result back.
 *
 * Allocation rule: a credit first fills the charge its `forMonth` pins it
 * to (if any capacity remains there), then spills to the oldest charge with
 * remaining capacity. Anything left after every charge is satisfied is an
 * advance the tenant is carrying.
 */

import { Prisma } from '@prisma/client';

const ZERO = new Prisma.Decimal(0);

export interface ChargeInput {
  /** RentReceipt.id for rent, RentLedgerEntry.id for a fee. */
  key: string;
  kind: 'RECEIPT' | 'FEE';
  /** "YYYY-MM" for rent charges; null for fees. */
  forMonth: string | null;
  due: Date;
  amount: Prisma.Decimal;
}

export interface CreditInput {
  /** RentLedgerEntry.id. */
  key: string;
  entryDate: Date;
  createdAt: Date;
  /** "YYYY-MM" pin, or null to allocate FIFO. */
  forMonth: string | null;
  amount: Prisma.Decimal;
}

export interface ChargeAllocation {
  allocated: Prisma.Decimal;
  /** entryDate of the credit that brought this charge to fully-paid. */
  settledOn: Date | null;
  /** Keys of every credit that contributed, in allocation order. */
  creditKeys: string[];
}

export interface AllocationResult {
  perCharge: Map<string, ChargeAllocation>;
  advance: Prisma.Decimal;
}

/**
 * Charges sort by due date, then receipts before fees on the same date, then
 * by key. Credits sort by entryDate, then createdAt, then key. Sorting here
 * rather than at the call site is what makes the result independent of the
 * order rows came back from the database.
 */
function sortCharges(charges: ChargeInput[]): ChargeInput[] {
  return [...charges].sort((a, b) => {
    const d = a.due.getTime() - b.due.getTime();
    if (d !== 0) return d;
    if (a.kind !== b.kind) return a.kind === 'RECEIPT' ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

function sortCredits(credits: CreditInput[]): CreditInput[] {
  return [...credits].sort((a, b) => {
    const d = a.entryDate.getTime() - b.entryDate.getTime();
    if (d !== 0) return d;
    const c = a.createdAt.getTime() - b.createdAt.getTime();
    if (c !== 0) return c;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

export function allocateCredits(
  charges: ChargeInput[],
  credits: CreditInput[],
): AllocationResult {
  const ordered = sortCharges(charges);
  const perCharge = new Map<string, ChargeAllocation>();
  const remaining = new Map<string, Prisma.Decimal>();
  for (const c of ordered) {
    perCharge.set(c.key, { allocated: ZERO, settledOn: null, creditKeys: [] });
    remaining.set(c.key, c.amount);
  }

  const applyTo = (chargeKey: string, credit: CreditInput, pool: Prisma.Decimal): Prisma.Decimal => {
    const left = remaining.get(chargeKey);
    if (!left || left.lte(ZERO) || pool.lte(ZERO)) return pool;
    const take = Prisma.Decimal.min(left, pool);
    const alloc = perCharge.get(chargeKey)!;
    alloc.allocated = alloc.allocated.plus(take);
    alloc.creditKeys.push(credit.key);
    remaining.set(chargeKey, left.minus(take));
    if (remaining.get(chargeKey)!.lte(ZERO)) {
      alloc.settledOn = credit.entryDate;
    }
    return pool.minus(take);
  };

  let advance = ZERO;
  for (const credit of sortCredits(credits)) {
    let pool = credit.amount;
    if (credit.forMonth) {
      const pinned = ordered.find(
        (c) => c.kind === 'RECEIPT' && c.forMonth === credit.forMonth,
      );
      if (pinned) pool = applyTo(pinned.key, credit, pool);
    }
    for (const c of ordered) {
      if (pool.lte(ZERO)) break;
      pool = applyTo(c.key, credit, pool);
    }
    advance = advance.plus(pool);
  }

  return { perCharge, advance };
}

export type DerivedReceiptStatus =
  | 'EXPECTED'
  | 'RECEIVED'
  | 'PARTIAL'
  | 'OVERDUE'
  | 'SKIPPED';

/**
 * PARTIAL deliberately outranks OVERDUE: before the ledger existed,
 * `markOverdueReceipts` only ever flipped EXPECTED to OVERDUE, so a partly
 * paid month never raised an overdue alert. Keeping that ordering means
 * alerts.service keeps behaving exactly as it does today.
 */
export function deriveReceiptStatus(args: {
  isSkipped: boolean;
  expected: Prisma.Decimal;
  allocated: Prisma.Decimal;
  dueDate: Date;
  today: Date;
  graceDays: number;
}): DerivedReceiptStatus {
  if (args.isSkipped) return 'SKIPPED';
  if (args.allocated.gte(args.expected)) return 'RECEIVED';
  if (args.allocated.gt(ZERO)) return 'PARTIAL';

  const cutoff = new Date(args.today.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - args.graceDays);
  cutoff.setUTCHours(0, 0, 0, 0);
  return args.dueDate <= cutoff ? 'OVERDUE' : 'EXPECTED';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @everypaisa/api exec vitest run src/services/rentalLedgerMath.test.ts
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/rentalLedgerMath.ts packages/api/src/services/rentalLedgerMath.test.ts
git commit
```

Message: `feat(rental): pure FIFO allocation and derived receipt status`

---

### Task 3: Recompute service

**Files:**
- Create: `packages/api/src/services/rentalLedger.service.ts`
- Test: `packages/api/test/invariants/rental-ledger-recompute.test.ts`

**Interfaces:**
- Consumes: `allocateCredits`, `deriveReceiptStatus`, `ChargeInput`, `CreditInput` from `./rentalLedgerMath.js`; `prisma`, `runInTransaction` from `../lib/prisma.js`.
- Produces:
  ```ts
  export const LEDGER_ENTRY_TYPES: readonly ['PAYMENT','DISCOUNT','LATE_FEE','OTHER_CHARGE','DEPOSIT','DEPOSIT_REFUND']
  export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number]
  export const OVERDUE_GRACE_DAYS = 7
  export interface LedgerSummary { balanceDue: Prisma.Decimal; depositHeld: Prisma.Decimal; settledReceiptIds: string[] }
  export async function recomputeTenancyLedger(tx: Prisma.TransactionClient, tenancyId: string): Promise<LedgerSummary>
  export async function recomputeTenancy(tenancyId: string): Promise<LedgerSummary>
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/invariants/rental-ledger-recompute.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { recomputeTenancy } from '../../src/services/rentalLedger.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: RentReceipt.status / receivedAmount / receivedOn are a
 * projection of RentLedgerEntry. Recomputing twice changes nothing, deposits
 * never touch balanceDue, and deleting a payment restores the prior state
 * exactly.
 */
describe('invariant: tenancy ledger recompute', () => {
  let scope: TestScope;
  let tenancyId: string;
  let aprId: string;
  let mayId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-recompute');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Khata Test', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Ledger Tenant',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '45000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      const apr = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-04', expectedAmount: '45000',
          dueDate: new Date('2026-04-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      const may = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-05', expectedAmount: '45000',
          dueDate: new Date('2026-05-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      aprId = apr.id;
      mayId = may.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('splits one payment FIFO across two arrears', async () => {
    await scope.runAs(async () => {
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId, entryType: 'PAYMENT', amount: '60000',
          entryDate: new Date('2026-05-10T00:00:00.000Z'),
        },
      });
      await recomputeTenancy(tenancyId);

      const apr = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: aprId } });
      const may = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: mayId } });
      expect(apr.status).toBe('RECEIVED');
      expect(apr.receivedAmount?.toString()).toBe('45000');
      expect(may.status).toBe('PARTIAL');
      expect(may.receivedAmount?.toString()).toBe('15000');

      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.balanceDue.toString()).toBe('30000');
    });
  });

  it('is idempotent — a second recompute changes nothing', async () => {
    await scope.runAs(async () => {
      const before = await prisma.rentReceipt.findMany({
        where: { tenancyId }, orderBy: { dueDate: 'asc' },
      });
      await recomputeTenancy(tenancyId);
      const after = await prisma.rentReceipt.findMany({
        where: { tenancyId }, orderBy: { dueDate: 'asc' },
      });
      expect(after.map((r) => [r.status, r.receivedAmount?.toString() ?? null]))
        .toEqual(before.map((r) => [r.status, r.receivedAmount?.toString() ?? null]));
    });
  });

  it('keeps deposits out of balanceDue and in depositHeld', async () => {
    await scope.runAs(async () => {
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId, entryType: 'DEPOSIT', amount: '90000',
          entryDate: new Date('2026-04-01T00:00:00.000Z'),
        },
      });
      await recomputeTenancy(tenancyId);
      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.balanceDue.toString()).toBe('30000');
      expect(tenancy.depositHeld.toString()).toBe('90000');
    });
  });

  it('restores prior state when the payment is deleted', async () => {
    await scope.runAs(async () => {
      await prisma.rentLedgerEntry.deleteMany({ where: { tenancyId, entryType: 'PAYMENT' } });
      await recomputeTenancy(tenancyId);

      const apr = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: aprId } });
      expect(apr.receivedAmount).toBeNull();
      expect(apr.receivedOn).toBeNull();
      expect(['EXPECTED', 'OVERDUE']).toContain(apr.status);

      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.balanceDue.toString()).toBe('90000');
    });
  });

  it('releases credit held by a month that gets skipped', async () => {
    await scope.runAs(async () => {
      await prisma.rentReceipt.update({ where: { id: aprId }, data: { isSkipped: true } });
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId, entryType: 'PAYMENT', amount: '45000',
          entryDate: new Date('2026-05-05T00:00:00.000Z'),
        },
      });
      await recomputeTenancy(tenancyId);

      const apr = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: aprId } });
      const may = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: mayId } });
      expect(apr.status).toBe('SKIPPED');
      expect(may.status).toBe('RECEIVED');
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @everypaisa/api exec vitest run test/invariants/rental-ledger-recompute.test.ts
```

Expected: FAIL — `Cannot find module '../../src/services/rentalLedger.service.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/api/src/services/rentalLedger.service.ts`:

```ts
/**
 * Tenant khata ledger — the single write path for rent money.
 *
 * `RentReceipt` still holds the monthly rent charge, but its `status`,
 * `receivedAmount`, `receivedOn`, `cashFlowId` and `autoMatchedFromEventId`
 * are a projection of `RentLedgerEntry` computed here. Nothing outside this
 * file may write those columns (CLAUDE.md §3.1).
 */

import { Prisma } from '@prisma/client';
import { prisma, runInTransaction } from '../lib/prisma.js';
import {
  allocateCredits,
  deriveReceiptStatus,
  type ChargeInput,
  type CreditInput,
} from './rentalLedgerMath.js';

export const LEDGER_ENTRY_TYPES = [
  'PAYMENT',
  'DISCOUNT',
  'LATE_FEE',
  'OTHER_CHARGE',
  'DEPOSIT',
  'DEPOSIT_REFUND',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/** Charge side of the khata — increases what the tenant owes. */
const CHARGE_TYPES = new Set<LedgerEntryType>(['LATE_FEE', 'OTHER_CHARGE']);
/** Credit side — reduces what the tenant owes. */
const CREDIT_TYPES = new Set<LedgerEntryType>(['PAYMENT', 'DISCOUNT']);

export const OVERDUE_GRACE_DAYS = 7;

const ZERO = new Prisma.Decimal(0);

export interface LedgerSummary {
  balanceDue: Prisma.Decimal;
  depositHeld: Prisma.Decimal;
  /** Receipts that moved from unsettled to RECEIVED/PARTIAL in this run. */
  settledReceiptIds: string[];
}

export async function recomputeTenancyLedger(
  tx: Prisma.TransactionClient,
  tenancyId: string,
): Promise<LedgerSummary> {
  const [receipts, entries] = await Promise.all([
    tx.rentReceipt.findMany({ where: { tenancyId }, orderBy: { dueDate: 'asc' } }),
    tx.rentLedgerEntry.findMany({ where: { tenancyId } }),
  ]);

  const charges: ChargeInput[] = [];
  for (const r of receipts) {
    if (r.isSkipped) continue;
    charges.push({
      key: r.id,
      kind: 'RECEIPT',
      forMonth: r.forMonth,
      due: r.dueDate,
      amount: r.expectedAmount,
    });
  }
  for (const e of entries) {
    if (CHARGE_TYPES.has(e.entryType as LedgerEntryType)) {
      charges.push({
        key: e.id, kind: 'FEE', forMonth: null, due: e.entryDate, amount: e.amount,
      });
    }
  }

  const credits: CreditInput[] = entries
    .filter((e) => CREDIT_TYPES.has(e.entryType as LedgerEntryType))
    .map((e) => ({
      key: e.id,
      entryDate: e.entryDate,
      createdAt: e.createdAt,
      forMonth: e.forMonth,
      amount: e.amount,
    }));

  const { perCharge } = allocateCredits(charges, credits);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const today = new Date();
  const settledReceiptIds: string[] = [];

  for (const r of receipts) {
    const alloc = perCharge.get(r.id);
    const allocated = alloc?.allocated ?? ZERO;
    const status = deriveReceiptStatus({
      isSkipped: r.isSkipped,
      expected: r.expectedAmount,
      allocated,
      dueDate: r.dueDate,
      today,
      graceDays: OVERDUE_GRACE_DAYS,
    });

    // Carry the legacy single-link columns from the first contributing entry
    // so the existing DTO and the "undo auto-match" affordance keep working.
    const contributors = (alloc?.creditKeys ?? []).map((k) => entryById.get(k)!);
    const cashFlowId = contributors.find((e) => e.cashFlowId)?.cashFlowId ?? null;
    const autoMatchedFromEventId =
      contributors.find((e) => e.canonicalEventId)?.canonicalEventId ?? null;

    const wasSettled = r.status === 'RECEIVED' || r.status === 'PARTIAL';
    const isSettled = status === 'RECEIVED' || status === 'PARTIAL';
    if (!wasSettled && isSettled) settledReceiptIds.push(r.id);

    const nextReceived = allocated.gt(ZERO) ? allocated : null;
    const nextReceivedOn = alloc?.settledOn ?? null;
    const unchanged =
      r.status === status &&
      (r.receivedAmount?.toString() ?? null) === (nextReceived?.toString() ?? null) &&
      (r.receivedOn?.getTime() ?? null) === (nextReceivedOn?.getTime() ?? null) &&
      r.cashFlowId === cashFlowId &&
      r.autoMatchedFromEventId === autoMatchedFromEventId;
    if (unchanged) continue;

    await tx.rentReceipt.update({
      where: { id: r.id },
      data: {
        status,
        receivedAmount: nextReceived,
        receivedOn: nextReceivedOn,
        cashFlowId,
        autoMatchedFromEventId,
      },
    });
  }

  let chargeTotal = ZERO;
  for (const c of charges) chargeTotal = chargeTotal.plus(c.amount);
  let creditTotal = ZERO;
  for (const c of credits) creditTotal = creditTotal.plus(c.amount);

  let depositHeld = ZERO;
  for (const e of entries) {
    if (e.entryType === 'DEPOSIT') depositHeld = depositHeld.plus(e.amount);
    if (e.entryType === 'DEPOSIT_REFUND') depositHeld = depositHeld.minus(e.amount);
  }

  const balanceDue = chargeTotal.minus(creditTotal);
  await tx.tenancy.update({
    where: { id: tenancyId },
    data: { balanceDue, depositHeld, balanceComputedAt: new Date() },
  });

  for (const receiptId of settledReceiptIds) {
    await resolveRentReceiptReminders(tx, receiptId);
  }

  return { balanceDue, depositHeld, settledReceiptIds };
}

/**
 * A receipt just settled — clear anything still nagging about it. Moved here
 * from rental.service.ts so the recompute owns the whole settle transition.
 * We delete (not soft-dismiss) the alert so a later un-settle can recreate it
 * past `generateRentOverdueAlerts`'s dedup-by-key check.
 */
export async function resolveRentReceiptReminders(
  tx: Prisma.TransactionClient,
  receiptId: string,
): Promise<void> {
  await tx.rentReminder.updateMany({
    where: { receiptId, status: 'PENDING_APPROVAL' },
    data: { status: 'SUPERSEDED' },
  });
  await tx.alert.deleteMany({
    where: {
      type: 'CUSTOM',
      metadata: { path: ['key'], equals: `rent_overdue:${receiptId}` },
    },
  });
}

/** Convenience wrapper for callers that are not already in a transaction. */
export async function recomputeTenancy(tenancyId: string): Promise<LedgerSummary> {
  return runInTransaction((tx) => recomputeTenancyLedger(tx, tenancyId));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @everypaisa/api exec vitest run test/invariants/rental-ledger-recompute.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/rentalLedger.service.ts packages/api/test/invariants/rental-ledger-recompute.test.ts
git commit
```

Message: `feat(rental): recompute tenancy ledger into receipt projection`

---

### Task 4: Backfill existing receipts into ledger entries

**Files:**
- Create: `packages/api/scripts/backfillRentalLedger.ts`
- Test: `packages/api/test/scripts/backfillRentalLedger.test.ts`

The backfill is a script, not raw SQL, because step 4 needs the recompute engine. It is idempotent: it skips any receipt that already has a backfilled entry (matched on `sourceHash`).

**Interfaces:**
- Consumes: `recomputeTenancyLedger` from `../src/services/rentalLedger.service.js`.
- Produces:
  ```ts
  export interface BackfillReport { paymentsCreated: number; depositsCreated: number; tenanciesRecomputed: number; drift: Array<{ receiptId: string; before: string; after: string }> }
  export async function backfillRentalLedger(opts?: { dryRun?: boolean }): Promise<BackfillReport>
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/scripts/backfillRentalLedger.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { backfillRentalLedger } from '../../scripts/backfillRentalLedger.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: backfilling a legacy tenancy must not move a single receipt.
 * Statuses and received amounts recorded before the ledger existed have to
 * survive the migration byte-for-byte.
 */
describe('backfillRentalLedger parity', () => {
  let scope: TestScope;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-backfill');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Backfill Test', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Legacy Tenant',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          monthlyRent: '30000',
          securityDeposit: '60000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-01', expectedAmount: '30000',
          dueDate: new Date('2026-01-01T00:00:00.000Z'),
          status: 'RECEIVED', receivedAmount: '30000',
          receivedOn: new Date('2026-01-04T00:00:00.000Z'),
        },
      });
      await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-02', expectedAmount: '30000',
          dueDate: new Date('2026-02-01T00:00:00.000Z'),
          status: 'PARTIAL', receivedAmount: '10000',
          receivedOn: new Date('2026-02-06T00:00:00.000Z'),
        },
      });
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('creates entries and reports zero drift', async () => {
    const report = await backfillRentalLedger();
    expect(report.drift).toEqual([]);
    expect(report.paymentsCreated).toBeGreaterThanOrEqual(2);
    expect(report.depositsCreated).toBeGreaterThanOrEqual(1);
  });

  it('preserves every receipt status and amount', async () => {
    await scope.runAs(async () => {
      const rows = await prisma.rentReceipt.findMany({
        where: { tenancyId }, orderBy: { dueDate: 'asc' },
      });
      expect(rows.map((r) => [r.forMonth, r.status, r.receivedAmount?.toString()])).toEqual([
        ['2026-01', 'RECEIVED', '30000'],
        ['2026-02', 'PARTIAL', '10000'],
      ]);
      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.depositHeld.toString()).toBe('60000');
      expect(tenancy.balanceDue.toString()).toBe('20000');
    });
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const report = await backfillRentalLedger();
    expect(report.paymentsCreated).toBe(0);
    expect(report.depositsCreated).toBe(0);
    expect(report.drift).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @everypaisa/api exec vitest run test/scripts/backfillRentalLedger.test.ts
```

Expected: FAIL — `Cannot find module '../../scripts/backfillRentalLedger.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/api/scripts/backfillRentalLedger.ts`:

```ts
/**
 * One-time backfill: turn legacy RentReceipt payment state into
 * RentLedgerEntry rows, then recompute every tenancy and assert nothing
 * moved.
 *
 * Idempotent — each generated entry carries a deterministic `sourceHash`
 * (CLAUDE.md §3.3), so a second run inserts nothing.
 *
 * Run: pnpm --filter @everypaisa/api exec tsx scripts/backfillRentalLedger.ts
 */

import { createHash } from 'node:crypto';
import { prisma, runInTransaction, runAsSystem } from '../src/lib/prisma.js';
import { recomputeTenancyLedger } from '../src/services/rentalLedger.service.js';

export interface BackfillReport {
  paymentsCreated: number;
  depositsCreated: number;
  tenanciesRecomputed: number;
  drift: Array<{ receiptId: string; before: string; after: string }>;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

export async function backfillRentalLedger(
  opts: { dryRun?: boolean } = {},
): Promise<BackfillReport> {
  return runAsSystem(async () => {
    const report: BackfillReport = {
      paymentsCreated: 0,
      depositsCreated: 0,
      tenanciesRecomputed: 0,
      drift: [],
    };

    const receipts = await prisma.rentReceipt.findMany({
      where: { receivedAmount: { not: null } },
    });
    const tenancies = await prisma.tenancy.findMany();

    // Snapshot the pre-backfill projection so step 5 can compare.
    const before = new Map(
      (await prisma.rentReceipt.findMany()).map((r) => [
        r.id,
        `${r.status}|${r.receivedAmount?.toString() ?? ''}`,
      ]),
    );

    for (const r of receipts) {
      const sourceHash = hash(`rentledger:backfill:payment:${r.id}`);
      const exists = await prisma.rentLedgerEntry.findUnique({ where: { sourceHash } });
      if (exists) continue;
      if (opts.dryRun) { report.paymentsCreated += 1; continue; }
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId: r.tenancyId,
          entryType: 'PAYMENT',
          amount: r.receivedAmount!,
          entryDate: r.receivedOn ?? r.dueDate,
          forMonth: r.forMonth,
          note: 'Backfilled from receipt',
          cashFlowId: r.cashFlowId,
          canonicalEventId: r.autoMatchedFromEventId,
          sourceHash,
        },
      });
      report.paymentsCreated += 1;
    }

    for (const t of tenancies) {
      if (!t.securityDeposit || t.securityDeposit.lte(0)) continue;
      const sourceHash = hash(`rentledger:backfill:deposit:${t.id}`);
      const exists = await prisma.rentLedgerEntry.findUnique({ where: { sourceHash } });
      if (exists) continue;
      if (opts.dryRun) { report.depositsCreated += 1; continue; }
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId: t.id,
          entryType: 'DEPOSIT',
          amount: t.securityDeposit,
          entryDate: t.startDate,
          note: 'Security deposit (backfilled from tenancy)',
          sourceHash,
        },
      });
      report.depositsCreated += 1;
    }

    if (opts.dryRun) return report;

    for (const t of tenancies) {
      await runInTransaction((tx) => recomputeTenancyLedger(tx, t.id));
      report.tenanciesRecomputed += 1;
    }

    for (const r of await prisma.rentReceipt.findMany()) {
      const after = `${r.status}|${r.receivedAmount?.toString() ?? ''}`;
      const prior = before.get(r.id);
      if (prior !== undefined && prior !== after) {
        report.drift.push({ receiptId: r.id, before: prior, after });
      }
    }

    return report;
  });
}

// Direct execution: print the report and exit non-zero on drift.
if (process.argv[1]?.endsWith('backfillRentalLedger.ts')) {
  backfillRentalLedger()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.drift.length === 0 ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

> If `runAsSystem` is not exported from `../src/lib/prisma.js`, check `packages/api/test/helpers/db.ts` — its header comment says setup runs under `runAsSystem`, so find the real export path there and import from it.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @everypaisa/api exec vitest run test/scripts/backfillRentalLedger.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Run the backfill against the dev database — G2 GATE**

**STOP.** Show the user the dry-run output first:

```bash
pnpm --filter @everypaisa/api exec tsx scripts/backfillRentalLedger.ts --dry-run
```

Then, on approval, run it for real and show the report. `drift` must be `[]`. If it is not, stop and report — do not proceed to Task 5.

- [ ] **Step 6: Commit**

```bash
git add packages/api/scripts/backfillRentalLedger.ts packages/api/test/scripts/backfillRentalLedger.test.ts
git commit
```

Message: `feat(rental): backfill legacy receipts into ledger entries`

---

### Task 5: Reroute every rent write path through the ledger

**Files:**
- Modify: `packages/api/src/services/rental.service.ts` — `markReceiptReceived` (587-651), `skipReceipt` (654-679), `unsettledStatusFor` (686-693), `resolveRentReceiptReminders` (703-713), `unmarkReceived` (722-742), `unskipReceipt` (752-760), `markOverdueReceipts` (896-920), `applyAutoMatch` (1001-1049), `undoAutoMatch` (1088-1112), `createTenancy` (357-410), `updateTenancy` (422-517)
- Test: `packages/api/test/regressions/rental-second-payment.test.ts`

**Interfaces:**
- Consumes: `recomputeTenancyLedger`, `recomputeTenancy`, `OVERDUE_GRACE_DAYS` from `./rentalLedger.service.js`.
- Produces: unchanged public signatures for every function listed above — the controllers do not change in this task.

- [ ] **Step 1: Write the failing regression test**

Create `packages/api/test/regressions/rental-second-payment.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { markReceiptReceived } from '../../src/services/rental.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * REGRESSION: markReceiptReceived used to return early when a receipt was
 * already RECEIVED, so a tenant could never pay one month in two parts.
 * With the ledger, each call appends a PAYMENT entry and the receipt is
 * recomputed from the sum.
 */
describe('regression: a receipt accepts more than one payment', () => {
  let scope: TestScope;
  let receiptId: string;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-second-payment');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Second Payment', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Split Payer',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          monthlyRent: '45000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      const receipt = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-06', expectedAmount: '45000',
          dueDate: new Date('2026-06-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      receiptId = receipt.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('sums two part-payments into RECEIVED', async () => {
    await scope.runAs(async () => {
      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '20000', receivedOn: '2026-06-03',
      });
      let row = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(row.status).toBe('PARTIAL');

      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '25000', receivedOn: '2026-06-14',
      });
      row = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(row.status).toBe('RECEIVED');
      expect(row.receivedAmount?.toString()).toBe('45000');

      const entries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId, entryType: 'PAYMENT' },
      });
      expect(entries).toHaveLength(2);

      const flows = await prisma.cashFlow.findMany({
        where: { id: { in: entries.map((e) => e.cashFlowId!).filter(Boolean) } },
      });
      expect(flows).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @everypaisa/api exec vitest run test/regressions/rental-second-payment.test.ts
```

Expected: FAIL — the second `markReceiptReceived` returns early and the receipt stays at `20000`.

- [ ] **Step 3: Rewrite `markReceiptReceived`**

Replace the body (`rental.service.ts:587-651`) with:

```ts
export async function markReceiptReceived(
  userId: string,
  receiptId: string,
  input: MarkReceivedInput,
): Promise<RentReceipt> {
  const existing = await getReceiptOwned(userId, receiptId);
  const received = parseDecimal(input.receivedAmount, 'receivedAmount');
  if (received.lte(0)) {
    throw new BadRequestError('receivedAmount must be positive');
  }
  const receivedOn = parseIsoDate(input.receivedOn);

  const portfolioId =
    existing.tenancy.property.portfolioId ??
    (await prisma.portfolio.findFirst({
      where: { userId, isDefault: true },
      select: { id: true },
    }))?.id ??
    (await prisma.portfolio.findFirst({
      where: { userId },
      select: { id: true },
    }))?.id ??
    null;

  return runInTransaction(async (tx) => {
    let cashFlowId: string | null = null;
    if (portfolioId) {
      const cf = await tx.cashFlow.create({
        data: {
          portfolioId,
          date: receivedOn,
          type: 'INFLOW',
          amount: received,
          description: `Rent received — ${existing.tenancy.property.name} / ${existing.tenancy.tenantName} (${existing.forMonth})`,
        },
        select: { id: true },
      });
      cashFlowId = cf.id;
    }
    await tx.rentLedgerEntry.create({
      data: {
        tenancyId: existing.tenancyId,
        entryType: 'PAYMENT',
        amount: received,
        entryDate: receivedOn,
        forMonth: existing.forMonth,
        note: input.notes ?? null,
        cashFlowId,
      },
    });
    if (input.notes) {
      await tx.rentReceipt.update({
        where: { id: receiptId },
        data: { notes: input.notes },
      });
    }
    await recomputeTenancyLedger(tx, existing.tenancyId);
    return tx.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  });
}
```

Add the import at the top of the file, next to the other service imports:

```ts
import {
  recomputeTenancyLedger,
  recomputeTenancy,
  resolveRentReceiptReminders,
} from './rentalLedger.service.js';
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @everypaisa/api exec vitest run test/regressions/rental-second-payment.test.ts
```

Expected: PASS.

- [ ] **Step 5: Delete the now-duplicated local helper**

Delete the local `resolveRentReceiptReminders` function (`rental.service.ts:703-713`) — it now lives in `rentalLedger.service.ts` and is imported. Leave every call site as-is; the import satisfies them.

- [ ] **Step 6: Rewrite `skipReceipt` and `unskipReceipt` to use `isSkipped`**

```ts
export async function skipReceipt(
  userId: string,
  receiptId: string,
  reason?: string | null,
) {
  const existing = await getReceiptOwned(userId, receiptId);
  if (existing.receivedAmount && existing.receivedAmount.gt(0)) {
    throw new BadRequestError(
      'Cannot skip a receipt with payments against it — remove the payment from the khata first',
    );
  }
  return runInTransaction(async (tx) => {
    await tx.rentReceipt.update({
      where: { id: receiptId },
      data: { isSkipped: true, notes: reason ?? existing.notes },
    });
    await recomputeTenancyLedger(tx, existing.tenancyId);
    await resolveRentReceiptReminders(tx, receiptId);
    return tx.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  });
}

export async function unskipReceipt(userId: string, receiptId: string) {
  const existing = await getReceiptOwned(userId, receiptId);
  if (!existing.isSkipped) {
    throw new BadRequestError('Receipt is not skipped — nothing to undo');
  }
  return runInTransaction(async (tx) => {
    await tx.rentReceipt.update({ where: { id: receiptId }, data: { isSkipped: false } });
    await recomputeTenancyLedger(tx, existing.tenancyId);
    return tx.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  });
}
```

Delete `unsettledStatusFor` (`rental.service.ts:686-693`) — `deriveReceiptStatus` replaces it.

- [ ] **Step 7: Rewrite `unmarkReceived`**

```ts
/**
 * Undo a manual "mark received" / "auto-match" click by deleting the payment
 * entries pinned to this month (and the CashFlow rows they created), then
 * recomputing. A payment that landed on this month via FIFO rather than a
 * pin is not deleted — that money genuinely belongs to the tenant's khata,
 * so the user removes it from the khata directly instead.
 */
export async function unmarkReceived(userId: string, receiptId: string) {
  const existing = await getReceiptOwned(userId, receiptId);
  const pinned = await prisma.rentLedgerEntry.findMany({
    where: {
      tenancyId: existing.tenancyId,
      entryType: 'PAYMENT',
      forMonth: existing.forMonth,
    },
  });
  if (pinned.length === 0) {
    throw new BadRequestError(
      'No payment is pinned to this month — remove the payment from the khata instead',
    );
  }
  return runInTransaction(async (tx) => {
    const cashFlowIds = pinned.map((e) => e.cashFlowId).filter((v): v is string => !!v);
    if (cashFlowIds.length > 0) {
      await tx.cashFlow.deleteMany({ where: { id: { in: cashFlowIds } } });
    }
    await tx.rentLedgerEntry.deleteMany({ where: { id: { in: pinned.map((e) => e.id) } } });
    await recomputeTenancyLedger(tx, existing.tenancyId);
    return tx.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  });
}
```

- [ ] **Step 8: Rewrite `applyAutoMatch` and `undoAutoMatch`**

```ts
export async function applyAutoMatch(
  userId: string,
  receiptId: string,
  event: AutoMatchCandidateEvent,
  existingCashFlowId: string | null = null,
): Promise<RentReceipt> {
  const existing = await getReceiptOwned(userId, receiptId);
  if (existing.status === RECEIPT_STATUS.RECEIVED) return existing;

  const received = event.amount
    ? new Prisma.Decimal(event.amount.toString())
    : new Prisma.Decimal(existing.expectedAmount.toString());
  const receivedOn = event.eventDate;
  const portfolioId = existing.tenancy.property.portfolioId ?? null;

  return runInTransaction(async (tx) => {
    let cashFlowId: string | null = existingCashFlowId;
    if (!cashFlowId && portfolioId) {
      const cf = await tx.cashFlow.create({
        data: {
          portfolioId,
          date: receivedOn,
          type: 'INFLOW',
          amount: received,
          description: `Auto-matched rent — ${existing.tenancy.property.name} / ${existing.tenancy.tenantName} (${existing.forMonth})`,
        },
        select: { id: true },
      });
      cashFlowId = cf.id;
    }
    await tx.rentLedgerEntry.create({
      data: {
        tenancyId: existing.tenancyId,
        entryType: 'PAYMENT',
        amount: received,
        entryDate: receivedOn,
        forMonth: existing.forMonth,
        note: 'Auto-matched from bank credit',
        cashFlowId,
        canonicalEventId: event.id,
        sourceHash: `rentledger:automatch:${event.id}:${receiptId}`,
      },
    });
    await recomputeTenancyLedger(tx, existing.tenancyId);
    return tx.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  });
}

export async function undoAutoMatch(userId: string, receiptId: string) {
  const existing = await getReceiptOwned(userId, receiptId);
  const matched = await prisma.rentLedgerEntry.findMany({
    where: {
      tenancyId: existing.tenancyId,
      forMonth: existing.forMonth,
      canonicalEventId: { not: null },
    },
  });
  if (matched.length === 0) {
    throw new BadRequestError('Receipt was not auto-matched');
  }
  return runInTransaction(async (tx) => {
    const cashFlowIds = matched.map((e) => e.cashFlowId).filter((v): v is string => !!v);
    if (cashFlowIds.length > 0) {
      await tx.cashFlow.deleteMany({ where: { id: { in: cashFlowIds } } });
    }
    await tx.rentLedgerEntry.deleteMany({ where: { id: { in: matched.map((e) => e.id) } } });
    await recomputeTenancyLedger(tx, existing.tenancyId);
    return tx.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  });
}
```

The `sourceHash` on the auto-match entry makes a replayed projection event a no-op instead of a double credit (§3.3). Prisma throws `P2002` on the unique constraint; catch it in `hookAutoMatchRentalCredit`, which already logs and returns `{ kind: 'no_match' }` — no change needed there.

- [ ] **Step 9: Rewrite `markOverdueReceipts`**

```ts
/**
 * Daily cron. Status is derived now, so instead of a blind updateMany we
 * recompute every tenancy that has an unpaid receipt past the grace window
 * and let `deriveReceiptStatus` decide. Returns the number of receipts that
 * actually flipped to OVERDUE.
 */
export async function markOverdueReceipts(userId?: string): Promise<number> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - OVERDUE_GRACE_DAYS);
  cutoff.setUTCHours(0, 0, 0, 0);

  const candidates = await prisma.rentReceipt.findMany({
    where: {
      status: RECEIPT_STATUS.EXPECTED,
      dueDate: { lte: cutoff },
      ...(userId ? { tenancy: { property: { userId } } } : {}),
    },
    select: { id: true, tenancyId: true },
  });
  if (candidates.length === 0) return 0;

  const tenancyIds = [...new Set(candidates.map((r) => r.tenancyId))];
  for (const tenancyId of tenancyIds) {
    await recomputeTenancy(tenancyId);
  }

  const flipped = await prisma.rentReceipt.count({
    where: { id: { in: candidates.map((r) => r.id) }, status: RECEIPT_STATUS.OVERDUE },
  });
  if (flipped > 0) {
    logger.info({ count: flipped, userId: userId ?? '<all>' }, 'rental.overdue.flipped');
  }
  return flipped;
}
```

- [ ] **Step 10: Recompute after tenancy writes**

In `createTenancy`, after the `generateReceiptsForTenancy` call and before `return tenancy`, add:

```ts
    if (securityDeposit && securityDeposit.gt(0)) {
      await tx.rentLedgerEntry.create({
        data: {
          tenancyId: tenancy.id,
          entryType: 'DEPOSIT',
          amount: securityDeposit,
          entryDate: startDate,
          note: 'Security deposit',
        },
      });
    }
    await recomputeTenancyLedger(tx, tenancy.id);
```

In `updateTenancy`, replace the shorten-endDate block that writes `status: RECEIPT_STATUS.SKIPPED` with:

```ts
      if (newEndDate) {
        await tx.rentReceipt.updateMany({
          where: {
            tenancyId: id,
            dueDate: { gt: newEndDate },
            receivedAmount: null,
          },
          data: { isSkipped: true },
        });
      }
```

and add `await recomputeTenancyLedger(tx, id);` immediately before the `return updated;` at the end of the transaction callback.

- [ ] **Step 11: Verify no stale writers remain**

```bash
grep -n "status: RECEIPT_STATUS\|receivedAmount:\|receivedOn:" packages/api/src/services/rental.service.ts
```

Expected: only reads and the `generateReceiptsForTenancy` seeding write remain. Any other write to those columns is a §3.1 violation — fix it before committing.

- [ ] **Step 12: Run the whole rental test surface**

```bash
pnpm --filter @everypaisa/api exec vitest run test/invariants/rental-ledger-recompute.test.ts test/invariants/rental-ledger-rls.test.ts test/regressions/rental-second-payment.test.ts test/scripts/backfillRentalLedger.test.ts
```

Expected: all PASS.

- [ ] **Step 13: Commit**

```bash
git add packages/api/src/services/rental.service.ts packages/api/test/regressions/rental-second-payment.test.ts
git commit
```

Message: `refactor(rental): route every rent write through the ledger`

---

### Task 6: Ledger CRUD, collections and reminder-link services

**Files:**
- Modify: `packages/api/src/services/rentalLedger.service.ts`
- Test: `packages/api/test/services/rentalLedgerEntries.test.ts`

**Interfaces:**
- Consumes: `recomputeTenancyLedger` (Task 3); `getTenancyOwned` — currently a private helper in `rental.service.ts:410-418`; export it from there and import it here.
- Produces:
  ```ts
  export interface CreateLedgerEntryInput { entryType: LedgerEntryType; amount: string; entryDate: string; forMonth?: string | null; note?: string | null; attachmentUrl?: string | null }
  export type UpdateLedgerEntryInput = Partial<CreateLedgerEntryInput>
  export interface LedgerRowDTO { id: string; kind: 'CHARGE' | 'CREDIT'; source: 'RECEIPT' | 'ENTRY'; entryType: string; date: string; amount: string; note: string | null; attachmentUrl: string | null; forMonth: string | null; runningBalance: string }
  export interface TenancyLedgerDTO { tenancyId: string; tenantName: string; tenantPhone: string | null; propertyId: string; propertyName: string; monthlyRent: string; balanceDue: string; depositHeld: string; rows: LedgerRowDTO[] }
  export interface CollectionRowDTO { tenancyId: string; tenantName: string; tenantPhone: string | null; propertyId: string; propertyName: string; balanceDue: string; oldestUnpaidMonth: string | null; oldestUnpaidDueDate: string | null }
  export async function createLedgerEntry(userId: string, tenancyId: string, input: CreateLedgerEntryInput): Promise<{ id: string }>
  export async function updateLedgerEntry(userId: string, entryId: string, patch: UpdateLedgerEntryInput): Promise<{ id: string }>
  export async function deleteLedgerEntry(userId: string, entryId: string): Promise<void>
  export async function getTenancyLedger(userId: string, tenancyId: string): Promise<TenancyLedgerDTO>
  export async function listCollections(userId: string): Promise<CollectionRowDTO[]>
  export async function buildReminderMessage(userId: string, tenancyId: string): Promise<{ text: string; waUrl: string | null }>
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/services/rentalLedgerEntries.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createLedgerEntry,
  deleteLedgerEntry,
  getTenancyLedger,
  listCollections,
  buildReminderMessage,
} from '../../src/services/rentalLedger.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

describe('rental ledger entries', () => {
  let scope: TestScope;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-entries');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: scope.userId,
          name: 'Andheri East flat',
          propertyType: 'RESIDENTIAL',
          landlordName: 'Test Landlord',
          paymentInstructions: 'UPI: test@upi',
        },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Rajesh Kumar',
          tenantPhone: '9876543210',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '45000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-04', expectedAmount: '45000',
          dueDate: new Date('2026-04-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('creates a payment entry, a CashFlow, and moves the balance', async () => {
    await scope.runAs(async () => {
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'PAYMENT', amount: '20000', entryDate: '2026-04-05', note: 'part 1',
      });
      const ledger = await getTenancyLedger(scope.userId, tenancyId);
      expect(ledger.balanceDue).toBe('25000');
      expect(ledger.rows.some((r) => r.entryType === 'PAYMENT' && r.amount === '20000')).toBe(true);
    });
  });

  it('rejects a non-positive amount', async () => {
    await scope.runAs(async () => {
      await expect(
        createLedgerEntry(scope.userId, tenancyId, {
          entryType: 'PAYMENT', amount: '0', entryDate: '2026-04-05',
        }),
      ).rejects.toThrow(/positive/i);
    });
  });

  it('rejects an unknown entry type', async () => {
    await scope.runAs(async () => {
      await expect(
        createLedgerEntry(scope.userId, tenancyId, {
          // @ts-expect-error deliberately invalid
          entryType: 'BRIBE', amount: '100', entryDate: '2026-04-05',
        }),
      ).rejects.toThrow(/entryType/i);
    });
  });

  it('lists the tenancy in collections with the oldest unpaid month', async () => {
    await scope.runAs(async () => {
      const rows = await listCollections(scope.userId);
      const row = rows.find((r) => r.tenancyId === tenancyId);
      expect(row?.balanceDue).toBe('25000');
      expect(row?.oldestUnpaidMonth).toBe('2026-04');
    });
  });

  it('builds a wa.me link with the amount and payment instructions', async () => {
    await scope.runAs(async () => {
      const msg = await buildReminderMessage(scope.userId, tenancyId);
      expect(msg.waUrl).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
      expect(msg.text).toContain('Rajesh Kumar');
      expect(msg.text).toContain('25,000');
      expect(msg.text).toContain('test@upi');
    });
  });

  it('deleting the entry restores the balance', async () => {
    await scope.runAs(async () => {
      const ledger = await getTenancyLedger(scope.userId, tenancyId);
      const payment = ledger.rows.find((r) => r.entryType === 'PAYMENT')!;
      await deleteLedgerEntry(scope.userId, payment.id);
      const after = await getTenancyLedger(scope.userId, tenancyId);
      expect(after.balanceDue).toBe('45000');
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @everypaisa/api exec vitest run test/services/rentalLedgerEntries.test.ts
```

Expected: FAIL — `createLedgerEntry is not a function`.

- [ ] **Step 3: Export `getTenancyOwned` from `rental.service.ts`**

Change `async function getTenancyOwned(` at `rental.service.ts:410` to `export async function getTenancyOwned(`.

- [ ] **Step 4: Implement the CRUD and read services**

Append to `packages/api/src/services/rentalLedger.service.ts`:

```ts
import { BadRequestError, NotFoundError, ForbiddenError } from '../lib/errors.js';
import { formatINR } from '@everypaisa/shared';
import { getTenancyOwned } from './rental.service.js';

const CASH_FLOW_DIRECTION: Partial<Record<LedgerEntryType, 'INFLOW' | 'OUTFLOW'>> = {
  PAYMENT: 'INFLOW',
  DEPOSIT: 'INFLOW',
  DEPOSIT_REFUND: 'OUTFLOW',
};

export interface CreateLedgerEntryInput {
  entryType: LedgerEntryType;
  amount: string;
  entryDate: string;
  forMonth?: string | null;
  note?: string | null;
  attachmentUrl?: string | null;
}
export type UpdateLedgerEntryInput = Partial<CreateLedgerEntryInput>;

function parseAmount(raw: string): Prisma.Decimal {
  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(raw);
  } catch {
    throw new BadRequestError(`Invalid decimal for amount: ${raw}`);
  }
  if (d.lte(0)) throw new BadRequestError('amount must be positive');
  return d;
}

function parseDay(raw: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestError(`Invalid date (expected YYYY-MM-DD): ${raw}`);
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

function assertEntryType(t: string): LedgerEntryType {
  if (!(LEDGER_ENTRY_TYPES as readonly string[]).includes(t)) {
    throw new BadRequestError(
      `Invalid entryType: ${t}. Expected one of ${LEDGER_ENTRY_TYPES.join(', ')}`,
    );
  }
  return t as LedgerEntryType;
}

async function getEntryOwned(userId: string, entryId: string) {
  const row = await prisma.rentLedgerEntry.findUnique({
    where: { id: entryId },
    include: { tenancy: { include: { property: { select: { userId: true, portfolioId: true, name: true } } } } },
  });
  if (!row) throw new NotFoundError('Ledger entry not found');
  if (row.tenancy.property.userId !== userId) throw new ForbiddenError();
  return row;
}

export async function createLedgerEntry(
  userId: string,
  tenancyId: string,
  input: CreateLedgerEntryInput,
): Promise<{ id: string }> {
  const tenancy = await getTenancyOwned(userId, tenancyId);
  const entryType = assertEntryType(input.entryType);
  const amount = parseAmount(input.amount);
  const entryDate = parseDay(input.entryDate);
  if (input.forMonth && !/^\d{4}-\d{2}$/.test(input.forMonth)) {
    throw new BadRequestError(`Invalid forMonth (expected YYYY-MM): ${input.forMonth}`);
  }

  const property = await prisma.rentalProperty.findUniqueOrThrow({
    where: { id: tenancy.propertyId },
    select: { name: true, portfolioId: true },
  });
  const direction = CASH_FLOW_DIRECTION[entryType];

  return runInTransaction(async (tx) => {
    let cashFlowId: string | null = null;
    if (direction && property.portfolioId) {
      const cf = await tx.cashFlow.create({
        data: {
          portfolioId: property.portfolioId,
          date: entryDate,
          type: direction,
          amount,
          description: `${entryType} — ${property.name} / ${tenancy.tenantName}`,
        },
        select: { id: true },
      });
      cashFlowId = cf.id;
    }
    const entry = await tx.rentLedgerEntry.create({
      data: {
        tenancyId,
        entryType,
        amount,
        entryDate,
        forMonth: input.forMonth ?? null,
        note: input.note ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        cashFlowId,
      },
      select: { id: true },
    });
    await recomputeTenancyLedger(tx, tenancyId);
    return entry;
  });
}

export async function updateLedgerEntry(
  userId: string,
  entryId: string,
  patch: UpdateLedgerEntryInput,
): Promise<{ id: string }> {
  const existing = await getEntryOwned(userId, entryId);
  const data: Prisma.RentLedgerEntryUpdateInput = {};
  if (patch.entryType !== undefined) data.entryType = assertEntryType(patch.entryType);
  if (patch.amount !== undefined) data.amount = parseAmount(patch.amount);
  if (patch.entryDate !== undefined) data.entryDate = parseDay(patch.entryDate);
  if (patch.forMonth !== undefined) data.forMonth = patch.forMonth;
  if (patch.note !== undefined) data.note = patch.note;
  if (patch.attachmentUrl !== undefined) data.attachmentUrl = patch.attachmentUrl;

  return runInTransaction(async (tx) => {
    const updated = await tx.rentLedgerEntry.update({
      where: { id: entryId }, data, select: { id: true, cashFlowId: true, amount: true, entryDate: true },
    });
    if (updated.cashFlowId) {
      await tx.cashFlow.update({
        where: { id: updated.cashFlowId },
        data: { amount: updated.amount, date: updated.entryDate },
      });
    }
    await recomputeTenancyLedger(tx, existing.tenancyId);
    return { id: updated.id };
  });
}

export async function deleteLedgerEntry(userId: string, entryId: string): Promise<void> {
  const existing = await getEntryOwned(userId, entryId);
  await runInTransaction(async (tx) => {
    if (existing.cashFlowId) {
      await tx.cashFlow.deleteMany({ where: { id: existing.cashFlowId } });
    }
    await tx.rentLedgerEntry.delete({ where: { id: entryId } });
    await recomputeTenancyLedger(tx, existing.tenancyId);
  });
}

export interface LedgerRowDTO {
  id: string;
  kind: 'CHARGE' | 'CREDIT';
  source: 'RECEIPT' | 'ENTRY';
  entryType: string;
  date: string;
  amount: string;
  note: string | null;
  attachmentUrl: string | null;
  forMonth: string | null;
  /** Balance after this row, oldest-to-newest. */
  runningBalance: string;
}

export interface TenancyLedgerDTO {
  tenancyId: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyId: string;
  propertyName: string;
  monthlyRent: string;
  balanceDue: string;
  depositHeld: string;
  /** Newest first. */
  rows: LedgerRowDTO[];
}

export async function getTenancyLedger(
  userId: string,
  tenancyId: string,
): Promise<TenancyLedgerDTO> {
  const tenancy = await getTenancyOwned(userId, tenancyId);
  const [property, receipts, entries, fresh] = await Promise.all([
    prisma.rentalProperty.findUniqueOrThrow({
      where: { id: tenancy.propertyId }, select: { id: true, name: true },
    }),
    prisma.rentReceipt.findMany({ where: { tenancyId }, orderBy: { dueDate: 'asc' } }),
    prisma.rentLedgerEntry.findMany({ where: { tenancyId }, orderBy: { entryDate: 'asc' } }),
    prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } }),
  ]);

  type Row = Omit<LedgerRowDTO, 'runningBalance'> & { sortKey: number };
  const rows: Row[] = [];
  for (const r of receipts) {
    if (r.isSkipped) continue;
    rows.push({
      id: r.id, kind: 'CHARGE', source: 'RECEIPT', entryType: 'RENT_CHARGE',
      date: r.dueDate.toISOString().slice(0, 10),
      amount: r.expectedAmount.toString(), note: r.notes,
      attachmentUrl: null, forMonth: r.forMonth, sortKey: r.dueDate.getTime(),
    });
  }
  for (const e of entries) {
    const type = e.entryType as LedgerEntryType;
    const kind: 'CHARGE' | 'CREDIT' = CHARGE_TYPES.has(type) ? 'CHARGE' : 'CREDIT';
    rows.push({
      id: e.id, kind, source: 'ENTRY', entryType: e.entryType,
      date: e.entryDate.toISOString().slice(0, 10),
      amount: e.amount.toString(), note: e.note,
      attachmentUrl: e.attachmentUrl, forMonth: e.forMonth, sortKey: e.entryDate.getTime(),
    });
  }
  rows.sort((a, b) => a.sortKey - b.sortKey);

  // Deposits sit outside the rent balance, so they carry it unchanged.
  let running = ZERO;
  const withBalance: LedgerRowDTO[] = rows.map(({ sortKey: _sortKey, ...row }) => {
    const amt = new Prisma.Decimal(row.amount);
    if (row.entryType !== 'DEPOSIT' && row.entryType !== 'DEPOSIT_REFUND') {
      running = row.kind === 'CHARGE' ? running.plus(amt) : running.minus(amt);
    }
    return { ...row, runningBalance: running.toString() };
  });

  return {
    tenancyId,
    tenantName: tenancy.tenantName,
    tenantPhone: tenancy.tenantPhone,
    propertyId: property.id,
    propertyName: property.name,
    monthlyRent: fresh.monthlyRent.toString(),
    balanceDue: fresh.balanceDue.toString(),
    depositHeld: fresh.depositHeld.toString(),
    rows: withBalance.reverse(),
  };
}

export interface CollectionRowDTO {
  tenancyId: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyId: string;
  propertyName: string;
  balanceDue: string;
  oldestUnpaidMonth: string | null;
  oldestUnpaidDueDate: string | null;
}

export async function listCollections(userId: string): Promise<CollectionRowDTO[]> {
  const tenancies = await prisma.tenancy.findMany({
    where: { isActive: true, property: { userId }, balanceDue: { gt: 0 } },
    include: { property: { select: { id: true, name: true } } },
    orderBy: { balanceDue: 'desc' },
  });
  if (tenancies.length === 0) return [];

  const oldest = await prisma.rentReceipt.findMany({
    where: {
      tenancyId: { in: tenancies.map((t) => t.id) },
      isSkipped: false,
      status: { in: ['EXPECTED', 'OVERDUE', 'PARTIAL'] },
    },
    orderBy: { dueDate: 'asc' },
    select: { tenancyId: true, forMonth: true, dueDate: true },
  });
  const firstUnpaid = new Map<string, { forMonth: string; dueDate: Date }>();
  for (const r of oldest) {
    if (!firstUnpaid.has(r.tenancyId)) {
      firstUnpaid.set(r.tenancyId, { forMonth: r.forMonth, dueDate: r.dueDate });
    }
  }

  return tenancies.map((t) => {
    const u = firstUnpaid.get(t.id);
    return {
      tenancyId: t.id,
      tenantName: t.tenantName,
      tenantPhone: t.tenantPhone,
      propertyId: t.property.id,
      propertyName: t.property.name,
      balanceDue: t.balanceDue.toString(),
      oldestUnpaidMonth: u?.forMonth ?? null,
      oldestUnpaidDueDate: u?.dueDate.toISOString().slice(0, 10) ?? null,
    };
  });
}

/**
 * Normalise an Indian mobile to E.164 digits for a wa.me link. Mirrors the
 * rule in notifications/sms.service.ts, minus the leading '+' (wa.me wants
 * bare digits). Returns null when the number is unusable, so the UI can
 * disable the button instead of opening a broken link.
 */
function waDigits(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-()+]/g, '');
  if (!/^\d{8,15}$/.test(cleaned)) return null;
  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) return `91${cleaned}`;
  return cleaned;
}

export async function buildReminderMessage(
  userId: string,
  tenancyId: string,
): Promise<{ text: string; waUrl: string | null }> {
  const ledger = await getTenancyLedger(userId, tenancyId);
  const property = await prisma.rentalProperty.findUniqueOrThrow({
    where: { id: ledger.propertyId },
    select: { name: true, landlordName: true, paymentInstructions: true },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId }, select: { name: true },
  });

  const due = formatINR(new Prisma.Decimal(ledger.balanceDue).toString());
  const monthLine = ledger.rows.find((r) => r.source === 'RECEIPT');
  const lines = [
    `Hi ${ledger.tenantName},`,
    '',
    `This is a reminder that ${due} is outstanding on ${property.name}${
      monthLine?.forMonth ? ` (oldest pending: ${monthLine.forMonth})` : ''
    }.`,
  ];
  if (property.paymentInstructions) {
    lines.push('', property.paymentInstructions);
  }
  lines.push('', `— ${property.landlordName ?? user.name ?? 'Your landlord'}`);
  const text = lines.join('\n');

  const digits = waDigits(ledger.tenantPhone);
  return {
    text,
    waUrl: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null,
  };
}
```

> `formatINR` is exported from `@everypaisa/shared` and is already used on the web side (`RentalListPage.tsx:20`). If its signature there takes a `Decimal` rather than a string, adapt the one call above; do not add a second formatter.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @everypaisa/api exec vitest run test/services/rentalLedgerEntries.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/rentalLedger.service.ts packages/api/src/services/rental.service.ts packages/api/test/services/rentalLedgerEntries.test.ts
git commit
```

Message: `feat(rental): ledger entry CRUD, collections list and reminder message`

---

### Task 7: HTTP routes for the khata

**Files:**
- Modify: `packages/api/src/controllers/rental.controller.ts` (add handlers at the end)
- Modify: `packages/api/src/routes/rental.routes.ts`
- Test: `packages/api/test/services/rentalLedgerRoutes.test.ts`

**Interfaces:**
- Consumes: everything Task 6 produced; `ok` from `../lib/response.js`; `streamPdf`, `fmtNum`, `fmtDate`, `type ExportColumn` from `../services/export.service.js`.
- Produces: handlers `getTenancyLedgerHandler`, `createLedgerEntryHandler`, `updateLedgerEntryHandler`, `deleteLedgerEntryHandler`, `listCollectionsHandler`, `getReminderLinkHandler`, `getTenancyStatementHandler`.

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/services/rentalLedgerRoutes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rentalRouter } from '../../src/routes/rental.routes.js';

/**
 * The khata routes must be registered, and `/tenancies/:id/ledger` must be
 * declared before any bare `/tenancies/:tenancyId` route so Express does not
 * swallow the more specific path.
 */
function paths(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rentalRouter as any).stack
    .filter((l: any) => l.route)
    .map((l: any) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
}

describe('rental ledger routes', () => {
  it('registers every khata endpoint', () => {
    const p = paths();
    expect(p).toContain('GET /tenancies/:tenancyId/ledger');
    expect(p).toContain('POST /tenancies/:tenancyId/entries');
    expect(p).toContain('PATCH /entries/:entryId');
    expect(p).toContain('DELETE /entries/:entryId');
    expect(p).toContain('GET /collections');
    expect(p).toContain('GET /tenancies/:tenancyId/reminder-link');
    expect(p).toContain('GET /tenancies/:tenancyId/statement');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @everypaisa/api exec vitest run test/services/rentalLedgerRoutes.test.ts
```

Expected: FAIL — the ledger paths are missing.

- [ ] **Step 3: Add the controller handlers**

Append to `packages/api/src/controllers/rental.controller.ts`:

```ts
import {
  createLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry,
  getTenancyLedger,
  listCollections,
  buildReminderMessage,
  LEDGER_ENTRY_TYPES,
} from '../services/rentalLedger.service.js';
import { streamPdf, fmtNum, fmtDate, type ExportColumn } from '../services/export.service.js';

const ledgerEntrySchema = z.object({
  entryType: z.enum(LEDGER_ENTRY_TYPES),
  amount: moneyString,
  entryDate: isoDate,
  forMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  attachmentUrl: z.string().max(2000).nullable().optional(),
});
const ledgerEntryPatchSchema = ledgerEntrySchema.partial();

export async function getTenancyLedgerHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError();
  ok(res, await getTenancyLedger(userId, req.params.tenancyId));
}

export async function createLedgerEntryHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError();
  const input = ledgerEntrySchema.parse(req.body);
  ok(res, await createLedgerEntry(userId, req.params.tenancyId, input));
}

export async function updateLedgerEntryHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError();
  const patch = ledgerEntryPatchSchema.parse(req.body);
  ok(res, await updateLedgerEntry(userId, req.params.entryId, patch));
}

export async function deleteLedgerEntryHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError();
  await deleteLedgerEntry(userId, req.params.entryId);
  ok(res, { deleted: true });
}

export async function listCollectionsHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError();
  ok(res, await listCollections(userId));
}

export async function getReminderLinkHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError();
  ok(res, await buildReminderMessage(userId, req.params.tenancyId));
}

export async function getTenancyStatementHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError();
  const ledger = await getTenancyLedger(userId, req.params.tenancyId);
  const columns: ExportColumn[] = [
    { key: 'date',           header: 'Date',    width: 12, formatter: fmtDate },
    { key: 'description',    header: 'Details', width: 34 },
    { key: 'youGave',        header: 'Charged', width: 14, formatter: (v) => fmtNum(v) },
    { key: 'youGot',         header: 'Paid',    width: 14, formatter: (v) => fmtNum(v) },
    { key: 'runningBalance', header: 'Balance', width: 14, formatter: (v) => fmtNum(v) },
  ];
  await streamPdf(res, {
    title: `Rent statement — ${ledger.tenantName}`,
    meta: {
      Property: ledger.propertyName,
      Tenant: ledger.tenantName,
      'Balance Due': ledger.balanceDue,
      'Deposit Held': ledger.depositHeld,
      'Generated On': new Date().toISOString().slice(0, 10),
    },
    columns,
    // Oldest first reads better on a statement than the screen's newest-first.
    rows: [...ledger.rows].reverse().map((r) => ({
      date: r.date,
      description: r.note ?? r.entryType.replace(/_/g, ' ').toLowerCase(),
      youGave: r.kind === 'CHARGE' ? r.amount : '',
      youGot: r.kind === 'CREDIT' ? r.amount : '',
      runningBalance: r.runningBalance,
    })),
  });
}
```

- [ ] **Step 4: Register the routes**

Add to `packages/api/src/routes/rental.routes.ts`, in the import block from `rental.controller.js` and then as routes placed **above** the existing `rentalRouter.patch('/tenancies/:tenancyId', ...)` line:

```ts
// Khata ledger — must precede the bare /tenancies/:tenancyId routes.
rentalRouter.get('/collections', asyncHandler(listCollectionsHandler));
rentalRouter.get('/tenancies/:tenancyId/ledger', asyncHandler(getTenancyLedgerHandler));
rentalRouter.post('/tenancies/:tenancyId/entries', asyncHandler(createLedgerEntryHandler));
rentalRouter.get('/tenancies/:tenancyId/reminder-link', asyncHandler(getReminderLinkHandler));
rentalRouter.get('/tenancies/:tenancyId/statement', asyncHandler(getTenancyStatementHandler));
rentalRouter.patch('/entries/:entryId', asyncHandler(updateLedgerEntryHandler));
rentalRouter.delete('/entries/:entryId', asyncHandler(deleteLedgerEntryHandler));
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @everypaisa/api exec vitest run test/services/rentalLedgerRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Typecheck the API package**

```bash
pnpm --filter @everypaisa/api run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/controllers/rental.controller.ts packages/api/src/routes/rental.routes.ts packages/api/test/services/rentalLedgerRoutes.test.ts
git commit
```

Message: `feat(rental): khata ledger, collections and statement endpoints`

---

### Task 8: Web API client types

**Files:**
- Modify: `apps/web/src/api/rental.api.ts`

**Interfaces:**
- Consumes: the endpoints from Task 7.
- Produces:
  ```ts
  export type LedgerEntryType = 'PAYMENT'|'DISCOUNT'|'LATE_FEE'|'OTHER_CHARGE'|'DEPOSIT'|'DEPOSIT_REFUND'
  export interface LedgerRowDTO { id: string; kind: 'CHARGE'|'CREDIT'; source: 'RECEIPT'|'ENTRY'; entryType: string; date: string; amount: string; note: string|null; attachmentUrl: string|null; forMonth: string|null; runningBalance: string }
  export interface TenancyLedgerDTO { tenancyId: string; tenantName: string; tenantPhone: string|null; propertyId: string; propertyName: string; monthlyRent: string; balanceDue: string; depositHeld: string; rows: LedgerRowDTO[] }
  export interface CollectionRowDTO { tenancyId: string; tenantName: string; tenantPhone: string|null; propertyId: string; propertyName: string; balanceDue: string; oldestUnpaidMonth: string|null; oldestUnpaidDueDate: string|null }
  export interface CreateLedgerEntryInput { entryType: LedgerEntryType; amount: string; entryDate: string; forMonth?: string|null; note?: string|null; attachmentUrl?: string|null }
  // added to the rentalApi object:
  rentalApi.getTenancyLedger(tenancyId: string): Promise<TenancyLedgerDTO>
  rentalApi.createLedgerEntry(tenancyId: string, input: CreateLedgerEntryInput): Promise<{ id: string }>
  rentalApi.updateLedgerEntry(entryId: string, patch: Partial<CreateLedgerEntryInput>): Promise<{ id: string }>
  rentalApi.deleteLedgerEntry(entryId: string): Promise<void>
  rentalApi.listCollections(): Promise<CollectionRowDTO[]>
  rentalApi.getReminderLink(tenancyId: string): Promise<{ text: string; waUrl: string | null }>
  rentalApi.statementUrl(tenancyId: string): string
  ```

- [ ] **Step 1: Add the DTOs**

Append after `PropertyPnLDTO` in `apps/web/src/api/rental.api.ts`:

```ts
export type LedgerEntryType =
  | 'PAYMENT'
  | 'DISCOUNT'
  | 'LATE_FEE'
  | 'OTHER_CHARGE'
  | 'DEPOSIT'
  | 'DEPOSIT_REFUND';

export interface LedgerRowDTO {
  id: string;
  kind: 'CHARGE' | 'CREDIT';
  source: 'RECEIPT' | 'ENTRY';
  /** 'RENT_CHARGE' for receipt rows, otherwise a LedgerEntryType. */
  entryType: string;
  date: string;
  amount: string;
  note: string | null;
  attachmentUrl: string | null;
  forMonth: string | null;
  runningBalance: string;
}

export interface TenancyLedgerDTO {
  tenancyId: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyId: string;
  propertyName: string;
  monthlyRent: string;
  balanceDue: string;
  depositHeld: string;
  /** Newest first. */
  rows: LedgerRowDTO[];
}

export interface CollectionRowDTO {
  tenancyId: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyId: string;
  propertyName: string;
  balanceDue: string;
  oldestUnpaidMonth: string | null;
  oldestUnpaidDueDate: string | null;
}

export interface CreateLedgerEntryInput {
  entryType: LedgerEntryType;
  amount: string;
  entryDate: string;
  forMonth?: string | null;
  note?: string | null;
  attachmentUrl?: string | null;
}
```

- [ ] **Step 2: Add the client methods**

Append inside the `rentalApi` object literal:

```ts
  // Khata ledger
  async getTenancyLedger(tenancyId: string): Promise<TenancyLedgerDTO> {
    const { data } = await api.get<ApiResponse<TenancyLedgerDTO>>(
      `/api/rental/tenancies/${tenancyId}/ledger`,
    );
    return unwrap(data);
  },
  async createLedgerEntry(
    tenancyId: string,
    input: CreateLedgerEntryInput,
  ): Promise<{ id: string }> {
    const { data } = await api.post<ApiResponse<{ id: string }>>(
      `/api/rental/tenancies/${tenancyId}/entries`,
      input,
    );
    return unwrap(data);
  },
  async updateLedgerEntry(
    entryId: string,
    patch: Partial<CreateLedgerEntryInput>,
  ): Promise<{ id: string }> {
    const { data } = await api.patch<ApiResponse<{ id: string }>>(
      `/api/rental/entries/${entryId}`,
      patch,
    );
    return unwrap(data);
  },
  async deleteLedgerEntry(entryId: string): Promise<void> {
    await api.delete(`/api/rental/entries/${entryId}`);
  },
  async listCollections(): Promise<CollectionRowDTO[]> {
    const { data } = await api.get<ApiResponse<CollectionRowDTO[]>>('/api/rental/collections');
    return unwrap(data);
  },
  async getReminderLink(tenancyId: string): Promise<{ text: string; waUrl: string | null }> {
    const { data } = await api.get<ApiResponse<{ text: string; waUrl: string | null }>>(
      `/api/rental/tenancies/${tenancyId}/reminder-link`,
    );
    return unwrap(data);
  },
  statementUrl(tenancyId: string): string {
    return `/api/rental/tenancies/${tenancyId}/statement`;
  },
```

Also add `isSkipped: boolean;` to `RentReceiptDTO` so the UI can tell a skipped month from a derived status.

- [ ] **Step 3: Typecheck the web package**

```bash
pnpm --filter @everypaisa/web run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/rental.api.ts
git commit
```

Message: `feat(web): rental khata ledger API client`

---

### Task 9: TenantKhataPage

**Files:**
- Create: `apps/web/src/pages/rental/TenantKhataPage.tsx`
- Modify: `apps/web/src/App.tsx:37-38, 134-135`

**Interfaces:**
- Consumes: `rentalApi.getTenancyLedger`, `createLedgerEntry`, `deleteLedgerEntry`, `getReminderLink`, `statementUrl` from Task 8.
- Produces: `export function TenantKhataPage(): JSX.Element`, mounted at `/rental/tenancies/:tenancyId`.

Follow the conventions already in `RentalListPage.tsx`: `useQuery`/`useMutation` from `@tanstack/react-query`, `toast` from `react-hot-toast`, `Decimal` and `formatINR` from `@everypaisa/shared`, `PageHeader`, `Button`, `Card`/`CardContent`, `Dialog*`, `Label`, `Input`, `Select`, `EmptyState`, and `lucide-react` icons. Theme colors come from CSS vars (`hsl(var(--positive))`, `hsl(var(--destructive))`) — no hard-coded hex.

- [ ] **Step 1: Create the page**

Create `apps/web/src/pages/rental/TenantKhataPage.tsx` with:

- `useParams<{ tenancyId: string }>()` for the id.
- `useQuery({ queryKey: ['tenancy-ledger', tenancyId], queryFn: () => rentalApi.getTenancyLedger(tenancyId!) })`.
- A `PageHeader` whose `title` is the tenant name and `description` is the property name, with `actions` holding two buttons:
  - **Remind** — `useMutation` calling `rentalApi.getReminderLink(tenancyId)`; on success, if `waUrl` is non-null do `window.open(waUrl, '_blank', 'noopener')`, else `toast.error('Add a phone number for this tenant first')`.
  - **Share statement** — an anchor to `rentalApi.statementUrl(tenancyId)` with `target="_blank"`.
- A balance card under the header: `formatINR(new Decimal(ledger.balanceDue))` rendered large, with the label `'To collect'` when `balanceDue > 0`, `'In advance'` when `< 0` (show the absolute value), `'Settled up'` when `0`. Color: `hsl(var(--destructive))` when owing, `hsl(var(--positive))` when in advance. Below it, a muted line `Deposit held: {formatINR(new Decimal(ledger.depositHeld))}` rendered only when `depositHeld` is non-zero.
- A three-column row list, newest first, headed `Date | You gave | You got` with a right-aligned running balance:
  - charge rows (`kind === 'CHARGE'`) put the amount in the **You gave** column;
  - credit rows put it in **You got**;
  - each row shows the note beneath the date, and `entryType` humanised when the note is null;
  - receipt rows (`source === 'RECEIPT'`) render `Rent · {forMonth}` and have no delete affordance — they are the schedule;
  - entry rows get a small `Trash2` button wired to a `deleteLedgerEntry` mutation, with `qc.invalidateQueries({ queryKey: ['tenancy-ledger', tenancyId] })` on success.
- A sticky bottom bar (`sticky bottom-0` with a `bg-background/95 backdrop-blur` border-top) holding two full-width buttons, `You gave` and `You got`, each opening the same dialog with a preset direction.
- One `Dialog` for adding an entry, holding: an amount `Input` (`inputMode="decimal"`), a date `Input type="date"` defaulting to today, a `Select` of entry types filtered by direction (`You got` → `PAYMENT`, `DISCOUNT`, `DEPOSIT`; `You gave` → `LATE_FEE`, `OTHER_CHARGE`, `DEPOSIT_REFUND`), an optional `forMonth` `Select` listing the receipt months from `ledger.rows` (labelled "Apply to month — leave blank to settle oldest first"), and a note `Input`. Submit calls the `createLedgerEntry` mutation and invalidates both `['tenancy-ledger', tenancyId]` and `['rental-collections']`.
- Loading state: three `Card`s with `h-20 animate-pulse bg-muted/60`, matching `RentalListPage`.
- Empty state: `EmptyState` with the `Receipt` icon, title `No entries yet`, description `Record a payment or a charge to start this tenant's khata.`

All money math uses `Decimal` from `@everypaisa/shared` — never `parseFloat`.

- [ ] **Step 2: Register the route**

In `apps/web/src/App.tsx`, add the import beside the other rental imports:

```tsx
import { TenantKhataPage } from './pages/rental/TenantKhataPage';
```

and add the route **above** `<Route path="/rental/:id" ... />`:

```tsx
        <Route path="/rental/tenancies/:tenancyId" element={<TenantKhataPage />} />
```

- [ ] **Step 3: Typecheck and lint**

```bash
pnpm --filter @everypaisa/web run typecheck
pnpm --filter @everypaisa/web run lint
```

Expected: no errors.

- [ ] **Step 4: Verify in the running app**

Start the app, open a tenancy's khata, add a `You got` payment of half the rent, and confirm: the balance drops by that amount, the row appears with the right running balance, and the month shows PARTIAL on the property detail page. Then delete the entry and confirm the balance returns.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/rental/TenantKhataPage.tsx apps/web/src/App.tsx
git commit
```

Message: `feat(web): tenant khata page with running balance and entry dialog`

---

### Task 10: Collections tab and links into the khata

**Files:**
- Modify: `apps/web/src/pages/rental/RentalListPage.tsx` (render block ~567-610)
- Modify: `apps/web/src/pages/rental/RentalDetailPage.tsx` (tenancy cards)

**Interfaces:**
- Consumes: `rentalApi.listCollections`, `rentalApi.getReminderLink` from Task 8; the route from Task 9.
- Produces: no new exports.

- [ ] **Step 1: Add the Collections tab to RentalListPage**

Wrap the existing body in `Tabs` from `@/components/ui/tabs` (already present in the codebase):

```tsx
<Tabs defaultValue="properties">
  <TabsList>
    <TabsTrigger value="properties">Properties</TabsTrigger>
    <TabsTrigger value="collections">Collections</TabsTrigger>
  </TabsList>
  <TabsContent value="properties">
    {/* everything that renders today: SummaryStrip, RentalRemindersPanel, the grid */}
  </TabsContent>
  <TabsContent value="collections">
    <CollectionsTab />
  </TabsContent>
</Tabs>
```

Add a `CollectionsTab` component in the same file:

- `useQuery({ queryKey: ['rental-collections'], queryFn: () => rentalApi.listCollections() })`.
- Renders one `Card` per row: tenant name (a `Link` to `/rental/tenancies/${row.tenancyId}`), property name muted beneath, `formatINR(new Decimal(row.balanceDue))` right-aligned in `hsl(var(--destructive))`, and `Oldest pending: {row.oldestUnpaidMonth}` when present.
- A `Remind` button per row using the same `getReminderLink` → `window.open(waUrl)` flow as the khata page, disabled when `row.tenantPhone` is null.
- `EmptyState` with the `CheckCircle2` icon, title `All rent collected`, description `No tenant has an outstanding balance right now.`

- [ ] **Step 2: Link tenancy cards into the khata**

In `RentalDetailPage.tsx`, wrap each tenancy card's header in a `Link` to `/rental/tenancies/${tenancy.id}` and add an `ArrowUpRight` icon, matching how property cards link on the list page. Change nothing else on that page.

- [ ] **Step 3: Typecheck and lint**

```bash
pnpm --filter @everypaisa/web run typecheck
pnpm --filter @everypaisa/web run lint
```

Expected: no errors.

- [ ] **Step 4: Verify in the running app**

Open `/rental`, switch to Collections, confirm a tenant with dues is listed with the right amount and oldest pending month, click through to the khata, and click Remind to confirm WhatsApp Web opens with the message prefilled.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/rental/RentalListPage.tsx apps/web/src/pages/rental/RentalDetailPage.tsx
git commit
```

Message: `feat(web): collections tab and khata links from property detail`

---

### Task 11: Full verification

**Files:**
- Create: `packages/api/test/manual-qa-rental-khata.md`

- [ ] **Step 1: Run the whole suite**

```bash
pnpm -r run typecheck
pnpm -r run lint
pnpm -r run test
```

Expected: all green. If a pre-existing failure appears that this branch did not cause, note it in the commit body rather than silencing it.

- [ ] **Step 2: Confirm no code outside the ledger writes the projection**

```bash
grep -rn "rentReceipt.update\|rentReceipt.updateMany" packages/api/src --include=*.ts
```

Expected: hits only in `rentalLedger.service.ts`, plus the `isSkipped` and `notes` writes in `rental.service.ts`. Anything writing `status`, `receivedAmount` or `receivedOn` elsewhere is a §3.1 violation.

- [ ] **Step 3: Write the manual QA checklist**

Create `packages/api/test/manual-qa-rental-khata.md` with a checkbox per item:

```markdown
# Manual QA — rental khata ledger

- [ ] Add a property and a tenancy with a security deposit → khata shows "Deposit held" and the deposit does not change the balance.
- [ ] Balance equals the sum of unpaid rent charges immediately after creating the tenancy.
- [ ] Record a part payment → month shows PARTIAL, balance drops by that amount.
- [ ] Record the remainder → month shows RECEIVED, balance drops to zero.
- [ ] Record an over-payment → balance goes negative and reads "In advance".
- [ ] Record a payment larger than one month with two months overdue → oldest month settles first.
- [ ] Pin a payment to a specific month → that month settles even though an older one is open; the excess spills to the older month.
- [ ] Add a LATE_FEE → balance increases; add a DISCOUNT → balance decreases.
- [ ] Delete a payment entry → balance and month status return to exactly their prior values.
- [ ] Skip a month with no payments → it leaves the balance; unskip restores it.
- [ ] Skip a month that has a payment → rejected with a clear error.
- [ ] Collections tab lists only tenants with dues, sorted by amount, with the right oldest pending month.
- [ ] Remind opens WhatsApp with the tenant's number, the amount, and the property's payment instructions.
- [ ] Remind is disabled for a tenant with no phone number.
- [ ] Share statement downloads a PDF whose closing balance matches the screen.
- [ ] Every money value in the API responses is a string, not a JSON number.
- [ ] Dashboard rent figures and the rental P&L still match what they showed before this branch.
- [ ] Cross-user check: with user A's session, GET another user's tenancy ledger → 403 or 404, never 200.
```

- [ ] **Step 4: Work the checklist against the running app**

Tick each item. Anything that fails gets fixed before the branch is offered for merge — record what you fixed in the commit body.

- [ ] **Step 5: Commit**

```bash
git add packages/api/test/manual-qa-rental-khata.md
git commit
```

Message: `test(rental): manual QA checklist for the khata ledger`
