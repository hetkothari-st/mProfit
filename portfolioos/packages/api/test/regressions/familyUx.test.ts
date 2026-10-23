import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  addManagedMember,
  createFamily,
  setManagedMemberManager,
} from '../../src/services/family/family.service.js';
import { inviteProfileClaim } from '../../src/services/family/familyClaim.service.js';
import { buildFamilyInviteEmail } from '../../src/services/family/familyInviteEmail.service.js';
import { getEffectiveScope } from '../../src/services/family/familyScope.service.js';

/**
 * Family & succession UX defects (fix/family-ux).
 *
 * The keeper rule: whoever keeps a managed member's books may hand those
 * books to someone else and may invite the person to take the account over —
 * without being an owner (familyClaim.service / setManagedMemberManager say so
 * and their tests pin it). The hand-over EMAIL step used to demand an owner,
 * so a non-owner keeper could create the invitation and then not send it.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope> {
  const s = await createTestScope(label);
  cleanups.push(s.cleanup);
  return s;
}

/** Owner + a CONTRIBUTOR who keeps a managed profile's books. */
async function familyWithKeeper(label: string) {
  const owner = await person(label);
  const keeper = await person(`${label}-keeper`);
  const fam = await runAsUser(owner.userId, () => createFamily(owner.userId, { name: 'Shahs' }));
  await runAsSystem(() =>
    prisma.family.update({ where: { id: fam.id }, data: { includedSeats: 20 } }),
  );
  await runAsSystem(() =>
    prisma.familyMember.create({
      data: { familyId: fam.id, userId: keeper.userId, role: 'CONTRIBUTOR', status: 'ACTIVE' },
    }),
  );
  const res = await runAsUser(owner.userId, () =>
    addManagedMember(owner.userId, fam.id, {
      name: 'Nani',
      relation: 'Mother',
      relatedToId: owner.userId,
    }),
  );
  if (res.status !== 'managed_added') throw new Error('expected managed_added');
  await runAsSystem(() =>
    prisma.user.update({ where: { id: res.userId }, data: { managedById: keeper.userId } }),
  );
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
  return { owner, keeper, familyId: fam.id, profileId: res.userId };
}

const freeEmail = (label: string) => `famux-${label}-${Date.now()}@test.local`;

describe('a non-owner keeper of a managed member', () => {
  it('can hand the books to someone else (the rule the UI now follows)', async () => {
    const { owner, keeper, familyId, profileId } = await familyWithKeeper('famux-hand');
    await runAsUser(keeper.userId, () =>
      setManagedMemberManager(keeper.userId, familyId, profileId, owner.userId),
    );
    const after = await runAsSystem(() =>
      prisma.user.findUniqueOrThrow({ where: { id: profileId }, select: { managedById: true } }),
    );
    expect(after.managedById).toBe(owner.userId);
  });

  it('can draft the hand-over email for the claim invitation they created', async () => {
    const { keeper, familyId, profileId } = await familyWithKeeper('famux-mail');
    const invite = await runAsUser(keeper.userId, () =>
      inviteProfileClaim(keeper.userId, familyId, profileId, { email: freeEmail('a') }),
    );
    const draft = await runAsUser(keeper.userId, () =>
      buildFamilyInviteEmail(keeper.userId, familyId, invite.invitationId),
    );
    expect(draft.isClaim).toBe(true);
  });

  it('still cannot draft the email for an ordinary join-the-family invitation', async () => {
    const { owner, keeper, familyId } = await familyWithKeeper('famux-plain');
    const inv = await runAsSystem(() =>
      prisma.familyInvitation.create({
        data: {
          familyId,
          invitedEmail: freeEmail('b'),
          invitedById: owner.userId,
          tokenHash: `famux-${Date.now()}-${Math.random()}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    );
    await expect(
      runAsUser(keeper.userId, () => buildFamilyInviteEmail(keeper.userId, familyId, inv.id)),
    ).rejects.toThrow();
  });

  it('cannot draft a claim email for a profile someone else keeps', async () => {
    const { owner, familyId, profileId } = await familyWithKeeper('famux-other');
    const stranger = await person('famux-other-stranger');
    await runAsSystem(() =>
      prisma.familyMember.create({
        data: { familyId, userId: stranger.userId, role: 'CONTRIBUTOR', status: 'ACTIVE' },
      }),
    );
    const invite = await runAsUser(owner.userId, () =>
      inviteProfileClaim(owner.userId, familyId, profileId, { email: freeEmail('c') }),
    );
    await expect(
      runAsUser(stranger.userId, () =>
        buildFamilyInviteEmail(stranger.userId, familyId, invite.invitationId),
      ),
    ).rejects.toThrow();
  });
});

describe('visibility caps', () => {
  it('an empty list is deny-all for a non-owner (the rule the UI now states)', async () => {
    const { keeper, familyId } = await familyWithKeeper('famux-caps');
    const scope = await runAsUser(keeper.userId, () =>
      getEffectiveScope(keeper.userId, { familyId }),
    );
    expect(scope.allowedAssetClasses).toEqual([]);
    expect(scope.allowedCategories).toEqual([]);
  });
});
