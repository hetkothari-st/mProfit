import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  addManagedMembersBulk,
  createFamily,
  getFamilyTreeLayout,
  listMembers,
} from '../../src/services/family.service.js';

/**
 * Adding a branch of the family in one pass: relations that point at people
 * created in the same batch, all-or-none on a bad row, and seats counted for
 * the whole list rather than one person at a time.
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

async function family(owner: TestScope, seats = 20) {
  const fam = await runAsUser(owner.userId, () => createFamily(owner.userId, { name: 'Jains' }));
  await runAsSystem(() =>
    prisma.family.update({ where: { id: fam.id }, data: { includedSeats: seats } }),
  );
  cleanups.push(async () => {
    await runAsSystem(async () => {
      const managed = await prisma.familyMember.findMany({
        where: { familyId: fam.id, user: { isShadowClient: true } },
        select: { userId: true },
      });
      await prisma.familyMember.deleteMany({ where: { familyId: fam.id } });
      await prisma.user.deleteMany({ where: { id: { in: managed.map((m) => m.userId) } } });
      await prisma.family.delete({ where: { id: fam.id } });
    });
  });
  return fam.id;
}

const managedCount = (familyId: string) =>
  runAsSystem(() =>
    prisma.familyMember.count({ where: { familyId, user: { isShadowClient: true } } }),
  );

describe('adding several family members at once', () => {
  it('adds everyone, including people related to someone in the same batch', async () => {
    const akshay = await person('bulk-owner');
    const famId = await family(akshay);

    const res = await runAsUser(akshay.userId, () =>
      addManagedMembersBulk(akshay.userId, famId, [
        { name: 'Mahendra Jain', relation: 'Father', relatedToId: akshay.userId },
        // Neither of these could be entered before Mahendra existed.
        { name: 'Sarita Jain', relation: 'Wife', relatedToRow: 0 },
        { name: 'Shalin Jain', relation: 'Son', relatedToRow: 0 },
      ]),
    );
    expect(res.added).toHaveLength(3);
    const [mahendra, sarita, shalin] = res.added.map((a) => a.userId);

    const members = await runAsUser(akshay.userId, () => listMembers(akshay.userId, famId));
    expect(members).toHaveLength(4);
    expect(members.find((m) => m.userId === sarita)?.relatedTo?.id).toBe(mahendra);

    const layout = await runAsUser(akshay.userId, () =>
      getFamilyTreeLayout(akshay.userId, famId),
    );
    // Father above, wife joined to him, son below him.
    expect((layout?.parents ?? {})[akshay.userId]).toBe(mahendra);
    expect(layout?.partners).toEqual([[sarita, mahendra]]);
    expect((layout?.parents ?? {})[shalin!]).toBe(mahendra);

    // Each of them can be given holdings straight away.
    const portfolios = await runAsSystem(() =>
      prisma.portfolio.count({ where: { userId: { in: [mahendra!, sarita!, shalin!] } } }),
    );
    expect(portfolios).toBe(3);
  });

  it('adds nobody when one row is wrong', async () => {
    const akshay = await person('bulk-atomic');
    const famId = await family(akshay);

    await expect(
      runAsUser(akshay.userId, () =>
        addManagedMembersBulk(akshay.userId, famId, [
          { name: 'Mahendra Jain', relation: 'Father', relatedToId: akshay.userId },
          { name: 'Nobody', relation: 'Son', relatedToId: 'not-a-member' },
        ]),
      ),
    ).rejects.toThrow();
    // Not "Mahendra went in and the rest did not" — the half that lands is
    // the half everyone else was related to.
    expect(await managedCount(famId)).toBe(0);
  });

  it('refuses a row related to someone listed below it', async () => {
    const akshay = await person('bulk-order');
    const famId = await family(akshay);

    await expect(
      runAsUser(akshay.userId, () =>
        addManagedMembersBulk(akshay.userId, famId, [
          { name: 'Sarita Jain', relation: 'Wife', relatedToRow: 1 },
          { name: 'Mahendra Jain', relation: 'Father', relatedToId: akshay.userId },
        ]),
      ),
    ).rejects.toThrow(/listed above/i);
    expect(await managedCount(famId)).toBe(0);
  });

  it('counts seats for the whole list, before adding anyone', async () => {
    const akshay = await person('bulk-seats');
    // Three seats, one of them already the owner's.
    const famId = await family(akshay, 3);

    await expect(
      runAsUser(akshay.userId, () =>
        addManagedMembersBulk(akshay.userId, famId, [
          { name: 'One', relation: 'Son', relatedToId: akshay.userId },
          { name: 'Two', relation: 'Son', relatedToId: akshay.userId },
          { name: 'Three', relation: 'Son', relatedToId: akshay.userId },
        ]),
      ),
    ).rejects.toThrow(/seat/i);
    expect(await managedCount(famId)).toBe(0);

    // Two fit, and go in.
    const res = await runAsUser(akshay.userId, () =>
      addManagedMembersBulk(akshay.userId, famId, [
        { name: 'One', relation: 'Son', relatedToId: akshay.userId },
        { name: 'Two', relation: 'Son', relatedToId: akshay.userId },
      ]),
    );
    expect(res.added).toHaveLength(2);
    expect(res.seatsUsed).toBe(3);
  });

  it('is owners only', async () => {
    const akshay = await person('bulk-owner-only');
    const priya = await person('bulk-contributor');
    const famId = await family(akshay);
    await runAsSystem(() =>
      prisma.familyMember.create({
        data: {
          familyId: famId,
          userId: priya.userId,
          role: 'CONTRIBUTOR',
          status: 'ACTIVE',
          invitedById: akshay.userId,
        },
      }),
    );

    await expect(
      runAsUser(priya.userId, () =>
        addManagedMembersBulk(priya.userId, famId, [
          { name: 'Someone', relation: 'Son', relatedToId: priya.userId },
        ]),
      ),
    ).rejects.toThrow();
    expect(await managedCount(famId)).toBe(0);
  });
});
