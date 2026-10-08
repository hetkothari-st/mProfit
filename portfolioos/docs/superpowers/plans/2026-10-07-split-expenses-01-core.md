# Split Expenses — Plan 1: Core ledger (schema, RLS, engine, API)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the server half of the Split Expenses tool: every table (with membership RLS), the split/balance math, and the core `/api/split` endpoints for contacts, groups, members, expenses, settlements, balances, friends and activity.

**Architecture:** One shared copy of each group; Postgres RLS lets a row through only when the caller is a current linked member of its group (SECURITY DEFINER helpers, same pattern as `app_is_active_family_owner`). Balances are never stored — pure functions over payers/shares/settlements in `services/split/`. Thin Express controllers with local Zod schemas call services, which use `runInTransaction` for multi-row writes.

**Tech Stack:** Node 22, Express, Prisma 5.22, PostgreSQL 15 (Docker), decimal.js, Zod, Vitest (no supertest — Node `fetch` against `app.listen(0)`).

**Spec:** `portfolioos/docs/superpowers/specs/2026-10-07-split-expenses-design.md` (§2–§5, §8 core endpoints, §12, §13). Plans 2–6 (web UI; receipts/comments/labels/reminders/pay-now/share-link/linking; email+paste detection; receipt OCR; Android SMS) are written after this one lands, against the real interfaces it produces.

All paths below are relative to `C:\Users\ST269\Desktop\mProfit-split-wt\portfolioos` (worktree, branch `feat/split-expenses`). API package = `packages/api`.

## Global Constraints

- Money is `Decimal` end to end; never `Number`, never `parseFloat`. API serialises money with `serializeMoney` from `@everypaisa/shared` (string, 4 dp).
- All split money is allocated at **2 dp** (paise). `baseAmount = round(amount × fxRate, 2, HALF_EVEN)`. (Refines spec §2 invariant 5, which said 4 dp: 2 dp keeps settle-up amounts payable.)
- Σ shares = amount and Σ payers = amount, exactly, in expense currency; same for the base-currency columns.
- Leftover paise go one paisa at a time to participants **sorted by member id ascending**.
- Every expense belongs to a group. 1:1 expenses use a `DIRECT` group with exactly two members.
- Balances never stored.
- Soft delete (`deletedAt`) for expenses, settlements, comments.
- Only linked members (`SplitMember.userId` set, `leftAt` null) can read or act.
- Every new RLS table is added to `USER_SCOPED_MODELS` in `packages/api/src/lib/prisma.ts` (enforced by `test/invariants/user-scoped-coverage.test.ts`).
- Contact email/phone stored with `sealText` + `hashIdentifier` (purposes `split-contact-email`, `split-contact-phone`), never plaintext when `APP_ENCRYPTION_KEY` is set. (Refines spec §2 `Bytes` columns to the codebase's `String` `…Enc` pattern.)
- No silent `catch`. Errors are `AppError` subclasses from `src/lib/errors.ts`.
- Tests and migrations run **only** against local Docker Postgres. Override **both** `DATABASE_URL` and `DIRECT_URL`; `packages/api/.env` points at Neon.
- Commit messages: Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

## Review Focus

1. **A non-member who knows a group id** must not read it or insert themselves as a member → RLS returns nothing and the member insert fails (Task 3 test "outsider cannot join by id").
2. **₹100 split three ways / 33.33% each** must total exactly ₹100.00 with the extra paisa going deterministically → Task 1 tests.
3. **A member who left** (`leftAt` set) must lose read access to the group and its expenses → Task 3 test "left member loses access".
4. **Editing an expense** (new amount, different payers) must replace payers/shares atomically; a failure mid-edit must not leave half the rows → Task 6 test "edit with invalid shares leaves original intact".
5. **Removing a member who still owes money** → 409 `SPLIT_MEMBER_HAS_BALANCE`, member stays → Task 5 test.

---

## File Structure

```
packages/shared/src/split.types.ts              DTO types shared with the web app (Task 0)
packages/shared/src/index.ts                    + export
packages/api/prisma/schema.prisma               + Split* models, enums, User back-relations (Task 3)
packages/api/prisma/migrations/20261007150000_split_expenses/migration.sql   (Task 3)
packages/api/src/lib/prisma.ts                  + USER_SCOPED_MODELS entries (Task 3)
packages/api/src/services/split/allocate.ts     pure: allocate / computeShares / toBase (Task 1)
packages/api/src/services/split/balances.ts     pure: memberNets / pairwiseDebts / simplify (Task 2)
packages/api/src/services/split/contacts.service.ts   (Task 4)
packages/api/src/services/split/groups.service.ts     groups, members, DIRECT groups (Task 5)
packages/api/src/services/split/expenses.service.ts   (Task 6)
packages/api/src/services/split/settlements.service.ts (Task 7)
packages/api/src/services/split/ledger.service.ts     balances / friends / activity reads (Task 7)
packages/api/src/services/split/activity.ts           writeActivity helper (Task 5)
packages/api/src/services/split/fx.ts                 resolveFxRate (Task 6)
packages/api/src/controllers/split.controller.ts      (Task 8)
packages/api/src/routes/split.routes.ts               (Task 8)
packages/api/src/routes/index.ts                      mount /api/split (Task 8)
packages/api/test/split/allocate.test.ts
packages/api/test/split/balances.test.ts
packages/api/test/invariants/split-rls.test.ts
packages/api/test/split/contacts.service.test.ts
packages/api/test/split/groups.service.test.ts
packages/api/test/split/expenses.service.test.ts
packages/api/test/split/settlements.service.test.ts
packages/api/test/routes/split.routes.test.ts
packages/api/test/helpers/splitFixtures.ts             (Task 5)
```

---

### Task 0: Worktree environment + shared DTO types

**Files:**
- Create: `packages/shared/src/split.types.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces (in `@everypaisa/shared`):

```ts
export const SPLIT_MODES = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'] as const;
export type SplitModeDto = (typeof SPLIT_MODES)[number];
export const SPLIT_GROUP_TYPES = ['TRIP', 'HOME', 'COUPLE', 'OTHER', 'DIRECT'] as const;
export type SplitGroupTypeDto = (typeof SPLIT_GROUP_TYPES)[number];
export const SPLIT_SETTLE_METHODS = ['CASH', 'UPI', 'OTHER'] as const;
export type SplitSettleMethodDto = (typeof SPLIT_SETTLE_METHODS)[number];

export interface SplitMemberDto { id: string; displayName: string; userId: string | null; contactId: string | null; isMe: boolean; leftAt: string | null }
export interface SplitGroupDto { id: string; name: string; type: SplitGroupTypeDto; baseCurrency: string; simplifyDebts: boolean; archivedAt: string | null; members: SplitMemberDto[]; myNet: Money }
export interface SplitPayerDto { memberId: string; amount: Money; baseAmount: Money }
export interface SplitShareDto { memberId: string; amount: Money; baseAmount: Money; rawInput: string | null }
export interface SplitExpenseDto {
  id: string; groupId: string; description: string; date: string;
  amount: Money; currency: string; fxRate: string; baseAmount: Money;
  splitMode: SplitModeDto; createdById: string; sourceType: string;
  deletedAt: string | null; payers: SplitPayerDto[]; shares: SplitShareDto[];
}
export interface SplitSettlementDto { id: string; groupId: string; fromMemberId: string; toMemberId: string; amount: Money; currency: string; fxRate: string; baseAmount: Money; method: SplitSettleMethodDto; date: string; deletedAt: string | null }
export interface SplitTransferDto { fromMemberId: string; toMemberId: string; amount: Money }
export interface SplitBalancesDto { groupId: string; baseCurrency: string; nets: Array<{ memberId: string; net: Money }>; transfers: SplitTransferDto[]; simplified: boolean }
export interface SplitFriendDto { key: string; displayName: string; userId: string | null; currency: string; net: Money; approx: boolean; groups: Array<{ groupId: string; groupName: string; net: Money; currency: string }> }
export interface SplitContactDto { id: string; name: string; email: string | null; phone: string | null; upiId: string | null; linkedUserId: string | null }
export interface SplitActivityDto { id: string; groupId: string; actorUserId: string; kind: string; payload: unknown; createdAt: string }
```

`Money` is the existing brand in `packages/shared/src/decimal.ts`. `net` is signed: positive = owed to that member (for friends: positive = they owe me).

- [ ] **Step 1: Prepare the worktree**

```bash
cd "/c/Users/ST269/Desktop/mProfit-split-wt/portfolioos"
pnpm install
docker compose up -d postgres
export DATABASE_URL="postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos"
export DIRECT_URL="postgresql://postgres:postgres@localhost:5432/portfolioos"
pnpm --filter @everypaisa/api prisma:generate
pnpm --filter @everypaisa/shared build
cd packages/api && npx prisma migrate status
```

Expected: `migrate status` names host `localhost:5432` (if it names a Neon host, STOP — `DIRECT_URL` is not overridden). Check the superuser credentials in `docker-compose.yml` and adjust `DIRECT_URL` if they differ. If `packages/api/.env` sets `RIA_VERDICTS_ENABLED=true`, also `export RIA_VERDICTS_ENABLED=false` for every test command in this plan. Every later command in this plan assumes these exports.

- [ ] **Step 2: Write `packages/shared/src/split.types.ts`** with exactly the code in the Interfaces block above, prefixed with `import type { Money } from './decimal.js';`.

- [ ] **Step 3: Export it** — append to `packages/shared/src/index.ts`:

```ts
export * from './split.types.js';
```

- [ ] **Step 4: Build shared**

Run: `pnpm --filter @everypaisa/shared build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/split.types.ts packages/shared/src/index.ts
git commit -m "feat(split): shared DTO types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Allocation math (pure)

**Files:**
- Create: `packages/api/src/services/split/allocate.ts`
- Test: `packages/api/test/split/allocate.test.ts`

**Interfaces:**
- Produces:

```ts
import { Decimal } from 'decimal.js';
export interface Weighted { id: string; weight: Decimal }
export function allocate(total: Decimal, parts: Weighted[]): Map<string, Decimal>;
export interface ShareInput { memberId: string; value?: string } // EXACT: amount; PERCENT: percent; SHARES: weight; EQUAL: ignored
export function computeShares(mode: 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES', amount: Decimal, inputs: ShareInput[]): Map<string, Decimal>;
export function toBase(amount: Decimal, fxRate: Decimal): Decimal;
export function allocateBase(baseTotal: Decimal, byMember: Map<string, Decimal>): Map<string, Decimal>;
```

All throw `BadRequestError` (from `src/lib/errors.ts`) with code-bearing messages: `SPLIT_SUM_MISMATCH`, `SPLIT_PERCENT_NOT_100`, `SPLIT_NO_PARTICIPANTS`, `SPLIT_BAD_INPUT`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/api/test/split/allocate.test.ts
import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { allocate, computeShares, toBase, allocateBase } from '../../src/services/split/allocate.js';

const D = (v: string) => new Decimal(v);
const sum = (m: Map<string, Decimal>) => [...m.values()].reduce((a, b) => a.plus(b), D('0'));
const str = (m: Map<string, Decimal>) => Object.fromEntries([...m].map(([k, v]) => [k, v.toFixed(2)]));

describe('allocate', () => {
  it('splits 100 three ways exactly, extra paisa to lowest id', () => {
    const r = allocate(D('100'), [
      { id: 'b', weight: D('1') }, { id: 'a', weight: D('1') }, { id: 'c', weight: D('1') },
    ]);
    expect(str(r)).toEqual({ a: '33.34', b: '33.33', c: '33.33' });
    expect(sum(r).toFixed(2)).toBe('100.00');
  });

  it('hands out multiple leftover paise in id order', () => {
    const r = allocate(D('0.05'), [
      { id: 'a', weight: D('1') }, { id: 'b', weight: D('1') }, { id: 'c', weight: D('1') },
    ]);
    expect(str(r)).toEqual({ a: '0.02', b: '0.02', c: '0.01' });
  });

  it('weights proportionally', () => {
    const r = allocate(D('90'), [{ id: 'a', weight: D('2') }, { id: 'b', weight: D('1') }]);
    expect(str(r)).toEqual({ a: '60.00', b: '30.00' });
  });

  it('rejects empty or zero-weight input', () => {
    expect(() => allocate(D('10'), [])).toThrow(/SPLIT_NO_PARTICIPANTS/);
    expect(() => allocate(D('10'), [{ id: 'a', weight: D('0') }])).toThrow(/SPLIT_NO_PARTICIPANTS/);
  });
});

describe('computeShares', () => {
  it('EQUAL', () => {
    const r = computeShares('EQUAL', D('100'), [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }]);
    expect(sum(r).toFixed(2)).toBe('100.00');
  });

  it('EXACT must sum to amount', () => {
    const ok = computeShares('EXACT', D('100'), [{ memberId: 'a', value: '60' }, { memberId: 'b', value: '40' }]);
    expect(str(ok)).toEqual({ a: '60.00', b: '40.00' });
    expect(() =>
      computeShares('EXACT', D('100'), [{ memberId: 'a', value: '60' }, { memberId: 'b', value: '39.99' }]),
    ).toThrow(/SPLIT_SUM_MISMATCH/);
  });

  it('PERCENT 33.33/33.33/33.34 of 100 totals exactly', () => {
    const r = computeShares('PERCENT', D('100'), [
      { memberId: 'a', value: '33.33' }, { memberId: 'b', value: '33.33' }, { memberId: 'c', value: '33.34' },
    ]);
    expect(sum(r).toFixed(2)).toBe('100.00');
  });

  it('PERCENT not summing to 100 is rejected', () => {
    expect(() =>
      computeShares('PERCENT', D('100'), [{ memberId: 'a', value: '50' }, { memberId: 'b', value: '40' }]),
    ).toThrow(/SPLIT_PERCENT_NOT_100/);
  });

  it('SHARES 2:1', () => {
    const r = computeShares('SHARES', D('300'), [{ memberId: 'a', value: '2' }, { memberId: 'b', value: '1' }]);
    expect(str(r)).toEqual({ a: '200.00', b: '100.00' });
  });

  it('rejects negative, non-numeric, more than 2 dp in EXACT, and duplicate members', () => {
    expect(() => computeShares('SHARES', D('10'), [{ memberId: 'a', value: '-1' }])).toThrow(/SPLIT_BAD_INPUT/);
    expect(() => computeShares('SHARES', D('10'), [{ memberId: 'a', value: 'abc' }])).toThrow(/SPLIT_BAD_INPUT/);
    expect(() => computeShares('EXACT', D('10'), [{ memberId: 'a', value: '10.001' }])).toThrow(/SPLIT_BAD_INPUT/);
    expect(() => computeShares('EQUAL', D('10'), [{ memberId: 'a' }, { memberId: 'a' }])).toThrow(/SPLIT_BAD_INPUT/);
  });

  it('rejects an amount with more than 2 dp or <= 0', () => {
    expect(() => computeShares('EQUAL', D('10.005'), [{ memberId: 'a' }])).toThrow(/SPLIT_BAD_INPUT/);
    expect(() => computeShares('EQUAL', D('0'), [{ memberId: 'a' }])).toThrow(/SPLIT_BAD_INPUT/);
  });
});

