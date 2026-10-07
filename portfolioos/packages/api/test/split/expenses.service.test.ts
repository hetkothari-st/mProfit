// packages/api/test/split/expenses.service.test.ts
import { Decimal } from 'decimal.js';
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

  it('rejects zero payer amounts', async () => {
    await expect(
      alice.runAs(() => createExpense(alice.userId, { ...base(), payers: [{ memberId: me, amount: '100' }, { memberId: b, amount: '0' }] })),
    ).rejects.toThrow(/SPLIT_BAD_INPUT/);
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
    expect(e.shares.reduce((a, s) => a.plus(s.baseAmount), new Decimal(0)).toFixed(2)).toBe('831.23');
  });

  it('rejects an fx override when currency equals the group base', async () => {
    await expect(alice.runAs(() => createExpense(alice.userId, { ...base(), fxRate: '2' }))).rejects.toThrow(/SPLIT_BAD_INPUT/);
  });

  it('rounds the fx override to 8 dp and uses the rounded rate', async () => {
    const e = await alice.runAs(() =>
      createExpense(alice.userId, { ...base(), amount: '10', currency: 'USD', fxRate: '83.123456789', payers: [{ memberId: me, amount: '10' }] }),
    );
    expect(e.fxRate).toBe('83.12345679');
    expect(e.baseAmount).toBe('831.2300');
  });

  it('rejects zero and over-precise amounts', async () => {
    await expect(alice.runAs(() => createExpense(alice.userId, { ...base(), amount: '0', payers: [{ memberId: me, amount: '0' }] }))).rejects.toThrow(/SPLIT_BAD_INPUT/);
    await expect(alice.runAs(() => createExpense(alice.userId, { ...base(), amount: '100.005', payers: [{ memberId: me, amount: '100' }] }))).rejects.toThrow(/SPLIT_BAD_INPUT/);
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
