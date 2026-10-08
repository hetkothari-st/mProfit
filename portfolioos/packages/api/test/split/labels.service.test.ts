import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense, getExpense } from '../../src/services/split/expenses.service.js';
import { listLabels, createLabel, deleteLabel, setExpenseLabels } from '../../src/services/split/labels.service.js';

describe('split labels', () => {
  let alice: TestScope; let eve: TestScope; let groupId: string; let otherGroupId: string; let expenseId: string;
  beforeAll(async () => {
    alice = await createTestScope('split-lab-a'); eve = await createTestScope('split-lab-e');
    const c = await seedContact(alice.userId, 'Ravi');
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Flat', myDisplayName: 'Alice', contactIds: [c.id] }));
    const g2 = await alice.runAs(() => createGroup(alice.userId, { name: 'Other', myDisplayName: 'Alice' }));
    groupId = g.id; otherGroupId = g2.id;
    const me = g.members.find((m) => m.isMe)!.id;
    expenseId = (await alice.runAs(() => createExpense(alice.userId, { groupId, description: 'Milk', date: '2026-10-01', amount: '60', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: me, amount: '60' }], shares: g.members.map((m) => ({ memberId: m.id })) }))).id;
  });
  afterAll(async () => { await cleanupSplit([alice.userId]); await alice.cleanup(); await eve.cleanup(); });

  it('seeds defaults once', async () => {
    const first = await alice.runAs(() => listLabels(alice.userId, groupId));
    expect(first.map((l) => l.name)).toEqual(['Food', 'Travel', 'Rent', 'Groceries', 'Utilities', 'Entertainment', 'Other']);
    const again = await alice.runAs(() => listLabels(alice.userId, groupId));
    expect(again).toHaveLength(7);
  });

  it('creates, rejects duplicates and bad colours', async () => {
    const l = await alice.runAs(() => createLabel(alice.userId, groupId, { name: 'Wifi', color: '#123456' }));
    expect(l.name).toBe('Wifi');
    await expect(alice.runAs(() => createLabel(alice.userId, groupId, { name: 'wifi', color: '#123456' }))).rejects.toThrow(/already/i);
    await expect(alice.runAs(() => createLabel(alice.userId, groupId, { name: 'X', color: 'red' }))).rejects.toThrow(/colour|color/i);
  });

  it('labels an expense; DTO shows labelIds; cross-group label rejected', async () => {
    const [food] = await alice.runAs(() => listLabels(alice.userId, groupId));
    const ids = await alice.runAs(() => setExpenseLabels(alice.userId, expenseId, [food!.id]));
    expect(ids).toEqual([food!.id]);
    expect((await alice.runAs(() => getExpense(alice.userId, expenseId))).labelIds).toEqual([food!.id]);
    const [foreign] = await alice.runAs(() => listLabels(alice.userId, otherGroupId));
    await expect(alice.runAs(() => setExpenseLabels(alice.userId, expenseId, [foreign!.id]))).rejects.toThrow(/another group/);
  });

  it('outsider gets 404', async () => {
    await expect(eve.runAs(() => listLabels(eve.userId, groupId))).rejects.toThrow(/not found/i);
    await expect(eve.runAs(() => setExpenseLabels(eve.userId, expenseId, []))).rejects.toThrow(/not found/i);
  });

  it('deleting a label removes it from expenses', async () => {
    const l = await alice.runAs(() => createLabel(alice.userId, groupId, { name: 'Temp', color: '#000000' }));
    await alice.runAs(() => setExpenseLabels(alice.userId, expenseId, [l.id]));
    await alice.runAs(() => deleteLabel(alice.userId, l.id));
    expect((await alice.runAs(() => getExpense(alice.userId, expenseId))).labelIds).toEqual([]);
  });
});
