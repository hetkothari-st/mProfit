import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser, runAsSystem } from '../../src/lib/requestContext.js';

/**
 * Migration 20261006170000. Runs against the NOBYPASSRLS app role, so the
 * database policies themselves are under test, not the service layer.
 *
 *   - A VIEWER of a family can read a family-shared portfolio and the family,
 *     but can no longer DELETE either (DELETE used to be judged by the read
 *     policy alone). The OWNER still can.
 *   - AuditLog is append-only for users: they insert rows about themselves
 *     only, and cannot edit or delete their own trail.
 */
describe('RLS: family deletes need an owner; audit log is append-only', () => {
  let owner: TestScope;
  let viewer: TestScope;
  let familyId: string;
  let familyPortfolioId: string;

  beforeAll(async () => {
    owner = await createTestScope('rls-del-owner');
    viewer = await createTestScope('rls-del-viewer');
    ({ familyId, familyPortfolioId } = await runAsSystem(async () => {
      const family = await prisma.family.create({ data: { name: 'Test family', createdById: owner.userId } });
      await prisma.familyMember.create({ data: { familyId: family.id, userId: owner.userId, role: 'OWNER' } });
      await prisma.familyMember.create({ data: { familyId: family.id, userId: viewer.userId, role: 'VIEWER' } });
      const p = await prisma.portfolio.create({
        data: { name: 'Shared pot', userId: owner.userId, familyId: family.id },
      });
      return { familyId: family.id, familyPortfolioId: p.id };
    }));
  });

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.auditLog.deleteMany({ where: { userId: { in: [owner.userId, viewer.userId] } } });
      await prisma.portfolio.deleteMany({ where: { familyId } });
      await prisma.familyMember.deleteMany({ where: { familyId } });
      await prisma.family.deleteMany({ where: { id: familyId } });
    });
    await viewer.cleanup();
    await owner.cleanup();
  });

  it('a viewer can see the shared portfolio but cannot delete it', async () => {
    const seen = await runAsUser(viewer.userId, () =>
      prisma.portfolio.findUnique({ where: { id: familyPortfolioId } }),
    );
    expect(seen?.id).toBe(familyPortfolioId);
    const deleted = await runAsUser(viewer.userId, () =>
      prisma.portfolio.deleteMany({ where: { id: familyPortfolioId } }),
    );
    expect(deleted.count).toBe(0);
  });

  it('a viewer cannot delete the family', async () => {
    const deleted = await runAsUser(viewer.userId, () => prisma.family.deleteMany({ where: { id: familyId } }));
    expect(deleted.count).toBe(0);
    const still = await runAsSystem(() => prisma.family.findUnique({ where: { id: familyId } }));
    expect(still).not.toBeNull();
  });

  it('the owner can still delete a shared portfolio', async () => {
    const extra = await runAsSystem(() =>
      prisma.portfolio.create({ data: { name: 'Disposable', userId: owner.userId, familyId } }),
    );
    const deleted = await runAsUser(owner.userId, () => prisma.portfolio.deleteMany({ where: { id: extra.id } }));
    expect(deleted.count).toBe(1);
  });

  it('a user cannot write an audit row under someone else', async () => {
    await expect(
      runAsUser(viewer.userId, () =>
        prisma.auditLog.create({ data: { userId: owner.userId, action: 'login' } }),
      ),
    ).rejects.toThrow();
  });

  it('a user can log about themselves but cannot edit or delete their trail', async () => {
    const row = await runAsUser(viewer.userId, () =>
      prisma.auditLog.create({ data: { userId: viewer.userId, action: 'login' } }),
    );
    const updated = await runAsUser(viewer.userId, () =>
      prisma.auditLog.updateMany({ where: { id: row.id }, data: { action: 'tampered' } }),
    );
    const removed = await runAsUser(viewer.userId, () => prisma.auditLog.deleteMany({ where: { id: row.id } }));
    expect([updated.count, removed.count]).toEqual([0, 0]);
    const kept = await runAsSystem(() => prisma.auditLog.findUnique({ where: { id: row.id } }));
    expect(kept?.action).toBe('login');
  });
});
