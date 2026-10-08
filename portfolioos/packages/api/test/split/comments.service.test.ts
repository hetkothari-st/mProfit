import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { listComments, addComment, deleteComment } from '../../src/services/split/comments.service.js';

describe('split comments', () => {
  let alice: TestScope; let bob: TestScope; let eve: TestScope; let expenseId: string;
  beforeAll(async () => {
    alice = await createTestScope('split-com-a'); bob = await createTestScope('split-com-b'); eve = await createTestScope('split-com-e');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Trip', myDisplayName: 'Alice', contactIds: [cb.id] }));
    const me = g.members.find((m) => m.isMe)!.id;
    expenseId = (await alice.runAs(() => createExpense(alice.userId, { groupId: g.id, description: 'Hotel', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: me, amount: '100' }], shares: g.members.map((m) => ({ memberId: m.id })) }))).id;
  });
  afterAll(async () => { await cleanupSplit([alice.userId, bob.userId]); await alice.cleanup(); await bob.cleanup(); await eve.cleanup(); });

  it('members comment and read in order with names', async () => {
    await alice.runAs(() => addComment(alice.userId, expenseId, '  Paid by card  '));
    await bob.runAs(() => addComment(bob.userId, expenseId, 'Thanks!'));
    const list = await bob.runAs(() => listComments(bob.userId, expenseId));
    expect(list.map((c) => [c.authorName, c.body, c.mine])).toEqual([['Alice', 'Paid by card', false], ['Bob', 'Thanks!', true]]);
  });

  it('rejects empty and over-long bodies', async () => {
    await expect(alice.runAs(() => addComment(alice.userId, expenseId, '   '))).rejects.toThrow(/comment/i);
    await expect(alice.runAs(() => addComment(alice.userId, expenseId, 'x'.repeat(1001)))).rejects.toThrow(/1000/);
  });

  it('only the author deletes', async () => {
    const c = await alice.runAs(() => addComment(alice.userId, expenseId, 'mine'));
    await expect(bob.runAs(() => deleteComment(bob.userId, c.id))).rejects.toThrow(/author/i);
    await alice.runAs(() => deleteComment(alice.userId, c.id));
    expect((await alice.runAs(() => listComments(alice.userId, expenseId))).find((x) => x.id === c.id)).toBeUndefined();
  });

  it('outsider gets 404', async () => {
    await expect(eve.runAs(() => listComments(eve.userId, expenseId))).rejects.toThrow(/not found/i);
    await expect(eve.runAs(() => addComment(eve.userId, expenseId, 'hi'))).rejects.toThrow(/not found/i);
  });
});
