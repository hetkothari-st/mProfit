# Split Expenses — Plan 2: Web UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can split expenses end to end in the browser: add contacts, create groups, add expenses (four split modes, multi-payer, other currencies), see balances and who-pays-whom, settle up, browse friends and activity — under **Tools → Split Expenses**.

**Architecture:** One API module (`apps/web/src/api/split.api.ts`) wraps the Plan 1 `/api/split` endpoints with TanStack Query keys. Pure, unit-tested helpers hold all money/format logic (`lib/splitFormat.ts`) and add-expense form logic (`pages/split/expenseForm.ts`). Pages under `apps/web/src/pages/split/` follow the existing Loans-Given page patterns (PageHeader, Card, Dialog, react-query mutations with toast). A small server task first fills DTO gaps the UI needs.

**Tech Stack:** React 18 + TS + Vite, TanStack Query 5, react-router 6, Tailwind + local shadcn-style components (`@/components/ui/*`), decimal.js via `@everypaisa/shared`, Vitest + Testing Library (jsdom).

**Spec:** `portfolioos/docs/superpowers/specs/2026-10-07-split-expenses-design.md` — §9 (Web UI), §4–§5 (balances/settle display), §12 (errors). Plan 1: `portfolioos/docs/superpowers/plans/2026-10-07-split-expenses-01-core.md`.

All paths relative to `C:\Users\ST269\Desktop\mProfit-split-wt\portfolioos` (worktree, branch `feat/split-expenses`).

## Global Constraints

- Money arrives from the API as strings (4 dp). Parse with `toDecimal`/`Decimal` from `@everypaisa/shared` before any arithmetic. Never `Number()` / `parseFloat` on money.
- Display INR with `formatINR`, other currencies with `formatCurrency(value, code)` from `@everypaisa/shared`.
- All amounts the UI sends are strings with at most 2 decimals and > 0.
- A friend/member net > 0 means **they owe you** / the member is owed; < 0 means **you owe**. Copy: "owes you ₹X", "you owe ₹X", "settled up".
- Every page must work at 375 px width without horizontal scroll (16 px side gutter) and at 1280 px.
- Follow existing UI: `PageHeader` (`@/components/layout/PageHeader`), `Card`/`CardContent`, `Button` variants `default|accent|destructive|outline|secondary|ghost|link`, `Dialog*` from `@/components/ui/dialog`, `Tabs*` from `@/components/ui/tabs`, native `Select` from `@/components/ui/select`, toasts via `react-hot-toast`, errors via `apiErrorMessage` from `@/api/client`.
- Out of scope for Plan 2 (Plans 3–4): receipts, comments, labels, reminders, pay-now/UPI, "my share → Cash Activity", invites/linking, detection inbox, `/split/settings`.
- Tests and the local API run only against the isolated local DB `portfolioos_split` (env in `.superpowers/sdd/2026-10-07-split-expenses-01-core/env.md`).
- Commits: Conventional Commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Typing "1,234.50" or "₹500" into an amount field** → accepted as 1234.50 / 500 (commas, spaces, ₹ stripped), never NaN or a silent 0 → Task 3 test "cleanAmount strips formatting".
2. **Unchecking every participant / percentages not adding to 100** → Save disabled with a clear message, not a 400 round-trip → Task 3 tests "no participants" and "percent off by".
3. **A 409 from the server (e.g. SPLIT_MEMBER_LEFT, SPLIT_MEMBER_HAS_BALANCE)** → message shown in a toast in plain words, dialog stays open → Task 6 test "remove member with balance shows server message".
4. **A friend who is someone else's placeholder (key `m:`)** → friend page shows balances but no "Add expense" (no 1:1 ledger possible) → Task 7 test.
5. **Group in a foreign currency (USD) with a home-currency friend total** → amounts shown with $ in the group and "approx." on the friend total → Task 2 test "formatSplitMoney USD" + Task 7 friend test asserts "approx.".

---

## File Structure

```
packages/shared/src/split.types.ts                      + createdAt/createdById/groupName/actorName/contactId fields (Task 1)
packages/api/src/services/split/{expenses,settlements,ledger}.service.ts   DTO additions (Task 1)
packages/api/src/services/split/allocate.ts             toBase overflow guard (Task 1)
apps/web/src/api/split.api.ts                           API client + SPLIT_KEYS (Task 2)
apps/web/src/lib/splitFormat.ts                         money/balance copy helpers (Task 2)
apps/web/src/lib/splitFormat.test.ts
apps/web/src/pages/split/expenseForm.ts                 add-expense form model + validation + payload (Task 3)
apps/web/src/pages/split/expenseForm.test.ts
apps/web/src/components/layout/navItems.tsx             + Tools entry (Task 4)
apps/web/src/App.tsx                                    + routes (Task 4)
apps/web/src/pages/split/SplitHomePage.tsx              /split (Task 4)
apps/web/src/pages/split/NewGroupDialog.tsx             (Task 4)
apps/web/src/pages/split/ContactDialog.tsx              (Task 4)
apps/web/src/pages/split/BalancePill.tsx                (Task 4)
apps/web/src/pages/split/SplitHomePage.test.tsx
apps/web/src/pages/split/AddExpenseDialog.tsx           (Task 5)
apps/web/src/pages/split/AddExpenseDialog.test.tsx
apps/web/src/pages/split/SettleUpDialog.tsx             (Task 6)
apps/web/src/pages/split/GroupPage.tsx                  /split/groups/:id (Task 6)
apps/web/src/pages/split/GroupPage.test.tsx
apps/web/src/pages/split/ExpenseDetailPage.tsx          /split/expenses/:id (Task 7)
apps/web/src/pages/split/FriendPage.tsx                 /split/friends/:key (Task 7)
apps/web/src/pages/split/FriendPage.test.tsx
apps/web/src/pages/split/testUtils.tsx                  render helper (Task 4)
```

---

### Task 1: Server DTO additions the UI needs

**Files:**
- Modify: `packages/shared/src/split.types.ts`
- Modify: `packages/api/src/services/split/expenses.service.ts` (toDto)
- Modify: `packages/api/src/services/split/settlements.service.ts` (toDto)
- Modify: `packages/api/src/services/split/ledger.service.ts` (listFriends, listActivity)
- Modify: `packages/api/src/services/split/allocate.ts` (toBase)
- Test: `packages/api/test/split/dtoAdditions.test.ts`

**Interfaces:**
- Produces (shared types, additive):
  - `SplitExpenseDto.createdAt: string` (ISO)
  - `SplitSettlementDto.createdAt: string`, `SplitSettlementDto.createdById: string`
  - `SplitActivityDto.groupName: string`, `SplitActivityDto.actorName: string`
  - `SplitFriendDto.contactId: string | null` — the caller's own contact for this person (for `c:` keys the key's id; for `u:` keys the caller's contact whose `linkedUserId` equals that user, else null; for `m:` keys null).
- `toBase` throws `BadRequestError('SPLIT_BAD_INPUT: converted amount too large')` when the result is ≥ 1e12.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/test/split/dtoAdditions.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { createSettlement } from '../../src/services/split/settlements.service.js';
import { listActivity, listFriends } from '../../src/services/split/ledger.service.js';
import { toBase } from '../../src/services/split/allocate.js';

