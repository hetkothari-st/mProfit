import { describe, it, expect, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  addManagedMember,
  createFamily,
  listMembers,
  revokeMember,
  setManagedMemberManager,
  updateMemberPermissions,
  updateFamilyTreeLayout,
} from '../../src/services/family.service.js';
import {
  isAccountRoute,
  listProfilesIManage,
  resolveActAs,
} from '../../src/services/family/managedProfile.service.js';
import { loginUser } from '../../src/services/auth.service.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { ForbiddenError } from '../../src/lib/errors.js';

/**
 * Managed family profiles: a grandparent with no email, whose books a family
 * member keeps. A profile is a real user that owns data, so the whole point
 * of these tests is the lock around it — who may act for it, when that
 * stops, and that nobody can ever sign in as it.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  return scope;
}

/** A family owned by `owner`, with `others` as ACTIVE contributors. */
async function family(owner: TestScope, others: TestScope[] = [], includedSeats = 10) {
  const fam = await runAsUser(owner.userId, () => createFamily(owner.userId, { name: 'Kotharis' }));
  await runAsSystem(async () => {
    await prisma.family.update({ where: { id: fam.id }, data: { includedSeats } });
    for (const o of others) {
      await prisma.familyMember.create({
        data: { familyId: fam.id, userId: o.userId, role: 'CONTRIBUTOR', status: 'ACTIVE' },
      });
    }
  });
  cleanups.push(async () => {
    await runAsSystem(async () => {
      const managed = await prisma.familyMember.findMany({
        where: { familyId: fam.id, user: { isShadowClient: true } },
        select: { userId: true },
      });
      const ids = managed.map((m) => m.userId);
      await prisma.auditLog.deleteMany({ where: { resource: { in: ids.map((i) => `User:${i}`) } } });
      await prisma.portfolio.deleteMany({ where: { userId: { in: ids } } });
      await prisma.familyMember.deleteMany({ where: { familyId: fam.id } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.family.delete({ where: { id: fam.id } });
    });
  });
  return fam.id;
}

async function addDadaji(owner: TestScope, familyId: string, managerId?: string) {
  const res = await runAsUser(owner.userId, () =>
    addManagedMember(owner.userId, familyId, { name: 'Dadaji', relation: 'Grandfather', managerId }),
  );
  if (res.status !== 'managed_added') throw new Error(`expected managed_added, got ${res.status}`);
  return res.userId;
}

describe('adding a managed member', () => {
  it('creates a profile that is a member, has no visible email, and takes a seat', async () => {
    const het = await person('mp-add-owner');
    const famId = await family(het);

    const res = await runAsUser(het.userId, () =>
      addManagedMember(het.userId, famId, { name: 'Dadaji', relation: 'Grandfather' }),
    );
    expect(res.status).toBe('managed_added');
    if (res.status !== 'managed_added') return;
    expect(res.seatNumber).toBe(2);

    const members = await runAsUser(het.userId, () => listMembers(het.userId, famId));
    const dadaji = members.find((m) => m.userId === res.userId)!;
    expect(dadaji.managed).toBe(true);
    expect(dadaji.email).toBeNull();
    expect(dadaji.relation).toBe('Grandfather');
    expect(dadaji.managedBy?.id).toBe(het.userId);
    expect(dadaji.status).toBe('ACTIVE');
  });

  it('can be kept by any active member, not only the one adding it', async () => {
    const het = await person('mp-mgr-owner');
    const priya = await person('mp-mgr-spouse');
    const famId = await family(het, [priya]);

    const profileId = await addDadaji(het, famId, priya.userId);

    expect((await listProfilesIManage(priya.userId)).map((p) => p.id)).toEqual([profileId]);
    expect(await listProfilesIManage(het.userId)).toEqual([]);
  });

  it('refuses a manager who is not in the family', async () => {
    const het = await person('mp-bad-owner');
    const stranger = await person('mp-bad-stranger');
    const famId = await family(het);

    await expect(
      runAsUser(het.userId, () =>
        addManagedMember(het.userId, famId, { name: 'Dadaji', managerId: stranger.userId }),
      ),
    ).rejects.toThrow(/active member/i);
  });

  it('takes a seat like an invite: past the included seats it needs a paid seat', async () => {
    const het = await person('mp-seat-owner');
    const famId = await family(het, [], 1); // Het alone fills the only seat.

    // Payments are not configured in tests, so the paid-seat path refuses
    // outright — which is the proof the seat rule applied at all.
    await expect(
      runAsUser(het.userId, () => addManagedMember(het.userId, famId, { name: 'Dadaji' })),
    ).rejects.toThrow(/exceeds your included seats/i);
  });

  it('is never made an owner', async () => {
    const het = await person('mp-owner-owner');
    const famId = await family(het);
    const profileId = await addDadaji(het, famId);

    await expect(
      runAsUser(het.userId, () =>
        updateMemberPermissions(het.userId, famId, profileId, { role: 'OWNER' }),
      ),
    ).rejects.toThrow(/cannot be an owner/i);
  });
});

describe('acting for a managed profile', () => {
  it('is allowed for its manager, with the manager’s plan and never more than INVESTOR', async () => {
    const het = await person('mp-act-owner');
    const famId = await family(het);
    const profileId = await addDadaji(het, famId);

    const identity = await resolveActAs({ id: het.userId, plan: 'FAMILY' }, profileId);
    expect(identity.id).toBe(profileId);
    expect(identity.plan).toBe('FAMILY');
    expect(identity.role).toBe('INVESTOR');
  });

  it('is refused to another member of the same family', async () => {
    const het = await person('mp-other-owner');
    const priya = await person('mp-other-spouse');
    const famId = await family(het, [priya]);
    const profileId = await addDadaji(het, famId);

    await expect(resolveActAs({ id: priya.userId, plan: 'FREE' }, profileId)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('is refused for an ordinary account, even by its own family', async () => {
    const het = await person('mp-real-owner');
    const priya = await person('mp-real-spouse');
    await family(het, [priya]);

    await expect(resolveActAs({ id: het.userId, plan: 'FREE' }, priya.userId)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('stops the moment the profile is removed from the family', async () => {
    const het = await person('mp-rev-owner');
    const famId = await family(het);
    const profileId = await addDadaji(het, famId);
    await runAsUser(het.userId, () => revokeMember(het.userId, famId, profileId));

    await expect(resolveActAs({ id: het.userId, plan: 'FREE' }, profileId)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('moves with the manager when the owner hands the profile over', async () => {
    const het = await person('mp-hand-owner');
    const priya = await person('mp-hand-spouse');
    const famId = await family(het, [priya]);
    const profileId = await addDadaji(het, famId);

    await runAsUser(het.userId, () =>
      setManagedMemberManager(het.userId, famId, profileId, priya.userId),
    );

    await expect(resolveActAs({ id: het.userId, plan: 'FREE' }, profileId)).rejects.toThrow(
      ForbiddenError,
    );
    expect((await resolveActAs({ id: priya.userId, plan: 'FREE' }, profileId)).id).toBe(profileId);
  });

  it('writes land in the profile’s own books, not the manager’s', async () => {
    const het = await person('mp-write-owner');
    const famId = await family(het);
    const profileId = await addDadaji(het, famId);

    await runAsUser(profileId, () =>
      prisma.portfolio.create({
        data: { userId: profileId, name: 'Dadaji FDs', currency: 'INR', type: 'INVESTMENT' },
      }),
    );

    const hetSees = await runAsUser(het.userId, () =>
      prisma.portfolio.count({ where: { name: 'Dadaji FDs' } }),
    );
    expect(hetSees).toBe(0);
  });
});

describe('the authenticate middleware', () => {
  function reqFor(token: string, actAs: string | undefined, url = '/api/portfolios'): Request {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (actAs) headers['x-act-as'] = actAs;
    return {
      originalUrl: url,
      header: (name: string) => headers[name.toLowerCase()],
    } as unknown as Request;
  }

  function run(req: Request): Promise<unknown> {
    return new Promise((resolve) => {
      authenticate(req, {} as Response, ((err?: unknown) => resolve(err ?? null)) as NextFunction);
    });
  }

  it('binds the request to the profile and keeps the manager as the actor', async () => {
    const het = await person('mp-mw-owner');
    const famId = await family(het);
    const profileId = await addDadaji(het, famId);
    const { token } = signAccessToken({ sub: het.userId, email: 'x@test.local', role: 'INVESTOR', plan: 'FAMILY' });

    const req = reqFor(token, profileId);
    expect(await run(req)).toBeNull();
    expect(req.user?.id).toBe(profileId);
    expect(req.user?.plan).toBe('FAMILY');
    expect(req.actor?.id).toBe(het.userId);
  });

  it('refuses account routes while acting', async () => {
    const het = await person('mp-mw-acct');
    const famId = await family(het);
    const profileId = await addDadaji(het, famId);
    const { token } = signAccessToken({ sub: het.userId, email: 'x@test.local', role: 'INVESTOR', plan: 'FAMILY' });

    for (const url of ['/api/auth/me', '/api/billing/dev-set-plan', '/api/families/x/members/invite']) {
      expect(await run(reqFor(token, profileId, url))).toBeInstanceOf(ForbiddenError);
    }
  });

  it('refuses a profile the caller does not manage', async () => {
    const het = await person('mp-mw-deny');
    const stranger = await person('mp-mw-stranger');
    const famId = await family(het);
    const profileId = await addDadaji(het, famId);
    const { token } = signAccessToken({ sub: stranger.userId, email: 'y@test.local', role: 'INVESTOR', plan: 'FREE' });

    const req = reqFor(token, profileId);
    expect(await run(req)).toBeInstanceOf(ForbiddenError);
    expect(req.user?.id).toBe(stranger.userId);
  });
});

describe('a managed profile can never sign in', () => {
  it('is refused by password login whatever is typed', async () => {
    const het = await person('mp-login-owner');
    const famId = await family(het);
    const profileId = await addDadaji(het, famId);
    const { email } = await runAsSystem(() =>
      prisma.user.findUniqueOrThrow({ where: { id: profileId }, select: { email: true } }),
    );

    expect(email).toMatch(/\.invalid$/);
    await expect(loginUser(email, 'anything')).rejects.toThrow(/invalid credentials/i);
  });
});

describe('the tree arrangement', () => {
  it('rejects placing someone under their own descendant', async () => {
    const het = await person('mp-tree-owner');
    const famId = await family(het);

    await expect(
      runAsUser(het.userId, () =>
        updateFamilyTreeLayout(het.userId, famId, { parents: { a: 'b', b: 'a' } }),
      ),
    ).rejects.toThrow(/under themselves/i);

    const saved = await runAsUser(het.userId, () =>
      updateFamilyTreeLayout(het.userId, famId, { parents: { [het.userId]: 'dadaji', dadaji: null } }),
    );
    expect(saved.parents).toEqual({ [het.userId]: 'dadaji', dadaji: null });
  });
});

describe('isAccountRoute', () => {
  it('matches account prefixes and nothing else', () => {
    expect(isAccountRoute('/api/auth/me')).toBe(true);
    expect(isAccountRoute('/api/families')).toBe(true);
    expect(isAccountRoute('/api/managed-profiles/x/enter')).toBe(true);
    expect(isAccountRoute('/api/portfolios')).toBe(false);
    expect(isAccountRoute('/api/authority')).toBe(false);
  });
});
