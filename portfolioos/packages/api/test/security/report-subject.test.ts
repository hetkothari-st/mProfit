/**
 * Who a downloaded report may be about.
 *
 * `resolveReportSubjects` is the only thing standing between a query-string
 * parameter and another person's financial position, so it is asserted here
 * rather than trusted.
 *
 * The case that matters most is the last one. The report builders emit a
 * member's WHOLE position — they take a userId and cannot yet honour
 * `visibleAssetClasses` / `visibleCategories`, because until subjects existed
 * the only userId they were ever handed was the caller's own. A capped member
 * allowed to name someone else would therefore receive, in a downloadable
 * file, exactly the rows the dashboard is built to withhold. A PDF is worse
 * than a screen for that: it leaves the session and cannot be un-shared.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Request } from 'express';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { resolveReportSubjects } from '../../src/services/reports/reportSubjects.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

let owner: TestScope;
let viewer: TestScope;
let outsider: TestScope;
let familyId: string;

/** Minimal stand-in for the parts of a Request the resolver reads. */
function req(userId: string, query: Record<string, string> = {}): Request {
  return {
    user: { id: userId },
    query,
    header: () => undefined,
  } as unknown as Request;
}

async function setCaps(userId: string, assetClasses: string[], categories: string[]) {
  await runAsSystem(async () => {
    await prisma.familyMember.updateMany({
      where: { familyId, userId },
      data: { visibleAssetClasses: assetClasses as never, visibleCategories: categories },
    });
  });
}

beforeAll(async () => {
  owner = await createTestScope('rs-owner');
  viewer = await createTestScope('rs-viewer');
  outsider = await createTestScope('rs-outsider');

  familyId = await runAsSystem(async () => {
    const family = await prisma.family.create({
      data: { name: 'Report Subject Family', createdById: owner.userId },
    });
    await prisma.familyMember.create({
      data: { familyId: family.id, userId: owner.userId, role: 'OWNER', status: 'ACTIVE' },
    });
    await prisma.familyMember.create({
      data: { familyId: family.id, userId: viewer.userId, role: 'VIEWER', status: 'ACTIVE' },
    });
    return family.id;
  });
}, 120_000);

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.familyMember.deleteMany({ where: { familyId } });
    await prisma.family.deleteMany({ where: { id: familyId } });
  });
  await owner.cleanup();
  await viewer.cleanup();
  await outsider.cleanup();
}, 120_000);

describe('resolveReportSubjects', () => {
  it('defaults to the caller alone when no subject is given', async () => {
    const resolved = await owner.runAs(() => resolveReportSubjects(req(owner.userId)));
    expect(resolved.subjects.map((s) => s.userId)).toEqual([owner.userId]);
    expect(resolved.isFamily).toBe(false);
  });

  it('needs no family context for a self report', async () => {
    // A solo user has no family at all; asking for their own report must not
    // require one, or every existing download would start failing.
    const resolved = await outsider.runAs(() =>
      resolveReportSubjects(req(outsider.userId, { subject: 'self' })),
    );
    expect(resolved.subjects.map((s) => s.userId)).toEqual([outsider.userId]);
  });

  it('refuses another member when no family is selected', async () => {
    await expect(
      owner.runAs(() => resolveReportSubjects(req(owner.userId, { subject: viewer.userId }))),
    ).rejects.toThrow(/family must be selected/i);
  });

  it('refuses a family the caller does not belong to', async () => {
    await expect(
      outsider.runAs(() =>
        resolveReportSubjects(req(outsider.userId, { subject: 'family', familyId })),
      ),
    ).rejects.toThrow();
  });

  it('refuses a stranger named as the subject', async () => {
    await expect(
      owner.runAs(() =>
        resolveReportSubjects(req(owner.userId, { subject: outsider.userId, familyId })),
      ),
    ).rejects.toThrow(/not part of a family you can see/i);
  });

  it('lets an OWNER report on one named member', async () => {
    const resolved = await owner.runAs(() =>
      resolveReportSubjects(req(owner.userId, { subject: viewer.userId, familyId })),
    );
    expect(resolved.subjects.map((s) => s.userId)).toEqual([viewer.userId]);
    expect(resolved.isFamily).toBe(false);
  });

  it('lets an OWNER report on the whole household', async () => {
    const resolved = await owner.runAs(() =>
      resolveReportSubjects(req(owner.userId, { subject: 'family', familyId })),
    );
    expect(resolved.subjects.map((s) => s.userId).sort()).toEqual(
      [owner.userId, viewer.userId].sort(),
    );
    expect(resolved.isFamily).toBe(true);
    expect(resolved.familyLabel).toBe('Report Subject Family');
  });

  it('refuses a capped member reporting on anyone else', async () => {
    // Deny-all is the state every member is in until an OWNER grants
    // something, since the column defaults to [].
    await setCaps(viewer.userId, [], []);

    await expect(
      viewer.runAs(() =>
        resolveReportSubjects(req(viewer.userId, { subject: owner.userId, familyId })),
      ),
    ).rejects.toThrow(/limited to certain categories/i);

    await expect(
      viewer.runAs(() =>
        resolveReportSubjects(req(viewer.userId, { subject: 'family', familyId })),
      ),
    ).rejects.toThrow(/limited to certain categories/i);
  });

  it('still lets a capped member report on themselves, by id as well as by "self"', async () => {
    await setCaps(viewer.userId, ['EQUITY'], []);

    const bySelf = await viewer.runAs(() =>
      resolveReportSubjects(req(viewer.userId, { subject: 'self', familyId })),
    );
    expect(bySelf.subjects.map((s) => s.userId)).toEqual([viewer.userId]);

    // Naming your own id is asking for yourself; caps never apply to your own
    // data, so this must not be caught by the check above.
    const byId = await viewer.runAs(() =>
      resolveReportSubjects(req(viewer.userId, { subject: viewer.userId, familyId })),
    );
    expect(byId.subjects.map((s) => s.userId)).toEqual([viewer.userId]);
  });

  it('lets a member granted everything report on others', async () => {
    // The check is about whether the caps actually withhold anything, not
    // about the role — a fully-granted member is not being protected from
    // data they can already see in full.
    const { AssetClass } = await import('@prisma/client');
    const { NON_AC_CATEGORIES } = await import('../../src/services/familyScope.service.js');
    await setCaps(viewer.userId, Object.values(AssetClass), [...NON_AC_CATEGORIES]);

    const resolved = await viewer.runAs(() =>
      resolveReportSubjects(req(viewer.userId, { subject: owner.userId, familyId })),
    );
    expect(resolved.subjects.map((s) => s.userId)).toEqual([owner.userId]);
  });
});