describe('split DTO additions for the web UI', () => {
  let alice: TestScope;
  let bob: TestScope;
  let groupId: string;
  let a: string;
  let b: string;
  let bobContactId: string;
  let raviContactId: string;

  beforeAll(async () => {
    alice = await createTestScope('split-dto-a');
    bob = await createTestScope('split-dto-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const cr = await seedContact(alice.userId, 'Ravi');
    bobContactId = cb.id;
    raviContactId = cr.id;
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Goa', myDisplayName: 'Alice', contactIds: [cb.id, cr.id] }));
    groupId = g.id;
    a = g.members.find((m) => m.isMe)!.id;
    b = g.members.find((m) => m.displayName === 'Bob')!.id;
  });
  afterAll(async () => {
    await cleanupSplit([alice.userId, bob.userId]);
    await alice.cleanup();
    await bob.cleanup();
  });

  it('expense and settlement carry createdAt / createdById', async () => {
    const e = await alice.runAs(() => createExpense(alice.userId, {
      groupId, description: 'Hotel', date: '2026-10-01', amount: '90', currency: 'INR', splitMode: 'EQUAL',
      payers: [{ memberId: a, amount: '90' }], shares: [{ memberId: a }, { memberId: b }],
    }));
    expect(e.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const s = await bob.runAs(() => createSettlement(bob.userId, { groupId, fromMemberId: b, toMemberId: a, amount: '10', method: 'CASH', date: '2026-10-02' }));
    expect(s.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.createdById).toBe(bob.userId);
  });

  it('activity rows carry group name and actor display name', async () => {
    const act = await alice.runAs(() => listActivity(alice.userId, {}));
    const settled = act.find((x) => x.kind === 'SETTLED')!;
    expect(settled.groupName).toBe('Goa');
    expect(settled.actorName).toBe('Bob');
    const created = act.find((x) => x.kind === 'GROUP_CREATED')!;
    expect(created.actorName).toBe('Alice');
  });

  it('friends carry the caller contact id', async () => {
    const f = await alice.runAs(() => listFriends(alice.userId));
    expect(f.find((x) => x.key === `u:${bob.userId}`)?.contactId).toBe(bobContactId);
    expect(f.find((x) => x.key === `c:${raviContactId}`)?.contactId).toBe(raviContactId);
  });

  it('toBase rejects absurd conversions', () => {
    expect(() => toBase(new Decimal('999999999999'), new Decimal('9999999999'))).toThrow(/too large/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (env from `env.md`): `cd packages/api && npx vitest run test/split/dtoAdditions.test.ts`
Expected: FAIL — `createdAt` undefined / `groupName` undefined / `contactId` undefined / no throw.

- [ ] **Step 3: Implement**

`packages/shared/src/split.types.ts` — replace the four interfaces with:

```ts
export interface SplitExpenseDto {
  id: string; groupId: string; description: string; date: string;
  amount: Money; currency: string; fxRate: string; baseAmount: Money;
  splitMode: SplitModeDto; createdById: string; createdAt: string; sourceType: string;
  deletedAt: string | null; payers: SplitPayerDto[]; shares: SplitShareDto[];
}
export interface SplitSettlementDto { id: string; groupId: string; fromMemberId: string; toMemberId: string; amount: Money; currency: string; fxRate: string; baseAmount: Money; method: SplitSettleMethodDto; date: string; createdById: string; createdAt: string; deletedAt: string | null }
export interface SplitFriendDto { key: string; displayName: string; userId: string | null; contactId: string | null; currency: string; net: Money; approx: boolean; groups: Array<{ groupId: string; groupName: string; net: Money; currency: string }> }
export interface SplitActivityDto { id: string; groupId: string; groupName: string; actorUserId: string; actorName: string; kind: string; payload: unknown; createdAt: string }
```

`expenses.service.ts` toDto — add after `createdById: e.createdById,`:

```ts
    createdAt: e.createdAt.toISOString(),
```

`settlements.service.ts` toDto — add `createdById: s.createdById, createdAt: s.createdAt.toISOString(),` to the returned object.

`ledger.service.ts` listFriends — replace the `myContactIds` line with:

```ts
  const myContacts = await prisma.splitContact.findMany({ where: { ownerUserId: userId }, select: { id: true, linkedUserId: true } });
  const myContactIds = new Set(myContacts.map((c) => c.id));
  const contactByLinkedUser = new Map(myContacts.filter((c) => c.linkedUserId).map((c) => [c.linkedUserId!, c.id]));
```

and in the `friends.get(key) ?? { ... }` initialiser add `contactId: key.startsWith('c:') ? key.slice(2) : other.userId ? contactByLinkedUser.get(other.userId) ?? null : null,` (after `userId: other.userId,`).

`ledger.service.ts` listActivity — change the query and mapping:

```ts
  const rows = await prisma.splitActivity.findMany({
    where: {
      ...(opts.groupId ? { groupId: opts.groupId } : { group: { members: { some: { userId, leftAt: null } } } }),
      ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: { group: { select: { name: true, members: { select: { userId: true, displayName: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    groupName: r.group.name,
    actorUserId: r.actorUserId,
    actorName: r.group.members.find((m) => m.userId === r.actorUserId)?.displayName ?? 'Someone',
    kind: r.kind,
    payload: r.payload,
    createdAt: r.createdAt.toISOString(),
  }));
```

`allocate.ts` toBase — replace body:

```ts
const BASE_LIMIT = new Decimal('1e12');

export function toBase(amount: Decimal, fxRate: Decimal): Decimal {
  const base = amount.mul(fxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  if (base.gte(BASE_LIMIT)) throw new BadRequestError('SPLIT_BAD_INPUT: converted amount too large');
  return base;
}
```

(`BASE_LIMIT` goes at module top level next to the other constants.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/split test/routes/split.routes.test.ts test/invariants/split-rls.test.ts` then `npx tsc --noEmit -p .` and `pnpm --filter @everypaisa/shared build`.
Expected: all PASS; no type errors. Fix any existing test that deep-equals a DTO and now sees extra fields by adding the new fields to its expectation.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/split.types.ts packages/api/src/services/split packages/api/test/split
git commit -m "feat(split): DTO fields for the web UI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Web API client + money/balance helpers

**Files:**
- Create: `apps/web/src/api/split.api.ts`
- Create: `apps/web/src/lib/splitFormat.ts`
- Test: `apps/web/src/lib/splitFormat.test.ts`

**Interfaces:**
- Consumes: shared DTO types (Task 1).
- Produces:

```ts
// split.api.ts
export const SPLIT_KEYS: { all: readonly ['split']; groups: readonly ['split','groups']; group: (id: string) => readonly unknown[]; expenses: (groupId: string) => readonly unknown[]; balances: (groupId: string) => readonly unknown[]; settlements: (groupId: string) => readonly unknown[]; activity: (groupId?: string) => readonly unknown[]; expense: (id: string) => readonly unknown[]; friends: readonly ['split','friends']; contacts: readonly ['split','contacts'] };
export interface ContactInput { name: string; email?: string | null; phone?: string | null; upiId?: string | null }
export interface NewGroupInput { name: string; type?: 'TRIP'|'HOME'|'COUPLE'|'OTHER'; baseCurrency?: string; simplifyDebts?: boolean; myDisplayName: string; contactIds?: string[] }
export interface ExpenseInput { groupId: string; description: string; date: string; amount: string; currency: string; fxRate?: string | null; splitMode: SplitModeDto; payers: Array<{ memberId: string; amount: string }>; shares: Array<{ memberId: string; value?: string }> }
export interface SettlementInput { groupId: string; fromMemberId: string; toMemberId: string; amount: string; currency?: string; method: SplitSettleMethodDto; date: string }
export const splitApi: {
  listContacts(): Promise<SplitContactDto[]>; createContact(i: ContactInput): Promise<SplitContactDto>; updateContact(id: string, i: Partial<ContactInput>): Promise<SplitContactDto>; deleteContact(id: string): Promise<void>;
  listGroups(includeArchived?: boolean): Promise<SplitGroupDto[]>; createGroup(i: NewGroupInput): Promise<SplitGroupDto>; directGroup(contactId: string, myDisplayName: string): Promise<SplitGroupDto>;
  getGroup(id: string): Promise<SplitGroupDto>; updateGroup(id: string, patch: { name?: string; type?: 'TRIP'|'HOME'|'COUPLE'|'OTHER'; simplifyDebts?: boolean; archived?: boolean }): Promise<SplitGroupDto>;
  addMember(groupId: string, contactId: string): Promise<SplitMemberDto>; removeMember(groupId: string, memberId: string): Promise<void>;
  listExpenses(groupId: string, includeDeleted?: boolean): Promise<SplitExpenseDto[]>; getExpense(id: string): Promise<SplitExpenseDto>;
  createExpense(i: ExpenseInput): Promise<SplitExpenseDto>; updateExpense(id: string, i: Omit<ExpenseInput,'groupId'>): Promise<SplitExpenseDto>; deleteExpense(id: string): Promise<void>; restoreExpense(id: string): Promise<SplitExpenseDto>;
  listSettlements(groupId: string): Promise<SplitSettlementDto[]>; createSettlement(i: SettlementInput): Promise<SplitSettlementDto>; deleteSettlement(id: string): Promise<void>;
  balances(groupId: string): Promise<SplitBalancesDto>; friends(): Promise<SplitFriendDto[]>; activity(groupId?: string): Promise<SplitActivityDto[]>;
};

// splitFormat.ts
export function formatSplitMoney(value: string | Decimal, currency: string): string;   // absolute value, currency symbol
export type BalanceTone = 'owed' | 'owe' | 'settled';
export function balanceTone(net: string | Decimal): BalanceTone;
export function balanceLabel(net: string | Decimal, currency: string, opts?: { approx?: boolean; who?: string }): string;
export function memberName(members: SplitMemberDto[], memberId: string): string;   // "You" for isMe
export function transferLabel(members: SplitMemberDto[], t: { fromMemberId: string; toMemberId: string; amount: string }, currency: string): string;
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/splitFormat.test.ts
import { describe, it, expect } from 'vitest';
import type { SplitMemberDto } from '@everypaisa/shared';
import { formatSplitMoney, balanceTone, balanceLabel, memberName, transferLabel } from './splitFormat';

const members: SplitMemberDto[] = [
  { id: 'm1', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null },
  { id: 'm2', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null },
];

describe('splitFormat', () => {
  it('formatSplitMoney INR uses Indian grouping and drops sign', () => {
    expect(formatSplitMoney('-123456.5000', 'INR')).toBe('₹1,23,456.50');
  });
  it('formatSplitMoney USD', () => {
    expect(formatSplitMoney('20.0000', 'USD')).toBe('$20.00');
  });
  it('balanceTone', () => {
    expect(balanceTone('10.0000')).toBe('owed');
    expect(balanceTone('-0.0100')).toBe('owe');
    expect(balanceTone('0.0000')).toBe('settled');
  });
  it('balanceLabel copy', () => {
    expect(balanceLabel('500.0000', 'INR')).toBe('owes you ₹500.00');
    expect(balanceLabel('-500.0000', 'INR')).toBe('you owe ₹500.00');
    expect(balanceLabel('0.0000', 'INR')).toBe('settled up');
    expect(balanceLabel('500.0000', 'INR', { approx: true })).toBe('owes you ≈ ₹500.00');
    expect(balanceLabel('500.0000', 'INR', { who: 'you are owed' })).toBe('you are owed ₹500.00');
  });
  it('memberName says You for me', () => {
    expect(memberName(members, 'm1')).toBe('You');
    expect(memberName(members, 'm2')).toBe('Bob');
    expect(memberName(members, 'zz')).toBe('Former member');
  });
  it('transferLabel', () => {
    expect(transferLabel(members, { fromMemberId: 'm2', toMemberId: 'm1', amount: '70.0000' }, 'INR')).toBe('Bob pays You ₹70.00');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx vitest run src/lib/splitFormat.test.ts`
Expected: FAIL — cannot resolve `./splitFormat`.

- [ ] **Step 3: Implement `splitFormat.ts`**

```ts
// apps/web/src/lib/splitFormat.ts
/** Display helpers for Split Expenses. Money arrives as strings; parse before math. */
import { Decimal, formatCurrency, toDecimal } from '@everypaisa/shared';
import type { SplitMemberDto } from '@everypaisa/shared';

export type BalanceTone = 'owed' | 'owe' | 'settled';

const dec = (v: string | Decimal) => (v instanceof Decimal ? v : toDecimal(v));

export function formatSplitMoney(value: string | Decimal, currency: string): string {
  return formatCurrency(dec(value).abs().toFixed(2), currency);
}

export function balanceTone(net: string | Decimal): BalanceTone {
  const d = dec(net).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  if (d.isZero()) return 'settled';
  return d.gt(0) ? 'owed' : 'owe';
}

export function balanceLabel(
  net: string | Decimal,
  currency: string,
  opts: { approx?: boolean; who?: string } = {},
): string {
  const tone = balanceTone(net);
  if (tone === 'settled') return 'settled up';
  const prefix = opts.who ?? (tone === 'owed' ? 'owes you' : 'you owe');
  return `${prefix} ${opts.approx ? '≈ ' : ''}${formatSplitMoney(net, currency)}`;
}

export function memberName(members: SplitMemberDto[], memberId: string): string {
  const m = members.find((x) => x.id === memberId);
  if (!m) return 'Former member';
  return m.isMe ? 'You' : m.displayName;
}

export function transferLabel(
  members: SplitMemberDto[],
  t: { fromMemberId: string; toMemberId: string; amount: string },
  currency: string,
): string {
  return `${memberName(members, t.fromMemberId)} pays ${memberName(members, t.toMemberId)} ${formatSplitMoney(t.amount, currency)}`;
}
```

Before Step 4 confirm `toDecimal` and `Decimal` are exported by `@everypaisa/shared` (`packages/shared/src/decimal.ts`) — they are used the same way in `apps/web/src/lib/holdingsSummary.ts`.

- [ ] **Step 4: Implement `split.api.ts`**

```ts
// apps/web/src/api/split.api.ts
import { api, unwrap } from './client';
import type {
  ApiResponse, SplitActivityDto, SplitBalancesDto, SplitContactDto, SplitExpenseDto, SplitFriendDto,
  SplitGroupDto, SplitMemberDto, SplitModeDto, SplitSettleMethodDto, SplitSettlementDto,
} from '@everypaisa/shared';

const BASE = '/api/split';

export const SPLIT_KEYS = {
  all: ['split'] as const,
  groups: ['split', 'groups'] as const,
  group: (id: string) => ['split', 'group', id] as const,
  expenses: (groupId: string) => ['split', 'group', groupId, 'expenses'] as const,
  balances: (groupId: string) => ['split', 'group', groupId, 'balances'] as const,
  settlements: (groupId: string) => ['split', 'group', groupId, 'settlements'] as const,
  activity: (groupId?: string) => ['split', 'activity', groupId ?? 'all'] as const,
  expense: (id: string) => ['split', 'expense', id] as const,
  friends: ['split', 'friends'] as const,
  contacts: ['split', 'contacts'] as const,
};

export interface ContactInput { name: string; email?: string | null; phone?: string | null; upiId?: string | null }
export interface NewGroupInput {
  name: string; type?: 'TRIP' | 'HOME' | 'COUPLE' | 'OTHER'; baseCurrency?: string;
  simplifyDebts?: boolean; myDisplayName: string; contactIds?: string[];
}
export interface ExpenseInput {
  groupId: string; description: string; date: string; amount: string; currency: string;
  fxRate?: string | null; splitMode: SplitModeDto;
  payers: Array<{ memberId: string; amount: string }>;
  shares: Array<{ memberId: string; value?: string }>;
}
export interface SettlementInput {
  groupId: string; fromMemberId: string; toMemberId: string; amount: string;
  currency?: string; method: SplitSettleMethodDto; date: string;
}

async function get<T>(url: string): Promise<T> {
  const { data } = await api.get<ApiResponse<T>>(url);
  return unwrap(data);
}
async function post<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.post<ApiResponse<T>>(url, body);
  return unwrap(data);
}
async function patch<T>(url: string, body: unknown): Promise<T> {
  const { data } = await api.patch<ApiResponse<T>>(url, body);
  return unwrap(data);
}

export const splitApi = {
  listContacts: () => get<SplitContactDto[]>(`${BASE}/contacts`),
  createContact: (i: ContactInput) => post<SplitContactDto>(`${BASE}/contacts`, i),
  updateContact: (id: string, i: Partial<ContactInput>) => patch<SplitContactDto>(`${BASE}/contacts/${id}`, i),
  deleteContact: async (id: string) => { await api.delete(`${BASE}/contacts/${id}`); },

  listGroups: (includeArchived = false) =>
    get<SplitGroupDto[]>(`${BASE}/groups${includeArchived ? '?includeArchived=1' : ''}`),
  createGroup: (i: NewGroupInput) => post<SplitGroupDto>(`${BASE}/groups`, i),
  directGroup: (contactId: string, myDisplayName: string) =>
    post<SplitGroupDto>(`${BASE}/groups/direct`, { contactId, myDisplayName }),
  getGroup: (id: string) => get<SplitGroupDto>(`${BASE}/groups/${id}`),
  updateGroup: (id: string, p: { name?: string; type?: 'TRIP' | 'HOME' | 'COUPLE' | 'OTHER'; simplifyDebts?: boolean; archived?: boolean }) =>
    patch<SplitGroupDto>(`${BASE}/groups/${id}`, p),
  addMember: (groupId: string, contactId: string) => post<SplitMemberDto>(`${BASE}/groups/${groupId}/members`, { contactId }),
  removeMember: async (groupId: string, memberId: string) => { await api.delete(`${BASE}/groups/${groupId}/members/${memberId}`); },

  listExpenses: (groupId: string, includeDeleted = false) =>
    get<SplitExpenseDto[]>(`${BASE}/groups/${groupId}/expenses${includeDeleted ? '?includeDeleted=1' : ''}`),
  getExpense: (id: string) => get<SplitExpenseDto>(`${BASE}/expenses/${id}`),
  createExpense: (i: ExpenseInput) => post<SplitExpenseDto>(`${BASE}/expenses`, i),
  updateExpense: (id: string, i: Omit<ExpenseInput, 'groupId'>) => patch<SplitExpenseDto>(`${BASE}/expenses/${id}`, i),
  deleteExpense: async (id: string) => { await api.delete(`${BASE}/expenses/${id}`); },
  restoreExpense: (id: string) => post<SplitExpenseDto>(`${BASE}/expenses/${id}/restore`),

  listSettlements: (groupId: string) => get<SplitSettlementDto[]>(`${BASE}/groups/${groupId}/settlements`),
  createSettlement: (i: SettlementInput) => post<SplitSettlementDto>(`${BASE}/settlements`, i),
  deleteSettlement: async (id: string) => { await api.delete(`${BASE}/settlements/${id}`); },

  balances: (groupId: string) => get<SplitBalancesDto>(`${BASE}/groups/${groupId}/balances`),
  friends: () => get<SplitFriendDto[]>(`${BASE}/friends`),
  activity: (groupId?: string) =>
    get<SplitActivityDto[]>(groupId ? `${BASE}/groups/${groupId}/activity` : `${BASE}/activity`),
};
```

Confirm `ApiResponse` is exported from `@everypaisa/shared` (it is — `loansGiven.api.ts` imports it).

- [ ] **Step 5: Run tests + typecheck**

Run: `cd apps/web && npx vitest run src/lib/splitFormat.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api/split.api.ts apps/web/src/lib/splitFormat.ts apps/web/src/lib/splitFormat.test.ts
git commit -m "feat(split-web): API client and balance formatting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Add-expense form model (pure)

**Files:**
- Create: `apps/web/src/pages/split/expenseForm.ts`
- Test: `apps/web/src/pages/split/expenseForm.test.ts`

**Interfaces:**
- Consumes: `ExpenseInput` from `@/api/split.api` (Task 2); `SplitMemberDto`, `SplitExpenseDto`, `SplitModeDto` from shared.
- Produces:

```ts
export interface ExpenseFormState {
  description: string; amount: string; currency: string; fxRate: string; date: string;
  splitMode: SplitModeDto;
  payerMode: 'single' | 'multiple';
  singlePayerId: string;
  payerAmounts: Record<string, string>;      // memberId → amount (multiple)
  included: Record<string, boolean>;          // memberId → participates (EQUAL)
  values: Record<string, string>;             // memberId → exact / percent / shares
}
export function cleanAmount(raw: string): string;   // strips commas, spaces, ₹
export function emptyForm(members: SplitMemberDto[], baseCurrency: string, today: string): ExpenseFormState;
export function formFromExpense(e: SplitExpenseDto, members: SplitMemberDto[]): ExpenseFormState;
export interface ShareLine { memberId: string; amount: string | null }   // preview, 2dp string or null when not computable
export interface FormCheck { ok: boolean; error: string | null; remaining: string | null; preview: ShareLine[] }
export function checkForm(f: ExpenseFormState, members: SplitMemberDto[], baseCurrency: string): FormCheck;
export function toPayload(f: ExpenseFormState, members: SplitMemberDto[], baseCurrency: string): Omit<ExpenseInput, 'groupId'>;
```

`members` passed in are the group's **active** members (leftAt null). Preview for EQUAL mirrors the server: floor to paise, leftover paise to member ids in ascending order.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/pages/split/expenseForm.test.ts
import { describe, it, expect } from 'vitest';
import type { SplitExpenseDto, SplitMemberDto } from '@everypaisa/shared';
import { checkForm, cleanAmount, emptyForm, formFromExpense, toPayload } from './expenseForm';

const M: SplitMemberDto[] = [
  { id: 'b', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null },
  { id: 'a', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null },
  { id: 'c', displayName: 'Chetan', userId: null, contactId: 'c3', isMe: false, leftAt: null },
];

const base = () => ({ ...emptyForm(M, 'INR', '2026-10-08'), description: 'Dinner', amount: '100' });

describe('expenseForm', () => {
  it('cleanAmount strips formatting', () => {
    expect(cleanAmount(' ₹1,234.50 ')).toBe('1234.50');
  });

  it('emptyForm: I paid, everyone included, EQUAL, group currency', () => {
    const f = emptyForm(M, 'INR', '2026-10-08');
    expect(f.singlePayerId).toBe('a');
    expect(f.splitMode).toBe('EQUAL');
    expect(Object.values(f.included).every(Boolean)).toBe(true);
    expect(f.currency).toBe('INR');
  });

  it('EQUAL preview totals exactly with extra paisa to lowest id', () => {
    const r = checkForm(base(), M, 'INR');
    expect(r.ok).toBe(true);
    expect(r.preview).toEqual([
      { memberId: 'a', amount: '33.34' }, { memberId: 'b', amount: '33.33' }, { memberId: 'c', amount: '33.33' },
    ]);
  });

  it('no participants', () => {
    const f = base();
    f.included = { a: false, b: false, c: false };
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: false, error: 'Pick at least one person to split with' });
  });

  it('EXACT remaining and success', () => {
    const f = { ...base(), splitMode: 'EXACT' as const, values: { a: '60', b: '30', c: '' } };
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: false, remaining: '10.00' });
    f.values.c = '10';
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: true, remaining: '0.00' });
  });

  it('percent off by', () => {
    const f = { ...base(), splitMode: 'PERCENT' as const, values: { a: '50', b: '40', c: '' } };
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: false, error: 'Percentages add up to 90%, not 100%' });
  });

  it('multiple payers must add up', () => {
    const f = { ...base(), payerMode: 'multiple' as const, payerAmounts: { a: '60', b: '30', c: '' } };
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: false, error: 'Paid amounts add up to ₹90.00, not ₹100.00' });
  });

  it('foreign currency needs a rate', () => {
    const f = { ...base(), currency: 'USD', fxRate: '' };
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: false, error: 'Enter the USD → INR exchange rate' });
  });

  it('bad amount and missing description', () => {
    expect(checkForm({ ...base(), amount: '0' }, M, 'INR').error).toBe('Enter an amount above 0 with at most 2 decimals');
    expect(checkForm({ ...base(), amount: '10.005' }, M, 'INR').error).toBe('Enter an amount above 0 with at most 2 decimals');
    expect(checkForm({ ...base(), description: '  ' }, M, 'INR').error).toBe('Add a description');
  });

  it('toPayload EQUAL sends only included members; same-currency sends no fxRate', () => {
    const f = base();
    f.included.c = false;
    expect(toPayload(f, M, 'INR')).toEqual({
      description: 'Dinner', date: '2026-10-08', amount: '100', currency: 'INR', fxRate: null,
      splitMode: 'EQUAL', payers: [{ memberId: 'a', amount: '100' }],
      shares: [{ memberId: 'b' }, { memberId: 'a' }],
    });
  });

  it('toPayload SHARES drops blank/zero values and sends USD rate', () => {
    const f = { ...base(), splitMode: 'SHARES' as const, currency: 'USD', fxRate: '83.1', values: { a: '2', b: '1', c: '0' } };
    const p = toPayload(f, M, 'INR');
    expect(p.shares).toEqual([{ memberId: 'b', value: '1' }, { memberId: 'a', value: '2' }]);
    expect(p.fxRate).toBe('83.1');
  });

  it('formFromExpense round-trips an EXACT multi-payer expense', () => {
    const e = {
      id: 'e1', groupId: 'g', description: 'Taxi', date: '2026-10-01', amount: '90.0000', currency: 'INR',
      fxRate: '1', baseAmount: '90.0000', splitMode: 'EXACT', createdById: 'u1', createdAt: '2026-10-01T00:00:00Z',
      sourceType: 'MANUAL', deletedAt: null,
      payers: [{ memberId: 'a', amount: '60.0000', baseAmount: '60.0000' }, { memberId: 'b', amount: '30.0000', baseAmount: '30.0000' }],
      shares: [{ memberId: 'a', amount: '45.0000', baseAmount: '45.0000', rawInput: '45' }, { memberId: 'b', amount: '45.0000', baseAmount: '45.0000', rawInput: '45' }],
    } as SplitExpenseDto;
    const f = formFromExpense(e, M);
    expect(f).toMatchObject({ amount: '90', payerMode: 'multiple', payerAmounts: { a: '60', b: '30' }, values: { a: '45', b: '45' } });
    expect(checkForm(f, M, 'INR').ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx vitest run src/pages/split/expenseForm.test.ts`
Expected: FAIL — cannot resolve `./expenseForm`.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/pages/split/expenseForm.ts
/**
 * Add/edit-expense form model. Pure: no React, no network. Validation mirrors
 * the server (Plan 1 allocate.ts) so the user sees problems before Save, but
 * the server stays the authority.
 */
import { Decimal } from '@everypaisa/shared';
import type { SplitExpenseDto, SplitMemberDto, SplitModeDto } from '@everypaisa/shared';
import type { ExpenseInput } from '@/api/split.api';
import { formatSplitMoney } from '@/lib/splitFormat';

export interface ExpenseFormState {
  description: string;
  amount: string;
  currency: string;
  fxRate: string;
  date: string;
  splitMode: SplitModeDto;
  payerMode: 'single' | 'multiple';
  singlePayerId: string;
  payerAmounts: Record<string, string>;
  included: Record<string, boolean>;
  values: Record<string, string>;
}

export interface ShareLine { memberId: string; amount: string | null }
export interface FormCheck { ok: boolean; error: string | null; remaining: string | null; preview: ShareLine[] }

const MONEY = /^\d+(\.\d{1,2})?$/;
const NUM = /^\d+(\.\d+)?$/;
const ZERO = new Decimal(0);
const PAISA = new Decimal('0.01');
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function cleanAmount(raw: string): string {
  return raw.replace(/[,\s₹]/g, '');
}

const plain = (v: string) => new Decimal(v).toString();

export function emptyForm(members: SplitMemberDto[], baseCurrency: string, today: string): ExpenseFormState {
  const me = members.find((m) => m.isMe) ?? members[0];
  return {
    description: '',
    amount: '',
    currency: baseCurrency,
    fxRate: '',
    date: today,
    splitMode: 'EQUAL',
    payerMode: 'single',
    singlePayerId: me?.id ?? '',
    payerAmounts: Object.fromEntries(members.map((m) => [m.id, ''])),
    included: Object.fromEntries(members.map((m) => [m.id, true])),
    values: Object.fromEntries(members.map((m) => [m.id, ''])),
  };
}

export function formFromExpense(e: SplitExpenseDto, members: SplitMemberDto[]): ExpenseFormState {
  const f = emptyForm(members, e.currency, e.date);
  f.description = e.description;
  f.amount = plain(e.amount);
  f.currency = e.currency;
  f.fxRate = new Decimal(e.fxRate).eq(1) ? '' : plain(e.fxRate);
  f.splitMode = e.splitMode;
  if (e.payers.length === 1) {
    f.payerMode = 'single';
    f.singlePayerId = e.payers[0]!.memberId;
  } else {
    f.payerMode = 'multiple';
    for (const p of e.payers) f.payerAmounts[p.memberId] = plain(p.amount);
  }
  const sharedIds = new Set(e.shares.map((s) => s.memberId));
  for (const m of members) f.included[m.id] = sharedIds.has(m.id);
  for (const s of e.shares) {
    f.values[s.memberId] = e.splitMode === 'EXACT' ? plain(s.amount) : s.rawInput ? plain(s.rawInput) : '';
  }
  return f;
}

function equalPreview(total: Decimal, ids: string[]): ShareLine[] {
  const sorted = [...ids].sort();
  const each = total.div(sorted.length).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  let left = total.minus(each.mul(sorted.length)).div(PAISA).toNumber();
  return sorted.map((id) => {
    const extra = left > 0 ? PAISA : ZERO;
    if (left > 0) left -= 1;
    return { memberId: id, amount: each.plus(extra).toFixed(2) };
  });
}

function weightedPreview(total: Decimal, weights: Array<{ id: string; w: Decimal }>): ShareLine[] {
  const live = weights.filter((x) => x.w.gt(0)).sort((x, y) => byId({ id: x.id }, { id: y.id }));
  const sum = live.reduce((a, x) => a.plus(x.w), ZERO);
  if (sum.isZero()) return [];
  const floors = live.map((x) => ({ id: x.id, v: total.mul(x.w).div(sum).toDecimalPlaces(2, Decimal.ROUND_DOWN) }));
  let left = total.minus(floors.reduce((a, x) => a.plus(x.v), ZERO)).div(PAISA).toNumber();
  return floors.map((x) => {
    const extra = left > 0 ? PAISA : ZERO;
    if (left > 0) left -= 1;
    return { memberId: x.id, amount: x.v.plus(extra).toFixed(2) };
  });
}

const fail = (error: string, remaining: string | null = null, preview: ShareLine[] = []): FormCheck => ({ ok: false, error, remaining, preview });

export function checkForm(f: ExpenseFormState, members: SplitMemberDto[], baseCurrency: string): FormCheck {
  if (!f.description.trim()) return fail('Add a description');
  const amountRaw = cleanAmount(f.amount);
  if (!MONEY.test(amountRaw) || new Decimal(amountRaw).lte(0)) return fail('Enter an amount above 0 with at most 2 decimals');
  const total = new Decimal(amountRaw);
  if (f.currency !== baseCurrency) {
    const rate = cleanAmount(f.fxRate);
    if (!NUM.test(rate) || new Decimal(rate).lte(0)) return fail(`Enter the ${f.currency} → ${baseCurrency} exchange rate`);
  }

  // Payers
  if (f.payerMode === 'single') {
    if (!members.some((m) => m.id === f.singlePayerId)) return fail('Pick who paid');
  } else {
    let paid = ZERO;
    for (const m of members) {
      const v = cleanAmount(f.payerAmounts[m.id] ?? '');
      if (!v) continue;
      if (!MONEY.test(v)) return fail(`Check the amount paid by ${m.isMe ? 'you' : m.displayName}`);
      paid = paid.plus(v);
    }
    if (!paid.eq(total)) {
      return fail(`Paid amounts add up to ${formatSplitMoney(paid, f.currency)}, not ${formatSplitMoney(total, f.currency)}`);
    }
  }

  // Shares
  const ids = members.map((m) => m.id);
  if (f.splitMode === 'EQUAL') {
    const chosen = ids.filter((id) => f.included[id]);
    if (chosen.length === 0) return fail('Pick at least one person to split with');
    return { ok: true, error: null, remaining: null, preview: equalPreview(total, chosen) };
  }

  const parsed: Array<{ id: string; w: Decimal }> = [];
  for (const m of members) {
    const v = cleanAmount(f.values[m.id] ?? '');
    if (!v) continue;
    if (!NUM.test(v)) return fail(`Check the value for ${m.isMe ? 'you' : m.displayName}`);
    if (f.splitMode === 'EXACT' && !MONEY.test(v)) return fail(`Use at most 2 decimals for ${m.isMe ? 'you' : m.displayName}`);
    parsed.push({ id: m.id, w: new Decimal(v) });
  }
  const sum = parsed.reduce((a, x) => a.plus(x.w), ZERO);
  if (f.splitMode === 'EXACT') {
    const remaining = total.minus(sum);
    const preview = parsed.filter((x) => x.w.gt(0)).sort((x, y) => byId({ id: x.id }, { id: y.id })).map((x) => ({ memberId: x.id, amount: x.w.toFixed(2) }));
    if (!remaining.isZero()) {
      return fail(remaining.gt(0) ? `${formatSplitMoney(remaining, f.currency)} left to assign` : `Over by ${formatSplitMoney(remaining, f.currency)}`, remaining.toFixed(2), preview);
    }
    if (preview.length === 0) return fail('Pick at least one person to split with');
    return { ok: true, error: null, remaining: '0.00', preview };
  }
  if (f.splitMode === 'PERCENT' && !sum.eq(100)) return fail(`Percentages add up to ${sum.toString()}%, not 100%`);
  if (sum.lte(0)) return fail('Pick at least one person to split with');
  return { ok: true, error: null, remaining: null, preview: weightedPreview(total, parsed) };
}

export function toPayload(f: ExpenseFormState, members: SplitMemberDto[], baseCurrency: string): Omit<ExpenseInput, 'groupId'> {
  const amount = cleanAmount(f.amount);
  const payers = f.payerMode === 'single'
    ? [{ memberId: f.singlePayerId, amount }]
    : members
        .map((m) => ({ memberId: m.id, amount: cleanAmount(f.payerAmounts[m.id] ?? '') }))
        .filter((p) => p.amount && new Decimal(p.amount).gt(0));
  const shares = f.splitMode === 'EQUAL'
    ? members.filter((m) => f.included[m.id]).map((m) => ({ memberId: m.id }))
    : members
        .map((m) => ({ memberId: m.id, value: cleanAmount(f.values[m.id] ?? '') }))
        .filter((s) => s.value && new Decimal(s.value).gt(0));
  return {
    description: f.description.trim(),
    date: f.date,
    amount,
    currency: f.currency,
    fxRate: f.currency === baseCurrency ? null : cleanAmount(f.fxRate),
    splitMode: f.splitMode,
    payers,
    shares,
  };
}
```

(`.toNumber()` above converts an integer count of paise — never money — and is bounded by the participant count.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pages/split/expenseForm.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/split/expenseForm.ts apps/web/src/pages/split/expenseForm.test.ts
git commit -m "feat(split-web): add-expense form model with live validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Nav, routes, Split home page, new-group and contact dialogs

**Files:**
- Modify: `apps/web/src/components/layout/navItems.tsx` (Tools section + lucide import)
- Modify: `apps/web/src/App.tsx` (imports + routes beside `/loans`)
- Create: `apps/web/src/pages/split/testUtils.tsx`
- Create: `apps/web/src/pages/split/BalancePill.tsx`
- Create: `apps/web/src/pages/split/ContactDialog.tsx`
- Create: `apps/web/src/pages/split/NewGroupDialog.tsx`
- Create: `apps/web/src/pages/split/SplitHomePage.tsx`
- Test: `apps/web/src/pages/split/SplitHomePage.test.tsx`

**Interfaces:**
- Consumes: `splitApi`, `SPLIT_KEYS`, `NewGroupInput`, `ContactInput` (Task 2); `balanceLabel`, `balanceTone`, `formatSplitMoney` (Task 2); `useAuthStore` from `@/stores/auth.store` (`user.name`).
- Produces:
  - `export function renderWithProviders(ui: ReactElement, opts?: { route?: string; path?: string }): RenderResult` (testUtils) — wraps in `QueryClientProvider` (retry off) + `MemoryRouter initialEntries=[route]` + `<Routes><Route path={path ?? '*'} element={ui} /></Routes>`.
  - `export function BalancePill({ net, currency, approx }: { net: string; currency: string; approx?: boolean })`
  - `export function ContactDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange(o: boolean): void; onSaved?(c: SplitContactDto): void })`
  - `export function NewGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void })` — navigates to `/split/groups/:id` on success.
  - `export function myDisplayName(user: { name?: string | null } | null): string` (in NewGroupDialog.tsx) → trimmed name or 'Me'.
  - Routes: `/split` → `SplitHomePage`; `/split/groups/:id` → `GroupPage` (Task 6); `/split/expenses/:id` → `ExpenseDetailPage` (Task 7); `/split/friends/:key` → `FriendPage` (Task 7). Until those exist, register only `/split` in this task; Tasks 6–7 add their routes.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/pages/split/SplitHomePage.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { SplitHomePage } from './SplitHomePage';

const api = vi.hoisted(() => ({
  friends: vi.fn(), listGroups: vi.fn(), activity: vi.fn(), listContacts: vi.fn(),
  createGroup: vi.fn(), createContact: vi.fn(),
}));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { name: 'Alice Rao' } }) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function seed() {
  api.friends.mockResolvedValue([
    { key: 'u:u2', displayName: 'Bob', userId: 'u2', contactId: 'c2', currency: 'INR', net: '70.0000', approx: false, groups: [] },
    { key: 'c:c3', displayName: 'Chetan', userId: null, contactId: 'c3', currency: 'INR', net: '-130.0000', approx: true, groups: [] },
  ]);
  api.listGroups.mockResolvedValue([
    { id: 'g1', name: 'Goa trip', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, members: [], myNet: '200.0000' },
  ]);
  api.activity.mockResolvedValue([
    { id: 'x1', groupId: 'g1', groupName: 'Goa trip', actorUserId: 'u2', actorName: 'Bob', kind: 'EXPENSE_ADDED', payload: { description: 'Hotel', amount: '90.00', currency: 'INR' }, createdAt: '2026-10-08T10:00:00Z' },
  ]);
  api.listContacts.mockResolvedValue([{ id: 'c2', name: 'Bob', email: null, phone: null, upiId: null, linkedUserId: 'u2' }]);
}

describe('SplitHomePage', () => {
  it('shows totals, friends, groups and activity', async () => {
    seed();
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    expect(await screen.findByText('Bob')).toBeTruthy();
    expect(screen.getByText('owes you ₹70.00')).toBeTruthy();
    expect(screen.getByText('you owe ≈ ₹130.00')).toBeTruthy();
    expect(screen.getByText('Goa trip')).toBeTruthy();
    expect(screen.getByTestId('split-owed-total').textContent).toContain('₹70.00');
    expect(screen.getByTestId('split-owe-total').textContent).toContain('₹130.00');
    expect(screen.getByText(/Bob added “Hotel”/)).toBeTruthy();
  });

  it('empty state invites the first group', async () => {
    api.friends.mockResolvedValue([]);
    api.listGroups.mockResolvedValue([]);
    api.activity.mockResolvedValue([]);
    api.listContacts.mockResolvedValue([]);
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    expect(await screen.findByText('No groups yet')).toBeTruthy();
  });

  it('creates a group with my name and chosen contacts', async () => {
    seed();
    api.createGroup.mockResolvedValue({ id: 'g9', name: 'Flat', type: 'HOME', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, members: [], myNet: '0.0000' });
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    fireEvent.click(await screen.findByRole('button', { name: 'New group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Flat' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'HOME' } });
    fireEvent.click(await screen.findByLabelText('Bob'));
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith({
      name: 'Flat', type: 'HOME', baseCurrency: 'INR', simplifyDebts: true, myDisplayName: 'Alice Rao', contactIds: ['c2'],
    }));
  });
});
```

Check `apps/web/src/stores/auth.store.ts` exports `useAuthStore` as a zustand hook used as `useAuthStore((s) => s.user)`; if its shape differs, adapt the mock (not the component contract) and report it.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx vitest run src/pages/split/SplitHomePage.test.tsx`
Expected: FAIL — cannot resolve `./testUtils` / `./SplitHomePage`.

- [ ] **Step 3: Implement `testUtils.tsx` and `BalancePill.tsx`**

```tsx
// apps/web/src/pages/split/testUtils.tsx
import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function renderWithProviders(ui: ReactElement, opts: { route?: string; path?: string } = {}): RenderResult {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[opts.route ?? '/']}>
        <Routes>
          <Route path={opts.path ?? '*'} element={ui} />
          <Route path="*" element={<div data-testid="navigated" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

```tsx
// apps/web/src/pages/split/BalancePill.tsx
import { cn } from '@/lib/cn';
import { balanceLabel, balanceTone } from '@/lib/splitFormat';

const TONE = {
  owed: 'text-emerald-700 dark:text-emerald-400',
  owe: 'text-rose-700 dark:text-rose-400',
  settled: 'text-muted-foreground',
} as const;

export function BalancePill({ net, currency, approx, className }: { net: string; currency: string; approx?: boolean; className?: string }) {
  return (
    <span className={cn('text-sm font-medium tabular-nums whitespace-nowrap', TONE[balanceTone(net)], className)}>
      {balanceLabel(net, currency, { approx })}
    </span>
  );
}
```

Check `tailwind.config.ts` / `src/styles` for existing positive/negative tokens (e.g. classes used by `Money` or P&L figures such as `text-gain`/`text-loss`); if the app defines semantic gain/loss tokens, use those instead of `emerald`/`rose` (per the theme-token convention), keeping `text-muted-foreground` for settled.

- [ ] **Step 4: Implement `ContactDialog.tsx`**

```tsx
// apps/web/src/pages/split/ContactDialog.tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { SplitContactDto } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/api/client';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';

export function ContactDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved?: (c: SplitContactDto) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setName(''); setEmail(''); setPhone(''); setError(null); }
  }, [open]);

  const save = useMutation({
    mutationFn: () => splitApi.createContact({ name: name.trim(), email: email.trim() || null, phone: phone.trim() || null }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.contacts });
      toast.success(`${c.name} added`);
      onOpenChange(false);
      onSaved?.(c);
    },
    onError: (err) => setError(apiErrorMessage(err, 'Could not add the person')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a name');
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add a person</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="contact-name">Name</Label>
            <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-email">Email (optional)</Label>
            <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Phone (optional)</Label>
            <Input id="contact-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">If they sign up later with this email or phone, they’ll see your shared groups.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>Add person</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Implement `NewGroupDialog.tsx`**

```tsx
// apps/web/src/pages/split/NewGroupDialog.tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/api/client';
import { SPLIT_KEYS, splitApi, type NewGroupInput } from '@/api/split.api';
import { useAuthStore } from '@/stores/auth.store';
import { ContactDialog } from './ContactDialog';

export const GROUP_TYPES: Array<{ value: NonNullable<NewGroupInput['type']>; label: string }> = [
  { value: 'TRIP', label: 'Trip' },
  { value: 'HOME', label: 'Home' },
  { value: 'COUPLE', label: 'Couple' },
  { value: 'OTHER', label: 'Other' },
];
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB', 'JPY', 'AUD', 'CAD'];

export function myDisplayName(user: { name?: string | null } | null): string {
  return user?.name?.trim() || 'Me';
}

export function NewGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((s: { user: { name?: string | null } | null }) => s.user);
  const contacts = useQuery({ queryKey: SPLIT_KEYS.contacts, queryFn: splitApi.listContacts, enabled: open });
  const [name, setName] = useState('');
  const [type, setType] = useState<NonNullable<NewGroupInput['type']>>('TRIP');
  const [currency, setCurrency] = useState('INR');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);

  useEffect(() => {
    if (open) { setName(''); setType('TRIP'); setCurrency('INR'); setPicked([]); setError(null); }
  }, [open]);

  const save = useMutation({
    mutationFn: () => splitApi.createGroup({
      name: name.trim(), type, baseCurrency: currency, simplifyDebts: true,
      myDisplayName: myDisplayName(user), contactIds: picked,
    }),
    onSuccess: (g) => {
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
      toast.success('Group created');
      onOpenChange(false);
      navigate(`/split/groups/${g.id}`);
    },
    onError: (err) => setError(apiErrorMessage(err, 'Could not create the group')),
  });

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Name the group');
    save.mutate();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New group</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Group name</Label>
              <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Goa trip" autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="group-type">Type</Label>
                <Select id="group-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  {GROUP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-currency">Currency</Label>
                <Select id="group-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">People</legend>
              {(contacts.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No people yet — add someone to split with.</p>}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {(contacts.data ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                    <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} aria-label={c.name} />
                    <span className="text-sm">{c.name}</span>
                  </label>
                ))}
              </div>
              <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setAddingPerson(true)}>+ Add a person</Button>
            </fieldset>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>Create group</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ContactDialog open={addingPerson} onOpenChange={setAddingPerson} onSaved={(c) => setPicked((p) => [...p, c.id])} />
    </>
  );
}
```

- [ ] **Step 6: Implement `SplitHomePage.tsx`**

```tsx
// apps/web/src/pages/split/SplitHomePage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, UserPlus, UsersRound } from 'lucide-react';
import { Decimal, toDecimal, formatDateTimeIST } from '@everypaisa/shared';
import type { SplitActivityDto } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney } from '@/lib/splitFormat';
import { BalancePill } from './BalancePill';
import { NewGroupDialog } from './NewGroupDialog';
import { ContactDialog } from './ContactDialog';

export function activityText(a: SplitActivityDto): string {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  const desc = typeof p.description === 'string' ? `“${p.description}”` : 'an expense';
  switch (a.kind) {
    case 'EXPENSE_ADDED': return `${a.actorName} added ${desc}`;
    case 'EXPENSE_EDITED': return `${a.actorName} edited ${desc}`;
    case 'EXPENSE_DELETED': return `${a.actorName} deleted ${desc}`;
    case 'EXPENSE_RESTORED': return `${a.actorName} restored ${desc}`;
    case 'SETTLED': return `${a.actorName} recorded a payment`;
    case 'SETTLEMENT_EDITED': return `${a.actorName} edited a payment`;
    case 'SETTLEMENT_DELETED': return `${a.actorName} deleted a payment`;
    case 'GROUP_CREATED': return `${a.actorName} created the group`;
    case 'GROUP_UPDATED': return `${a.actorName} changed group settings`;
    case 'MEMBER_ADDED': return `${a.actorName} added ${typeof p.displayName === 'string' ? p.displayName : 'someone'}`;
    case 'MEMBER_REMOVED': return `${a.actorName} removed a member`;
    default: return `${a.actorName} updated the group`;
  }
}

export function SplitHomePage() {
  const [newGroup, setNewGroup] = useState(false);
  const [newPerson, setNewPerson] = useState(false);
  const friends = useQuery({ queryKey: SPLIT_KEYS.friends, queryFn: splitApi.friends });
  const groups = useQuery({ queryKey: SPLIT_KEYS.groups, queryFn: () => splitApi.listGroups() });
  const activity = useQuery({ queryKey: SPLIT_KEYS.activity(), queryFn: () => splitApi.activity() });

  const list = friends.data ?? [];
  const owed = list.reduce((a, f) => (toDecimal(f.net).gt(0) ? a.plus(toDecimal(f.net)) : a), new Decimal(0));
  const owe = list.reduce((a, f) => (toDecimal(f.net).lt(0) ? a.plus(toDecimal(f.net).abs()) : a), new Decimal(0));
  const currency = list[0]?.currency ?? 'INR';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tools"
        title="Split Expenses"
        description="Share costs with friends, flatmates and trips — see who owes whom and settle up."
        actions={
          <>
            <Button variant="outline" onClick={() => setNewPerson(true)}><UserPlus className="h-4 w-4 mr-1.5" />Add person</Button>
            <Button onClick={() => setNewGroup(true)}><Plus className="h-4 w-4 mr-1.5" />New group</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">You are owed</p>
          <p data-testid="split-owed-total" className="text-xl font-semibold tabular-nums mt-1">{formatSplitMoney(owed, currency)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">You owe</p>
          <p data-testid="split-owe-total" className="text-xl font-semibold tabular-nums mt-1">{formatSplitMoney(owe, currency)}</p>
        </CardContent></Card>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Groups</h2>
        {groups.isSuccess && groups.data.length === 0 && (
          <Card><CardContent className="p-6 text-center space-y-2">
            <UsersRound className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="font-medium">No groups yet</p>
            <p className="text-sm text-muted-foreground">Create one for a trip, your flat, or anything you share.</p>
            <Button size="sm" onClick={() => setNewGroup(true)}>New group</Button>
          </CardContent></Card>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {(groups.data ?? []).map((g) => (
            <Link key={g.id} to={`/split/groups/${g.id}`} className="block">
              <Card className="hover:bg-muted/40 transition-colors"><CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{g.name}</p>
                  <p className="text-xs text-muted-foreground">{g.members.length} people · {g.baseCurrency}</p>
                </div>
                <BalancePill net={g.myNet} currency={g.baseCurrency} />
              </CardContent></Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Friends</h2>
        {friends.isSuccess && list.length === 0 && <p className="text-sm text-muted-foreground">Balances with people appear here once you add expenses.</p>}
        <Card><CardContent className="p-0 divide-y">
          {list.map((f) => (
            <Link key={f.key} to={`/split/friends/${encodeURIComponent(f.key)}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
              <span className="font-medium truncate">{f.displayName}</span>
              <BalancePill net={f.net} currency={f.currency} approx={f.approx} />
            </Link>
          ))}
        </CardContent></Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</h2>
        <Card><CardContent className="p-0 divide-y">
          {(activity.data ?? []).slice(0, 20).map((a) => (
            <Link key={a.id} to={`/split/groups/${a.groupId}`} className="block px-4 py-3 hover:bg-muted/40">
              <p className="text-sm">{activityText(a)} <span className="text-muted-foreground">in {a.groupName}</span></p>
              <p className="text-xs text-muted-foreground">{formatDateTimeIST(a.createdAt)}</p>
            </Link>
          ))}
          {activity.isSuccess && activity.data.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Nothing yet.</p>}
        </CardContent></Card>
      </section>

      <NewGroupDialog open={newGroup} onOpenChange={setNewGroup} />
      <ContactDialog open={newPerson} onOpenChange={setNewPerson} />
    </div>
  );
}
```

Confirm `formatDateTimeIST` is exported from `@everypaisa/shared` (it is, `packages/shared/src/format/date.ts:14`) and `UsersRound` exists in the installed `lucide-react` (`node -e "console.log(!!require('lucide-react').UsersRound)"` from `apps/web`); if not, use `Users`.

- [ ] **Step 7: Nav + route**

In `apps/web/src/components/layout/navItems.tsx` add `UsersRound` to the `lucide-react` import list and insert into the `Tools` items, right after `Accounting`:

```tsx
      { label: 'Split Expenses', to: '/split', icon: UsersRound },
