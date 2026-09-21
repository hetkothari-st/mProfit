import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  acceptInvitation,
  createFamily,
  inviteMember,
  listMembers,
  peekInvitation,
} from '../../src/services/family.service.js';
import {
  authenticateExtension,
  completePairing,
  initPairing,
} from '../../src/services/extensionPairing.service.js';

/**
 * Paths where the credential is NOT a session.
 *
 * An invitation token, a pairing code, an extension bearer: each one proves
 * its own bearer's right to the row it names, and each arrives from someone
 * who is either not signed in at all or signed in as somebody with no claim
 * on that row yet. Row-level security keys off `app.current_user_id`, so in
 * every one of these the policy looks at the wrong question and answers
 * "no rows" — which surfaces as "invitation not found", an empty member list,
 * or a dead browser extension.
 *
 * None of it showed up while the app connected as a superuser, because the
 * policies were never evaluated. These tests run with policies in force.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope & { email: string }> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  const user = await runAsSystem(() =>
    prisma.user.findUniqueOrThrow({ where: { id: scope.userId }, select: { email: true } }),
  );
  return { ...scope, email: user.email };
}

async function household(ownerId: string): Promise<string> {
  const fam = await runAsUser(ownerId, () => createFamily(ownerId, { name: 'Invite Household' }));
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.familyInvitation.deleteMany({ where: { familyId: fam.id } });
      await prisma.familyMember.deleteMany({ where: { familyId: fam.id } });
      await prisma.family.deleteMany({ where: { id: fam.id } });
    });
  });
  return fam.id;
}

describe('a family invitation', () => {
  it('can be previewed by the person holding the token, who has no session', async () => {
    const owner = await person('invite-owner');
    const invitee = await person('invite-guest');
    const familyId = await household(owner.userId);

    const invite = await runAsUser(owner.userId, () =>
      inviteMember(owner.userId, familyId, { invitedEmail: invitee.email }),
    );
    expect(invite.status).toBe('invited');
    const token = (invite as { token: string }).token;

    // Exactly how the accept page calls it: no authentication anywhere.
    const preview = await peekInvitation(token);
    expect(preview.familyName).toBe('Invite Household');
    expect(preview.invitedEmail).toBe(invitee.email);
  });

  it('can be accepted by its invitee, who is not yet in the family', async () => {
    const owner = await person('accept-owner');
    const invitee = await person('accept-guest');
    const familyId = await household(owner.userId);

    const invite = await runAsUser(owner.userId, () =>
      inviteMember(owner.userId, familyId, { invitedEmail: invitee.email, role: 'CONTRIBUTOR' }),
    );
    const token = (invite as { token: string }).token;

    const membership = await runAsUser(invitee.userId, () =>
      acceptInvitation(invitee.userId, token),
    );
    expect(membership.status).toBe('ACTIVE');
    expect(membership.userId).toBe(invitee.userId);

    const stamped = await runAsSystem(() =>
      prisma.familyInvitation.findUniqueOrThrow({ where: { token } }),
    );
    expect(stamped.acceptedAt).not.toBeNull();
  });

  it('still refuses a token that was sent to a different address', async () => {
    const owner = await person('wrong-owner');
    const invitee = await person('wrong-guest');
    const bystander = await person('wrong-bystander');
    const familyId = await household(owner.userId);

    const invite = await runAsUser(owner.userId, () =>
      inviteMember(owner.userId, familyId, { invitedEmail: invitee.email }),
    );
    const token = (invite as { token: string }).token;

    await expect(
      runAsUser(bystander.userId, () => acceptInvitation(bystander.userId, token)),
    ).rejects.toThrow(/different email/i);
  });
});

describe('the family member list', () => {
  it('shows the whole household to a member who does not own it', async () => {
    const owner = await person('members-owner');
    const invitee = await person('members-guest');
    const familyId = await household(owner.userId);

    const invite = await runAsUser(owner.userId, () =>
      inviteMember(owner.userId, familyId, { invitedEmail: invitee.email, role: 'CONTRIBUTOR' }),
    );
    await runAsUser(invitee.userId, () =>
      acceptInvitation(invitee.userId, (invite as { token: string }).token),
    );

    // A CONTRIBUTOR's own RLS view of FamilyMember is their own row only, so
    // this is the read that collapsed the page to a household of one.
    const asMember = await runAsUser(invitee.userId, () =>
      listMembers(invitee.userId, familyId),
    );
    expect(asMember.map((m) => m.userId).sort()).toEqual([owner.userId, invitee.userId].sort());
    expect(asMember.every((m) => m.email.length > 0)).toBe(true);
  });

  it('is refused to someone with no membership at all', async () => {
    const owner = await person('members-stranger-owner');
    const stranger = await person('members-stranger');
    const familyId = await household(owner.userId);

    await expect(
      runAsUser(stranger.userId, () => listMembers(stranger.userId, familyId)),
    ).rejects.toThrow();
  });
});

describe('the browser extension pairing', () => {
  it('exchanges a code and authenticates a bearer with no session at all', async () => {
    const user = await person('pairing-user');
    cleanups.push(async () => {
      await runAsSystem(() =>
        prisma.extensionPairing.deleteMany({ where: { userId: user.userId } }),
      );
    });

    const { code } = await runAsUser(user.userId, () => initPairing(user.userId));

    // The extension posts the code with no cookie and no JWT.
    const paired = await completePairing(code);
    expect(paired.userId).toBe(user.userId);

    // And every later call arrives the same way: a bearer, nothing else. The
    // lookup runs before any user context is entered.
    const pairing = await authenticateExtension(paired.bearer);
    expect(pairing.userId).toBe(user.userId);
    expect(pairing.paired).toBe(true);
  });

  it('rejects a bearer that was never issued', async () => {
    await expect(authenticateExtension('0'.repeat(64))).rejects.toThrow(/Invalid bearer/i);
  });
});
