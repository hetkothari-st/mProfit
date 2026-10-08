import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup, addMember, removeMember } from '../../src/services/split/groups.service.js';
import { createExpense, deleteExpense, restoreExpense, updateExpense } from '../../src/services/split/expenses.service.js';
import { createSettlement, deleteSettlement } from '../../src/services/split/settlements.service.js';

describe('left members keep a zero balance', () => {
  let alice: TestScope;
  let contactId: string;
  let groupId: string;
  let a: string;
  let b: string;

  const exp = () => ({
    groupId, description: 'Dinner', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL' as const,
    payers: [{ memberId: a, amount: '100' }], shares: [{ memberId: a }, { memberId: b }],
  });

  beforeAll(async () => {
    alice = await createTestScope('split-left-a');
    contactId = (await seedContact(alice.userId, 'Ravi')).id;
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'L', myDisplayName: 'Alice', contactIds: [contactId] }));
    groupId = g.id;
    a = g.members.find((m) => m.isMe)!.id;
    b = g.members.find((m) => !m.isMe)!.id;
  });
  afterAll(async () => {
    await cleanupSplit([alice.userId]);
    await alice.cleanup();
  });

  it('blocks changes that would strand a left member, until they are re-added', async () => {
    const e1 = await alice.runAs(() => createExpense(alice.userId, exp()));
    const e2 = await alice.runAs(() => createExpense(alice.userId, exp()));
    const s = await alice.runAs(() => createSettlement(alice.userId, { groupId, fromMemberId: b, toMemberId: a, amount: '50', method: 'CASH', date: '2026-10-02' }));
    // e1 deleted + e2 settled by 50 → Bob nets zero.
    await alice.runAs(() => deleteExpense(alice.userId, e1.id));
    await alice.runAs(() => removeMember(alice.userId, groupId, b));

    await expect(alice.runAs(() => restoreExpense(alice.userId, e1.id))).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/^SPLIT_MEMBER_LEFT: re-add Ravi/) });
    await expect(alice.runAs(() => deleteSettlement(alice.userId, s.id))).rejects.toMatchObject({ statusCode: 409 });
    await expect(alice.runAs(() => deleteExpense(alice.userId, e2.id))).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      alice.runAs(() => updateExpense(alice.userId, e2.id, { ...exp(), amount: '80', payers: [{ memberId: a, amount: '80' }], shares: [{ memberId: a }] })),
    ).rejects.toMatchObject({ statusCode: 409 });

    const back = await alice.runAs(() => addMember(alice.userId, groupId, contactId));
    expect(back.id).toBe(b);
    expect(back.leftAt).toBeNull();
    const restored = await alice.runAs(() => restoreExpense(alice.userId, e1.id));
    expect(restored.deletedAt).toBeNull();
  });
});
