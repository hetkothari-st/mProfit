import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  addManagedMember,
  createFamily,
  getFamilyTreeLayout,
  listMembers,
  revokeMember,
  setManagedMemberManager,
  updateMemberPermissions,
} from '../../src/services/family.service.js';
import { buildFamilyInviteEmail } from '../../src/services/family/familyInviteEmail.service.js';
import { inviteMember } from '../../src/services/family.service.js';

/**
 * Relatives on the family tree: who someone is related to, where that puts
 * them, and what removing someone does. The tree is read back from the
 * saved layout, because "rearranged automatically, and remembered" is the
 * behaviour being asked for.
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

async function family(owner: TestScope, others: TestScope[] = []) {
  const fam = await runAsUser(owner.userId, () => createFamily(owner.userId, { name: 'Jains' }));
  await runAsSystem(async () => {
    await prisma.family.update({ where: { id: fam.id }, data: { includedSeats: 20 } });
    for (const o of others) {
      await prisma.familyMember.create({
        data: {
          familyId: fam.id,
          userId: o.userId,
          role: 'CONTRIBUTOR',
          status: 'ACTIVE',
          invitedById: owner.userId,
        },
      });
    }
  });
  cleanups.push(async () => {
    await runAsSystem(async () => {
      const managed = await prisma.familyMember.findMany({
        where: { familyId: fam.id, user: { isShadowClient: true } },
        select: { userId: true },
      });
      await prisma.familyInvitation.deleteMany({ where: { familyId: fam.id } });
      await prisma.familyMember.deleteMany({ where: { familyId: fam.id } });
      await prisma.user.deleteMany({ where: { id: { in: managed.map((m) => m.userId) } } });
      await prisma.auditLog.deleteMany({ where: { userId: owner.userId } });
      await prisma.family.delete({ where: { id: fam.id } });
    });
  });
  return fam.id;
}

async function addRelative(
  owner: TestScope,
  familyId: string,
  name: string,
  relation: string,
  relatedToId: string,
) {
  const res = await runAsUser(owner.userId, () =>
    addManagedMember(owner.userId, familyId, { name, relation, relatedToId }),
  );
  if (res.status !== 'managed_added') throw new Error('expected managed_added');
  return res.userId;
}

const layoutOf = async (owner: TestScope, familyId: string) =>
  (await runAsUser(owner.userId, () => getFamilyTreeLayout(owner.userId, familyId))) ?? {};
const parentsOf = async (owner: TestScope, familyId: string) =>
  (await layoutOf(owner, familyId)).parents ?? {};

describe('adding a relative places them on the tree, and remembers it', () => {
  it('puts a father above, a wife alongside and a son below the person they relate to', async () => {
    const akshay = await person('rel-akshay');
    const famId = await family(akshay);

    const papa = await addRelative(akshay, famId, 'Mahendra', 'Father', akshay.userId);
    let parents = await parentsOf(akshay, famId);
    expect(parents[papa]).toBeNull();
    expect(parents[akshay.userId]).toBe(papa);

    const wife = await addRelative(akshay, famId, 'Neha', 'Wife', akshay.userId);
    const son = await addRelative(akshay, famId, 'Aarav', 'Son', akshay.userId);
    const layout = await layoutOf(akshay, famId);
    parents = layout.parents ?? {};
    // A wife is joined to her husband, not born to his father: giving her
    // his parent drew her as her father-in-law's daughter.
    expect(parents[wife]).toBeNull();
    expect(layout.partners).toEqual([[wife, akshay.userId]]);
    expect(parents[son]).toBe(akshay.userId);
  });

  it('keeps a couple together when the next generation marries', async () => {
    const mahendra = await person('rel-couple');
    const famId = await family(mahendra);

    const sarita = await addRelative(mahendra, famId, 'Sarita', 'Wife', mahendra.userId);
    const shalin = await addRelative(mahendra, famId, 'Shalin', 'Son', mahendra.userId);
    const ritika = await addRelative(mahendra, famId, 'Ritika', 'Wife', shalin);

    const layout = await layoutOf(mahendra, famId);
    const parents = layout.parents ?? {};
    // Ritika married into the family; she is nobody's daughter here.
    expect(parents[ritika]).toBeNull();
    expect(parents[shalin]).toBe(mahendra.userId);
    expect(layout.partners).toEqual([
      [sarita, mahendra.userId],
      [ritika, shalin],
    ]);
  });

  it('leaves the surviving partner holding the children when one is removed', async () => {
    const mahendra = await person('rel-widow');
    const famId = await family(mahendra);
    const sarita = await addRelative(mahendra, famId, 'Sarita', 'Wife', mahendra.userId);
    const akshay = await addRelative(mahendra, famId, 'Akshay', 'Son', mahendra.userId);

    await runAsUser(mahendra.userId, () => revokeMember(mahendra.userId, famId, sarita));
    const layout = await layoutOf(mahendra, famId);
    expect(layout.partners).toEqual([]);
    expect((layout.parents ?? {})[akshay]).toBe(mahendra.userId);
  });

  it('names who the relation is to on the member list', async () => {
    const akshay = await person('rel-list');
    const famId = await family(akshay);
    const papa = await addRelative(akshay, famId, 'Mahendra', 'Father', akshay.userId);

    const members = await runAsUser(akshay.userId, () => listMembers(akshay.userId, famId));
    const row = members.find((m) => m.userId === papa)!;
    expect(row.relation).toBe('Father');
    expect(row.relatedTo?.id).toBe(akshay.userId);
  });

  it('re-places someone when their relation is edited', async () => {
    const akshay = await person('rel-edit');
    const famId = await family(akshay);
    const x = await addRelative(akshay, famId, 'Ravi', 'Son', akshay.userId);

    await runAsUser(akshay.userId, () =>
      updateMemberPermissions(akshay.userId, famId, x, { relation: 'Brother', relatedToId: akshay.userId }),
    );
    const parents = await parentsOf(akshay, famId);
    expect(parents[x]).toBe(parents[akshay.userId] ?? null);
  });

  it('refuses a relation that would put someone under their own descendant', async () => {
    const akshay = await person('rel-cycle');
    const famId = await family(akshay);
    const son = await addRelative(akshay, famId, 'Aarav', 'Son', akshay.userId);
    const grandson = await addRelative(akshay, famId, 'Vihaan', 'Son', son);

    await expect(
      runAsUser(akshay.userId, () =>
        updateMemberPermissions(akshay.userId, famId, son, { relation: 'Son', relatedToId: grandson }),
      ),
    ).rejects.toThrow(/own descendant/i);
  });

  it('refuses a relation to someone outside the family', async () => {
    const akshay = await person('rel-out');
    const stranger = await person('rel-stranger');
    const famId = await family(akshay);

    await expect(
      runAsUser(akshay.userId, () =>
        addManagedMember(akshay.userId, famId, { name: 'X', relation: 'Son', relatedToId: stranger.userId }),
      ),
    ).rejects.toThrow(/active member/i);
  });
});

describe('removing someone removes them completely', () => {
  it('deletes a managed member outright and moves their children up', async () => {
    const akshay = await person('rm-managed');
    const famId = await family(akshay);
    const papa = await addRelative(akshay, famId, 'Mahendra', 'Father', akshay.userId);

    await runAsUser(akshay.userId, () => revokeMember(akshay.userId, famId, papa));

    const gone = await runAsSystem(() => prisma.user.findUnique({ where: { id: papa } }));
    expect(gone).toBeNull();
    const members = await runAsUser(akshay.userId, () => listMembers(akshay.userId, famId));
    expect(members.map((m) => m.userId)).toEqual([akshay.userId]);
    const parents = await parentsOf(akshay, famId);
    expect(parents[akshay.userId]).toBeNull();
    expect(papa in parents).toBe(false);
  });

  it('takes a member with their own login off the family, and leaves their account alone', async () => {
    const akshay = await person('rm-real-owner');
    const priya = await person('rm-real-member');
    const famId = await family(akshay, [priya]);

    await runAsUser(akshay.userId, () => revokeMember(akshay.userId, famId, priya.userId));

    const row = await runAsSystem(() =>
      prisma.familyMember.findUnique({
        where: { familyId_userId: { familyId: famId, userId: priya.userId } },
      }),
    );
    expect(row).toBeNull();
    const account = await runAsSystem(() => prisma.user.findUnique({ where: { id: priya.userId } }));
    expect(account).not.toBeNull();
  });

  it('hands managed members kept by the removed person to the owner', async () => {
    const akshay = await person('rm-kept-owner');
    const priya = await person('rm-kept-member');
    const famId = await family(akshay, [priya]);
    const res = await runAsUser(akshay.userId, () =>
      addManagedMember(akshay.userId, famId, { name: 'Dadi', managerId: priya.userId }),
    );
    if (res.status !== 'managed_added') throw new Error('expected managed_added');

    await runAsUser(akshay.userId, () => revokeMember(akshay.userId, famId, priya.userId));

    const dadi = await runAsSystem(() =>
      prisma.user.findUniqueOrThrow({ where: { id: res.userId }, select: { managedById: true } }),
    );
    expect(dadi.managedById).toBe(akshay.userId);
  });
});

describe('handing over a managed member', () => {
  it('is open to the current manager, who need not be an owner', async () => {
    const akshay = await person('ho-owner');
    const priya = await person('ho-manager');
    const ravi = await person('ho-next');
    const famId = await family(akshay, [priya, ravi]);
    const res = await runAsUser(akshay.userId, () =>
      addManagedMember(akshay.userId, famId, { name: 'Dadi', managerId: priya.userId }),
    );
    if (res.status !== 'managed_added') throw new Error('expected managed_added');

    await runAsUser(priya.userId, () =>
      setManagedMemberManager(priya.userId, famId, res.userId, ravi.userId),
    );
    const dadi = await runAsSystem(() =>
      prisma.user.findUniqueOrThrow({ where: { id: res.userId }, select: { managedById: true } }),
    );
    expect(dadi.managedById).toBe(ravi.userId);
  });

  it('is refused to a member who neither manages it nor owns the family', async () => {
    const akshay = await person('ho2-owner');
    const priya = await person('ho2-other');
    const famId = await family(akshay, [priya]);
    const res = await runAsUser(akshay.userId, () =>
      addManagedMember(akshay.userId, famId, { name: 'Dadi' }),
    );
    if (res.status !== 'managed_added') throw new Error('expected managed_added');

    await expect(
      runAsUser(priya.userId, () =>
        setManagedMemberManager(priya.userId, famId, res.userId, priya.userId),
      ),
    ).rejects.toThrow();
  });
});

describe('the family invitation email', () => {
  it('drafts a message naming the family and the relation, with the join link', async () => {
    const akshay = await person('mail-owner');
    const famId = await family(akshay);
    const inv = await runAsUser(akshay.userId, () =>
      inviteMember(akshay.userId, famId, {
        invitedEmail: 'neha.test@example.com',
        invitedName: 'Neha Jain',
        relation: 'Wife',
        relatedToId: akshay.userId,
      }),
    );
    if (inv.status !== 'invited') throw new Error('expected invited');

    const draft = await runAsUser(akshay.userId, () =>
      buildFamilyInviteEmail(akshay.userId, famId, inv.id),
    );
    expect(draft.to).toBe('neha.test@example.com');
    expect(draft.subject).toMatch(/Jains/);
    expect(draft.message).toMatch(/^Hi Neha,/);
    expect(draft.message).toMatch(/as my wife/);
    expect(draft.acceptUrl).toMatch(new RegExp(`/families/invitations/${inv.token}/accept$`));
    expect(draft.html).toContain('Join the family');
  });

  it('keeps the link out of the sender’s hands', async () => {
    const akshay = await person('mail-edit');
    const famId = await family(akshay);
    const inv = await runAsUser(akshay.userId, () =>
      inviteMember(akshay.userId, famId, { invitedEmail: 'x.test@example.com' }),
    );
    if (inv.status !== 'invited') throw new Error('expected invited');

    const draft = await runAsUser(akshay.userId, () =>
      buildFamilyInviteEmail(akshay.userId, famId, inv.id, {
        message: '<a href="https://evil.test">click</a>',
      }),
    );
    expect(draft.html).not.toContain('href="https://evil.test"');
    expect(draft.html).toContain(inv.token);
  });
});
