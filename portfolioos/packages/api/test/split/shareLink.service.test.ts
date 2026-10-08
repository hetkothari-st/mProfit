import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense, updateExpense, deleteExpense, restoreExpense } from '../../src/services/split/expenses.service.js';
import { getShareLink, setShareLink, reconcileAllShareLinks } from '../../src/services/split/shareLink.service.js';

describe('split share → Cash Activity', () => {
  let alice: TestScope; let bob: TestScope; let groupId: string; let a: string; let b: string; let expenseId: string;
  const cashFlowFor = (id: string | null) => runAsSystem(() => (id ? prisma.cashFlow.findUnique({ where: { id } }) : Promise.resolve(null)));

  beforeAll(async () => {
    alice = await createTestScope('split-sl-a'); bob = await createTestScope('split-sl-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Flat', myDisplayName: 'Alice', contactIds: [cb.id] }));
    groupId = g.id; a = g.members.find((m) => m.isMe)!.id; b = g.members.find((m) => !m.isMe)!.id;
    expenseId = (await alice.runAs(() => createExpense(alice.userId, { groupId, description: 'Rent', date: '2026-10-01', amount: '1000', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: b, amount: '1000' }], shares: [{ memberId: a }, { memberId: b }] }))).id;
  });
  afterAll(async () => {
    await runAsSystem(() => prisma.splitShareLink.deleteMany({ where: { userId: { in: [alice.userId, bob.userId] } } }));
    await cleanupSplit([alice.userId, bob.userId]); await alice.cleanup(); await bob.cleanup();
  });

  it('needs a portfolio, then creates an OUTFLOW of my share', async () => {
    await expect(alice.runAs(() => setShareLink(alice.userId, expenseId, { enabled: true }))).rejects.toThrow(/portfolio/i);
    const l = await alice.runAs(() => setShareLink(alice.userId, expenseId, { enabled: true, portfolioId: alice.portfolioId }));
    expect(l).toMatchObject({ enabled: true, myShare: '500.0000', currency: 'INR' });
    const cf = await cashFlowFor(l.cashFlowId);
    expect(cf).toMatchObject({ type: 'OUTFLOW', portfolioId: alice.portfolioId, description: 'Split: Rent (Flat)' });
    expect(cf!.amount.toString()).toBe('500');
  });

  it("rejects someone else's portfolio", async () => {
    await expect(bob.runAs(() => setShareLink(bob.userId, expenseId, { enabled: true, portfolioId: alice.portfolioId }))).rejects.toThrow(/portfolio/i);
  });

  it('co-member edit syncs my cash flow; delete removes it; restore brings it back', async () => {
    await bob.runAs(() => updateExpense(bob.userId, expenseId, { description: 'Rent Oct', date: '2026-10-01', amount: '1200', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: b, amount: '1200' }], shares: [{ memberId: a }, { memberId: b }] }));
    let l = await alice.runAs(() => getShareLink(alice.userId, expenseId));
    expect((await cashFlowFor(l.cashFlowId))!.amount.toString()).toBe('600');
    await bob.runAs(() => deleteExpense(bob.userId, expenseId));
    l = await alice.runAs(() => getShareLink(alice.userId, expenseId));
    expect(l.cashFlowId).toBeNull();
    expect(l.enabled).toBe(true);
    await bob.runAs(() => restoreExpense(bob.userId, expenseId));
    l = await alice.runAs(() => getShareLink(alice.userId, expenseId));
    expect((await cashFlowFor(l.cashFlowId))!.amount.toString()).toBe('600');
  });

  it('disable removes the cash flow and the link', async () => {
    const before = await alice.runAs(() => getShareLink(alice.userId, expenseId));
    const l = await alice.runAs(() => setShareLink(alice.userId, expenseId, { enabled: false }));
    expect(l.enabled).toBe(false);
    expect(await cashFlowFor(before.cashFlowId)).toBeNull();
  });

  it('reconcile repairs a drifted cash flow', async () => {
    const l = await alice.runAs(() => setShareLink(alice.userId, expenseId, { enabled: true, portfolioId: alice.portfolioId }));
    await runAsSystem(() => prisma.cashFlow.update({ where: { id: l.cashFlowId! }, data: { amount: '1' } }));
    const r = await runAsSystem(() => reconcileAllShareLinks());
    expect(r.fixed).toBeGreaterThanOrEqual(1);
    expect((await cashFlowFor(l.cashFlowId))!.amount.toString()).toBe('600');
  });
});
