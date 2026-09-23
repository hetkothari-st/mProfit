import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { addManagedMember, createFamily, revokeMember } from '../../src/services/family.service.js';
import {
  claimProfile,
  inviteProfileClaim,
  peekProfileClaim,
} from '../../src/services/family/familyClaim.service.js';
import { buildFamilyInviteEmail } from '../../src/services/family/familyInviteEmail.service.js';
import { resolveActAs } from '../../src/services/family/managedProfile.service.js';
import { loginUser } from '../../src/services/auth.service.js';

/**
 * Handing a managed profile to the person it belongs to.
 *
 * The point of the flow is that it is the SAME account: everything recorded
 * while the family kept their books stays under the same user, so these
 * assert on the id and on the data hanging off it, not just on being able to
 * sign in afterwards.
 */

const PASSWORD = 'GrandpaSetsOne#2026';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope> {
  const s = await createTestScope(label);
  cleanups.push(s.cleanup);
  return s;
}

async function familyWithProfile(label: string) {
  const owner = await person(label);
  const fam = await runAsUser(owner.userId, () => createFamily(owner.userId, { name: 'Jains' }));
  await runAsSystem(() =>
    prisma.family.update({ where: { id: fam.id }, data: { includedSeats: 20 } }),
  );
  const res = await runAsUser(owner.userId, () =>
    addManagedMember(owner.userId, fam.id, { name: 'Dadaji', relation: 'Father', relatedToId: owner.userId }),
  );
  if (res.status !== 'managed_added') throw new Error('expected managed_added');
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.auditLog.deleteMany({ where: { userId: res.userId } });
      await prisma.portfolio.deleteMany({ where: { userId: res.userId } });
      await prisma.familyInvitation.deleteMany({ where: { familyId: fam.id } });
      await prisma.familyMember.deleteMany({ where: { familyId: fam.id } });
      await prisma.user.deleteMany({ where: { id: res.userId } });
      await prisma.family.delete({ where: { id: fam.id } });
    });
  });
  return { owner, familyId: fam.id, profileId: res.userId };
}

const freeEmail = (label: string) => `claim-${label}-${Date.now()}@test.local`;

describe('inviting someone to take over the profile kept for them', () => {
  it('is open to the member keeping their books, and to owners', async () => {
    const { owner, familyId, profileId } = await familyWithProfile('claim-who');
    const invite = await runAsUser(owner.userId, () =>
      inviteProfileClaim(owner.userId, familyId, profileId, { email: freeEmail('a') }),
    );
    expect(invite.token).toHaveLength(43);
  });

  it('refuses a member who neither owns the family nor keeps their books', async () => {
    const { familyId, profileId } = await familyWithProfile('claim-deny');
    const other = await person('claim-deny-other');
    await runAsSystem(() =>
      prisma.familyMember.create({
        data: { familyId, userId: other.userId, role: 'CONTRIBUTOR', status: 'ACTIVE' },
      }),
    );

    await expect(
      runAsUser(other.userId, () =>
        inviteProfileClaim(other.userId, familyId, profileId, { email: freeEmail('b') }),
      ),
    ).rejects.toThrow();
  });

  it('refuses an address that already has an account, by name', async () => {
    const { owner, familyId, profileId } = await familyWithProfile('claim-taken');
    const existing = await person('claim-taken-existing');
    const email = await runAsSystem(() =>
      prisma.user
        .findUniqueOrThrow({ where: { id: existing.userId }, select: { email: true } })
        .then((u) => u.email),
    );

    await expect(
      runAsUser(owner.userId, () => inviteProfileClaim(owner.userId, familyId, profileId, { email })),
    ).rejects.toThrow(/already has an EveryPaisa account/i);
  });

  it('drafts a hand-over email, not a join-the-family one', async () => {
    const { owner, familyId, profileId } = await familyWithProfile('claim-mail');
    const invite = await runAsUser(owner.userId, () =>
      inviteProfileClaim(owner.userId, familyId, profileId, { email: freeEmail('c') }),
    );

    const draft = await runAsUser(owner.userId, () =>
      buildFamilyInviteEmail(owner.userId, familyId, invite.invitationId),
    );
    expect(draft.isClaim).toBe(true);
    expect(draft.subject).toMatch(/set up your EveryPaisa account/i);
    expect(draft.message).toMatch(/take the account over/i);
    expect(draft.acceptUrl).toMatch(new RegExp(`/family/claims/${invite.token}$`));
    expect(draft.html).toContain('Take over my account');
  });
});

