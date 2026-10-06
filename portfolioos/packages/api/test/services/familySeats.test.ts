import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  addManagedMember,
  cancelInvitation,
  createFamily,
  inviteMember,
  listMembers,
  listMyFamilies,
  seatUsage,
} from '../../src/services/family.service.js';
import { inviteProfileClaim } from '../../src/services/family/familyClaim.service.js';

/**
 * What holds a family seat.
 *
 * The reported bug: two members, and the third addition asked for payment.
 * An unaccepted invitation was holding the third seat — correct, but silent.
 * These pin down what counts, what does not, and that the refusal says so.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function family(label: string, includedSeats = 3) {
  const owner: TestScope = await createTestScope(label);
  cleanups.push(owner.cleanup);
  const fam = await runAsUser(owner.userId, () => createFamily(owner.userId, { name: 'Seats' }));
  await runAsSystem(() =>
    prisma.family.update({ where: { id: fam.id }, data: { includedSeats } }),
  );
  cleanups.push(async () => {
    await runAsSystem(async () => {
      const managed = await prisma.familyMember.findMany({
        where: { familyId: fam.id, user: { isShadowClient: true } },
        select: { userId: true },
      });
      await prisma.familyInvitation.deleteMany({ where: { familyId: fam.id } });
      await prisma.pendingFamilyInvite.deleteMany({ where: { familyId: fam.id } });
      await prisma.familyMember.deleteMany({ where: { familyId: fam.id } });
      await prisma.portfolio.deleteMany({ where: { userId: { in: managed.map((m) => m.userId) } } });
      await prisma.user.deleteMany({ where: { id: { in: managed.map((m) => m.userId) } } });
      await prisma.family.delete({ where: { id: fam.id } });
    });
  });
  return { owner, familyId: fam.id };
}

describe('what uses a family seat', () => {
  it('counts members and invitations nobody has accepted', async () => {
    const { owner, familyId } = await family('seat-count');
    await runAsUser(owner.userId, () =>
      addManagedMember(owner.userId, familyId, { name: 'Dadi' }),
    );
    const invite = await runAsUser(owner.userId, () =>
      inviteMember(owner.userId, familyId, { invitedEmail: 'pending.seat@test.local' }),
    );
    if (invite.status !== 'invited') throw new Error('expected invited');

    expect(await runAsUser(owner.userId, () => seatUsage(familyId))).toEqual({
      includedSeats: 3,
      members: 2,
      openInvitations: 1,
      used: 3,
    });
  });

  it('frees the seat when the invitation is cancelled', async () => {
    const { owner, familyId } = await family('seat-cancel');
    const invite = await runAsUser(owner.userId, () =>
      inviteMember(owner.userId, familyId, { invitedEmail: 'cancel.seat@test.local' }),
    );
    if (invite.status !== 'invited') throw new Error('expected invited');
    await runAsUser(owner.userId, () => cancelInvitation(owner.userId, familyId, invite.id));

    expect((await runAsUser(owner.userId, () => seatUsage(familyId))).used).toBe(1);
  });

  it('does not count an expired invitation', async () => {
    const { owner, familyId } = await family('seat-expired');
    const invite = await runAsUser(owner.userId, () =>
      inviteMember(owner.userId, familyId, { invitedEmail: 'old.seat@test.local' }),
    );
    if (invite.status !== 'invited') throw new Error('expected invited');
    await runAsSystem(() =>
      prisma.familyInvitation.update({
        where: { id: invite.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      }),
    );

    expect((await runAsUser(owner.userId, () => seatUsage(familyId))).used).toBe(1);
  });

  it('does not charge a family twice for a member taking over their own profile', async () => {
    const { owner, familyId } = await family('seat-claim');
    const managed = await runAsUser(owner.userId, () =>
      addManagedMember(owner.userId, familyId, { name: 'Dadaji' }),
    );
    if (managed.status !== 'managed_added') throw new Error('expected managed_added');
    await runAsUser(owner.userId, () =>
      inviteProfileClaim(owner.userId, familyId, managed.userId, {
        email: `claim.seat.${Date.now()}@test.local`,
      }),
    );

    // Two members, one hand-over invitation to one of them: still two seats.
    expect((await runAsUser(owner.userId, () => seatUsage(familyId))).used).toBe(2);
  });

  it('says what is using the seats when it refuses', async () => {
    const { owner, familyId } = await family('seat-msg', 2);
    const invite = await runAsUser(owner.userId, () =>
      inviteMember(owner.userId, familyId, { invitedEmail: 'holder.seat@test.local' }),
    );
    if (invite.status !== 'invited') throw new Error('expected invited');

    // Payments are not configured in tests, so the paid-seat path refuses —
    // and the refusal has to name the invitation holding the seat.
    await expect(
      runAsUser(owner.userId, () => addManagedMember(owner.userId, familyId, { name: 'Dadi' })),
    ).rejects.toThrow(/1 member and 1 invitation nobody has accepted yet/i);
  });

  it('reports the seats on the family list, for the page to show', async () => {
    const { owner, familyId } = await family('seat-list');
    const rows = await runAsUser(owner.userId, () => listMyFamilies(owner.userId));
    expect(rows.find((r) => r.id === familyId)?.seats).toEqual({
      includedSeats: 3,
      members: 1,
      openInvitations: 0,
      used: 1,
    });
  });
});

describe('a member added without an email', () => {
  it('joins straight away, as a contributor by default, with a portfolio of their own', async () => {
    const { owner, familyId } = await family('seat-role');
    const res = await runAsUser(owner.userId, () =>
      addManagedMember(owner.userId, familyId, { name: 'Ramesh Kothari' }),
    );
    if (res.status !== 'managed_added') throw new Error('expected managed_added');

    const row = await runAsSystem(() =>
      prisma.familyMember.findUniqueOrThrow({
        where: { familyId_userId: { familyId, userId: res.userId } },
        select: { role: true, status: true },
      }),
    );
    expect(row).toEqual({ role: 'CONTRIBUTOR', status: 'ACTIVE' });

    const portfolios = await runAsUser(res.userId, () =>
      prisma.portfolio.findMany({ where: { userId: res.userId }, select: { name: true, isDefault: true } }),
    );
    expect(portfolios).toEqual([{ name: "Ramesh's portfolio", isDefault: true }]);
  });

  it('can be added as a viewer instead', async () => {
    const { owner, familyId } = await family('seat-role-viewer');
    const res = await runAsUser(owner.userId, () =>
      addManagedMember(owner.userId, familyId, { name: 'Dadi', role: 'VIEWER' }),
    );
    if (res.status !== 'managed_added') throw new Error('expected managed_added');

    const row = await runAsSystem(() =>
      prisma.familyMember.findUniqueOrThrow({
        where: { familyId_userId: { familyId, userId: res.userId } },
        select: { role: true },
      }),
    );
    expect(row.role).toBe('VIEWER');
  });
});

describe('adding someone directly, without an invitation', () => {
  it('puts them in the family at once and sends nothing, even with an email noted', async () => {
    const { owner, familyId } = await family('direct-add');

    const res = await runAsUser(owner.userId, () =>
      addManagedMember(owner.userId, familyId, {
        name: 'Mahendra Jain',
        role: 'CONTRIBUTOR',
        contactEmail: 'Mahendra.Jain@Example.com',
      }),
    );
    if (res.status !== 'managed_added') throw new Error('expected managed_added');

    // On the tree immediately — no invitation to accept, none created.
    const members = await runAsUser(owner.userId, () => listMembers(owner.userId, familyId));
    const row = members.find((m) => m.userId === res.userId)!;
    expect(row.status).toBe('ACTIVE');
    expect(row.role).toBe('CONTRIBUTOR');
    expect(row.managed).toBe(true);
    // Noted for the hand-over later, lower-cased, and never their login.
    expect(row.contactEmail).toBe('mahendra.jain@example.com');
    expect(row.email).toBeNull();

    const invitations = await runAsSystem(() =>
      prisma.familyInvitation.count({ where: { familyId } }),
    );
    expect(invitations).toBe(0);

    // The address stays free: they can still register it themselves.
    const taken = await runAsSystem(() =>
      prisma.user.findUnique({ where: { email: 'mahendra.jain@example.com' } }),
    );
    expect(taken).toBeNull();
  });

  it('refuses an address that is not one', async () => {
    const { owner, familyId } = await family('direct-bad-email');
    await expect(
      runAsUser(owner.userId, () =>
        addManagedMember(owner.userId, familyId, { name: 'X', contactEmail: 'not-an-email' }),
      ),
    ).rejects.toThrow(/does not look right/i);
  });
});