describe('base currency', () => {
  it('toBase rounds half-even to 2 dp', () => {
    expect(toBase(D('10'), D('83.12345')).toFixed(2)).toBe('831.23');
    expect(toBase(D('1'), D('0.125')).toFixed(2)).toBe('0.12');
  });

  it('allocateBase keeps base totals exact', () => {
    const shares = new Map([['a', D('33.34')], ['b', D('33.33')], ['c', D('33.33')]]);
    const base = allocateBase(D('8312.35'), shares);
    expect(sum(base).toFixed(2)).toBe('8312.35');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/api && npx vitest run test/split/allocate.test.ts`
Expected: FAIL — cannot resolve `../../src/services/split/allocate.js`.

- [ ] **Step 3: Implement**

```ts
// packages/api/src/services/split/allocate.ts
/**
 * Split allocation. Everything is allocated in whole paise (2 dp): each part
 * gets floor(total × weight / Σweight) and the leftover paise go one at a
 * time to parts in ascending id order, so totals are exact and the result
 * does not depend on input order.
 */
import { Decimal } from 'decimal.js';
import { BadRequestError } from '../../lib/errors.js';

export interface Weighted { id: string; weight: Decimal }
export interface ShareInput { memberId: string; value?: string }
export type SplitMode = 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES';

const PAISA = new Decimal('0.01');
const HUNDRED = new Decimal(100);

function bad(code: string, detail: string): never {
  throw new BadRequestError(`${code}: ${detail}`);
}

function parseNonNegative(raw: string | undefined, label: string): Decimal {
  if (raw === undefined || !/^\d+(\.\d+)?$/.test(raw.trim())) bad('SPLIT_BAD_INPUT', `${label} must be a non-negative number`);
  return new Decimal(raw.trim());
}

function assertMoney(amount: Decimal, label: string): void {
  if (amount.lte(0) || amount.decimalPlaces() > 2) bad('SPLIT_BAD_INPUT', `${label} must be > 0 with at most 2 decimals`);
}

export function allocate(total: Decimal, parts: Weighted[]): Map<string, Decimal> {
  const live = parts.filter((p) => p.weight.gt(0));
  if (live.length === 0) bad('SPLIT_NO_PARTICIPANTS', 'nobody to allocate to');
  const totalWeight = live.reduce((a, p) => a.plus(p.weight), new Decimal(0));
  const sorted = [...live].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const out = new Map<string, Decimal>();
  let given = new Decimal(0);
  for (const p of sorted) {
    const v = total.mul(p.weight).div(totalWeight).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    out.set(p.id, v);
    given = given.plus(v);
  }
  let leftover = total.minus(given).div(PAISA).toNumber(); // integer count of paise, < parts.length
  for (let i = 0; leftover > 0; i = (i + 1) % sorted.length, leftover--) {
    const id = sorted[i]!.id;
    out.set(id, out.get(id)!.plus(PAISA));
  }
  return out;
}

export function computeShares(mode: SplitMode, amount: Decimal, inputs: ShareInput[]): Map<string, Decimal> {
  assertMoney(amount, 'amount');
  if (inputs.length === 0) bad('SPLIT_NO_PARTICIPANTS', 'no participants');
  const ids = new Set(inputs.map((i) => i.memberId));
  if (ids.size !== inputs.length) bad('SPLIT_BAD_INPUT', 'a member appears twice');

  switch (mode) {
    case 'EQUAL':
      return allocate(amount, inputs.map((i) => ({ id: i.memberId, weight: new Decimal(1) })));
    case 'SHARES':
      return allocate(amount, inputs.map((i) => ({ id: i.memberId, weight: parseNonNegative(i.value, 'share') })));
    case 'PERCENT': {
      const pct = inputs.map((i) => ({ id: i.memberId, weight: parseNonNegative(i.value, 'percent') }));
      const total = pct.reduce((a, p) => a.plus(p.weight), new Decimal(0));
      if (!total.eq(HUNDRED)) bad('SPLIT_PERCENT_NOT_100', `percentages add to ${total.toString()}`);
      return allocate(amount, pct);
    }
    case 'EXACT': {
      const out = new Map<string, Decimal>();
      let total = new Decimal(0);
      for (const i of inputs) {
        const v = parseNonNegative(i.value, 'exact amount');
        if (v.decimalPlaces() > 2) bad('SPLIT_BAD_INPUT', 'exact amount has more than 2 decimals');
        out.set(i.memberId, v);
        total = total.plus(v);
      }
      if (!total.eq(amount)) bad('SPLIT_SUM_MISMATCH', `shares add to ${total.toFixed(2)}, expense is ${amount.toFixed(2)}`);
      return out;
    }
  }
}

export function toBase(amount: Decimal, fxRate: Decimal): Decimal {
  return amount.mul(fxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

/** Spread a base-currency total over members in proportion to their expense-currency amounts. */
export function allocateBase(baseTotal: Decimal, byMember: Map<string, Decimal>): Map<string, Decimal> {
  return allocate(baseTotal, [...byMember].map(([id, weight]) => ({ id, weight })));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/split/allocate.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/split/allocate.ts packages/api/test/split/allocate.test.ts
git commit -m "feat(split): paise-exact share allocation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Balance engine (pure)

**Files:**
- Create: `packages/api/src/services/split/balances.ts`
- Test: `packages/api/test/split/balances.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:

```ts
export interface LedgerExpense { payers: Array<{ memberId: string; baseAmount: Decimal }>; shares: Array<{ memberId: string; baseAmount: Decimal }> }
export interface LedgerSettlement { fromMemberId: string; toMemberId: string; baseAmount: Decimal }
export interface Transfer { fromMemberId: string; toMemberId: string; amount: Decimal }
export function memberNets(expenses: LedgerExpense[], settlements: LedgerSettlement[], memberIds: string[]): Map<string, Decimal>;
export function pairwiseDebts(expenses: LedgerExpense[], settlements: LedgerSettlement[]): Transfer[];
export function simplify(nets: Map<string, Decimal>): Transfer[];
```

Callers pass only non-deleted rows. Net > 0 = member is owed. Settlement `from` paid `to`: from's net goes up, to's goes down.

- [ ] **Step 1: Write failing tests**

```ts
// packages/api/test/split/balances.test.ts
import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { memberNets, pairwiseDebts, simplify, type LedgerExpense } from '../../src/services/split/balances.js';

const D = (v: string | number) => new Decimal(v);
const exp = (payer: string, amount: string, shares: Record<string, string>): LedgerExpense => ({
  payers: [{ memberId: payer, baseAmount: D(amount) }],
  shares: Object.entries(shares).map(([memberId, v]) => ({ memberId, baseAmount: D(v) })),
});
const flat = (t: { fromMemberId: string; toMemberId: string; amount: Decimal }[]) =>
  t.map((x) => `${x.fromMemberId}->${x.toMemberId}:${x.amount.toFixed(2)}`);

describe('memberNets', () => {
  it('payer is owed the others shares', () => {
    const n = memberNets([exp('a', '90', { a: '30', b: '30', c: '30' })], [], ['a', 'b', 'c']);
    expect(n.get('a')!.toFixed(2)).toBe('60.00');
    expect(n.get('b')!.toFixed(2)).toBe('-30.00');
    expect(n.get('c')!.toFixed(2)).toBe('-30.00');
  });

  it('settlement moves net toward zero', () => {
    const n = memberNets(
      [exp('a', '90', { a: '30', b: '30', c: '30' })],
      [{ fromMemberId: 'b', toMemberId: 'a', baseAmount: D('30') }],
      ['a', 'b', 'c'],
    );
    expect(n.get('a')!.toFixed(2)).toBe('30.00');
    expect(n.get('b')!.toFixed(2)).toBe('0.00');
  });

  it('includes members with no activity at zero', () => {
    const n = memberNets([], [], ['x']);
    expect(n.get('x')!.toFixed(2)).toBe('0.00');
  });
});

describe('pairwiseDebts', () => {
  it('nets opposite debts between a pair', () => {
    const t = pairwiseDebts(
      [exp('a', '100', { a: '50', b: '50' }), exp('b', '40', { a: '20', b: '20' })],
      [],
    );
    expect(flat(t)).toEqual(['b->a:30.00']);
  });

  it('multi-payer expense owes each payer proportionally', () => {
    const e: LedgerExpense = {
      payers: [{ memberId: 'a', baseAmount: D('60') }, { memberId: 'b', baseAmount: D('30') }],
      shares: [{ memberId: 'a', baseAmount: D('30') }, { memberId: 'b', baseAmount: D('30') }, { memberId: 'c', baseAmount: D('30') }],
    };
    expect(flat(pairwiseDebts([e], [])).sort()).toEqual(['b->a:10.00', 'c->a:20.00', 'c->b:10.00'].sort());
  });
});

describe('simplify', () => {
  it('collapses a chain a->b->c into a->c', () => {
    const nets = new Map([['a', D('-10')], ['b', D('0')], ['c', D('10')]]);
    expect(flat(simplify(nets))).toEqual(['a->c:10.00']);
  });

  it('property: random ledgers settle to zero with at most n-1 transfers, deterministically', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let run = 0; run < 200; run++) {
      const n = 2 + Math.floor(rnd() * 6);
      const ids = Array.from({ length: n }, (_, i) => `m${i}`);
      const raw = ids.map(() => D(Math.floor(rnd() * 100000)).div(100));
      const mean = raw.reduce((a, b) => a.plus(b), D(0)).div(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const vals = raw.map((r) => r.minus(mean));
      const drift = vals.reduce((a, b) => a.plus(b), D(0));
      vals[0] = vals[0]!.minus(drift); // force Σ = 0 exactly
      const nets = new Map(ids.map((id, i) => [id, vals[i]!]));
      const t = simplify(nets);
      expect(t.length).toBeLessThanOrEqual(n - 1);
      const after = new Map(nets);
      for (const x of t) {
        expect(x.amount.gt(0)).toBe(true);
        after.set(x.fromMemberId, after.get(x.fromMemberId)!.plus(x.amount));
        after.set(x.toMemberId, after.get(x.toMemberId)!.minus(x.amount));
      }
      for (const v of after.values()) expect(v.toFixed(2)).toBe('0.00');
      expect(flat(simplify(new Map([...nets].reverse())))).toEqual(flat(t));
    }
  });

  it('throws if nets do not sum to zero', () => {
    expect(() => simplify(new Map([['a', D('1')]]))).toThrow(/SPLIT_NETS_UNBALANCED/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/split/balances.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/api/src/services/split/balances.ts
/**
 * Group balances, derived on every read from payers, shares and settlements
 * (all already in the group's base currency). Nothing here touches the DB.
 * Net > 0 means the member is owed money.
 */
import { Decimal } from 'decimal.js';
import { AppError } from '../../lib/errors.js';

export interface LedgerExpense { payers: Array<{ memberId: string; baseAmount: Decimal }>; shares: Array<{ memberId: string; baseAmount: Decimal }> }
export interface LedgerSettlement { fromMemberId: string; toMemberId: string; baseAmount: Decimal }
export interface Transfer { fromMemberId: string; toMemberId: string; amount: Decimal }

const ZERO = new Decimal(0);
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function memberNets(expenses: LedgerExpense[], settlements: LedgerSettlement[], memberIds: string[]): Map<string, Decimal> {
  const nets = new Map<string, Decimal>(memberIds.map((id) => [id, ZERO]));
  const add = (id: string, v: Decimal) => nets.set(id, (nets.get(id) ?? ZERO).plus(v));
  for (const e of expenses) {
    for (const p of e.payers) add(p.memberId, p.baseAmount);
    for (const s of e.shares) add(s.memberId, s.baseAmount.neg());
  }
  for (const s of settlements) {
    add(s.fromMemberId, s.baseAmount);
    add(s.toMemberId, s.baseAmount.neg());
  }
  return nets;
}

export function pairwiseDebts(expenses: LedgerExpense[], settlements: LedgerSettlement[]): Transfer[] {
  // owed[x][y] = how much x owes y (full precision until the end)
  const owed = new Map<string, Decimal>();
  const key = (x: string, y: string) => `${x}\u0000${y}`;
  const bump = (x: string, y: string, v: Decimal) => owed.set(key(x, y), (owed.get(key(x, y)) ?? ZERO).plus(v));

  for (const e of expenses) {
    const paidTotal = e.payers.reduce((a, p) => a.plus(p.baseAmount), ZERO);
    if (paidTotal.isZero()) continue;
    for (const s of e.shares) {
      for (const p of e.payers) {
        if (p.memberId === s.memberId) continue;
        bump(s.memberId, p.memberId, s.baseAmount.mul(p.baseAmount).div(paidTotal));
      }
    }
  }
  for (const s of settlements) bump(s.fromMemberId, s.toMemberId, s.baseAmount.neg());

  const pairs = new Set<string>();
  for (const k of owed.keys()) {
    const [x, y] = k.split('\u0000') as [string, string];
    pairs.add(x < y ? key(x, y) : key(y, x));
  }
  const out: Transfer[] = [];
  for (const k of [...pairs].sort()) {
    const [x, y] = k.split('\u0000') as [string, string];
    const net = (owed.get(key(x, y)) ?? ZERO).minus(owed.get(key(y, x)) ?? ZERO).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    if (net.gt(0)) out.push({ fromMemberId: x, toMemberId: y, amount: net });
    else if (net.lt(0)) out.push({ fromMemberId: y, toMemberId: x, amount: net.neg() });
  }
  return out;
}

export function simplify(nets: Map<string, Decimal>): Transfer[] {
  const total = [...nets.values()].reduce((a, b) => a.plus(b), ZERO);
  if (!total.isZero()) {
    throw new AppError(`SPLIT_NETS_UNBALANCED: nets sum to ${total.toString()}`, 500, 'SPLIT_NETS_UNBALANCED');
  }
  const creditors = [...nets].filter(([, v]) => v.gt(0)).map(([id, v]) => ({ id, v }));
  const debtors = [...nets].filter(([, v]) => v.lt(0)).map(([id, v]) => ({ id, v: v.neg() }));
  const order = (a: { id: string; v: Decimal }, b: { id: string; v: Decimal }) => b.v.cmp(a.v) || byId(a.id, b.id);
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(order);
    debtors.sort(order);
    const c = creditors[0]!;
    const d = debtors[0]!;
    const amt = Decimal.min(c.v, d.v);
    out.push({ fromMemberId: d.id, toMemberId: c.id, amount: amt });
    c.v = c.v.minus(amt);
    d.v = d.v.minus(amt);
    if (c.v.isZero()) creditors.shift();
    if (d.v.isZero()) debtors.shift();
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/split/balances.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/split/balances.ts packages/api/test/split/balances.test.ts
git commit -m "feat(split): balance engine with debt simplification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Schema, migration, RLS

**Files:**
- Modify: `packages/api/prisma/schema.prisma` (append Split models; add back-relations on `User`)
- Create: `packages/api/prisma/migrations/20261007150000_split_expenses/migration.sql`
- Modify: `packages/api/src/lib/prisma.ts` (`USER_SCOPED_MODELS`)
- Test: `packages/api/test/invariants/split-rls.test.ts`

**Interfaces:**
- Produces Prisma models `SplitContact, SplitGroup, SplitMember, SplitExpense, SplitPayer, SplitShare, SplitLabel, SplitExpenseLabel, SplitComment, SplitSettlement, SplitActivity, SplitDetection, SplitShareLink, SplitSettings` and SQL functions `app_is_split_member(text)`, `app_is_split_group_creator(text)`, `app_split_expense_group(text)`, `app_split_group_is_empty(text)`. All tables for Plans 2–6 are created here so RLS is designed and reviewed once.

- [ ] **Step 1: Append models to `schema.prisma`**

```prisma
// ── Split Expenses (docs/superpowers/specs/2026-10-07-split-expenses-design.md) ──

enum SplitGroupType { TRIP HOME COUPLE OTHER DIRECT }
enum SplitMode { EQUAL EXACT PERCENT SHARES }
enum SplitSource { MANUAL RECEIPT_OCR EMAIL SMS PASTE }
enum SplitSettleMethod { CASH UPI OTHER }
enum SplitDetectionSource { EMAIL SMS PASTE RECEIPT }
enum SplitDetectionStatus { NEW SPLIT SETTLED DISMISSED }

model SplitContact {
  id           String   @id @default(cuid())
  ownerUserId  String
  owner        User     @relation("SplitContactOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  name         String
  email        String?  // plaintext only when no APP_ENCRYPTION_KEY (dev)
  emailEnc     String?
  emailHash    String?
  phone        String?
  phoneEnc     String?
  phoneHash    String?
  upiId        String?
  linkedUserId String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  members      SplitMember[]

  @@index([ownerUserId])
  @@index([emailHash])
  @@index([phoneHash])
}

model SplitGroup {
  id            String         @id @default(cuid())
  name          String
  type          SplitGroupType @default(OTHER)
  baseCurrency  String         @default("INR")
  simplifyDebts Boolean        @default(true)
  createdById   String         // plain id: groups outlive their creator's account
  archivedAt    DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  members       SplitMember[]
  expenses      SplitExpense[]
  settlements   SplitSettlement[]
  activity      SplitActivity[]
  labels        SplitLabel[]

  @@index([createdById])
}

model SplitMember {
  id          String        @id @default(cuid())
  groupId     String
  group       SplitGroup    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  contactId   String?
  contact     SplitContact? @relation(fields: [contactId], references: [id], onDelete: SetNull)
  userId      String?
  user        User?         @relation("SplitMemberUser", fields: [userId], references: [id], onDelete: SetNull)
  displayName String
  leftAt      DateTime?
  createdAt   DateTime      @default(now())

  @@unique([groupId, userId])
  @@index([userId])
  @@index([groupId])
}

model SplitExpense {
  id            String       @id @default(cuid())
  groupId       String
  group         SplitGroup   @relation(fields: [groupId], references: [id], onDelete: Cascade)
  description   String
  date          DateTime     @db.Date
  amount        Decimal      @db.Decimal(18, 4)
  currency      String
  fxRate        Decimal      @db.Decimal(18, 8)
  baseAmount    Decimal      @db.Decimal(18, 4)
  splitMode     SplitMode
  createdById   String
  receiptBlobId String?
  sourceType    SplitSource  @default(MANUAL)
  detectionId   String?
  deletedAt     DateTime?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  payers        SplitPayer[]
  shares        SplitShare[]
  labels        SplitExpenseLabel[]
  comments      SplitComment[]

  @@index([groupId, date])
}

model SplitPayer {
  id         String       @id @default(cuid())
  expenseId  String
  expense    SplitExpense @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  memberId   String
  amount     Decimal      @db.Decimal(18, 4)
  baseAmount Decimal      @db.Decimal(18, 4)

  @@index([expenseId])
}

model SplitShare {
  id         String       @id @default(cuid())
  expenseId  String
  expense    SplitExpense @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  memberId   String
  amount     Decimal      @db.Decimal(18, 4)
  baseAmount Decimal      @db.Decimal(18, 4)
  rawInput   Decimal?     @db.Decimal(18, 6)

  @@index([expenseId])
}

model SplitLabel {
  id          String      @id @default(cuid())
  groupId     String?
  group       SplitGroup? @relation(fields: [groupId], references: [id], onDelete: Cascade)
  ownerUserId String?
  name        String
  color       String
  expenses    SplitExpenseLabel[]
}

model SplitExpenseLabel {
  expenseId String
  expense   SplitExpense @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  labelId   String
  label     SplitLabel   @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([expenseId, labelId])
}

model SplitComment {
  id           String       @id @default(cuid())
  expenseId    String
  expense      SplitExpense @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  authorUserId String
  body         String
  createdAt    DateTime     @default(now())
  deletedAt    DateTime?

  @@index([expenseId, createdAt])
}

model SplitSettlement {
  id           String            @id @default(cuid())
  groupId      String
  group        SplitGroup        @relation(fields: [groupId], references: [id], onDelete: Cascade)
  fromMemberId String
  toMemberId   String
  amount       Decimal           @db.Decimal(18, 4)
  currency     String
  fxRate       Decimal           @db.Decimal(18, 8)
  baseAmount   Decimal           @db.Decimal(18, 4)
  method       SplitSettleMethod
  date         DateTime          @db.Date
  createdById  String
  detectionId  String?
  deletedAt    DateTime?
  createdAt    DateTime          @default(now())

  @@index([groupId, date])
}

model SplitActivity {
  id          String     @id @default(cuid())
  groupId     String
  group       SplitGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  actorUserId String
  kind        String
  payload     Json
  createdAt   DateTime   @default(now())

  @@index([groupId, createdAt])
}

model SplitDetection {
  id                String               @id @default(cuid())
  userId            String
  user              User                 @relation("SplitDetectionUser", fields: [userId], references: [id], onDelete: Cascade)
  source            SplitDetectionSource
  sourceHash        String
  amount            Decimal              @db.Decimal(18, 4)
  currency          String               @default("INR")
  direction         String
  merchant          String?
  payeeVpa          String?
  date              DateTime             @db.Date
  rawRedactedEnc    String?
  canonicalEventId  String?
  status            SplitDetectionStatus @default(NEW)
  expenseId         String?
  settlementId      String?
  createdAt         DateTime             @default(now())

  @@unique([userId, sourceHash])
  @@index([userId, status, date])
}

model SplitShareLink {
  id         String @id @default(cuid())
  expenseId  String
  userId     String
  user       User   @relation("SplitShareLinkUser", fields: [userId], references: [id], onDelete: Cascade)
  cashFlowId String

  @@unique([expenseId, userId])
}

model SplitSettings {
  userId             String  @id
  user               User    @relation("SplitSettingsUser", fields: [userId], references: [id], onDelete: Cascade)
  upiId              String?
  homeCurrency       String  @default("INR")
  defaultPortfolioId String?
  detectEmail        Boolean @default(false)
  detectPaste        Boolean @default(true)
  detectReceipt      Boolean @default(true)
  detectSms          Boolean @default(false)
  emailOnActivity    Boolean @default(true)
  weeklyDigest       Boolean @default(false)
}
```

Add to `model User { ... }` (anywhere among its relation fields):

```prisma
  splitContacts    SplitContact[]   @relation("SplitContactOwner")
  splitMembers     SplitMember[]    @relation("SplitMemberUser")
  splitDetections  SplitDetection[] @relation("SplitDetectionUser")
  splitShareLinks  SplitShareLink[] @relation("SplitShareLinkUser")
  splitSettings    SplitSettings?   @relation("SplitSettingsUser")
```

- [ ] **Step 2: Generate the migration SQL (no apply)**

```bash
cd packages/api
npx prisma migrate dev --create-only --name split_expenses
```

Rename the generated folder to `prisma/migrations/20261007150000_split_expenses` (keeps ordering after `20261007120000_invite_token_hash`). If Prisma also emits unrelated drift statements, delete them — this migration contains only Split objects.

- [ ] **Step 3: Append RLS to `migration.sql`**

```sql
-- ── Split Expenses RLS ───────────────────────────────────────────────
-- A group's rows are visible to its current linked members. Membership checks
-- go through SECURITY DEFINER helpers so SplitMember's own policy can consult
-- SplitMember without re-entering itself (42P17; see
-- 20260903090000_fix_familymember_policy_recursion). Each helper answers only
-- about app_current_user_id(), so EXECUTE leaks nothing about other users.

CREATE OR REPLACE FUNCTION app_is_split_member(target_group_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM "SplitMember" m
    WHERE m."groupId" = target_group_id
      AND m."userId" = app_current_user_id()
      AND m."leftAt" IS NULL);
$$;

CREATE OR REPLACE FUNCTION app_is_split_group_creator(target_group_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM "SplitGroup" g
    WHERE g.id = target_group_id AND g."createdById" = app_current_user_id());
$$;

CREATE OR REPLACE FUNCTION app_split_expense_group(target_expense_id TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT e."groupId" FROM "SplitExpense" e WHERE e.id = target_expense_id;
$$;

-- True while a group has no member rows at all (the instant between the
-- group INSERT and the creator's member INSERT). SECURITY DEFINER so the
-- count is not filtered by SplitMember's own policy — under that policy a
-- creator who had left would see zero members and wrongly regain access.
CREATE OR REPLACE FUNCTION app_split_group_is_empty(target_group_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (SELECT 1 FROM "SplitMember" m WHERE m."groupId" = target_group_id);
$$;

GRANT EXECUTE ON FUNCTION app_is_split_member(TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_is_split_group_creator(TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_split_expense_group(TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_split_group_is_empty(TEXT) TO portfolioos_app;

-- SplitGroup. The creator clause exists because Prisma's INSERT … RETURNING
-- must satisfy the SELECT policy before the creator's member row exists.
ALTER TABLE "SplitGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitGroup" FORCE ROW LEVEL SECURITY;
CREATE POLICY splitgroup_access ON "SplitGroup"
  USING (app_is_system() OR app_is_split_member(id)
         OR ("createdById" = app_current_user_id() AND app_split_group_is_empty(id)))
  WITH CHECK (app_is_system() OR app_is_split_member(id)
         OR ("createdById" = app_current_user_id() AND app_split_group_is_empty(id)));

-- SplitMember. A user may insert their OWN row only into a group they created
-- (bootstrap); every other insert needs an existing membership. Knowing a
-- group id is not enough to join it. The own-row USING clause is needed for
-- the creator's INSERT … RETURNING: the STABLE helper runs on the statement's
-- starting snapshot and cannot see the row being inserted. It reveals only the
-- caller's own membership row, never the group's other rows.
ALTER TABLE "SplitMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitMember" FORCE ROW LEVEL SECURITY;
CREATE POLICY splitmember_access ON "SplitMember"
  USING (app_is_system() OR "userId" = app_current_user_id() OR app_is_split_member("groupId"))
  WITH CHECK (app_is_system() OR app_is_split_member("groupId")
              OR ("userId" = app_current_user_id() AND app_is_split_group_creator("groupId")));

-- Tables carrying groupId directly.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['SplitExpense','SplitSettlement','SplitActivity'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %s ON %I USING (app_is_system() OR app_is_split_member("groupId")) WITH CHECK (app_is_system() OR app_is_split_member("groupId"))', lower(t) || '_access', t);
  END LOOP;
END $$;

-- Tables hanging off an expense.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['SplitPayer','SplitShare','SplitExpenseLabel','SplitComment'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %s ON %I USING (app_is_system() OR app_is_split_member(app_split_expense_group("expenseId"))) WITH CHECK (app_is_system() OR app_is_split_member(app_split_expense_group("expenseId")))', lower(t) || '_access', t);
  END LOOP;
END $$;

-- Labels: group label (members) or personal label (owner).
ALTER TABLE "SplitLabel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitLabel" FORCE ROW LEVEL SECURITY;
CREATE POLICY splitlabel_access ON "SplitLabel"
  USING (app_is_system() OR ("groupId" IS NOT NULL AND app_is_split_member("groupId"))
         OR ("groupId" IS NULL AND "ownerUserId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR ("groupId" IS NOT NULL AND app_is_split_member("groupId"))
         OR ("groupId" IS NULL AND "ownerUserId" = app_current_user_id()));

-- Owner-only tables.
ALTER TABLE "SplitContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitContact" FORCE ROW LEVEL SECURITY;
CREATE POLICY splitcontact_owner ON "SplitContact"
  USING (app_is_system() OR "ownerUserId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "ownerUserId" = app_current_user_id());

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['SplitDetection','SplitShareLink','SplitSettings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %s ON %I USING (app_is_system() OR "userId" = app_current_user_id()) WITH CHECK (app_is_system() OR "userId" = app_current_user_id())', lower(t) || '_owner', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "SplitContact","SplitGroup","SplitMember","SplitExpense","SplitPayer","SplitShare",
  "SplitLabel","SplitExpenseLabel","SplitComment","SplitSettlement","SplitActivity",
  "SplitDetection","SplitShareLink","SplitSettings"
TO portfolioos_app;
```

Note on the SplitGroup clauses: the creator sees a group with **no** members (the instant between INSERT and the member insert). Once any member row exists, only current members see it — so a creator who leaves loses access like anyone else (tested in Step 6).

- [ ] **Step 4: Register models** — in `src/lib/prisma.ts`, add to `USER_SCOPED_MODELS` (before the closing `]`):

```ts
  // Split Expenses (20261007150000_split_expenses). Group tables use the
  // membership helper app_is_split_member; contacts/detections/share links/
  // settings are owner-only.
  'SplitContact',
  'SplitGroup',
  'SplitMember',
  'SplitExpense',
  'SplitPayer',
  'SplitShare',
  'SplitLabel',
  'SplitExpenseLabel',
  'SplitComment',
  'SplitSettlement',
  'SplitActivity',
  'SplitDetection',
  'SplitShareLink',
  'SplitSettings',
```

- [ ] **Step 5: Apply migration locally and regenerate**

```bash
npx prisma migrate status   # must report localhost:5432
npx prisma migrate deploy
npx prisma generate
```

Expected: `20261007150000_split_expenses` applied; no errors.

- [ ] **Step 6: Write the RLS test**

```ts
// packages/api/test/invariants/split-rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

/**
 * INVARIANT: split group rows are visible only to current linked members.
 * Runs as the NOBYPASSRLS app role, so the policies themselves are tested.
 */
describe('invariant: Split RLS', () => {
  let alice: TestScope;
  let bob: TestScope;
  let eve: TestScope;
  let groupId: string;
  let expenseId: string;
  let bobMemberId: string;

  beforeAll(async () => {
    alice = await createTestScope('split-rls-a');
    bob = await createTestScope('split-rls-b');
    eve = await createTestScope('split-rls-e');

    // Alice creates the group through the real policy path.
    await alice.runAs(async () => {
      const g = await prisma.splitGroup.create({ data: { name: 'Goa', createdById: alice.userId } });
      groupId = g.id;
      const a = await prisma.splitMember.create({ data: { groupId, userId: alice.userId, displayName: 'Alice' } });
      const b = await prisma.splitMember.create({ data: { groupId, userId: bob.userId, displayName: 'Bob' } });
      bobMemberId = b.id;
      const e = await prisma.splitExpense.create({
        data: {
          groupId, description: 'Dinner', date: new Date('2026-10-01'), amount: '100', currency: 'INR',
          fxRate: '1', baseAmount: '100', splitMode: 'EQUAL', createdById: alice.userId,
          payers: { create: [{ memberId: a.id, amount: '100', baseAmount: '100' }] },
          shares: { create: [
            { memberId: a.id, amount: '50', baseAmount: '50' },
            { memberId: b.id, amount: '50', baseAmount: '50' },
          ] },
        },
      });
      expenseId = e.id;
    });
  });

  afterAll(async () => {
    await runAsSystem(() => prisma.splitGroup.deleteMany({ where: { id: groupId } }));
    await alice.cleanup();
    await bob.cleanup();
    await eve.cleanup();
  });

  it('members see the group, expense and shares', async () => {
    await bob.runAs(async () => {
      expect(await prisma.splitGroup.findUnique({ where: { id: groupId } })).not.toBeNull();
      expect(await prisma.splitExpense.findUnique({ where: { id: expenseId } })).not.toBeNull();
      expect(await prisma.splitShare.count({ where: { expenseId } })).toBe(2);
    });
  });

  it('outsider sees nothing by id', async () => {
    await eve.runAs(async () => {
      expect(await prisma.splitGroup.findUnique({ where: { id: groupId } })).toBeNull();
      expect(await prisma.splitExpense.findUnique({ where: { id: expenseId } })).toBeNull();
      expect(await prisma.splitShare.count({ where: { expenseId } })).toBe(0);
      expect(await prisma.splitMember.count({ where: { groupId } })).toBe(0);
    });
  });

  it('outsider cannot join by id', async () => {
    await eve.runAs(async () => {
      await expect(
        prisma.splitMember.create({ data: { groupId, userId: eve.userId, displayName: 'Eve' } }),
      ).rejects.toThrow();
    });
  });

  it('outsider cannot add an expense to the group', async () => {
    await eve.runAs(async () => {
      await expect(
        prisma.splitExpense.create({
          data: { groupId, description: 'x', date: new Date('2026-10-01'), amount: '1', currency: 'INR',
            fxRate: '1', baseAmount: '1', splitMode: 'EQUAL', createdById: eve.userId },
        }),
      ).rejects.toThrow();
    });
  });

  it('left member loses access', async () => {
    await runAsSystem(() => prisma.splitMember.update({ where: { id: bobMemberId }, data: { leftAt: new Date() } }));
    await bob.runAs(async () => {
      expect(await prisma.splitGroup.findUnique({ where: { id: groupId } })).toBeNull();
      expect(await prisma.splitExpense.findUnique({ where: { id: expenseId } })).toBeNull();
    });
    await runAsSystem(() => prisma.splitMember.update({ where: { id: bobMemberId }, data: { leftAt: null } }));
  });

  it('creator who left loses access too', async () => {
    const aliceMember = await runAsSystem(() =>
      prisma.splitMember.findFirstOrThrow({ where: { groupId, userId: alice.userId } }),
    );
    await runAsSystem(() => prisma.splitMember.update({ where: { id: aliceMember.id }, data: { leftAt: new Date() } }));
    await alice.runAs(async () => {
      expect(await prisma.splitGroup.findUnique({ where: { id: groupId } })).toBeNull();
    });
    await runAsSystem(() => prisma.splitMember.update({ where: { id: aliceMember.id }, data: { leftAt: null } }));
  });

  it('contacts are owner-only', async () => {
    const c = await alice.runAs(() => prisma.splitContact.create({ data: { ownerUserId: alice.userId, name: 'Ravi' } }));
    await bob.runAs(async () => {
      expect(await prisma.splitContact.findUnique({ where: { id: c.id } })).toBeNull();
    });
    await runAsSystem(() => prisma.splitContact.delete({ where: { id: c.id } }));
  });
});
```

- [ ] **Step 7: Run RLS + coverage invariants**

Run: `npx vitest run test/invariants/split-rls.test.ts test/invariants/user-scoped-coverage.test.ts test/invariants/rls-isolation.test.ts`
Expected: PASS. If "creates group" fails with 42501 on RETURNING, re-check the SplitGroup USING clause from Step 3.

- [ ] **Step 8: Commit**

```bash
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations/20261007150000_split_expenses packages/api/src/lib/prisma.ts packages/api/test/invariants/split-rls.test.ts
git commit -m "feat(split): schema and membership-based RLS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Contacts service

**Files:**
- Create: `packages/api/src/services/split/contacts.service.ts`
- Test: `packages/api/test/split/contacts.service.test.ts`

**Interfaces:**
- Consumes: `sealText`, `openText` from `src/services/piiAtRest.service.ts`; `hashIdentifier` from `src/services/pfCredentials.service.ts`.
- Produces:

```ts
export interface ContactInput { name: string; email?: string | null; phone?: string | null; upiId?: string | null }
export function normalizeEmail(raw: string): string;   // trim + lowercase
export function normalizePhone(raw: string): string;   // digits only; 10 digits → prefix 91
export async function listContacts(userId: string): Promise<SplitContactDto[]>;
export async function createContact(userId: string, input: ContactInput): Promise<SplitContactDto>;
export async function updateContact(userId: string, id: string, input: Partial<ContactInput>): Promise<SplitContactDto>;
export async function deleteContact(userId: string, id: string): Promise<void>;
export async function getContactRow(userId: string, id: string): Promise<{ id: string; name: string; linkedUserId: string | null; upiId: string | null }>;
```

- [ ] **Step 1: Write failing tests**

```ts
// packages/api/test/split/contacts.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  createContact, listContacts, updateContact, deleteContact, normalizeEmail, normalizePhone,
} from '../../src/services/split/contacts.service.js';

describe('split contacts', () => {
  let me: TestScope;
  beforeAll(async () => { me = await createTestScope('split-contacts'); });
  afterAll(async () => {
    await runAsSystem(() => prisma.splitContact.deleteMany({ where: { ownerUserId: me.userId } }));
    await me.cleanup();
  });

  it('normalises', () => {
    expect(normalizeEmail('  Ravi@Example.COM ')).toBe('ravi@example.com');
    expect(normalizePhone('+91 98765-43210')).toBe('919876543210');
    expect(normalizePhone('9876543210')).toBe('919876543210');
  });

  it('stores email/phone encrypted with a lookup hash, returns plaintext', async () => {
    const c = await me.runAs(() => createContact(me.userId, { name: 'Ravi', email: 'Ravi@x.com', phone: '9876543210', upiId: 'ravi@okhdfc' }));
    expect(c.email).toBe('ravi@x.com');
    expect(c.phone).toBe('919876543210');
    const row = await runAsSystem(() => prisma.splitContact.findUniqueOrThrow({ where: { id: c.id } }));
    expect(row.email).toBeNull();
    expect(row.emailEnc).not.toBeNull();
    expect(row.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.phone).toBeNull();
  });

  it('lists, updates, deletes', async () => {
    const c = await me.runAs(() => createContact(me.userId, { name: 'Sita' }));
    const u = await me.runAs(() => updateContact(me.userId, c.id, { name: 'Sita K', email: 'sita@x.com' }));
    expect(u.name).toBe('Sita K');
    expect(u.email).toBe('sita@x.com');
    const all = await me.runAs(() => listContacts(me.userId));
    expect(all.map((x) => x.name)).toContain('Sita K');
    await me.runAs(() => deleteContact(me.userId, c.id));
    await expect(me.runAs(() => updateContact(me.userId, c.id, { name: 'x' }))).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid email or UPI id', async () => {
    await expect(me.runAs(() => createContact(me.userId, { name: 'X', email: 'nope' }))).rejects.toThrow(/email/i);
    await expect(me.runAs(() => createContact(me.userId, { name: 'X', upiId: 'no-at-sign' }))).rejects.toThrow(/UPI/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/split/contacts.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/api/src/services/split/contacts.service.ts
/**
 * The caller's Split address book. Email and phone are sealed at rest
 * (sealText) with a keyed fingerprint beside them, so a later signup can be
 * matched to placeholder contacts without storing the address in clear.
 */
import type { SplitContactDto } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { sealText, openText } from '../piiAtRest.service.js';
import { hashIdentifier } from '../pfCredentials.service.js';
import { env } from '../../config/env.js';

export interface ContactInput { name: string; email?: string | null; phone?: string | null; upiId?: string | null }

const EMAIL_PURPOSE = 'split-contact-email';
const PHONE_PURPOSE = 'split-contact-phone';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

function checkEmail(v: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new BadRequestError('Invalid email address');
}
function checkUpi(v: string): void {
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(v)) throw new BadRequestError('Invalid UPI ID');
}

async function identifierColumns(prefix: 'email' | 'phone', raw: string | null | undefined) {
  if (raw === undefined) return {};
  if (raw === null || raw.trim() === '') return { [prefix]: null, [`${prefix}Enc`]: null, [`${prefix}Hash`]: null };
  const value = prefix === 'email' ? normalizeEmail(raw) : normalizePhone(raw);
  if (prefix === 'email') checkEmail(value);
  const { plain, enc } = await sealText(value);
  const hash = env.APP_ENCRYPTION_KEY ? hashIdentifier(value, prefix === 'email' ? EMAIL_PURPOSE : PHONE_PURPOSE) : null;
  return { [prefix]: plain, [`${prefix}Enc`]: enc, [`${prefix}Hash`]: hash };
}

type Row = { id: string; name: string; email: string | null; emailEnc: string | null; phone: string | null; phoneEnc: string | null; upiId: string | null; linkedUserId: string | null };

function toDto(r: Row): SplitContactDto {
  return {
    id: r.id,
    name: r.name,
    email: openText(r.emailEnc, r.email),
    phone: openText(r.phoneEnc, r.phone),
    upiId: r.upiId,
    linkedUserId: r.linkedUserId,
  };
}

export async function listContacts(userId: string): Promise<SplitContactDto[]> {
  const rows = await prisma.splitContact.findMany({ where: { ownerUserId: userId }, orderBy: { name: 'asc' } });
  return rows.map(toDto);
}

export async function createContact(userId: string, input: ContactInput): Promise<SplitContactDto> {
  const name = input.name.trim();
  if (!name) throw new BadRequestError('Name is required');
  if (input.upiId) checkUpi(input.upiId.trim());
  const row = await prisma.splitContact.create({
    data: {
      ownerUserId: userId,
      name,
      upiId: input.upiId?.trim() || null,
      ...(await identifierColumns('email', input.email ?? null)),
      ...(await identifierColumns('phone', input.phone ?? null)),
    },
  });
  return toDto(row);
}

export async function getContactRow(userId: string, id: string) {
  const row = await prisma.splitContact.findFirst({
    where: { id, ownerUserId: userId },
    select: { id: true, name: true, linkedUserId: true, upiId: true },
  });
  if (!row) throw new NotFoundError('Contact not found');
  return row;
}

export async function updateContact(userId: string, id: string, input: Partial<ContactInput>): Promise<SplitContactDto> {
  await getContactRow(userId, id);
  if (input.upiId) checkUpi(input.upiId.trim());
  const row = await prisma.splitContact.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.upiId !== undefined ? { upiId: input.upiId?.trim() || null } : {}),
      ...(await identifierColumns('email', input.email)),
      ...(await identifierColumns('phone', input.phone)),
    },
  });
  return toDto(row);
}

export async function deleteContact(userId: string, id: string): Promise<void> {
  await getContactRow(userId, id);
  await prisma.splitContact.delete({ where: { id } });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/split/contacts.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/split/contacts.service.ts packages/api/test/split/contacts.service.test.ts
git commit -m "feat(split): encrypted contact book

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Groups, members, DIRECT groups, activity

**Files:**
- Create: `packages/api/src/services/split/activity.ts`
- Create: `packages/api/src/services/split/groups.service.ts`
- Create: `packages/api/test/helpers/splitFixtures.ts`
- Test: `packages/api/test/split/groups.service.test.ts`

**Interfaces:**
- Consumes: `getContactRow` (Task 4); `memberNets` (Task 2).
- Produces:

```ts
// activity.ts
export async function writeActivity(tx: Prisma.TransactionClient, groupId: string, actorUserId: string, kind: string, payload: Prisma.InputJsonValue): Promise<void>;

// groups.service.ts
export interface CreateGroupInput { name: string; type?: 'TRIP' | 'HOME' | 'COUPLE' | 'OTHER'; baseCurrency?: string; simplifyDebts?: boolean; myDisplayName: string; contactIds?: string[] }
export async function createGroup(userId: string, input: CreateGroupInput): Promise<SplitGroupDto>;
export async function listGroups(userId: string, opts?: { includeDirect?: boolean; includeArchived?: boolean }): Promise<SplitGroupDto[]>;
export async function getGroup(userId: string, groupId: string): Promise<SplitGroupDto>;
export async function updateGroup(userId: string, groupId: string, patch: { name?: string; type?: 'TRIP'|'HOME'|'COUPLE'|'OTHER'; simplifyDebts?: boolean; archived?: boolean }): Promise<SplitGroupDto>;
export async function addMember(userId: string, groupId: string, contactId: string): Promise<SplitMemberDto>;
export async function removeMember(userId: string, groupId: string, memberId: string): Promise<void>;
export async function getOrCreateDirectGroup(userId: string, myDisplayName: string, contactId: string): Promise<SplitGroupDto>;
export async function loadLedger(groupId: string): Promise<{ memberIds: string[]; expenses: LedgerExpense[]; settlements: LedgerSettlement[] }>;
export async function requireMember(userId: string, groupId: string): Promise<{ memberId: string }>;
```

`baseCurrency` validated as 3 uppercase letters and immutable after create (changing it would invalidate every stored `baseAmount`). `myNet` in `SplitGroupDto` = caller's net from `memberNets`. A linked contact (`linkedUserId` set) becomes a member with `userId` set; otherwise placeholder (`userId` null). Adding the same linked user twice → 409.

- [ ] **Step 1: Write fixture helper**

```ts
// packages/api/test/helpers/splitFixtures.ts
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

/** A contact owned by `ownerUserId`, optionally already linked to `linkedUserId`. */
export async function seedContact(ownerUserId: string, name: string, linkedUserId: string | null = null) {
  return runAsSystem(() => prisma.splitContact.create({ data: { ownerUserId, name, linkedUserId } }));
}

/** Remove every split row a test created for these users. */
export async function cleanupSplit(userIds: string[]) {
  await runAsSystem(async () => {
    const groups = await prisma.splitGroup.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
    await prisma.splitGroup.deleteMany({ where: { id: { in: groups.map((g) => g.id) } } });
    await prisma.splitContact.deleteMany({ where: { ownerUserId: { in: userIds } } });
  });
}
```

- [ ] **Step 2: Write failing tests**

```ts
// packages/api/test/split/groups.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import {
  createGroup, listGroups, getGroup, updateGroup, addMember, removeMember, getOrCreateDirectGroup,
} from '../../src/services/split/groups.service.js';

describe('split groups', () => {
  let alice: TestScope;
  let bob: TestScope;
  beforeAll(async () => {
    alice = await createTestScope('split-groups-a');
    bob = await createTestScope('split-groups-b');
  });
  afterAll(async () => {
    await cleanupSplit([alice.userId, bob.userId]);
    await alice.cleanup();
    await bob.cleanup();
  });

  it('creates a group with creator, linked and placeholder members', async () => {
    const linked = await seedContact(alice.userId, 'Bob', bob.userId);
    const ph = await seedContact(alice.userId, 'Ravi');
    const g = await alice.runAs(() =>
      createGroup(alice.userId, { name: 'Goa', type: 'TRIP', myDisplayName: 'Alice', contactIds: [linked.id, ph.id] }),
    );
    expect(g.members).toHaveLength(3);
    expect(g.members.find((m) => m.isMe)?.displayName).toBe('Alice');
    expect(g.members.find((m) => m.displayName === 'Bob')?.userId).toBe(bob.userId);
    expect(g.members.find((m) => m.displayName === 'Ravi')?.userId).toBeNull();
    expect(g.myNet).toBe('0.0000');
    const bobView = await bob.runAs(() => getGroup(bob.userId, g.id));
    expect(bobView.members.find((m) => m.isMe)?.displayName).toBe('Bob');
  });

  it('rejects a bad currency code', async () => {
    await expect(
      alice.runAs(() => createGroup(alice.userId, { name: 'X', baseCurrency: 'rupees', myDisplayName: 'A' })),
    ).rejects.toThrow(/currency/i);
  });

  it('hides DIRECT groups from the default list and reuses them', async () => {
    const c = await seedContact(alice.userId, 'Bob D', bob.userId);
    const d1 = await alice.runAs(() => getOrCreateDirectGroup(alice.userId, 'Alice', c.id));
    const d2 = await alice.runAs(() => getOrCreateDirectGroup(alice.userId, 'Alice', c.id));
    expect(d1.id).toBe(d2.id);
    expect(d1.type).toBe('DIRECT');
    const list = await alice.runAs(() => listGroups(alice.userId));
    expect(list.find((g) => g.id === d1.id)).toBeUndefined();
  });

  it('adding the same linked user twice is a conflict', async () => {
    const c = await seedContact(alice.userId, 'Bob 2', bob.userId);
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Flat', myDisplayName: 'Alice', contactIds: [c.id] }));
    await expect(alice.runAs(() => addMember(alice.userId, g.id, c.id))).rejects.toThrow(/already/i);
  });

  it('removing a member who still owes money is refused', async () => {
    const ph = await seedContact(alice.userId, 'Owes');
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Debt', myDisplayName: 'Alice', contactIds: [ph.id] }));
    const me = g.members.find((m) => m.isMe)!;
    const them = g.members.find((m) => !m.isMe)!;
    await runAsSystem(() =>
      prisma.splitExpense.create({
        data: {
          groupId: g.id, description: 'x', date: new Date('2026-10-01'), amount: '10', currency: 'INR', fxRate: '1',
          baseAmount: '10', splitMode: 'EQUAL', createdById: alice.userId,
          payers: { create: [{ memberId: me.id, amount: '10', baseAmount: '10' }] },
          shares: { create: [{ memberId: them.id, amount: '10', baseAmount: '10' }] },
        },
      }),
    );
    await expect(alice.runAs(() => removeMember(alice.userId, g.id, them.id))).rejects.toThrow(/SPLIT_MEMBER_HAS_BALANCE/);
    const after = await alice.runAs(() => getGroup(alice.userId, g.id));
    expect(after.members.find((m) => m.id === them.id)).toBeDefined();
  });

  it('archive and simplify toggle', async () => {
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Old', myDisplayName: 'Alice' }));
    const u = await alice.runAs(() => updateGroup(alice.userId, g.id, { simplifyDebts: false, archived: true }));
    expect(u.simplifyDebts).toBe(false);
    expect(u.archivedAt).not.toBeNull();
    const list = await alice.runAs(() => listGroups(alice.userId));
    expect(list.find((x) => x.id === g.id)).toBeUndefined();
  });

  it('non-member gets not found', async () => {
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Private', myDisplayName: 'Alice' }));
    await expect(bob.runAs(() => getGroup(bob.userId, g.id))).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run test/split/groups.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `activity.ts`**

```ts
// packages/api/src/services/split/activity.ts
import type { Prisma } from '@prisma/client';

export async function writeActivity(
  tx: Prisma.TransactionClient,
  groupId: string,
  actorUserId: string,
  kind: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await tx.splitActivity.create({ data: { groupId, actorUserId, kind, payload } });
}
```

- [ ] **Step 5: Implement `groups.service.ts`**

```ts
// packages/api/src/services/split/groups.service.ts
/**
 * Split groups and their members. RLS already hides groups the caller is not
 * in; requireMember turns "hidden" into a clean 404 and gives back the
 * caller's member id for writes.
 */
import { Decimal } from 'decimal.js';
import type { SplitGroupDto, SplitMemberDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { getContactRow } from './contacts.service.js';
import { memberNets, type LedgerExpense, type LedgerSettlement } from './balances.js';
import { writeActivity } from './activity.js';

export interface CreateGroupInput {
  name: string;
  type?: 'TRIP' | 'HOME' | 'COUPLE' | 'OTHER';
  baseCurrency?: string;
  simplifyDebts?: boolean;
  myDisplayName: string;
  contactIds?: string[];
}

const CCY = /^[A-Z]{3}$/;

export async function requireMember(userId: string, groupId: string): Promise<{ memberId: string }> {
  const m = await prisma.splitMember.findFirst({ where: { groupId, userId, leftAt: null }, select: { id: true } });
  if (!m) throw new NotFoundError('Group not found');
  return { memberId: m.id };
}

export async function loadLedger(groupId: string) {
  const [members, expenses, settlements] = await Promise.all([
    prisma.splitMember.findMany({ where: { groupId }, select: { id: true } }),
    prisma.splitExpense.findMany({
      where: { groupId, deletedAt: null },
      select: { payers: { select: { memberId: true, baseAmount: true } }, shares: { select: { memberId: true, baseAmount: true } } },
    }),
    prisma.splitSettlement.findMany({
      where: { groupId, deletedAt: null },
      select: { fromMemberId: true, toMemberId: true, baseAmount: true },
    }),
  ]);
  const d = (v: { toString(): string }) => new Decimal(v.toString());
  return {
    memberIds: members.map((m) => m.id),
    expenses: expenses.map<LedgerExpense>((e) => ({
      payers: e.payers.map((p) => ({ memberId: p.memberId, baseAmount: d(p.baseAmount) })),
      shares: e.shares.map((s) => ({ memberId: s.memberId, baseAmount: d(s.baseAmount) })),
    })),
    settlements: settlements.map<LedgerSettlement>((s) => ({ fromMemberId: s.fromMemberId, toMemberId: s.toMemberId, baseAmount: d(s.baseAmount) })),
  };
}

type GroupRow = Awaited<ReturnType<typeof fetchGroup>>;
function fetchGroup(groupId: string) {
  return prisma.splitGroup.findUnique({ where: { id: groupId }, include: { members: { orderBy: { createdAt: 'asc' } } } });
}

async function toDto(userId: string, g: NonNullable<GroupRow>): Promise<SplitGroupDto> {
  const ledger = await loadLedger(g.id);
  const nets = memberNets(ledger.expenses, ledger.settlements, ledger.memberIds);
  const mine = g.members.find((m) => m.userId === userId && !m.leftAt);
  const members: SplitMemberDto[] = g.members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    userId: m.userId,
    contactId: m.contactId,
    isMe: m.userId === userId,
    leftAt: m.leftAt?.toISOString() ?? null,
  }));
  return {
    id: g.id,
    name: g.name,
    type: g.type,
    baseCurrency: g.baseCurrency,
    simplifyDebts: g.simplifyDebts,
    archivedAt: g.archivedAt?.toISOString() ?? null,
    members,
    myNet: serializeMoney(mine ? nets.get(mine.id) ?? 0 : 0),
  };
}

export async function getGroup(userId: string, groupId: string): Promise<SplitGroupDto> {
  await requireMember(userId, groupId);
  const g = await fetchGroup(groupId);
  if (!g) throw new NotFoundError('Group not found');
  return toDto(userId, g);
}

async function memberDataForContact(userId: string, contactId: string) {
  const c = await getContactRow(userId, contactId);
  return { contactId: c.id, userId: c.linkedUserId, displayName: c.name };
}

export async function createGroup(userId: string, input: CreateGroupInput): Promise<SplitGroupDto> {
  const name = input.name.trim();
  if (!name) throw new BadRequestError('Group name is required');
  const baseCurrency = (input.baseCurrency ?? 'INR').toUpperCase();
  if (!CCY.test(baseCurrency)) throw new BadRequestError('Invalid currency code');
  const others = await Promise.all((input.contactIds ?? []).map((id) => memberDataForContact(userId, id)));
  const seen = new Set<string>([userId]);
  for (const o of others) {
    if (o.userId && seen.has(o.userId)) throw new ConflictError('That person is already in the group');
    if (o.userId) seen.add(o.userId);
  }

  const groupId = await runInTransaction(async (tx) => {
    const g = await tx.splitGroup.create({
      data: { name, type: input.type ?? 'OTHER', baseCurrency, simplifyDebts: input.simplifyDebts ?? true, createdById: userId },
    });
    await tx.splitMember.create({ data: { groupId: g.id, userId, displayName: input.myDisplayName.trim() || 'Me' } });
    for (const o of others) await tx.splitMember.create({ data: { groupId: g.id, ...o } });
    await writeActivity(tx, g.id, userId, 'GROUP_CREATED', { name });
    return g.id;
  });
  return getGroup(userId, groupId);
}

export async function listGroups(userId: string, opts: { includeDirect?: boolean; includeArchived?: boolean } = {}): Promise<SplitGroupDto[]> {
  const rows = await prisma.splitGroup.findMany({
    where: {
      members: { some: { userId, leftAt: null } },
      ...(opts.includeDirect ? {} : { type: { not: 'DIRECT' } }),
      ...(opts.includeArchived ? {} : { archivedAt: null }),
    },
    include: { members: { orderBy: { createdAt: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });
  return Promise.all(rows.map((g) => toDto(userId, g)));
}

export async function updateGroup(
  userId: string,
  groupId: string,
  patch: { name?: string; type?: 'TRIP' | 'HOME' | 'COUPLE' | 'OTHER'; simplifyDebts?: boolean; archived?: boolean },
): Promise<SplitGroupDto> {
  await requireMember(userId, groupId);
  await runInTransaction(async (tx) => {
    await tx.splitGroup.update({
      where: { id: groupId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.simplifyDebts !== undefined ? { simplifyDebts: patch.simplifyDebts } : {}),
        ...(patch.archived !== undefined ? { archivedAt: patch.archived ? new Date() : null } : {}),
      },
    });
    await writeActivity(tx, groupId, userId, 'GROUP_UPDATED', patch);
  });
  return getGroup(userId, groupId);
}

export async function addMember(userId: string, groupId: string, contactId: string): Promise<SplitMemberDto> {
  await requireMember(userId, groupId);
  const data = await memberDataForContact(userId, contactId);
  if (data.userId) {
    const dup = await prisma.splitMember.findFirst({ where: { groupId, userId: data.userId } });
    if (dup) throw new ConflictError('That person is already in the group');
  }
  const m = await runInTransaction(async (tx) => {
    const row = await tx.splitMember.create({ data: { groupId, ...data } });
    await writeActivity(tx, groupId, userId, 'MEMBER_ADDED', { memberId: row.id, displayName: row.displayName });
    return row;
  });
  return { id: m.id, displayName: m.displayName, userId: m.userId, contactId: m.contactId, isMe: false, leftAt: null };
}

export async function removeMember(userId: string, groupId: string, memberId: string): Promise<void> {
  await requireMember(userId, groupId);
  const ledger = await loadLedger(groupId);
  if (!ledger.memberIds.includes(memberId)) throw new NotFoundError('Member not found');
  const net = memberNets(ledger.expenses, ledger.settlements, ledger.memberIds).get(memberId)!;
  if (!net.isZero()) throw new ConflictError('SPLIT_MEMBER_HAS_BALANCE: settle this member to zero first');
  const involved = ledger.expenses.some((e) => e.payers.some((p) => p.memberId === memberId) || e.shares.some((s) => s.memberId === memberId));
  await runInTransaction(async (tx) => {
    // Keep the row (history references it) once they took part in anything.
    if (involved) await tx.splitMember.update({ where: { id: memberId }, data: { leftAt: new Date() } });
    else await tx.splitMember.delete({ where: { id: memberId } });
    await writeActivity(tx, groupId, userId, 'MEMBER_REMOVED', { memberId });
  });
}

export async function getOrCreateDirectGroup(userId: string, myDisplayName: string, contactId: string): Promise<SplitGroupDto> {
  const other = await memberDataForContact(userId, contactId);
  const existing = await prisma.splitGroup.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { members: { some: { userId, leftAt: null } } },
        { members: { some: other.userId ? { userId: other.userId } : { contactId } } },
      ],
    },
    select: { id: true },
  });
  if (existing) return getGroup(userId, existing.id);
  const groupId = await runInTransaction(async (tx) => {
    const g = await tx.splitGroup.create({ data: { name: other.displayName, type: 'DIRECT', createdById: userId } });
    await tx.splitMember.create({ data: { groupId: g.id, userId, displayName: myDisplayName.trim() || 'Me' } });
    await tx.splitMember.create({ data: { groupId: g.id, ...other } });
    return g.id;
  });
  return getGroup(userId, groupId);
}
```

Leaving a member row with `leftAt` set keeps their id valid in history and balances; `memberNets` still includes them, which is correct (their net is zero).

- [ ] **Step 6: Run tests**

Run: `npx vitest run test/split/groups.service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/services/split/activity.ts packages/api/src/services/split/groups.service.ts packages/api/test/helpers/splitFixtures.ts packages/api/test/split/groups.service.test.ts
git commit -m "feat(split): groups, members and direct ledgers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Expenses service

**Files:**
- Create: `packages/api/src/services/split/fx.ts`
- Create: `packages/api/src/services/split/expenses.service.ts`
- Test: `packages/api/test/split/expenses.service.test.ts`

**Interfaces:**
- Consumes: `computeShares`, `toBase`, `allocateBase`, `allocate` (Task 1); `requireMember`, `writeActivity` (Task 5); `getLatestFxRate(base, quote)` from `src/priceFeeds/fx.service.ts`.
- Produces:

```ts
// fx.ts
export async function resolveFxRate(from: string, to: string, override?: string | null): Promise<Decimal>; // 400 SPLIT_FX_UNAVAILABLE when no rate and no override

// expenses.service.ts
export interface ExpenseInput {
  groupId: string; description: string; date: string; // YYYY-MM-DD
  amount: string; currency: string; fxRate?: string | null;
  splitMode: 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES';
  payers: Array<{ memberId: string; amount: string }>;
  shares: Array<{ memberId: string; value?: string }>;
}
export async function createExpense(userId: string, input: ExpenseInput): Promise<SplitExpenseDto>;
export async function updateExpense(userId: string, id: string, input: Omit<ExpenseInput, 'groupId'>): Promise<SplitExpenseDto>;
export async function deleteExpense(userId: string, id: string): Promise<void>;
export async function restoreExpense(userId: string, id: string): Promise<SplitExpenseDto>;
export async function getExpense(userId: string, id: string): Promise<SplitExpenseDto>;
export async function listExpenses(userId: string, groupId: string, opts?: { includeDeleted?: boolean }): Promise<SplitExpenseDto[]>;
```

Validation: every payer/share `memberId` must be a member of the group (current or left → left is rejected); Σ payers = amount (`SPLIT_SUM_MISMATCH`); currency 3 letters; date not more than 1 day in the future.

- [ ] **Step 1: Write failing tests**

```ts
// packages/api/test/split/expenses.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import {
  createExpense, updateExpense, deleteExpense, restoreExpense, getExpense, listExpenses,
} from '../../src/services/split/expenses.service.js';

describe('split expenses', () => {
  let alice: TestScope;
  let bob: TestScope;
  let groupId: string;
  let me: string;
  let b: string;
  let r: string;

  beforeAll(async () => {
    alice = await createTestScope('split-exp-a');
    bob = await createTestScope('split-exp-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const cr = await seedContact(alice.userId, 'Ravi');
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Trip', myDisplayName: 'Alice', contactIds: [cb.id, cr.id] }));
    groupId = g.id;
    me = g.members.find((m) => m.isMe)!.id;
    b = g.members.find((m) => m.displayName === 'Bob')!.id;
    r = g.members.find((m) => m.displayName === 'Ravi')!.id;
  });
  afterAll(async () => {
    await cleanupSplit([alice.userId, bob.userId]);
    await alice.cleanup();
    await bob.cleanup();
  });

  const base = () => ({
    groupId, description: 'Dinner', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL' as const,
    payers: [{ memberId: me, amount: '100' }],
    shares: [{ memberId: me }, { memberId: b }, { memberId: r }],
  });

  it('creates an equal split that totals exactly, with an activity row', async () => {
    const e = await alice.runAs(() => createExpense(alice.userId, base()));
    expect(e.shares.map((s) => s.amount).sort()).toEqual(['33.3300', '33.3300', '33.3400']);
    expect(e.baseAmount).toBe('100.0000');
    const act = await runAsSystem(() => prisma.splitActivity.count({ where: { groupId, kind: 'EXPENSE_ADDED' } }));
    expect(act).toBeGreaterThan(0);
  });

  it('other linked member can edit it', async () => {
    const e = await alice.runAs(() => createExpense(alice.userId, base()));
    const u = await bob.runAs(() =>
      updateExpense(bob.userId, e.id, { ...base(), amount: '90', splitMode: 'EXACT',
        payers: [{ memberId: b, amount: '90' }], shares: [{ memberId: me, value: '45' }, { memberId: b, value: '45' }] }),
    );
    expect(u.amount).toBe('90.0000');
    expect(u.payers).toEqual([{ memberId: b, amount: '90.0000', baseAmount: '90.0000' }]);
    expect(u.shares).toHaveLength(2);
  });

  it('edit with invalid shares leaves original intact', async () => {
    const e = await alice.runAs(() => createExpense(alice.userId, base()));
    await expect(
      alice.runAs(() => updateExpense(alice.userId, e.id, { ...base(), splitMode: 'EXACT', shares: [{ memberId: me, value: '10' }] })),
    ).rejects.toThrow(/SPLIT_SUM_MISMATCH/);
    const again = await alice.runAs(() => getExpense(alice.userId, e.id));
    expect(again.amount).toBe('100.0000');
    expect(again.shares).toHaveLength(3);
  });

  it('payers must add up', async () => {
    await expect(
      alice.runAs(() => createExpense(alice.userId, { ...base(), payers: [{ memberId: me, amount: '99' }] })),
    ).rejects.toThrow(/SPLIT_SUM_MISMATCH/);
  });

  it('rejects members from another group', async () => {
    const other = await alice.runAs(() => createGroup(alice.userId, { name: 'Other', myDisplayName: 'Alice' }));
    const stranger = other.members[0]!.id;
    await expect(
      alice.runAs(() => createExpense(alice.userId, { ...base(), shares: [{ memberId: stranger }] })),
    ).rejects.toThrow(/not in this group/i);
  });

  it('foreign currency uses the given rate and keeps base totals exact', async () => {
    const e = await alice.runAs(() =>
      createExpense(alice.userId, { ...base(), amount: '10', currency: 'usd', fxRate: '83.12345', payers: [{ memberId: me, amount: '10' }] }),
    );
    expect(e.currency).toBe('USD');
    expect(e.baseAmount).toBe('831.2300');
    const sumBase = e.shares.reduce((a, s) => a + Math.round(Number(s.baseAmount) * 100), 0);
    expect(sumBase).toBe(83123);
  });

  it('soft delete hides from list, restore brings it back', async () => {
    const e = await alice.runAs(() => createExpense(alice.userId, base()));
    await alice.runAs(() => deleteExpense(alice.userId, e.id));
    const list = await alice.runAs(() => listExpenses(alice.userId, groupId));
    expect(list.find((x) => x.id === e.id)).toBeUndefined();
    const back = await alice.runAs(() => restoreExpense(alice.userId, e.id));
    expect(back.deletedAt).toBeNull();
  });

  it('rejects a date far in the future', async () => {
    await expect(alice.runAs(() => createExpense(alice.userId, { ...base(), date: '2099-01-01' }))).rejects.toThrow(/date/i);
  });
});
```

(The `Number(...)` in the currency test is test-only arithmetic on already-serialised paise to check a sum; it never feeds production code.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/split/expenses.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fx.ts`**

```ts
// packages/api/src/services/split/fx.ts
import { Decimal } from 'decimal.js';
import { BadRequestError } from '../../lib/errors.js';
import { getLatestFxRate } from '../../priceFeeds/fx.service.js';

/** Rate converting `from` into `to`. A user-supplied override wins. */
export async function resolveFxRate(from: string, to: string, override?: string | null): Promise<Decimal> {
  if (override != null && override !== '') {
    if (!/^\d+(\.\d+)?$/.test(override) || new Decimal(override).lte(0)) {
      throw new BadRequestError('SPLIT_BAD_INPUT: fxRate must be a positive number');
    }
    return new Decimal(override);
  }
  if (from === to) return new Decimal(1);
  const rate = await getLatestFxRate(from, to);
  if (!rate) throw new BadRequestError(`SPLIT_FX_UNAVAILABLE: no ${from}/${to} rate — enter one manually`);
  return rate.toDecimalPlaces(8, Decimal.ROUND_HALF_EVEN);
}
```

- [ ] **Step 4: Implement `expenses.service.ts`**

```ts
// packages/api/src/services/split/expenses.service.ts
/**
 * Expense writes. Shares and payers are computed and validated in memory
 * first; only then does one transaction replace the rows, so a rejected edit
 * never leaves an expense half-rewritten.
 */
import { Decimal } from 'decimal.js';
import type { Prisma } from '@prisma/client';
import type { SplitExpenseDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { computeShares, toBase, allocateBase } from './allocate.js';
import { requireMember } from './groups.service.js';
import { writeActivity } from './activity.js';
import { resolveFxRate } from './fx.js';

export interface ExpenseInput {
  groupId: string;
  description: string;
  date: string;
  amount: string;
  currency: string;
  fxRate?: string | null;
  splitMode: 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES';
  payers: Array<{ memberId: string; amount: string }>;
  shares: Array<{ memberId: string; value?: string }>;
}

const DAY_MS = 86_400_000;
const INCLUDE = { payers: true, shares: true } as const;
type Row = Prisma.SplitExpenseGetPayload<{ include: typeof INCLUDE }>;

function toDto(e: Row): SplitExpenseDto {
  const byId = <T extends { memberId: string }>(a: T, b: T) => (a.memberId < b.memberId ? -1 : 1);
  return {
    id: e.id,
    groupId: e.groupId,
    description: e.description,
    date: e.date.toISOString().slice(0, 10),
    amount: serializeMoney(e.amount.toString()),
    currency: e.currency,
    fxRate: e.fxRate.toString(),
    baseAmount: serializeMoney(e.baseAmount.toString()),
    splitMode: e.splitMode,
    createdById: e.createdById,
    sourceType: e.sourceType,
    deletedAt: e.deletedAt?.toISOString() ?? null,
    payers: [...e.payers].sort(byId).map((p) => ({ memberId: p.memberId, amount: serializeMoney(p.amount.toString()), baseAmount: serializeMoney(p.baseAmount.toString()) })),
    shares: [...e.shares].sort(byId).map((s) => ({ memberId: s.memberId, amount: serializeMoney(s.amount.toString()), baseAmount: serializeMoney(s.baseAmount.toString()), rawInput: s.rawInput?.toString() ?? null })),
  };
}

async function build(groupId: string, input: Omit<ExpenseInput, 'groupId'>) {
  const description = input.description.trim();
  if (!description) throw new BadRequestError('Description is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new BadRequestError('Invalid date');
  const date = new Date(`${input.date}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + DAY_MS) throw new BadRequestError('Invalid date');
  const currency = input.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestError('Invalid currency code');
  if (!/^\d+(\.\d+)?$/.test(input.amount)) throw new BadRequestError('SPLIT_BAD_INPUT: amount');
  const amount = new Decimal(input.amount);

  const group = await prisma.splitGroup.findUnique({ where: { id: groupId }, select: { baseCurrency: true } });
  if (!group) throw new NotFoundError('Group not found');
  const active = new Set(
    (await prisma.splitMember.findMany({ where: { groupId, leftAt: null }, select: { id: true } })).map((m) => m.id),
  );
  for (const id of [...input.payers.map((p) => p.memberId), ...input.shares.map((s) => s.memberId)]) {
    if (!active.has(id)) throw new BadRequestError('A participant is not in this group');
  }

  const shares = computeShares(input.splitMode, amount, input.shares);
  const payers = new Map<string, Decimal>();
  let paid = new Decimal(0);
  for (const p of input.payers) {
    if (!/^\d+(\.\d{1,2})?$/.test(p.amount)) throw new BadRequestError('SPLIT_BAD_INPUT: payer amount');
    const v = new Decimal(p.amount);
    payers.set(p.memberId, (payers.get(p.memberId) ?? new Decimal(0)).plus(v));
    paid = paid.plus(v);
  }
  if (payers.size === 0) throw new BadRequestError('SPLIT_NO_PARTICIPANTS: nobody paid');
  if (!paid.eq(amount)) throw new BadRequestError(`SPLIT_SUM_MISMATCH: payers add to ${paid.toFixed(2)}, expense is ${amount.toFixed(2)}`);

  const fxRate = await resolveFxRate(currency, group.baseCurrency, input.fxRate);
  const baseAmount = toBase(amount, fxRate);
  const baseShares = allocateBase(baseAmount, shares);
  const basePayers = allocateBase(baseAmount, payers);
  const raw = new Map(input.shares.map((s) => [s.memberId, s.value]));

  return {
    scalar: { description, date, amount: amount.toFixed(2), currency, fxRate: fxRate.toString(), baseAmount: baseAmount.toFixed(2), splitMode: input.splitMode },
    payers: [...payers].map(([memberId, v]) => ({ memberId, amount: v.toFixed(2), baseAmount: basePayers.get(memberId)!.toFixed(2) })),
    shares: [...shares].map(([memberId, v]) => ({
      memberId,
      amount: v.toFixed(2),
      baseAmount: baseShares.get(memberId)!.toFixed(2),
      rawInput: input.splitMode === 'EQUAL' ? null : raw.get(memberId) ?? null,
    })),
  };
}

async function loadOwned(userId: string, id: string): Promise<Row> {
  const e = await prisma.splitExpense.findUnique({ where: { id }, include: INCLUDE });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  return e;
}

export async function getExpense(userId: string, id: string): Promise<SplitExpenseDto> {
  return toDto(await loadOwned(userId, id));
}

export async function listExpenses(userId: string, groupId: string, opts: { includeDeleted?: boolean } = {}): Promise<SplitExpenseDto[]> {
  await requireMember(userId, groupId);
  const rows = await prisma.splitExpense.findMany({
    where: { groupId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
    include: INCLUDE,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toDto);
}

export async function createExpense(userId: string, input: ExpenseInput): Promise<SplitExpenseDto> {
  await requireMember(userId, input.groupId);
  const b = await build(input.groupId, input);
  const id = await runInTransaction(async (tx) => {
    const e = await tx.splitExpense.create({
      data: { groupId: input.groupId, createdById: userId, ...b.scalar, payers: { create: b.payers }, shares: { create: b.shares } },
    });
    await writeActivity(tx, input.groupId, userId, 'EXPENSE_ADDED', { expenseId: e.id, description: b.scalar.description, amount: b.scalar.amount, currency: b.scalar.currency });
    await tx.splitGroup.update({ where: { id: input.groupId }, data: { updatedAt: new Date() } });
    return e.id;
  });
  return getExpense(userId, id);
}

export async function updateExpense(userId: string, id: string, input: Omit<ExpenseInput, 'groupId'>): Promise<SplitExpenseDto> {
  const existing = await loadOwned(userId, id);
  if (existing.deletedAt) throw new BadRequestError('Restore the expense before editing it');
  const b = await build(existing.groupId, input);
  await runInTransaction(async (tx) => {
    await tx.splitPayer.deleteMany({ where: { expenseId: id } });
    await tx.splitShare.deleteMany({ where: { expenseId: id } });
    await tx.splitExpense.update({
      where: { id },
      data: { ...b.scalar, payers: { create: b.payers }, shares: { create: b.shares } },
    });
    await writeActivity(tx, existing.groupId, userId, 'EXPENSE_EDITED', {
      expenseId: id,
      before: { description: existing.description, amount: existing.amount.toString(), currency: existing.currency },
      after: { description: b.scalar.description, amount: b.scalar.amount, currency: b.scalar.currency },
    });
  });
  return getExpense(userId, id);
}

export async function deleteExpense(userId: string, id: string): Promise<void> {
  const e = await loadOwned(userId, id);
  if (e.deletedAt) return;
  await runInTransaction(async (tx) => {
    await tx.splitExpense.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeActivity(tx, e.groupId, userId, 'EXPENSE_DELETED', { expenseId: id, description: e.description });
  });
}

export async function restoreExpense(userId: string, id: string): Promise<SplitExpenseDto> {
  const e = await loadOwned(userId, id);
  if (e.deletedAt) {
    await runInTransaction(async (tx) => {
      await tx.splitExpense.update({ where: { id }, data: { deletedAt: null } });
      await writeActivity(tx, e.groupId, userId, 'EXPENSE_RESTORED', { expenseId: id, description: e.description });
    });
  }
  return getExpense(userId, id);
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/split/expenses.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/split/fx.ts packages/api/src/services/split/expenses.service.ts packages/api/test/split/expenses.service.test.ts
git commit -m "feat(split): expenses with multi-payer, four split modes and FX

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Settlements, balances, friends, activity reads

**Files:**
- Create: `packages/api/src/services/split/settlements.service.ts`
- Create: `packages/api/src/services/split/ledger.service.ts`
- Test: `packages/api/test/split/settlements.service.test.ts`

**Interfaces:**
- Consumes: `requireMember`, `loadLedger`, `listGroups` (Task 5); `memberNets`, `pairwiseDebts`, `simplify` (Task 2); `resolveFxRate` (Task 6); `toBase` (Task 1).
- Produces:

```ts
// settlements.service.ts
export interface SettlementInput { groupId: string; fromMemberId: string; toMemberId: string; amount: string; currency?: string; fxRate?: string | null; method: 'CASH' | 'UPI' | 'OTHER'; date: string }
export async function createSettlement(userId: string, input: SettlementInput): Promise<SplitSettlementDto>;
export async function updateSettlement(userId: string, id: string, input: Omit<SettlementInput, 'groupId'>): Promise<SplitSettlementDto>;
export async function deleteSettlement(userId: string, id: string): Promise<void>;
export async function listSettlements(userId: string, groupId: string): Promise<SplitSettlementDto[]>;

// ledger.service.ts
export async function groupBalances(userId: string, groupId: string): Promise<SplitBalancesDto>;
export async function listFriends(userId: string): Promise<SplitFriendDto[]>;
export async function listActivity(userId: string, opts: { groupId?: string; limit?: number; before?: string }): Promise<SplitActivityDto[]>;
```

Settlement currency defaults to group base. `fromMemberId !== toMemberId`; both must be active members; amount > 0, ≤ 2 dp. Friend key: `u:<userId>` for linked people, `m:<memberId>` for placeholders. Friend `net` > 0 means they owe the caller. Each group's contribution is the transfers between caller and that person from that group's `transfers` (simplified or pairwise per group setting), converted to the caller's `SplitSettings.homeCurrency` (default INR) at the latest rate; `approx = true` when any conversion happened. If no rate exists for a group's currency, that group is listed in `groups` but skipped from the total and `approx` is true.

- [ ] **Step 1: Write failing tests**

```ts
// packages/api/test/split/settlements.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { createSettlement, deleteSettlement } from '../../src/services/split/settlements.service.js';
import { groupBalances, listFriends, listActivity } from '../../src/services/split/ledger.service.js';

describe('split settlements and balances', () => {
  let alice: TestScope;
  let bob: TestScope;
  let groupId: string;
  let a: string;
  let b: string;
  let c: string;

  beforeAll(async () => {
    alice = await createTestScope('split-set-a');
    bob = await createTestScope('split-set-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const cc = await seedContact(alice.userId, 'Chetan');
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Flat', myDisplayName: 'Alice', contactIds: [cb.id, cc.id] }));
    groupId = g.id;
    a = g.members.find((m) => m.isMe)!.id;
    b = g.members.find((m) => m.displayName === 'Bob')!.id;
    c = g.members.find((m) => m.displayName === 'Chetan')!.id;
    // Alice paid 300 for all three; Bob paid 60 for Bob + Chetan.
    await alice.runAs(() => createExpense(alice.userId, {
      groupId, description: 'Rent', date: '2026-10-01', amount: '300', currency: 'INR', splitMode: 'EQUAL',
      payers: [{ memberId: a, amount: '300' }], shares: [{ memberId: a }, { memberId: b }, { memberId: c }],
    }));
    await bob.runAs(() => createExpense(bob.userId, {
      groupId, description: 'Milk', date: '2026-10-02', amount: '60', currency: 'INR', splitMode: 'EQUAL',
      payers: [{ memberId: b, amount: '60' }], shares: [{ memberId: b }, { memberId: c }],
    }));
  });
  afterAll(async () => {
    await cleanupSplit([alice.userId, bob.userId]);
    await alice.cleanup();
    await bob.cleanup();
  });

  it('nets and simplified transfers', async () => {
    const bal = await alice.runAs(() => groupBalances(alice.userId, groupId));
    const net = Object.fromEntries(bal.nets.map((n) => [n.memberId, n.net]));
    expect(net[a]).toBe('200.0000');
    expect(net[b]).toBe('-70.0000');
    expect(net[c]).toBe('-130.0000');
    expect(bal.simplified).toBe(true);
    expect(bal.transfers.length).toBeLessThanOrEqual(2);
  });

  it('friends view: Bob owes Alice 70 (Alice side), Alice is owed by Bob (Bob side negative)', async () => {
    const fa = await alice.runAs(() => listFriends(alice.userId));
    expect(fa.find((f) => f.key === `u:${bob.userId}`)?.net).toBe('70.0000');
    const fb = await bob.runAs(() => listFriends(bob.userId));
    expect(fb.find((f) => f.key === `u:${alice.userId}`)?.net).toBe('-70.0000');
    expect(fa.find((f) => f.key === `m:${c}`)?.net).toBe('130.0000');
  });

  it('settlement reduces balance; delete restores it', async () => {
    const s = await bob.runAs(() => createSettlement(bob.userId, { groupId, fromMemberId: b, toMemberId: a, amount: '70', method: 'UPI', date: '2026-10-03' }));
    let bal = await alice.runAs(() => groupBalances(alice.userId, groupId));
    expect(bal.nets.find((n) => n.memberId === b)!.net).toBe('0.0000');
    await bob.runAs(() => deleteSettlement(bob.userId, s.id));
    bal = await alice.runAs(() => groupBalances(alice.userId, groupId));
    expect(bal.nets.find((n) => n.memberId === b)!.net).toBe('-70.0000');
  });

  it('rejects paying yourself and non-positive amounts', async () => {
    await expect(alice.runAs(() => createSettlement(alice.userId, { groupId, fromMemberId: a, toMemberId: a, amount: '1', method: 'CASH', date: '2026-10-03' }))).rejects.toThrow();
    await expect(alice.runAs(() => createSettlement(alice.userId, { groupId, fromMemberId: b, toMemberId: a, amount: '0', method: 'CASH', date: '2026-10-03' }))).rejects.toThrow();
  });

  it('activity feed lists newest first', async () => {
    const act = await alice.runAs(() => listActivity(alice.userId, { groupId, limit: 50 }));
    expect(act[0]!.createdAt >= act[act.length - 1]!.createdAt).toBe(true);
    expect(act.map((x) => x.kind)).toContain('EXPENSE_ADDED');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/split/settlements.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `settlements.service.ts`**

```ts
// packages/api/src/services/split/settlements.service.ts
import { Decimal } from 'decimal.js';
import type { SplitSettlementDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import type { SplitSettlement } from '@prisma/client';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { requireMember } from './groups.service.js';
import { writeActivity } from './activity.js';
import { resolveFxRate } from './fx.js';
import { toBase } from './allocate.js';

export interface SettlementInput {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: string;
  currency?: string;
  fxRate?: string | null;
  method: 'CASH' | 'UPI' | 'OTHER';
  date: string;
}

function toDto(s: SplitSettlement): SplitSettlementDto {
  return {
    id: s.id, groupId: s.groupId, fromMemberId: s.fromMemberId, toMemberId: s.toMemberId,
    amount: serializeMoney(s.amount.toString()), currency: s.currency, fxRate: s.fxRate.toString(),
    baseAmount: serializeMoney(s.baseAmount.toString()), method: s.method,
    date: s.date.toISOString().slice(0, 10), deletedAt: s.deletedAt?.toISOString() ?? null,
  };
}

async function build(groupId: string, input: Omit<SettlementInput, 'groupId'>) {
  if (input.fromMemberId === input.toMemberId) throw new BadRequestError('Payer and receiver must differ');
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount) || new Decimal(input.amount).lte(0)) throw new BadRequestError('Amount must be > 0 with at most 2 decimals');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new BadRequestError('Invalid date');
  const group = await prisma.splitGroup.findUnique({ where: { id: groupId }, select: { baseCurrency: true } });
  if (!group) throw new NotFoundError('Group not found');
  const n = await prisma.splitMember.count({ where: { groupId, leftAt: null, id: { in: [input.fromMemberId, input.toMemberId] } } });
  if (n !== 2) throw new BadRequestError('A participant is not in this group');
  const currency = (input.currency ?? group.baseCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestError('Invalid currency code');
  const amount = new Decimal(input.amount);
  const fxRate = await resolveFxRate(currency, group.baseCurrency, input.fxRate);
  return {
    fromMemberId: input.fromMemberId, toMemberId: input.toMemberId, amount: amount.toFixed(2), currency,
    fxRate: fxRate.toString(), baseAmount: toBase(amount, fxRate).toFixed(2), method: input.method,
    date: new Date(`${input.date}T00:00:00Z`),
  };
}

async function loadOwned(userId: string, id: string) {
  const s = await prisma.splitSettlement.findUnique({ where: { id } });
  if (!s) throw new NotFoundError('Settlement not found');
  await requireMember(userId, s.groupId);
  return s;
}

export async function createSettlement(userId: string, input: SettlementInput): Promise<SplitSettlementDto> {
  await requireMember(userId, input.groupId);
  const data = await build(input.groupId, input);
  const row = await runInTransaction(async (tx) => {
    const s = await tx.splitSettlement.create({ data: { groupId: input.groupId, createdById: userId, ...data } });
    await writeActivity(tx, input.groupId, userId, 'SETTLED', { settlementId: s.id, from: s.fromMemberId, to: s.toMemberId, amount: data.amount, currency: data.currency });
    return s;
  });
  return toDto(row);
}

export async function updateSettlement(userId: string, id: string, input: Omit<SettlementInput, 'groupId'>): Promise<SplitSettlementDto> {
  const existing = await loadOwned(userId, id);
  const data = await build(existing.groupId, input);
  const row = await runInTransaction(async (tx) => {
    const s = await tx.splitSettlement.update({ where: { id }, data });
    await writeActivity(tx, existing.groupId, userId, 'SETTLEMENT_EDITED', { settlementId: id, amount: data.amount });
    return s;
  });
  return toDto(row);
}

export async function deleteSettlement(userId: string, id: string): Promise<void> {
  const s = await loadOwned(userId, id);
  if (s.deletedAt) return;
  await runInTransaction(async (tx) => {
    await tx.splitSettlement.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeActivity(tx, s.groupId, userId, 'SETTLEMENT_DELETED', { settlementId: id });
  });
}

export async function listSettlements(userId: string, groupId: string): Promise<SplitSettlementDto[]> {
  await requireMember(userId, groupId);
  const rows = await prisma.splitSettlement.findMany({ where: { groupId, deletedAt: null }, orderBy: { date: 'desc' } });
  return rows.map(toDto);
}
```

- [ ] **Step 4: Implement `ledger.service.ts`**

```ts
// packages/api/src/services/split/ledger.service.ts
/** Read models: group balances, the cross-group friend list, the activity feed. */
import { Decimal } from 'decimal.js';
import type { SplitActivityDto, SplitBalancesDto, SplitFriendDto, SplitTransferDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { getLatestFxRate } from '../../priceFeeds/fx.service.js';
import { requireMember, loadLedger, listGroups } from './groups.service.js';
import { memberNets, pairwiseDebts, simplify, type Transfer } from './balances.js';

async function transfersFor(groupId: string, simplifyDebts: boolean) {
  const ledger = await loadLedger(groupId);
  const nets = memberNets(ledger.expenses, ledger.settlements, ledger.memberIds);
  const transfers = simplifyDebts ? simplify(nets) : pairwiseDebts(ledger.expenses, ledger.settlements);
  return { nets, transfers };
}

const dto = (t: Transfer): SplitTransferDto => ({ fromMemberId: t.fromMemberId, toMemberId: t.toMemberId, amount: serializeMoney(t.amount) });

export async function groupBalances(userId: string, groupId: string): Promise<SplitBalancesDto> {
  await requireMember(userId, groupId);
  const g = await prisma.splitGroup.findUniqueOrThrow({ where: { id: groupId }, select: { baseCurrency: true, simplifyDebts: true } });
  const { nets, transfers } = await transfersFor(groupId, g.simplifyDebts);
  return {
    groupId,
    baseCurrency: g.baseCurrency,
    nets: [...nets].map(([memberId, net]) => ({ memberId, net: serializeMoney(net) })),
    transfers: transfers.map(dto),
    simplified: g.simplifyDebts,
  };
}

export async function listFriends(userId: string): Promise<SplitFriendDto[]> {
  const settings = await prisma.splitSettings.findUnique({ where: { userId }, select: { homeCurrency: true } });
  const home = settings?.homeCurrency ?? 'INR';
  const groups = await listGroups(userId, { includeDirect: true, includeArchived: true });
  const friends = new Map<string, SplitFriendDto & { total: Decimal }>();

  for (const g of groups) {
    const me = g.members.find((m) => m.isMe);
    if (!me) continue;
    const { transfers } = await transfersFor(g.id, g.simplifyDebts);
    const rate = g.baseCurrency === home ? new Decimal(1) : await getLatestFxRate(g.baseCurrency, home);
    for (const other of g.members) {
      if (other.isMe) continue;
      let net = new Decimal(0); // > 0: they owe me
      for (const t of transfers) {
        if (t.fromMemberId === other.id && t.toMemberId === me.id) net = net.plus(t.amount);
        if (t.fromMemberId === me.id && t.toMemberId === other.id) net = net.minus(t.amount);
      }
      const key = other.userId ? `u:${other.userId}` : `m:${other.id}`;
      const f = friends.get(key) ?? { key, displayName: other.displayName, userId: other.userId, currency: home, net: serializeMoney(0), approx: false, groups: [], total: new Decimal(0) };
      f.groups.push({ groupId: g.id, groupName: g.name, net: serializeMoney(net), currency: g.baseCurrency });
      if (rate) f.total = f.total.plus(net.mul(rate));
      if (g.baseCurrency !== home) f.approx = true;
      friends.set(key, f);
    }
  }
  return [...friends.values()]
    .map(({ total, ...f }) => ({ ...f, net: serializeMoney(total.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)) }))
    .sort((x, y) => x.displayName.localeCompare(y.displayName));
}

export async function listActivity(userId: string, opts: { groupId?: string; limit?: number; before?: string }): Promise<SplitActivityDto[]> {
  if (opts.groupId) await requireMember(userId, opts.groupId);
  const rows = await prisma.splitActivity.findMany({
    where: {
      ...(opts.groupId ? { groupId: opts.groupId } : { group: { members: { some: { userId, leftAt: null } } } }),
      ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 50, 200),
  });
  return rows.map((r) => ({ id: r.id, groupId: r.groupId, actorUserId: r.actorUserId, kind: r.kind, payload: r.payload, createdAt: r.createdAt.toISOString() }));
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/split/settlements.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/split/settlements.service.ts packages/api/src/services/split/ledger.service.ts packages/api/test/split/settlements.service.test.ts
git commit -m "feat(split): settlements, balances, friends and activity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: HTTP layer — controller, router, mount, route tests

**Files:**
- Create: `packages/api/src/controllers/split.controller.ts`
- Create: `packages/api/src/routes/split.routes.ts`
- Modify: `packages/api/src/routes/index.ts` (import + `app.use('/api/split', splitRouter)` next to `/api/loans-given`)
- Test: `packages/api/test/routes/split.routes.test.ts`

**Interfaces:**
- Consumes: every service function from Tasks 4–7.
- Produces routes (all `authenticate`d, envelope via `ok`/`created`/`noContent`):

| Method | Path | Handler → service |
|---|---|---|
| GET | `/contacts` | listContacts |
| POST | `/contacts` | createContact |
| PATCH | `/contacts/:id` | updateContact |
| DELETE | `/contacts/:id` | deleteContact |
| GET | `/groups?includeArchived=1` | listGroups |
| POST | `/groups` | createGroup |
| POST | `/groups/direct` `{contactId, myDisplayName}` | getOrCreateDirectGroup |
| GET | `/groups/:id` | getGroup |
| PATCH | `/groups/:id` | updateGroup |
| POST | `/groups/:id/members` `{contactId}` | addMember |
| DELETE | `/groups/:id/members/:memberId` | removeMember |
| GET | `/groups/:id/expenses?includeDeleted=1` | listExpenses |
| GET | `/groups/:id/settlements` | listSettlements |
| GET | `/groups/:id/balances` | groupBalances |
| GET | `/groups/:id/activity?limit&before` | listActivity({groupId}) |
| POST | `/expenses` | createExpense |
| GET | `/expenses/:id` | getExpense |
| PATCH | `/expenses/:id` | updateExpense |
| DELETE | `/expenses/:id` | deleteExpense |
| POST | `/expenses/:id/restore` | restoreExpense |
| POST | `/settlements` | createSettlement |
| PATCH | `/settlements/:id` | updateSettlement |
| DELETE | `/settlements/:id` | deleteSettlement |
| GET | `/friends` | listFriends |
| GET | `/activity?limit&before` | listActivity({}) |

`/groups/direct` is registered **before** `/groups/:id`.

- [ ] **Step 1: Write failing route tests**

```ts
// packages/api/test/routes/split.routes.test.ts
/**
 * Drives /api/split over real HTTP so authenticate, asyncHandler and
 * errorHandler are part of what is tested. Uses real users (RLS needs
 * them) created via createTestScope.
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { splitRouter } from '../../src/routes/split.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { offendingNumbers } from '../helpers/wireNumerics.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let alice: TestScope;
let bob: TestScope;
let eve: TestScope;
const tok = (s: TestScope) => signAccessToken({ sub: s.userId, email: `${s.userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token;

async function call(who: TestScope | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/split${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tok(who)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  alice = await createTestScope('split-http-a');
  bob = await createTestScope('split-http-b');
  eve = await createTestScope('split-http-e');
  const app = express();
  app.use(express.json());
  app.use('/api/split', splitRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await cleanupSplit([alice.userId, bob.userId, eve.userId]);
  await alice.cleanup();
  await bob.cleanup();
  await eve.cleanup();
});

describe('/api/split', () => {
  it('requires auth', async () => {
    expect((await call(null, 'GET', '/groups')).status).toBe(401);
  });

  it('full flow: group → expense → balances → settle; money on the wire is strings', async () => {
    const contact = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await call(alice, 'POST', '/groups', { name: 'Goa', type: 'TRIP', myDisplayName: 'Alice', contactIds: [contact.id] });
    expect(g.status).toBe(201);
    const groupId = g.json.data.id as string;
    const a = g.json.data.members.find((m: { isMe: boolean }) => m.isMe).id as string;
    const b = g.json.data.members.find((m: { isMe: boolean }) => !m.isMe).id as string;

    const e = await call(alice, 'POST', '/expenses', {
      groupId, description: 'Hotel', date: '2026-10-01', amount: '1000', currency: 'INR', splitMode: 'EQUAL',
      payers: [{ memberId: a, amount: '1000' }], shares: [{ memberId: a }, { memberId: b }],
    });
    expect(e.status).toBe(201);
    expect(offendingNumbers(e.json)).toEqual([]);

    const bal = await call(bob, 'GET', `/groups/${groupId}/balances`);
    expect(bal.status).toBe(200);
    expect(bal.json.data.transfers).toEqual([{ fromMemberId: b, toMemberId: a, amount: '500.0000' }]);
    expect(offendingNumbers(bal.json)).toEqual([]);

    const s = await call(bob, 'POST', '/settlements', { groupId, fromMemberId: b, toMemberId: a, amount: '500', method: 'UPI', date: '2026-10-02' });
    expect(s.status).toBe(201);
    const after = await call(alice, 'GET', `/groups/${groupId}/balances`);
    expect(after.json.data.transfers).toEqual([]);

    // Outsider: 404, never 200 or 403-with-data.
    expect((await call(eve, 'GET', `/groups/${groupId}`)).status).toBe(404);
    expect((await call(eve, 'GET', `/expenses/${e.json.data.id}`)).status).toBe(404);
    expect((await call(eve, 'GET', `/groups/${groupId}/balances`)).status).toBe(404);
  });

  it('validation errors are 400 with a message', async () => {
    const g = await call(alice, 'POST', '/groups', { name: 'V', myDisplayName: 'Alice' });
    const a = g.json.data.members[0].id as string;
    const r = await call(alice, 'POST', '/expenses', {
      groupId: g.json.data.id, description: 'x', date: '2026-10-01', amount: '10', currency: 'INR', splitMode: 'EXACT',
      payers: [{ memberId: a, amount: '10' }], shares: [{ memberId: a, value: '9' }],
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toMatch(/SPLIT_SUM_MISMATCH/);
    expect((await call(alice, 'POST', '/expenses', { groupId: g.json.data.id })).status).toBe(400);
  });

  it('direct group route is not shadowed by /groups/:id', async () => {
    const c = await seedContact(alice.userId, 'Bob Direct', bob.userId);
    const d = await call(alice, 'POST', '/groups/direct', { contactId: c.id, myDisplayName: 'Alice' });
    expect(d.status).toBe(200);
    expect(d.json.data.type).toBe('DIRECT');
  });
});
```

Before writing the test, open `test/helpers/wireNumerics.ts` and confirm `offendingNumbers` returns an array of offending paths (adjust the assertion if it returns something else). Confirm `AccessPayload` fields in `src/services/jwt.service.ts` and match the `signAccessToken` call. Confirm the error envelope from `src/middleware/errorHandler.ts` contains the error message so the `/SPLIT_SUM_MISMATCH/` match holds.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/routes/split.routes.test.ts`
Expected: FAIL — cannot resolve `split.routes.js`.

- [ ] **Step 3: Implement controller**

```ts
// packages/api/src/controllers/split.controller.ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../lib/response.js';
import { BadRequestError, UnauthorizedError } from '../lib/errors.js';
import { createContact, deleteContact, listContacts, updateContact } from '../services/split/contacts.service.js';
import {
  addMember, createGroup, getGroup, getOrCreateDirectGroup, listGroups, removeMember, updateGroup,
} from '../services/split/groups.service.js';
import {
  createExpense, deleteExpense, getExpense, listExpenses, restoreExpense, updateExpense,
} from '../services/split/expenses.service.js';
import { createSettlement, deleteSettlement, listSettlements, updateSettlement } from '../services/split/settlements.service.js';
import { groupBalances, listActivity, listFriends } from '../services/split/ledger.service.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const money = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Expected a positive amount with at most 2 decimals');
const ccy = z.string().regex(/^[A-Za-z]{3}$/, 'Expected a 3-letter currency code');
const id = z.string().min(1).max(64);
const groupType = z.enum(['TRIP', 'HOME', 'COUPLE', 'OTHER']);

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().max(254).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
  upiId: z.string().max(320).nullable().optional(),
});
const groupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: groupType.optional(),
  baseCurrency: ccy.optional(),
  simplifyDebts: z.boolean().optional(),
  myDisplayName: z.string().trim().min(1).max(120),
  contactIds: z.array(id).max(50).optional(),
});
const groupPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: groupType.optional(),
  simplifyDebts: z.boolean().optional(),
  archived: z.boolean().optional(),
});
const expenseBody = z.object({
  description: z.string().trim().min(1).max(200),
  date: isoDate,
  amount: money,
  currency: ccy,
  fxRate: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  splitMode: z.enum(['EQUAL', 'EXACT', 'PERCENT', 'SHARES']),
  payers: z.array(z.object({ memberId: id, amount: money })).min(1).max(50),
  shares: z.array(z.object({ memberId: id, value: z.string().max(32).optional() })).min(1).max(50),
});
const settlementBody = z.object({
  fromMemberId: id,
  toMemberId: id,
  amount: money,
  currency: ccy.optional(),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  method: z.enum(['CASH', 'UPI', 'OTHER']),
  date: isoDate,
});

function uid(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), r.error.issues);
  return r.data;
}
const p = (req: Request, k: string) => req.params[k]!;

export const listContactsHandler = async (req: Request, res: Response) => ok(res, await listContacts(uid(req)));
export const createContactHandler = async (req: Request, res: Response) => created(res, await createContact(uid(req), parse(contactSchema, req.body)));
export const updateContactHandler = async (req: Request, res: Response) => ok(res, await updateContact(uid(req), p(req, 'id'), parse(contactSchema.partial(), req.body)));
export const deleteContactHandler = async (req: Request, res: Response) => { await deleteContact(uid(req), p(req, 'id')); noContent(res); };

export const listGroupsHandler = async (req: Request, res: Response) => ok(res, await listGroups(uid(req), { includeArchived: req.query['includeArchived'] === '1' }));
export const createGroupHandler = async (req: Request, res: Response) => created(res, await createGroup(uid(req), parse(groupSchema, req.body)));
export const directGroupHandler = async (req: Request, res: Response) => {
  const b = parse(z.object({ contactId: id, myDisplayName: z.string().trim().min(1).max(120) }), req.body);
  ok(res, await getOrCreateDirectGroup(uid(req), b.myDisplayName, b.contactId));
};
export const getGroupHandler = async (req: Request, res: Response) => ok(res, await getGroup(uid(req), p(req, 'id')));
export const updateGroupHandler = async (req: Request, res: Response) => ok(res, await updateGroup(uid(req), p(req, 'id'), parse(groupPatch, req.body)));
export const addMemberHandler = async (req: Request, res: Response) => created(res, await addMember(uid(req), p(req, 'id'), parse(z.object({ contactId: id }), req.body).contactId));
export const removeMemberHandler = async (req: Request, res: Response) => { await removeMember(uid(req), p(req, 'id'), p(req, 'memberId')); noContent(res); };

export const listExpensesHandler = async (req: Request, res: Response) => ok(res, await listExpenses(uid(req), p(req, 'id'), { includeDeleted: req.query['includeDeleted'] === '1' }));
export const createExpenseHandler = async (req: Request, res: Response) => created(res, await createExpense(uid(req), parse(expenseBody.extend({ groupId: id }), req.body)));
export const getExpenseHandler = async (req: Request, res: Response) => ok(res, await getExpense(uid(req), p(req, 'id')));
export const updateExpenseHandler = async (req: Request, res: Response) => ok(res, await updateExpense(uid(req), p(req, 'id'), parse(expenseBody, req.body)));
export const deleteExpenseHandler = async (req: Request, res: Response) => { await deleteExpense(uid(req), p(req, 'id')); noContent(res); };
export const restoreExpenseHandler = async (req: Request, res: Response) => ok(res, await restoreExpense(uid(req), p(req, 'id')));

export const listSettlementsHandler = async (req: Request, res: Response) => ok(res, await listSettlements(uid(req), p(req, 'id')));
export const createSettlementHandler = async (req: Request, res: Response) => created(res, await createSettlement(uid(req), parse(settlementBody.extend({ groupId: id }), req.body)));
export const updateSettlementHandler = async (req: Request, res: Response) => ok(res, await updateSettlement(uid(req), p(req, 'id'), parse(settlementBody, req.body)));
export const deleteSettlementHandler = async (req: Request, res: Response) => { await deleteSettlement(uid(req), p(req, 'id')); noContent(res); };

export const balancesHandler = async (req: Request, res: Response) => ok(res, await groupBalances(uid(req), p(req, 'id')));
export const friendsHandler = async (req: Request, res: Response) => ok(res, await listFriends(uid(req)));
function activityOpts(req: Request) {
  const limit = Number.parseInt(String(req.query['limit'] ?? '50'), 10);
  const before = typeof req.query['before'] === 'string' ? req.query['before'] : undefined;
  return { limit: Number.isFinite(limit) ? limit : 50, before };
}
export const groupActivityHandler = async (req: Request, res: Response) => ok(res, await listActivity(uid(req), { groupId: p(req, 'id'), ...activityOpts(req) }));
export const activityHandler = async (req: Request, res: Response) => ok(res, await listActivity(uid(req), activityOpts(req)));
```

Body validation uses `BadRequestError` (400) rather than `ValidationError` (422) because spec §12 specifies 400 for bad split input. `Number.parseInt` on `limit` is a row count, not money.

- [ ] **Step 4: Implement router**

```ts
// packages/api/src/routes/split.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import * as c from '../controllers/split.controller.js';

export const splitRouter = Router();
splitRouter.use(authenticate);

splitRouter.get('/contacts', asyncHandler(c.listContactsHandler));
splitRouter.post('/contacts', asyncHandler(c.createContactHandler));
splitRouter.patch('/contacts/:id', asyncHandler(c.updateContactHandler));
splitRouter.delete('/contacts/:id', asyncHandler(c.deleteContactHandler));

splitRouter.get('/groups', asyncHandler(c.listGroupsHandler));
splitRouter.post('/groups', asyncHandler(c.createGroupHandler));
// Before /groups/:id so "direct" is never read as a group id.
splitRouter.post('/groups/direct', asyncHandler(c.directGroupHandler));
splitRouter.get('/groups/:id', asyncHandler(c.getGroupHandler));
splitRouter.patch('/groups/:id', asyncHandler(c.updateGroupHandler));
splitRouter.post('/groups/:id/members', asyncHandler(c.addMemberHandler));
splitRouter.delete('/groups/:id/members/:memberId', asyncHandler(c.removeMemberHandler));
splitRouter.get('/groups/:id/expenses', asyncHandler(c.listExpensesHandler));
splitRouter.get('/groups/:id/settlements', asyncHandler(c.listSettlementsHandler));
splitRouter.get('/groups/:id/balances', asyncHandler(c.balancesHandler));
splitRouter.get('/groups/:id/activity', asyncHandler(c.groupActivityHandler));

splitRouter.post('/expenses', asyncHandler(c.createExpenseHandler));
splitRouter.get('/expenses/:id', asyncHandler(c.getExpenseHandler));
splitRouter.patch('/expenses/:id', asyncHandler(c.updateExpenseHandler));
splitRouter.delete('/expenses/:id', asyncHandler(c.deleteExpenseHandler));
splitRouter.post('/expenses/:id/restore', asyncHandler(c.restoreExpenseHandler));

splitRouter.post('/settlements', asyncHandler(c.createSettlementHandler));
splitRouter.patch('/settlements/:id', asyncHandler(c.updateSettlementHandler));
splitRouter.delete('/settlements/:id', asyncHandler(c.deleteSettlementHandler));

splitRouter.get('/friends', asyncHandler(c.friendsHandler));
splitRouter.get('/activity', asyncHandler(c.activityHandler));
```

- [ ] **Step 5: Mount** — in `src/routes/index.ts` add `import { splitRouter } from './split.routes.js';` beside the `loansGiven` import, and `app.use('/api/split', splitRouter);` on the line after `app.use('/api/loans-given', loansGivenRouter);`.

- [ ] **Step 6: Run route tests**

Run: `npx vitest run test/routes/split.routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/controllers/split.controller.ts packages/api/src/routes/split.routes.ts packages/api/src/routes/index.ts packages/api/test/routes/split.routes.test.ts
git commit -m "feat(split): /api/split endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification

- [ ] **Step 1: Typecheck, lint, build**

```bash
cd "/c/Users/ST269/Desktop/mProfit-split-wt/portfolioos"
pnpm -r run typecheck
pnpm -r run lint
pnpm -r run build
```

Expected: all exit 0. Fix any lint hits from the bespoke rules (no `parseFloat`/`Number(` on money, no silent catch) in split files.

- [ ] **Step 2: Full API test suite against local Postgres**

Run: `pnpm --filter @everypaisa/api test`
Expected: all green. In particular `user-scoped-coverage`, `rls-isolation`, `child-table-rls`, `rls-context-coverage`, `split-rls`. A failure in an unrelated pre-existing test: confirm it also fails on `origin/main` before treating it as not ours, and report it.

- [ ] **Step 3: Record and stop**

Do not push and do not open a PR. Report: commits made, test counts, anything adjusted from this plan (with reason). Plan 2 (web UI) is written next against these endpoints.