describe('the link, before anyone signs anything', () => {
  it('says who is asking and for what, and nothing else', async () => {
    const { owner, familyId, profileId } = await familyWithProfile('claim-peek');
    const email = freeEmail('d');
    const invite = await runAsUser(owner.userId, () =>
      inviteProfileClaim(owner.userId, familyId, profileId, { email }),
    );

    const preview = await peekProfileClaim(invite.token);
    expect(preview.profileName).toBe('Dadaji');
    expect(preview.familyName).toBe('Jains');
    expect(preview.invitedEmail).toBe(email);
    expect(JSON.stringify(preview)).not.toContain(profileId);
    expect(JSON.stringify(preview)).not.toContain(familyId);
  });
});

describe('taking it over', () => {
  it('turns the same profile into their account, keeping everything in it', async () => {
    const { owner, familyId, profileId } = await familyWithProfile('claim-take');
    // Something the family recorded for them while keeping their books.
    await runAsUser(profileId, () =>
      prisma.portfolio.create({
        data: { userId: profileId, name: 'Dadaji FDs', currency: 'INR', type: 'INVESTMENT' },
      }),
    );
    const email = freeEmail('e');
    const invite = await runAsUser(owner.userId, () =>
      inviteProfileClaim(owner.userId, familyId, profileId, { email }),
    );

    const session = await claimProfile(invite.token, { email, password: PASSWORD });
    expect(session.user.id).toBe(profileId); // the same account, not a new one
    expect(session.user.email).toBe(email);
    expect(session.tokens.accessToken).toBeTruthy();

    const after = await runAsSystem(() =>
      prisma.user.findUniqueOrThrow({
        where: { id: profileId },
        select: { isShadowClient: true, managedById: true },
      }),
    );
    expect(after).toEqual({ isShadowClient: false, managedById: null });

    const kept = await runAsUser(profileId, () =>
      prisma.portfolio.count({ where: { userId: profileId } }),
    );
    expect(kept).toBe(1);

    // They can sign in, and the family member who kept their books cannot
    // open the account any more.
    await expect(loginUser(email, PASSWORD)).resolves.toBeTruthy();
    await expect(resolveActAs({ id: owner.userId, plan: 'FREE' }, profileId)).rejects.toThrow();
  });

  it('cannot be used twice', async () => {
    const { owner, familyId, profileId } = await familyWithProfile('claim-twice');
    const email = freeEmail('f');
    const invite = await runAsUser(owner.userId, () =>
      inviteProfileClaim(owner.userId, familyId, profileId, { email }),
    );
    await claimProfile(invite.token, { email, password: PASSWORD });

    await expect(claimProfile(invite.token, { email, password: PASSWORD })).rejects.toThrow(
      /already been taken over/i,
    );
    await expect(peekProfileClaim(invite.token)).rejects.toThrow(/already been taken over/i);
  });

  it('refuses a different address than the one it was sent to', async () => {
    const { owner, familyId, profileId } = await familyWithProfile('claim-wrong');
    const invite = await runAsUser(owner.userId, () =>
      inviteProfileClaim(owner.userId, familyId, profileId, { email: freeEmail('g') }),
    );

    await expect(
      claimProfile(invite.token, { email: freeEmail('h'), password: PASSWORD }),
    ).rejects.toThrow(/different email/i);
  });

  it('refuses an expired link', async () => {
    const { owner, familyId, profileId } = await familyWithProfile('claim-expired');
    const email = freeEmail('i');
    const invite = await runAsUser(owner.userId, () =>
      inviteProfileClaim(owner.userId, familyId, profileId, { email }),
    );
    await runAsSystem(() =>
      prisma.familyInvitation.update({
        where: { id: invite.invitationId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      }),
    );

    await expect(claimProfile(invite.token, { email, password: PASSWORD })).rejects.toThrow(
      /expired/i,
    );
  });

  it('refuses once the profile has been removed from the family', async () => {
    const { owner, familyId, profileId } = await familyWithProfile('claim-removed');
    const email = freeEmail('j');
    const invite = await runAsUser(owner.userId, () =>
      inviteProfileClaim(owner.userId, familyId, profileId, { email }),
    );
    await runAsUser(owner.userId, () => revokeMember(owner.userId, familyId, profileId));

    await expect(claimProfile(invite.token, { email, password: PASSWORD })).rejects.toThrow();
  });
});
