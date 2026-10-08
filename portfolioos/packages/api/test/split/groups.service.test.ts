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

  it('rejects member changes on a DIRECT group', async () => {
    const c = await seedContact(alice.userId, 'Bob Fixed', bob.userId);
    const d = await alice.runAs(() => getOrCreateDirectGroup(alice.userId, 'Alice', c.id));
    const extra = await seedContact(alice.userId, 'Extra');
    await expect(alice.runAs(() => addMember(alice.userId, d.id, extra.id))).rejects.toThrow(/SPLIT_DIRECT_FIXED/);
    await expect(alice.runAs(() => removeMember(alice.userId, d.id, d.members[1]!.id))).rejects.toThrow(/SPLIT_DIRECT_FIXED/);
    await expect(alice.runAs(() => updateGroup(alice.userId, d.id, { type: 'TRIP' }))).rejects.toThrow(/SPLIT_DIRECT_FIXED/);
  });

  it('concurrent getOrCreateDirectGroup yields one group', async () => {
    const c = await seedContact(alice.userId, 'Bob Race', bob.userId);
    const [a, b] = await Promise.all([
      alice.runAs(() => getOrCreateDirectGroup(alice.userId, 'Alice', c.id)),
      alice.runAs(() => getOrCreateDirectGroup(alice.userId, 'Alice', c.id)),
    ]);
    expect(a.id).toBe(b.id);
    const n = await runAsSystem(() =>
      prisma.splitGroup.count({
        where: { type: 'DIRECT', AND: [{ members: { some: { userId: alice.userId } } }, { members: { some: { userId: bob.userId } } }] },
      }),
    );
    expect(n).toBe(1);
  });

  it('a member involved only in a settlement is soft-removed', async () => {
    const ph = await seedContact(alice.userId, 'Settled');
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Sett', myDisplayName: 'Alice', contactIds: [ph.id] }));
    const me = g.members.find((m) => m.isMe)!;
    const them = g.members.find((m) => !m.isMe)!;
    await runAsSystem(async () => {
      await prisma.splitExpense.create({
        data: {
          groupId: g.id, description: 'x', date: new Date('2026-10-01'), amount: '10', currency: 'INR', fxRate: '1',
          baseAmount: '10', splitMode: 'EQUAL', createdById: alice.userId,
          payers: { create: [{ memberId: me.id, amount: '10', baseAmount: '10' }] },
          shares: { create: [{ memberId: them.id, amount: '10', baseAmount: '10' }] },
        },
      });
      await prisma.splitSettlement.create({
        data: {
          groupId: g.id, fromMemberId: them.id, toMemberId: me.id, amount: '10', currency: 'INR', fxRate: '1',
          baseAmount: '10', method: 'CASH', date: new Date('2026-10-02'), createdById: alice.userId,
        },
      });
    });
    await alice.runAs(() => removeMember(alice.userId, g.id, them.id));
    const row = await runAsSystem(() => prisma.splitMember.findUnique({ where: { id: them.id } }));
    expect(row?.leftAt).not.toBeNull();
  });

  it('refuses to remove the last active linked member', async () => {
    const ph = await seedContact(alice.userId, 'OnlyPh');
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Last', myDisplayName: 'Alice', contactIds: [ph.id] }));
    const me = g.members.find((m) => m.isMe)!;
    await expect(alice.runAs(() => removeMember(alice.userId, g.id, me.id))).rejects.toThrow(/SPLIT_LAST_MEMBER/);
  });

  it('createGroup with a repeated contact is a conflict', async () => {
    const c = await seedContact(alice.userId, 'Dup');
    await expect(
      alice.runAs(() => createGroup(alice.userId, { name: 'D', myDisplayName: 'Alice', contactIds: [c.id, c.id] })),
    ).rejects.toThrow(/already/i);
  });

  it('re-adding a linked member who left reactivates them', async () => {
    const c = await seedContact(alice.userId, 'Bob Back', bob.userId);
    const ph = await seedContact(alice.userId, 'Anchor');
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Back', myDisplayName: 'Alice', contactIds: [ph.id] }));
    const first = await alice.runAs(() => addMember(alice.userId, g.id, c.id));
    await runAsSystem(() => prisma.splitMember.update({ where: { id: first.id }, data: { leftAt: new Date() } }));
    const again = await alice.runAs(() => addMember(alice.userId, g.id, c.id));
    expect(again.id).toBe(first.id);
    const row = await runAsSystem(() => prisma.splitMember.findUnique({ where: { id: first.id } }));
    expect(row?.leftAt).toBeNull();
  });
});
