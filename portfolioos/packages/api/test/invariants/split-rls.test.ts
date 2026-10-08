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
  let aliceMemberId: string;
  let commentId: string;
  let settlementId: string;
  let activityId: string;
  let labelId: string;
  let group2Id: string;

  /** Rows affected by a write that RLS may reject (throws) or filter (count 0). */
  const affected = async (fn: () => Promise<{ count: number }>): Promise<number> => {
    try {
      return (await fn()).count;
    } catch {
      return 0;
    }
  };

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
      aliceMemberId = a.id;
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
      commentId = (await prisma.splitComment.create({ data: { expenseId, authorUserId: alice.userId, body: 'hi' } })).id;
      settlementId = (await prisma.splitSettlement.create({
        data: { groupId, fromMemberId: b.id, toMemberId: a.id, amount: '10', currency: 'INR', fxRate: '1',
          baseAmount: '10', method: 'CASH', date: new Date('2026-10-02'), createdById: alice.userId },
      })).id;
      activityId = (await prisma.splitActivity.create({
        data: { groupId, actorUserId: alice.userId, kind: 'expense.created', payload: {} },
      })).id;
      labelId = (await prisma.splitLabel.create({ data: { groupId, name: 'food', color: '#fff' } })).id;
      await prisma.splitExpenseLabel.create({ data: { expenseId, labelId } });
    });
    await bob.runAs(async () => {
      group2Id = (await prisma.splitGroup.create({ data: { name: 'Other', createdById: bob.userId } })).id;
      await prisma.splitMember.create({ data: { groupId: group2Id, userId: bob.userId, displayName: 'Bob' } });
    });
  });

  afterAll(async () => {
    await runAsSystem(() => prisma.splitGroup.deleteMany({ where: { id: { in: [groupId, group2Id] } } }));
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

  it('outsider can neither read nor write any group table', async () => {
    await eve.runAs(async () => {
      expect(await prisma.splitGroup.findUnique({ where: { id: groupId } })).toBeNull();
      expect(await prisma.splitMember.findUnique({ where: { id: bobMemberId } })).toBeNull();
      expect(await prisma.splitExpense.findUnique({ where: { id: expenseId } })).toBeNull();
      expect(await prisma.splitPayer.findFirst({ where: { expenseId } })).toBeNull();
      expect(await prisma.splitShare.findFirst({ where: { expenseId } })).toBeNull();
      expect(await prisma.splitComment.findUnique({ where: { id: commentId } })).toBeNull();
      expect(await prisma.splitSettlement.findUnique({ where: { id: settlementId } })).toBeNull();
      expect(await prisma.splitActivity.findUnique({ where: { id: activityId } })).toBeNull();
      expect(await prisma.splitLabel.findUnique({ where: { id: labelId } })).toBeNull();
      expect(await prisma.splitExpenseLabel.findFirst({ where: { expenseId } })).toBeNull();

      expect(await prisma.splitGroup.updateMany({ where: { id: groupId }, data: { name: 'x' } })).toEqual({ count: 0 });
      expect(await prisma.splitMember.updateMany({ where: { groupId }, data: { displayName: 'x' } })).toEqual({ count: 0 });
      expect(await prisma.splitExpense.updateMany({ where: { id: expenseId }, data: { description: 'x' } })).toEqual({ count: 0 });
      expect(await prisma.splitPayer.updateMany({ where: { expenseId }, data: { amount: '1' } })).toEqual({ count: 0 });
      expect(await prisma.splitShare.updateMany({ where: { expenseId }, data: { amount: '1' } })).toEqual({ count: 0 });
      expect(await prisma.splitComment.updateMany({ where: { id: commentId }, data: { body: 'x' } })).toEqual({ count: 0 });
      expect(await prisma.splitSettlement.updateMany({ where: { id: settlementId }, data: { method: 'UPI' } })).toEqual({ count: 0 });
      expect(await prisma.splitActivity.updateMany({ where: { id: activityId }, data: { kind: 'x' } })).toEqual({ count: 0 });
      expect(await prisma.splitLabel.updateMany({ where: { id: labelId }, data: { name: 'x' } })).toEqual({ count: 0 });

      expect(await prisma.splitGroup.deleteMany({ where: { id: groupId } })).toEqual({ count: 0 });
      expect(await prisma.splitMember.deleteMany({ where: { groupId } })).toEqual({ count: 0 });
      expect(await prisma.splitExpense.deleteMany({ where: { id: expenseId } })).toEqual({ count: 0 });
      expect(await prisma.splitPayer.deleteMany({ where: { expenseId } })).toEqual({ count: 0 });
      expect(await prisma.splitShare.deleteMany({ where: { expenseId } })).toEqual({ count: 0 });
      expect(await prisma.splitComment.deleteMany({ where: { id: commentId } })).toEqual({ count: 0 });
      expect(await prisma.splitSettlement.deleteMany({ where: { id: settlementId } })).toEqual({ count: 0 });
      expect(await prisma.splitActivity.deleteMany({ where: { id: activityId } })).toEqual({ count: 0 });
      expect(await prisma.splitLabel.deleteMany({ where: { id: labelId } })).toEqual({ count: 0 });
      expect(await prisma.splitExpenseLabel.deleteMany({ where: { expenseId } })).toEqual({ count: 0 });
    });
    // Nothing was touched.
    const still = await runAsSystem(async () => ({
      g: await prisma.splitGroup.findUniqueOrThrow({ where: { id: groupId } }),
      m: await prisma.splitMember.count({ where: { groupId } }),
      l: await prisma.splitExpenseLabel.count({ where: { expenseId } }),
    }));
    expect(still.g.name).toBe('Goa');
    expect(still.m).toBe(2);
    expect(still.l).toBe(1);
  });

  it('detections, share links and settings are owner-only', async () => {
    const ids = await alice.runAs(async () => ({
      d: (await prisma.splitDetection.create({ data: { userId: alice.userId, source: 'PASTE', sourceHash: 'h-' + alice.userId,
        amount: '5', direction: 'DEBIT', date: new Date('2026-10-01') } })).id,
      l: (await prisma.splitShareLink.create({ data: { expenseId, userId: alice.userId, cashFlowId: 'cf1' } })).id,
      s: (await prisma.splitSettings.create({ data: { userId: alice.userId } })).userId,
    }));
    await bob.runAs(async () => {
      expect(await prisma.splitDetection.findUnique({ where: { id: ids.d } })).toBeNull();
      expect(await prisma.splitShareLink.findUnique({ where: { id: ids.l } })).toBeNull();
      expect(await prisma.splitSettings.findUnique({ where: { userId: ids.s } })).toBeNull();
      expect(await prisma.splitDetection.updateMany({ where: { id: ids.d }, data: { status: 'DISMISSED' } })).toEqual({ count: 0 });
      expect(await prisma.splitShareLink.deleteMany({ where: { id: ids.l } })).toEqual({ count: 0 });
      expect(await prisma.splitSettings.updateMany({ where: { userId: ids.s }, data: { upiId: 'x' } })).toEqual({ count: 0 });
    });
    await bob.runAs(async () => {
      await expect(prisma.splitSettings.create({ data: { userId: alice.userId } })).rejects.toThrow();
    });
    await runAsSystem(async () => {
      await prisma.splitDetection.deleteMany({ where: { id: ids.d } });
      await prisma.splitShareLink.deleteMany({ where: { id: ids.l } });
      await prisma.splitSettings.deleteMany({ where: { userId: ids.s } });
    });
  });

  it('a creator who left cannot rejoin by flipping leftAt', async () => {
    await runAsSystem(() => prisma.splitMember.update({ where: { id: aliceMemberId }, data: { leftAt: new Date() } }));
    await alice.runAs(async () => {
      expect(await affected(() => prisma.splitMember.updateMany({ where: { id: aliceMemberId }, data: { leftAt: null } }))).toBe(0);
    });
    const row = await runAsSystem(() => prisma.splitMember.findUniqueOrThrow({ where: { id: aliceMemberId } }));
    expect(row.leftAt).not.toBeNull();
    await runAsSystem(() => prisma.splitMember.update({ where: { id: aliceMemberId }, data: { leftAt: null } }));
  });

  it('a creator whose row was removed cannot re-insert herself', async () => {
    await runAsSystem(() => prisma.splitMember.delete({ where: { id: aliceMemberId } }));
    await alice.runAs(async () => {
      await expect(
        prisma.splitMember.create({ data: { groupId, userId: alice.userId, displayName: 'Alice' } }),
      ).rejects.toThrow();
    });
    await runAsSystem(() =>
      prisma.splitMember.create({ data: { id: aliceMemberId, groupId, userId: alice.userId, displayName: 'Alice' } }),
    );
  });

  it('a left member cannot delete or reactivate their own member row', async () => {
    await runAsSystem(() => prisma.splitMember.update({ where: { id: bobMemberId }, data: { leftAt: new Date() } }));
    await bob.runAs(async () => {
      expect(await prisma.splitMember.deleteMany({ where: { id: bobMemberId } })).toEqual({ count: 0 });
      expect(await prisma.splitMember.updateMany({ where: { id: bobMemberId }, data: { leftAt: null } })).toEqual({ count: 0 });
    });
    expect(await runAsSystem(() => prisma.splitMember.count({ where: { id: bobMemberId, leftAt: { not: null } } }))).toBe(1);
    await runAsSystem(() => prisma.splitMember.update({ where: { id: bobMemberId }, data: { leftAt: null } }));
  });

  it('attribution columns cannot be forged', async () => {
    await bob.runAs(async () => {
      await expect(
        prisma.splitComment.create({ data: { expenseId, authorUserId: alice.userId, body: 'forged' } }),
      ).rejects.toThrow();
    });
    await bob.runAs(async () => {
      await expect(
        prisma.splitExpense.create({
          data: { groupId, description: 'forged', date: new Date('2026-10-01'), amount: '1', currency: 'INR',
            fxRate: '1', baseAmount: '1', splitMode: 'EQUAL', createdById: alice.userId },
        }),
      ).rejects.toThrow();
    });
    await bob.runAs(async () => {
      await expect(
        prisma.splitActivity.create({ data: { groupId, actorUserId: alice.userId, kind: 'forged', payload: {} } }),
      ).rejects.toThrow();
    });
    await bob.runAs(async () => {
      await expect(
        prisma.splitSettlement.create({
          data: { groupId, fromMemberId: bobMemberId, toMemberId: aliceMemberId, amount: '1', currency: 'INR', fxRate: '1',
            baseAmount: '1', method: 'CASH', date: new Date('2026-10-02'), createdById: alice.userId },
        }),
      ).rejects.toThrow();
    });
    await bob.runAs(async () => {
      await expect(
        prisma.splitGroup.create({ data: { name: 'forged', createdById: alice.userId } }),
      ).rejects.toThrow();
    });
  });

  it('ledger rows are soft-delete only and activity is append-only', async () => {
    await alice.runAs(async () => {
      expect(await affected(() => prisma.splitExpense.deleteMany({ where: { id: expenseId } }))).toBe(0);
      expect(await affected(() => prisma.splitSettlement.deleteMany({ where: { id: settlementId } }))).toBe(0);
      expect(await affected(() => prisma.splitComment.deleteMany({ where: { id: commentId } }))).toBe(0);
      expect(await affected(() => prisma.splitActivity.deleteMany({ where: { id: activityId } }))).toBe(0);
      expect(await affected(() => prisma.splitActivity.updateMany({ where: { id: activityId }, data: { kind: 'tampered' } }))).toBe(0);
      expect(await affected(() => prisma.splitGroup.deleteMany({ where: { id: groupId } }))).toBe(0);
      // soft delete (an UPDATE) still works for members
      expect(await prisma.splitExpense.updateMany({ where: { id: expenseId }, data: { deletedAt: new Date() } })).toEqual({ count: 1 });
    });
    await runAsSystem(() => prisma.splitExpense.update({ where: { id: expenseId }, data: { deletedAt: null } }));
    const left = await runAsSystem(async () => ({
      e: await prisma.splitExpense.count({ where: { id: expenseId } }),
      s: await prisma.splitSettlement.count({ where: { id: settlementId } }),
      c: await prisma.splitComment.count({ where: { id: commentId } }),
      a: await prisma.splitActivity.findUniqueOrThrow({ where: { id: activityId } }),
    }));
    expect(left).toMatchObject({ e: 1, s: 1, c: 1 });
    expect(left.a.kind).toBe('expense.created');
  });

  it('a member cannot move an expense into a group they are not in', async () => {
    await alice.runAs(async () => {
      await expect(
        prisma.splitExpense.updateMany({ where: { id: expenseId }, data: { groupId: group2Id } }),
      ).rejects.toThrow();
    });
    expect(await runAsSystem(() => prisma.splitExpense.findUniqueOrThrow({ where: { id: expenseId } }))).toMatchObject({ groupId });
  });
  it('SplitReminder rows are sender-only', async () => {
    const r = await alice.runAs(() => prisma.splitReminder.create({
      data: { userId: alice.userId, groupId, memberId: bobMemberId, sentOn: new Date('2026-10-08') },
    }));
    await bob.runAs(async () => {
      expect(await prisma.splitReminder.findUnique({ where: { id: r.id } })).toBeNull();
    });
    await expect(eve.runAs(() => prisma.splitReminder.create({
      data: { userId: alice.userId, groupId, memberId: bobMemberId, sentOn: new Date('2026-10-09') },
    }))).rejects.toThrow();
    await runAsSystem(() => prisma.splitReminder.delete({ where: { id: r.id } }));
  });
});