```

In `apps/web/src/App.tsx` add `import { SplitHomePage } from './pages/split/SplitHomePage';` beside the Loans imports and, after the `/loans/:id` route:

```tsx
        <Route path="/split" element={<SplitHomePage />} />
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/pages/split && npx tsc --noEmit && npx eslint src/pages/split src/api/split.api.ts src/lib/splitFormat.ts src/components/layout/navItems.tsx`
Expected: PASS, no type or lint errors. If an existing nav test snapshots the Tools list, update its expectation to include "Split Expenses".

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/pages/split apps/web/src/components/layout/navItems.tsx apps/web/src/App.tsx
git commit -m "feat(split-web): Split Expenses home, groups and people

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Add/edit expense dialog

**Files:**
- Create: `apps/web/src/pages/split/AddExpenseDialog.tsx`
- Test: `apps/web/src/pages/split/AddExpenseDialog.test.tsx`

**Interfaces:**
- Consumes: `emptyForm`, `formFromExpense`, `checkForm`, `toPayload`, `ExpenseFormState`, `cleanAmount` (Task 3); `splitApi`, `SPLIT_KEYS` (Task 2); `CURRENCIES` (Task 4, `NewGroupDialog.tsx`); `memberName`, `formatSplitMoney` (Task 2).
- Produces: `export function AddExpenseDialog({ open, onOpenChange, group, expense }: { open: boolean; onOpenChange(o: boolean): void; group: SplitGroupDto; expense?: SplitExpenseDto | null })` — create when `expense` is absent, edit otherwise. On success invalidates `SPLIT_KEYS.all` and closes. Today's date is `new Date().toISOString().slice(0, 10)` computed in the component.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/pages/split/AddExpenseDialog.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { SplitGroupDto } from '@everypaisa/shared';
import { renderWithProviders } from './testUtils';
import { AddExpenseDialog } from './AddExpenseDialog';

const api = vi.hoisted(() => ({ createExpense: vi.fn(), updateExpense: vi.fn() }));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const group: SplitGroupDto = {
  id: 'g1', name: 'Goa', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, myNet: '0.0000',
  members: [
    { id: 'a', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null },
    { id: 'b', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null },
    { id: 'z', displayName: 'Zed', userId: null, contactId: 'c9', isMe: false, leftAt: '2026-09-01T00:00:00Z' },
  ],
};

describe('AddExpenseDialog', () => {
  it('equal split: shows per-person preview and saves', async () => {
    api.createExpense.mockResolvedValue({});
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Dinner' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1,001' } });
    expect(screen.getByTestId('share-a').textContent).toContain('₹500.50');
    expect(screen.getByTestId('share-b').textContent).toContain('₹500.50');
    expect(screen.queryByText('Zed')).toBeNull(); // left members are not offered
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    await waitFor(() => expect(api.createExpense).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 'g1', description: 'Dinner', amount: '1001', splitMode: 'EQUAL',
      payers: [{ memberId: 'a', amount: '1001' }], shares: [{ memberId: 'a' }, { memberId: 'b' }],
    })));
  });

  it('exact split shows what is left and blocks save', async () => {
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Cab' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Exact' }));
    fireEvent.change(screen.getByLabelText('Exact amount for You'), { target: { value: '60' } });
    expect(screen.getByRole('alert').textContent).toContain('₹40.00 left to assign');
    expect((screen.getByRole('button', { name: 'Save expense' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('foreign currency asks for a rate', async () => {
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Snorkel' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });
    expect(screen.getByLabelText('1 USD in INR')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Enter the USD → INR exchange rate');
  });

  it('server error stays in the dialog', async () => {
    api.createExpense.mockRejectedValue({ isAxiosError: true, response: { data: { success: false, error: { code: 'BAD_REQUEST', message: 'SPLIT_SUM_MISMATCH: shares add to 99' } } } });
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(await screen.findByText(/SPLIT_SUM_MISMATCH/)).toBeTruthy();
  });
});
```

