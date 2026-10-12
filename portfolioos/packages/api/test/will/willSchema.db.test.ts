import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { WillStatus } from '@prisma/client';
import { hasFeature } from '@everypaisa/shared';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { ForbiddenError } from '../../src/lib/errors.js';
import { purgeUser } from '../../src/services/accountDeletion.service.js';
import {
  createDocument, deleteDocument, replaceDocumentBytes, updateDocumentMeta,
} from '../../src/services/document.service.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

function insertWill(userId: string, status: WillStatus, version: number) {
  return runAsSystem(() =>
    prisma.will.create({ data: { userId, version, status, payload: Buffer.from('sealed-elsewhere') } }),
  );
}

function insertVersion(userId: string, willId: string) {
  return runAsSystem(() =>
    prisma.willVersion.create({
      data: {
        willId, userId, versionNo: 1, regime: 'ISA_HINDU', templateId: 'isa-hindu', templateVersion: 1,
        rulesetVersion: 1, inputHash: 'a'.repeat(64), textHash: 'b'.repeat(64), snapshotSealed: Buffer.from('x'),
        documentId: 'doc-placeholder', pdfSha256: 'c'.repeat(64), findingsJson: [],
        generatedOn: new Date('2026-10-12T00:00:00Z'),
      },
    }),
  );
}

function wipeWills(userId: string) {
  return runAsSystem(async () => {
    await prisma.willVersion.deleteMany({ where: { userId } });
    await prisma.will.deleteMany({ where: { userId } });
  });
}

const pdf = () => Buffer.from('%PDF-1.7 test');

describe('Will tables', () => {
  let a: TestScope;
  let b: TestScope;

  beforeAll(async () => {
    a = await createTestScope('will-a');
    b = await createTestScope('will-b');
  });
  afterAll(async () => {
    await wipeWills(a.userId);
    await wipeWills(b.userId);
    await a.cleanup();
    await b.cleanup();
  });

  it('WILL_MAKER needs PLUS', () => {
    expect(hasFeature('FREE', 'WILL_MAKER')).toBe(false);
    expect(hasFeature('PLUS', 'WILL_MAKER')).toBe(true);
  });

  it('a user sees only their own wills', async () => {
    const w = await insertWill(a.userId, 'GENERATED', 1);
    expect(await a.runAs(() => prisma.will.count({ where: { id: w.id } }))).toBe(1);
    expect(await b.runAs(() => prisma.will.count({ where: { id: w.id } }))).toBe(0);
    await wipeWills(a.userId);
  });

  it('allows one DRAFT per user, any number of other statuses', async () => {
    await insertWill(a.userId, 'DRAFT', 10);
    await expect(insertWill(a.userId, 'DRAFT', 11)).rejects.toMatchObject({ code: 'P2002' });
    await insertWill(a.userId, 'GENERATED', 12);
    await insertWill(a.userId, 'SUPERSEDED', 13);
    await insertWill(b.userId, 'DRAFT', 10);
    await wipeWills(a.userId);
    await wipeWills(b.userId);
  });

  it('WillVersion rows cannot be updated, and users cannot delete them', async () => {
    const w = await insertWill(a.userId, 'GENERATED', 20);
    const v = await insertVersion(a.userId, w.id);
    await expect(
      runAsSystem(() => prisma.willVersion.update({ where: { id: v.id }, data: { textHash: 'd'.repeat(64) } })),
    ).rejects.toThrow();
    const del = await a.runAs(() => prisma.willVersion.deleteMany({ where: { id: v.id } }));
    expect(del.count).toBe(0);
    expect(await a.runAs(() => prisma.willVersion.count({ where: { id: v.id } }))).toBe(1);
    await wipeWills(a.userId);
  });

  it('WILL documents: owner check, and read-only in the vault', async () => {
    const w = await insertWill(a.userId, 'GENERATED', 30);
    const doc = await a.runAs(() =>
      createDocument({ userId: a.userId, ownerType: 'WILL', ownerId: w.id, fileName: 'will-v30.pdf', mimeType: 'application/pdf', buffer: pdf() }),
    );
    expect(doc.ownerType).toBe('WILL');
    await expect(
      b.runAs(() => createDocument({ userId: b.userId, ownerType: 'WILL', ownerId: w.id, fileName: 'x.pdf', mimeType: 'application/pdf', buffer: pdf() })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(a.runAs(() => updateDocumentMeta(a.userId, doc.id, { fileName: 'x.pdf' }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(a.runAs(() => replaceDocumentBytes(a.userId, doc.id, Buffer.from('y')))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(a.runAs(() => deleteDocument(a.userId, doc.id))).rejects.toBeInstanceOf(ForbiddenError);
    await a.runAs(() => deleteDocument(a.userId, doc.id, { allowWill: true }));
    expect(await a.runAs(() => prisma.document.count({ where: { id: doc.id } }))).toBe(0);
    await wipeWills(a.userId);
  });

  it('account purge removes wills, versions and will PDFs', async () => {
    const victim = await createTestScope('will-purge');
    const w = await insertWill(victim.userId, 'GENERATED', 1);
    await insertVersion(victim.userId, w.id);
    await victim.runAs(() =>
      createDocument({ userId: victim.userId, ownerType: 'WILL', ownerId: w.id, fileName: 'will-v1.pdf', mimeType: 'application/pdf', buffer: pdf() }),
    );
    await runAsSystem(() => purgeUser(victim.userId));
    const left = await runAsSystem(async () => ({
      wills: await prisma.will.count({ where: { userId: victim.userId } }),
      versions: await prisma.willVersion.count({ where: { userId: victim.userId } }),
      docs: await prisma.document.count({ where: { userId: victim.userId } }),
      blobs: await prisma.documentBlob.count({ where: { userId: victim.userId } }),
    }));
    expect(left).toEqual({ wills: 0, versions: 0, docs: 0, blobs: 0 });
    // The user row is gone, so victim.cleanup() would fail; nothing else to remove.
  });
});
