import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { createSettlement, deleteSettlement, updateSettlement } from '../../src/services/split/settlements.service.js';
import { groupBalances, listFriends, listActivity } from '../../src/services/split/ledger.service.js';

describe('split settlements and balances', () => {
  let alice: TestScope;
  let bob: TestScope;
  let groupId: string;
  let a: string;
  let b: string;
  let c: string;
  let chetanContactId: string;

  beforeAll(async () => {
    alice = await createTestScope('split-set-a');
    bob = await createTestScope('split-set-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const cc = await seedContact(alice.userId, 'Chetan');
    chetanContactId = cc.id;
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
    expect(fa.find((f) => f.key === `c:${chetanContactId}`)?.net).toBe('130.0000');
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

  it('rejects editing a soft-deleted settlement', async () => {
    const s = await bob.runAs(() => createSettlement(bob.userId, { groupId, fromMemberId: b, toMemberId: a, amount: '5', method: 'CASH', date: '2026-10-04' }));
    await bob.runAs(() => deleteSettlement(bob.userId, s.id));
    await expect(bob.runAs(() => updateSettlement(bob.userId, s.id, { fromMemberId: b, toMemberId: a, amount: '6', method: 'CASH', date: '2026-10-04' }))).rejects.toThrow(/restore/i);
  });

  it('validates activity before cursor and clamps limit', async () => {
    await expect(alice.runAs(() => listActivity(alice.userId, { groupId, before: 'garbage' }))).rejects.toThrow(/before/i);
    const zero = await alice.runAs(() => listActivity(alice.userId, { groupId, limit: 0 }));
    expect(zero.length).toBeGreaterThanOrEqual(1);
    const neg = await alice.runAs(() => listActivity(alice.userId, { groupId, limit: -5 }));
    expect(neg.length).toBeGreaterThanOrEqual(1);
    expect(neg[0]!.createdAt >= neg[neg.length - 1]!.createdAt).toBe(true);
  });
});