Before writing the last test, read `apiErrorMessage` in `apps/web/src/api/client.ts` and shape the rejected value so it extracts `error.message`; adjust the mock shape (not the assertion) if needed.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/pages/split/AddExpenseDialog.test.tsx`
Expected: FAIL — cannot resolve `./AddExpenseDialog`.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/pages/split/AddExpenseDialog.tsx
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { SplitExpenseDto, SplitGroupDto, SplitModeDto } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/api/client';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney } from '@/lib/splitFormat';
import { cn } from '@/lib/cn';
import { checkForm, emptyForm, formFromExpense, toPayload, type ExpenseFormState } from './expenseForm';
import { CURRENCIES } from './NewGroupDialog';

const MODES: Array<{ value: SplitModeDto; label: string; field: string }> = [
  { value: 'EQUAL', label: 'Equally', field: '' },
  { value: 'EXACT', label: 'Exact', field: 'Exact amount' },
  { value: 'PERCENT', label: 'Percent', field: 'Percent' },
  { value: 'SHARES', label: 'Shares', field: 'Shares' },
];

const today = () => new Date().toISOString().slice(0, 10);

export function AddExpenseDialog({ open, onOpenChange, group, expense }: {
  open: boolean; onOpenChange: (o: boolean) => void; group: SplitGroupDto; expense?: SplitExpenseDto | null;
}) {
  const qc = useQueryClient();
  const members = useMemo(() => group.members.filter((m) => !m.leftAt), [group.members]);
  const [form, setForm] = useState<ExpenseFormState>(() =>
    expense ? formFromExpense(expense, members) : emptyForm(members, group.baseCurrency, today()));
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(expense ? formFromExpense(expense, members) : emptyForm(members, group.baseCurrency, today()));
      setServerError(null);
    }
  }, [open, expense, members, group.baseCurrency]);

  const set = <K extends keyof ExpenseFormState>(k: K, v: ExpenseFormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setIn = (k: 'payerAmounts' | 'included' | 'values', id: string, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: { ...f[k], [id]: v } }));

  const check = checkForm(form, members, group.baseCurrency);
  const nameOf = (id: string) => (members.find((m) => m.id === id)?.isMe ? 'You' : members.find((m) => m.id === id)?.displayName ?? '');
  const previewOf = (id: string) => check.preview.find((p) => p.memberId === id)?.amount ?? null;

  const save = useMutation({
    mutationFn: () => {
      const payload = toPayload(form, members, group.baseCurrency);
      return expense ? splitApi.updateExpense(expense.id, payload) : splitApi.createExpense({ groupId: group.id, ...payload });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
      toast.success(expense ? 'Expense updated' : 'Expense added');
      onOpenChange(false);
    },
    onError: (err) => setServerError(apiErrorMessage(err, 'Could not save the expense')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (check.ok) save.mutate();
  };

  const mode = MODES.find((m) => m.value === form.splitMode)!;
  // Only show an error once the user has started filling the essentials.
  const showCheckError = !check.ok && form.description.trim() !== '' && form.amount.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{expense ? 'Edit expense' : 'Add expense'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="exp-desc">Description</Label>
            <Input id="exp-desc" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Dinner at Thalassa" autoComplete="off" />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Amount</Label>
              <Input id="exp-amount" inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-ccy">Currency</Label>
              <Select id="exp-ccy" value={form.currency} onChange={(e) => set('currency', e.target.value)} className="w-24">
                {Array.from(new Set([group.baseCurrency, ...CURRENCIES])).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          {form.currency !== group.baseCurrency && (
            <div className="space-y-1.5">
              <Label htmlFor="exp-fx">{`1 ${form.currency} in ${group.baseCurrency}`}</Label>
              <Input id="exp-fx" inputMode="decimal" value={form.fxRate} onChange={(e) => set('fxRate', e.target.value)} placeholder="83.10" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="exp-date">Date</Label>
            <Input id="exp-date" type="date" value={form.date} max={today()} onChange={(e) => set('date', e.target.value)} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Paid by</legend>
            <div className="flex gap-2">
              <Select aria-label="Payer" value={form.payerMode === 'single' ? form.singlePayerId : '__multi'}
                onChange={(e) => {
                  if (e.target.value === '__multi') set('payerMode', 'multiple');
                  else setForm((f) => ({ ...f, payerMode: 'single', singlePayerId: e.target.value }));
                }}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.isMe ? 'You' : m.displayName}</option>)}
                <option value="__multi">Multiple people</option>
              </Select>
            </div>
            {form.payerMode === 'multiple' && members.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Label htmlFor={`paid-${m.id}`} className="flex-1 text-sm font-normal">{nameOf(m.id)}</Label>
                <Input id={`paid-${m.id}`} aria-label={`Paid by ${nameOf(m.id)}`} inputMode="decimal" className="w-32"
                  value={form.payerAmounts[m.id] ?? ''} onChange={(e) => setIn('payerAmounts', m.id, e.target.value)} />
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Split</legend>
            <div role="tablist" className="grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
              {MODES.map((m) => (
                <button key={m.value} type="button" role="tab" aria-selected={form.splitMode === m.value}
                  onClick={() => set('splitMode', m.value)}
                  className={cn('rounded px-2 py-1.5 text-xs font-medium', form.splitMode === m.value ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                  {m.label}
                </button>
              ))}
            </div>
            <ul className="space-y-1.5">
              {members.map((m) => {
                const label = nameOf(m.id);
                const preview = previewOf(m.id);
                return (
                  <li key={m.id} className="flex items-center gap-2">
                    {form.splitMode === 'EQUAL' ? (
                      <label className="flex flex-1 items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!form.included[m.id]} onChange={(e) => setIn('included', m.id, e.target.checked)} aria-label={`Include ${label}`} />
                        {label}
                      </label>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{label}</span>
                        <Input aria-label={`${mode.field} for ${label}`} inputMode="decimal" className="w-24"
                          value={form.values[m.id] ?? ''} onChange={(e) => setIn('values', m.id, e.target.value)} />
                      </>
                    )}
                    <span data-testid={`share-${m.id}`} className="w-24 text-right text-sm tabular-nums text-muted-foreground">
                      {preview ? formatSplitMoney(preview, form.currency) : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {(showCheckError || serverError) && (
            <p role="alert" className="text-sm text-destructive">{serverError ?? check.error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!check.ok || save.isPending}>Save expense</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pages/split && npx tsc --noEmit && npx eslint src/pages/split`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/split/AddExpenseDialog.tsx apps/web/src/pages/split/AddExpenseDialog.test.tsx
