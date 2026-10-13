import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Prisma, WillStatus } from '@prisma/client';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getWillOverview } from '../../src/services/will/will.service.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const deps = { collect: async () => ({ candidates: [], failed: [] }), today: () => '2026-10-12' };
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function insertWill(userId: string, version: number, status: WillStatus, extra: Partial<Prisma.WillUncheckedCreateInput> = {}) {
  return runAsSystem(() =>
    prisma.will.create({ data: { userId, version, status, payload: Buffer.from('sealed-elsewhere'), ...extra } }),
  );
}

function insertVersion(userId: string, willId: string, versionNo: number, generatedOn: string) {
  return runAsSystem(() =>
    prisma.willVersion.create({
      data: {
        willId, userId, versionNo, regime: 'ISA_HINDU', templateId: 'isa-hindu', templateVersion: 1, rulesetVersion: 1,
        inputHash: 'a'.repeat(64), textHash: 'b'.repeat(64), snapshotSealed: Buffer.from('x'), documentId: 'doc-placeholder',
        pdfSha256: 'c'.repeat(64), findingsJson: [], generatedOn: day(generatedOn),
      },
    }),
  );
}

function wipe(userId: string) {
  return runAsSystem(async () => {
    await prisma.willVersion.deleteMany({ where: { userId } });
    await prisma.will.deleteMany({ where: { userId } });
  });
}

let a: TestScope;
let b: TestScope;
let c: TestScope;

beforeAll(async () => {
  a = await createTestScope('will-history-a');
  b = await createTestScope('will-history-b');
  c = await createTestScope('will-history-c');
});
afterAll(async () => {
  await wipe(a.userId);
  await wipe(b.userId);
  await wipe(c.userId);
  await a.cleanup();
  await b.cleanup();
  await c.cleanup();
});

describe('overview history and review', () => {
  let executedId = '';

  it('lists every non-discarded version with its dates, newest first, and the review that is due', async () => {
    const v1 = await insertWill(a.userId, 1, 'SUPERSEDED', {
      executedAt: day('2024-03-01'), nextReviewAt: day('2026-03-01'), executedDocumentId: 'doc-signed-1',
    });
    const v2 = await insertWill(a.userId, 2, 'EXECUTED', {
      executedAt: day('2024-10-01'), nextReviewAt: day('2026-10-01'), executedDocumentId: 'doc-signed-2',
    });
    executedId = v2.id;
    await runAsSystem(() => prisma.will.update({ where: { id: v1.id }, data: { supersededById: v2.id } }));
    await insertWill(a.userId, 3, 'DISCARDED');
    const v4 = await insertWill(a.userId, 4, 'DRAFT');
    const ver1 = await insertVersion(a.userId, v1.id, 1, '2024-02-20');
    const ver2 = await insertVersion(a.userId, v2.id, 2, '2024-09-25');

    const o = await a.runAs(() => getWillOverview(a.userId, deps));
    expect(o.status).toBe('EXECUTED');
    expect(o.history.map((h) => [h.version, h.status])).toEqual([[4, 'DRAFT'], [2, 'EXECUTED'], [1, 'SUPERSEDED']]);
    expect(o.history[0]).toMatchObject({
      willId: v4.id, generatedOn: null, executedOn: null, nextReviewAt: null, versionId: null, hasSignedCopy: false,
      supersededByVersion: null,
    });
    expect(o.history[0]?.createdOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(o.history[1]).toMatchObject({
      willId: v2.id, generatedOn: '2024-09-25', executedOn: '2024-10-01', nextReviewAt: '2026-10-01',
      versionId: ver2.id, hasSignedCopy: true, supersededByVersion: null,
    });
    expect(o.history[2]).toMatchObject({
      willId: v1.id, generatedOn: '2024-02-20', executedOn: '2024-03-01', nextReviewAt: null,
      versionId: ver1.id, hasSignedCopy: true, supersededByVersion: 2,
    });
    expect(o.review).toEqual({ willId: v2.id, version: 2, nextReviewAt: '2026-10-01', due: true });
  });

  it('a review date still ahead is shown but not due', async () => {
    await runAsSystem(() => prisma.will.update({ where: { id: executedId }, data: { nextReviewAt: day('2028-10-01') } }));
    const o = await a.runAs(() => getWillOverview(a.userId, deps));
    expect(o.review).toEqual({ willId: executedId, version: 2, nextReviewAt: '2028-10-01', due: false });
  });

  it('no wills: empty history and no review', async () => {
    const o = await b.runAs(() => getWillOverview(b.userId, deps));
    expect(o.history).toEqual([]);
    expect(o.review).toBeNull();
  });
});

describe('history edge cases', () => {
  it('a will replaced by a will that is not listed (discarded) shows no "replaced by" version', async () => {
    const discarded = await insertWill(c.userId, 2, 'DISCARDED');
    const old = await insertWill(c.userId, 1, 'SUPERSEDED', { supersededById: discarded.id });
    const o = await c.runAs(() => getWillOverview(c.userId, deps));
    expect(o.history.map((h) => h.willId)).toEqual([old.id]);
    expect(o.history[0]).toMatchObject({ status: 'SUPERSEDED', supersededByVersion: null });
  });

  it('hasSignedCopy follows the recorded document id even when its row is missing (the download then 404s)', async () => {
    const w = await insertWill(c.userId, 3, 'EXECUTED', {
      executedAt: day('2026-10-01'), nextReviewAt: day('2028-10-01'), executedDocumentId: 'no-such-document',
    });
    expect(await runAsSystem(() => prisma.document.count({ where: { id: 'no-such-document' } }))).toBe(0);
    const o = await c.runAs(() => getWillOverview(c.userId, deps));
    expect(o.history.find((h) => h.willId === w.id)).toMatchObject({ hasSignedCopy: true });
  });
});
