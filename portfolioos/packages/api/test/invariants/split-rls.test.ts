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