git commit -m "feat(split-web): add and edit expenses with four split modes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Group page and settle-up dialog

**Files:**
- Create: `apps/web/src/pages/split/SettleUpDialog.tsx`
- Create: `apps/web/src/pages/split/GroupPage.tsx`
- Modify: `apps/web/src/App.tsx` (route `/split/groups/:id`)
- Test: `apps/web/src/pages/split/GroupPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–5 (`splitApi`, `SPLIT_KEYS`, `BalancePill`, `AddExpenseDialog`, `activityText` from `SplitHomePage.tsx`, `memberName`, `transferLabel`, `formatSplitMoney`, `GROUP_TYPES`, `ContactDialog`).
- Produces:
  - `export function SettleUpDialog({ open, onOpenChange, group, from, to, amount }: { open: boolean; onOpenChange(o: boolean): void; group: SplitGroupDto; from?: string; to?: string; amount?: string })` — prefilled from a transfer; method Cash/UPI/Other; date today; saves via `createSettlement` with the group's base currency; invalidates `SPLIT_KEYS.all`.
  - `export function GroupPage()` — reads `:id`. Tabs: **Expenses** (date-grouped list, each row links to `/split/expenses/:id`, shows "you lent/borrowed"), **Balances** (each member's net + transfers with "Settle" buttons), **Activity**, **Settings** (rename, simplify toggle, archive, members list with add-from-contacts and remove). DIRECT groups hide Settings member add/remove and type controls.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/pages/split/GroupPage.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { GroupPage } from './GroupPage';

const api = vi.hoisted(() => ({
  getGroup: vi.fn(), listExpenses: vi.fn(), balances: vi.fn(), activity: vi.fn(), listContacts: vi.fn(),
  createSettlement: vi.fn(), updateGroup: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(), listSettlements: vi.fn(),
}));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: toastError } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const GROUP = {
  id: 'g1', name: 'Goa trip', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, myNet: '200.0000',
  members: [
    { id: 'a', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null },
    { id: 'b', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null },
    { id: 'c', displayName: 'Chetan', userId: null, contactId: 'c3', isMe: false, leftAt: null },
  ],
};

function seed() {
  api.getGroup.mockResolvedValue(GROUP);
  api.listExpenses.mockResolvedValue([
    { id: 'e1', groupId: 'g1', description: 'Hotel', date: '2026-10-01', amount: '300.0000', currency: 'INR', fxRate: '1', baseAmount: '300.0000', splitMode: 'EQUAL', createdById: 'u1', createdAt: '2026-10-01T00:00:00Z', sourceType: 'MANUAL', deletedAt: null,
      payers: [{ memberId: 'a', amount: '300.0000', baseAmount: '300.0000' }],
      shares: ['a', 'b', 'c'].map((m) => ({ memberId: m, amount: '100.0000', baseAmount: '100.0000', rawInput: null })) },
  ]);
  api.balances.mockResolvedValue({ groupId: 'g1', baseCurrency: 'INR', simplified: true,
    nets: [{ memberId: 'a', net: '200.0000' }, { memberId: 'b', net: '-100.0000' }, { memberId: 'c', net: '-100.0000' }],
    transfers: [{ fromMemberId: 'b', toMemberId: 'a', amount: '100.0000' }, { fromMemberId: 'c', toMemberId: 'a', amount: '100.0000' }] });
  api.activity.mockResolvedValue([]);
  api.listContacts.mockResolvedValue([]);
  api.listSettlements.mockResolvedValue([]);
}

const renderPage = () => renderWithProviders(<GroupPage />, { route: '/split/groups/g1', path: '/split/groups/:id' });

describe('GroupPage', () => {
  it('lists expenses with my lent amount', async () => {
    seed();
    renderPage();
    expect(await screen.findByText('Hotel')).toBeTruthy();
    expect(screen.getByText('you lent ₹200.00')).toBeTruthy();
  });

  it('balances tab settles a transfer', async () => {
    seed();
    api.createSettlement.mockResolvedValue({});
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Balances' }));
    expect(await screen.findByText('Bob pays You ₹100.00')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Settle' })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(api.createSettlement).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 'g1', fromMemberId: 'b', toMemberId: 'a', amount: '100', currency: 'INR', method: 'CASH',
    })));
  });

  it('remove member with balance shows server message', async () => {
    seed();
    api.removeMember.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { success: false, error: { code: 'CONFLICT', message: 'SPLIT_MEMBER_HAS_BALANCE: settle this member to zero first' } } } });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Bob' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining('settle this member to zero first')));
  });

  it('direct groups hide member management', async () => {
    seed();
    api.getGroup.mockResolvedValue({ ...GROUP, type: 'DIRECT', members: GROUP.members.slice(0, 2) });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    expect(screen.queryByRole('button', { name: 'Remove Bob' })).toBeNull();
  });
});
```

Read `apps/web/src/components/ui/tabs.tsx`: if `TabsTrigger` does not render `role="tab"`, either add `role="tab"` + `aria-selected` to it (small, compatible change; mention it in the report) or select tabs in the test by button name — prefer the role fix.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/pages/split/GroupPage.test.tsx`
Expected: FAIL — cannot resolve `./GroupPage`.

- [ ] **Step 3: Implement `SettleUpDialog.tsx`**

```tsx
// apps/web/src/pages/split/SettleUpDialog.tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Decimal } from '@everypaisa/shared';
import type { SplitGroupDto, SplitSettleMethodDto } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/api/client';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { cleanAmount } from './expenseForm';

const today = () => new Date().toISOString().slice(0, 10);
const MONEY = /^\d+(\.\d{1,2})?$/;

export function SettleUpDialog({ open, onOpenChange, group, from, to, amount }: {
  open: boolean; onOpenChange: (o: boolean) => void; group: SplitGroupDto; from?: string; to?: string; amount?: string;
}) {
  const qc = useQueryClient();
  const active = group.members.filter((m) => !m.leftAt);
  const me = active.find((m) => m.isMe);
  const [payer, setPayer] = useState('');
  const [receiver, setReceiver] = useState('');
  const [value, setValue] = useState('');
  const [method, setMethod] = useState<SplitSettleMethodDto>('CASH');
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPayer(from ?? me?.id ?? '');
    setReceiver(to ?? active.find((m) => m.id !== (from ?? me?.id))?.id ?? '');
    setValue(amount ? new Decimal(amount).toFixed(2).replace(/\.00$/, '') : '');
    setMethod('CASH');
    setDate(today());
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, from, to, amount]);

  const save = useMutation({
    mutationFn: () => splitApi.createSettlement({
      groupId: group.id, fromMemberId: payer, toMemberId: receiver, amount: cleanAmount(value),
      currency: group.baseCurrency, method, date,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
      toast.success('Payment recorded');
      onOpenChange(false);
    },
    onError: (err) => setError(apiErrorMessage(err, 'Could not record the payment')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = cleanAmount(value);
    if (payer === receiver) return setError('Pick two different people');
    if (!MONEY.test(v) || new Decimal(v).lte(0)) return setError('Enter an amount above 0 with at most 2 decimals');
    save.mutate();
  };

  const label = (id: string) => (active.find((m) => m.id === id)?.isMe ? 'You' : active.find((m) => m.id === id)?.displayName ?? '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Settle up</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="settle-from">Paid by</Label>
              <Select id="settle-from" value={payer} onChange={(e) => setPayer(e.target.value)}>
                {active.map((m) => <option key={m.id} value={m.id}>{label(m.id)}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settle-to">Paid to</Label>
              <Select id="settle-to" value={receiver} onChange={(e) => setReceiver(e.target.value)}>
                {active.map((m) => <option key={m.id} value={m.id}>{label(m.id)}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settle-amount">{`Amount (${group.baseCurrency})`}</Label>
            <Input id="settle-amount" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="settle-method">Method</Label>
              <Select id="settle-method" value={method} onChange={(e) => setMethod(e.target.value as SplitSettleMethodDto)}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settle-date">Date</Label>
              <Input id="settle-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>Record payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Implement `GroupPage.tsx`**

```tsx
// apps/web/src/pages/split/GroupPage.tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, HandCoins } from 'lucide-react';
import { Decimal, toDecimal, formatDateIST, formatDateTimeIST } from '@everypaisa/shared';
import type { SplitExpenseDto, SplitGroupDto } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiErrorMessage } from '@/api/client';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney, memberName, transferLabel } from '@/lib/splitFormat';
import { BalancePill } from './BalancePill';
import { AddExpenseDialog } from './AddExpenseDialog';
import { SettleUpDialog } from './SettleUpDialog';
import { ContactDialog } from './ContactDialog';
import { activityText } from './SplitHomePage';

export function myLine(e: SplitExpenseDto, myId: string | undefined, currency: string): string {
  if (!myId) return '';
  const paid = e.payers.filter((p) => p.memberId === myId).reduce((a, p) => a.plus(toDecimal(p.baseAmount)), new Decimal(0));
  const share = e.shares.filter((s) => s.memberId === myId).reduce((a, s) => a.plus(toDecimal(s.baseAmount)), new Decimal(0));
  const diff = paid.minus(share);
  if (diff.isZero()) return paid.isZero() ? 'not involved' : 'settled';
  return diff.gt(0) ? `you lent ${formatSplitMoney(diff, currency)}` : `you borrowed ${formatSplitMoney(diff, currency)}`;
}

function ExpensesTab({ group, expenses }: { group: SplitGroupDto; expenses: SplitExpenseDto[] }) {
  const me = group.members.find((m) => m.isMe);
  if (expenses.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No expenses yet.</p>;
  return (
    <Card><CardContent className="p-0 divide-y">
      {expenses.map((e) => (
        <Link key={e.id} to={`/split/expenses/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
          <div className="min-w-0">
            <p className="font-medium truncate">{e.description}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateIST(e.date)} · {e.payers.length === 1 ? `${memberName(group.members, e.payers[0]!.memberId)} paid` : `${e.payers.length} people paid`} {formatSplitMoney(e.amount, e.currency)}
            </p>
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">{myLine(e, me?.id, group.baseCurrency)}</span>
        </Link>
      ))}
    </CardContent></Card>
  );
}

function SettingsTab({ group }: { group: SplitGroupDto }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);
  const [addPerson, setAddPerson] = useState(false);
  const contacts = useQuery({ queryKey: SPLIT_KEYS.contacts, queryFn: splitApi.listContacts });
  const refresh = () => void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
  const onErr = (fallback: string) => (err: unknown) => toast.error(apiErrorMessage(err, fallback));

  const update = useMutation({ mutationFn: (p: Parameters<typeof splitApi.updateGroup>[1]) => splitApi.updateGroup(group.id, p), onSuccess: () => { refresh(); toast.success('Saved'); }, onError: onErr('Could not save') });
  const add = useMutation({ mutationFn: (contactId: string) => splitApi.addMember(group.id, contactId), onSuccess: refresh, onError: onErr('Could not add') });
  const remove = useMutation({ mutationFn: (memberId: string) => splitApi.removeMember(group.id, memberId), onSuccess: () => { refresh(); toast.success('Removed'); }, onError: onErr('Could not remove') });

  const direct = group.type === 'DIRECT';
  const memberContactIds = new Set(group.members.filter((m) => !m.leftAt).map((m) => m.contactId));
  const addable = (contacts.data ?? []).filter((c) => !memberContactIds.has(c.id));

  return (
    <div className="space-y-4">
      {!direct && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-name">Group name</Label>
            <div className="flex gap-2">
              <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="outline" onClick={() => update.mutate({ name: name.trim() })} disabled={!name.trim() || name.trim() === group.name}>Rename</Button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={group.simplifyDebts} onChange={(e) => update.mutate({ simplifyDebts: e.target.checked })} />
            Simplify debts (fewest payments to settle)
          </label>
          <p className="text-xs text-muted-foreground">Currency: {group.baseCurrency} (fixed once a group is created)</p>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0 divide-y">
        {group.members.filter((m) => !m.leftAt).map((m) => (
          <div key={m.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{m.isMe ? `${m.displayName} (you)` : m.displayName}{!m.userId && <span className="text-xs text-muted-foreground"> · not on the app yet</span>}</span>
            {!direct && <Button variant="ghost" size="sm" aria-label={`Remove ${m.isMe ? 'yourself' : m.displayName}`} onClick={() => remove.mutate(m.id)}>Remove</Button>}
          </div>
        ))}
      </CardContent></Card>
      {!direct && (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Add a person" value="" onChange={(e) => e.target.value && add.mutate(e.target.value)} className="w-56">
            <option value="">Add someone…</option>
            {addable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button variant="link" size="sm" onClick={() => setAddPerson(true)}>+ New person</Button>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => update.mutate({ archived: !group.archivedAt })}>
            {group.archivedAt ? 'Unarchive group' : 'Archive group'}
          </Button>
        </div>
      )}
      <ContactDialog open={addPerson} onOpenChange={setAddPerson} onSaved={(c) => add.mutate(c.id)} />
    </div>
  );
}

export function GroupPage() {
  const { id = '' } = useParams();
  const [adding, setAdding] = useState(false);
  const [settle, setSettle] = useState<{ from?: string; to?: string; amount?: string } | null>(null);
  const group = useQuery({ queryKey: SPLIT_KEYS.group(id), queryFn: () => splitApi.getGroup(id) });
  const expenses = useQuery({ queryKey: SPLIT_KEYS.expenses(id), queryFn: () => splitApi.listExpenses(id) });
  const balances = useQuery({ queryKey: SPLIT_KEYS.balances(id), queryFn: () => splitApi.balances(id) });
  const activity = useQuery({ queryKey: SPLIT_KEYS.activity(id), queryFn: () => splitApi.activity(id) });

  if (group.isError) return <p className="text-sm text-muted-foreground">This group doesn’t exist or you’re no longer in it. <Link className="underline" to="/split">Back to Split Expenses</Link></p>;
  if (!group.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const g = group.data;

  return (
    <div className="space-y-5">
      <Link to="/split" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Split Expenses</Link>
      <PageHeader
        title={g.name}
        description={g.type === 'DIRECT' ? 'Your 1:1 expenses' : `${g.members.filter((m) => !m.leftAt).length} people · ${g.baseCurrency}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setSettle({})}><HandCoins className="h-4 w-4 mr-1.5" />Settle up</Button>
            <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1.5" />Add expense</Button>
          </>
        }
      />
      <Card><CardContent className="p-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Your balance</span>
        <BalancePill net={g.myNet} currency={g.baseCurrency} className="text-base" />
      </CardContent></Card>

      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses" className="pt-3"><ExpensesTab group={g} expenses={expenses.data ?? []} /></TabsContent>
        <TabsContent value="balances" className="pt-3 space-y-3">
          <Card><CardContent className="p-0 divide-y">
            {(balances.data?.nets ?? []).filter((n) => !toDecimal(n.net).isZero() || !g.members.find((m) => m.id === n.memberId)?.leftAt).map((n) => (
              <div key={n.memberId} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{memberName(g.members, n.memberId)}</span>
                <BalancePill net={n.net} currency={g.baseCurrency} />
              </div>
            ))}
          </CardContent></Card>
          <h3 className="text-sm font-semibold">{balances.data?.simplified ? 'Suggested payments' : 'Who owes whom'}</h3>
          {(balances.data?.transfers ?? []).length === 0 && <p className="text-sm text-muted-foreground">Everyone is settled up.</p>}
          <Card><CardContent className="p-0 divide-y">
            {(balances.data?.transfers ?? []).map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm">{transferLabel(g.members, t, g.baseCurrency)}</span>
                <Button size="sm" variant="outline" onClick={() => setSettle({ from: t.fromMemberId, to: t.toMemberId, amount: t.amount })}>Settle</Button>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="activity" className="pt-3">
          <Card><CardContent className="p-0 divide-y">
            {(activity.data ?? []).map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-sm">{activityText(a)}</p>
                <p className="text-xs text-muted-foreground">{formatDateTimeIST(a.createdAt)}</p>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="settings" className="pt-3"><SettingsTab group={g} /></TabsContent>
      </Tabs>

      <AddExpenseDialog open={adding} onOpenChange={setAdding} group={g} />
      <SettleUpDialog open={settle !== null} onOpenChange={(o) => !o && setSettle(null)} group={g} {...(settle ?? {})} />
    </div>
  );
}
```

Add to `App.tsx`: `import { GroupPage } from './pages/split/GroupPage';` and route `<Route path="/split/groups/:id" element={<GroupPage />} />` after `/split`.

Confirm `formatDateIST` accepts a `YYYY-MM-DD` string (`packages/shared/src/format/date.ts:4`); if it renders a shifted day for date-only strings, pass `${e.date}T00:00:00+05:30` instead.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/pages/split && npx tsc --noEmit && npx eslint src/pages/split src/components/ui/tabs.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/split apps/web/src/App.tsx apps/web/src/components/ui/tabs.tsx
git commit -m "feat(split-web): group page with balances, settle up and members

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Expense detail and friend pages

**Files:**
- Create: `apps/web/src/pages/split/ExpenseDetailPage.tsx`
- Create: `apps/web/src/pages/split/FriendPage.tsx`
- Modify: `apps/web/src/App.tsx` (routes `/split/expenses/:id`, `/split/friends/:key`)
- Test: `apps/web/src/pages/split/FriendPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:
  - `export function ExpenseDetailPage()` — loads expense (`SPLIT_KEYS.expense(id)`) and its group; shows amount, date, currency + rate when foreign, payers, shares with each member's amount, created date; actions: Edit (opens `AddExpenseDialog` with `expense`), Delete (soft; toast with **Undo** that calls `restoreExpense`), Restore when deleted. Errors (e.g. 409 SPLIT_MEMBER_LEFT) via `toast.error(apiErrorMessage(err))`.
  - `export function FriendPage()` — reads `:key` (URL-decoded), finds the friend in `splitApi.friends()`, shows overall `BalancePill` (with `approx`), per-group rows linking to the group with each group's net; **Add expense** only when `friend.contactId` is set: calls `splitApi.directGroup(contactId, myDisplayName(user))`, then opens `AddExpenseDialog` for that group. `m:` friends show the note "Add expenses with {name} inside your shared groups."

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/pages/split/FriendPage.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { FriendPage } from './FriendPage';

const api = vi.hoisted(() => ({ friends: vi.fn(), directGroup: vi.fn(), createExpense: vi.fn() }));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { name: 'Alice' } }) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const FRIENDS = [
  { key: 'u:u2', displayName: 'Bob', userId: 'u2', contactId: 'c2', currency: 'INR', net: '70.0000', approx: true,
    groups: [{ groupId: 'g1', groupName: 'Goa trip', net: '50.0000', currency: 'INR' }, { groupId: 'g2', groupName: 'Bangkok', net: '0.2500', currency: 'USD' }] },
  { key: 'm:mx', displayName: 'Dev', userId: null, contactId: null, currency: 'INR', net: '-10.0000', approx: false,
    groups: [{ groupId: 'g1', groupName: 'Goa trip', net: '-10.0000', currency: 'INR' }] },
];

describe('FriendPage', () => {
  it('shows overall approx balance and per-group nets', async () => {
    api.friends.mockResolvedValue(FRIENDS);
    renderWithProviders(<FriendPage />, { route: '/split/friends/u%3Au2', path: '/split/friends/:key' });
    expect(await screen.findByText('owes you ≈ ₹70.00')).toBeTruthy();
    expect(screen.getByText('Goa trip')).toBeTruthy();
    expect(screen.getByText('owes you $0.25')).toBeTruthy();
  });

  it('add expense opens the 1:1 ledger', async () => {
    api.friends.mockResolvedValue(FRIENDS);
    api.directGroup.mockResolvedValue({ id: 'd1', name: 'Bob', type: 'DIRECT', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, myNet: '0.0000',
      members: [{ id: 'a', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null }, { id: 'b', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null }] });
    renderWithProviders(<FriendPage />, { route: '/split/friends/u%3Au2', path: '/split/friends/:key' });
    fireEvent.click(await screen.findByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(api.directGroup).toHaveBeenCalledWith('c2', 'Alice'));
    expect(await screen.findByRole('heading', { name: 'Add expense' })).toBeTruthy();
  });

  it('someone else’s placeholder has no 1:1 add', async () => {
    api.friends.mockResolvedValue(FRIENDS);
    renderWithProviders(<FriendPage />, { route: '/split/friends/m%3Amx', path: '/split/friends/:key' });
    expect(await screen.findByText('Add expenses with Dev inside your shared groups.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add expense' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/pages/split/FriendPage.test.tsx`
Expected: FAIL — cannot resolve `./FriendPage`.

- [ ] **Step 3: Implement `FriendPage.tsx`**

```tsx
// apps/web/src/pages/split/FriendPage.tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus } from 'lucide-react';
import type { SplitGroupDto } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { useAuthStore } from '@/stores/auth.store';
import { BalancePill } from './BalancePill';
import { AddExpenseDialog } from './AddExpenseDialog';
import { myDisplayName } from './NewGroupDialog';

export function FriendPage() {
  const { key: rawKey = '' } = useParams();
  const key = decodeURIComponent(rawKey);
  const user = useAuthStore((s: { user: { name?: string | null } | null }) => s.user);
  const friends = useQuery({ queryKey: SPLIT_KEYS.friends, queryFn: splitApi.friends });
  const [direct, setDirect] = useState<SplitGroupDto | null>(null);

  const open1to1 = useMutation({
    mutationFn: (contactId: string) => splitApi.directGroup(contactId, myDisplayName(user)),
    onSuccess: (g) => setDirect(g),
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not open your 1:1 expenses')),
  });

  if (!friends.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const friend = friends.data.find((f) => f.key === key);
  if (!friend) return <p className="text-sm text-muted-foreground">No balances with this person. <Link className="underline" to="/split">Back</Link></p>;

  return (
    <div className="space-y-5">
      <Link to="/split" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Split Expenses</Link>
      <PageHeader
        title={friend.displayName}
        actions={friend.contactId ? (
          <Button onClick={() => open1to1.mutate(friend.contactId!)} disabled={open1to1.isPending}><Plus className="h-4 w-4 mr-1.5" />Add expense</Button>
        ) : undefined}
      />
      <Card><CardContent className="p-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Overall</span>
        <BalancePill net={friend.net} currency={friend.currency} approx={friend.approx} className="text-base" />
      </CardContent></Card>
      {friend.approx && <p className="text-xs text-muted-foreground">Includes groups in other currencies, converted at the latest rate.</p>}
      {!friend.contactId && <p className="text-sm text-muted-foreground">{`Add expenses with ${friend.displayName} inside your shared groups.`}</p>}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">By group</h2>
        <Card><CardContent className="p-0 divide-y">
          {friend.groups.map((g) => (
            <Link key={g.groupId} to={`/split/groups/${g.groupId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
              <span className="text-sm truncate">{g.groupName}</span>
              <BalancePill net={g.net} currency={g.currency} />
            </Link>
          ))}
        </CardContent></Card>
      </section>
      {direct && <AddExpenseDialog open onOpenChange={(o) => !o && setDirect(null)} group={direct} />}
    </div>
  );
}
```

Note: a DIRECT group's `name` is the friend's name, so it also appears in "By group" once it has a balance.

- [ ] **Step 4: Implement `ExpenseDetailPage.tsx`**

```tsx
// apps/web/src/pages/split/ExpenseDetailPage.tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { formatDateIST, formatDateTimeIST } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney, memberName } from '@/lib/splitFormat';
import { AddExpenseDialog } from './AddExpenseDialog';

const MODE_LABEL = { EQUAL: 'Split equally', EXACT: 'Exact amounts', PERCENT: 'By percent', SHARES: 'By shares' } as const;

export function ExpenseDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const expense = useQuery({ queryKey: SPLIT_KEYS.expense(id), queryFn: () => splitApi.getExpense(id) });
  const groupId = expense.data?.groupId ?? '';
  const group = useQuery({ queryKey: SPLIT_KEYS.group(groupId), queryFn: () => splitApi.getGroup(groupId), enabled: !!groupId });
  const refresh = () => void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });

  const restore = useMutation({
    mutationFn: () => splitApi.restoreExpense(id),
    onSuccess: () => { refresh(); toast.success('Expense restored'); },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not restore')),
  });
  const remove = useMutation({
    mutationFn: () => splitApi.deleteExpense(id),
    onSuccess: () => {
      refresh();
      toast((t) => (
        <span className="flex items-center gap-3">Expense deleted
          <button className="underline" onClick={() => { toast.dismiss(t.id); restore.mutate(); }}>Undo</button>
        </span>
      ));
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not delete')),
  });

  if (expense.isError) return <p className="text-sm text-muted-foreground">This expense isn’t available. <Link className="underline" to="/split">Back</Link></p>;
  if (!expense.data || !group.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const e = expense.data;
  const g = group.data;
  const foreign = e.currency !== g.baseCurrency;

  return (
    <div className="space-y-5">
      <Link to={`/split/groups/${g.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{g.name}</Link>
      <PageHeader
        title={e.description}
        description={`${formatDateIST(e.date)} · ${MODE_LABEL[e.splitMode]}${e.deletedAt ? ' · deleted' : ''}`}
        actions={e.deletedAt ? (
          <Button onClick={() => restore.mutate()}><RotateCcw className="h-4 w-4 mr-1.5" />Restore</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-1.5" />Edit</Button>
            <Button variant="destructive" onClick={() => remove.mutate()}><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button>
          </>
        )}
      />
      <Card><CardContent className="p-4">
        <p className="text-3xl font-semibold tabular-nums">{formatSplitMoney(e.amount, e.currency)}</p>
        {foreign && <p className="text-sm text-muted-foreground mt-1">= {formatSplitMoney(e.baseAmount, g.baseCurrency)} at 1 {e.currency} = {e.fxRate} {g.baseCurrency}</p>}
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="p-0 divide-y">
          <p className="px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">Paid by</p>
          {e.payers.map((p) => (
            <div key={p.memberId} className="flex justify-between px-4 py-2.5 text-sm">
              <span>{memberName(g.members, p.memberId)}</span><span className="tabular-nums">{formatSplitMoney(p.amount, e.currency)}</span>
            </div>
          ))}
        </CardContent></Card>
        <Card><CardContent className="p-0 divide-y">
          <p className="px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">Split between</p>
          {e.shares.map((s) => (
            <div key={s.memberId} className="flex justify-between px-4 py-2.5 text-sm">
              <span>{memberName(g.members, s.memberId)}</span><span className="tabular-nums">{formatSplitMoney(s.amount, e.currency)}</span>
            </div>
          ))}
        </CardContent></Card>
      </div>
      <p className="text-xs text-muted-foreground">Added {formatDateTimeIST(e.createdAt)}</p>
      <AddExpenseDialog open={editing} onOpenChange={setEditing} group={g} expense={e} />
    </div>
  );
}
```

Add to `App.tsx`: imports for `ExpenseDetailPage` and `FriendPage`, and routes:

```tsx
        <Route path="/split/expenses/:id" element={<ExpenseDetailPage />} />
        <Route path="/split/friends/:key" element={<FriendPage />} />
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/pages/split && npx tsc --noEmit && npx eslint src/pages/split`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/split apps/web/src/App.tsx
git commit -m "feat(split-web): expense detail and friend pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Run it for real — browser check at phone and desktop width

**Files:** fixes only, wherever the check finds problems (each fix gets a test where testable).

- [ ] **Step 1: Start the API and web app against the isolated DB**

Use the exports from `.superpowers/sdd/2026-10-07-split-expenses-01-core/env.md`. Find the API's dev script and required env in `packages/api/package.json` and `packages/api/src/config/env.ts` (JWT_SECRET, SECRETS_KEY, APP_ENCRYPTION_KEY — use the test defaults from `packages/api/test/helpers/env.setup.ts`; a Redis URL may be needed — if Redis is required and not running, report BLOCKED rather than starting new infrastructure). Start the API on a free port, start the web app (`pnpm --filter @everypaisa/web dev`) pointed at that API (check `apps/web/src/api/baseUrl.ts` / `VITE_API_URL`). Record the PIDs you start; stop only those PIDs at the end.

- [ ] **Step 2: Walk the flow with Playwright (MCP browser tools) at 1280×800**

Register two users (A and B) through the app's signup (if signup requires an emailed code, insert users with `runAsSystem`-style SQL is NOT allowed — instead use the API's existing test signup path or report NEEDS_CONTEXT). As A: open Tools → Split Expenses; add person "Bob" (B's email); create group "Goa trip" with Bob and a placeholder "Ravi"; add expense ₹3,000 equal; add expense $20 USD at rate 83.10 split by shares 2:1:1; open Balances; settle Ravi → A for the suggested amount; open the expense detail, edit amount, delete, Undo; open Friends → Bob; Add expense in the 1:1 ledger. Screenshot every page section (scroll the full page).

- [ ] **Step 3: Repeat at 375×812**

Same pages. Check: no horizontal scroll (`document.documentElement.scrollWidth <= window.innerWidth`), dialogs scroll inside the viewport, tab bars fit, balance pills don't overflow, header actions wrap.

- [ ] **Step 4: Fix and re-check**

For each problem: write a failing component test when the behaviour is testable in jsdom, fix, re-run `npx vitest run src/pages/split`, re-check in the browser. Commit fixes as `fix(split-web): <what>` with the trailer.

- [ ] **Step 5: Full verification**

```bash
pnpm -r run typecheck
pnpm -r run lint
pnpm -r run build
pnpm --filter @everypaisa/web test
pnpm --filter @everypaisa/api test -- test/split test/routes/split.routes.test.ts test/invariants/split-rls.test.ts
```

Expected: build exit 0; web + split API tests green. Typecheck/lint may still exit non-zero only for the pre-existing main errors recorded in Plan 1 (`scripts/backfillRentalLedger.ts` TS2322; 5 lint errors in mf* files) — any other error is ours and must be fixed.

- [ ] **Step 6: Report**

Write the screenshot paths, the checks run, fixes made, and anything not verified to the task report. Do not push.
