/**
 * A will is the owner's alone. The vault-wide list and the zip download are
 * subject-aware (a CA can read a client's paperwork, a family owner a
 * member's), so both must leave WILL documents out whenever the subject is
 * reached through anyone other than the owner themselves.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import type { Request } from 'express';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { fakeResponse } from '../helpers/fakeResponse.js';
import { createDocument } from '../../src/services/documents/document.service.js';
import { createWillDraft } from '../../src/services/will/will.service.js';
import type { SubjectVia } from '../../src/services/reports/reportSubjects.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const subjectState: { via: SubjectVia; userId: string } = { via: 'SELF', userId: '' };

vi.mock('../../src/services/reports/reportSubjects.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/reports/reportSubjects.js')>();
  return {
    ...actual,
    resolveReportSubjects: async () => ({
      subjects: [{ userId: subjectState.userId, label: 'Subject' }],
      isFamily: false,
      via: subjectState.via,
    }),
  };
});

const { listAllDocumentsHandler, bulkDownloadDocumentsHandler } = await import(
  '../../src/controllers/document.controller.js'
);

let s: TestScope;
let willDocId = '';
let otherDocId = '';

function req(body: unknown = {}): Request {
  return { user: { id: s.userId }, query: {}, params: {}, headers: {}, body, header: () => undefined } as unknown as Request;
}

async function listedIds(via: SubjectVia): Promise<string[]> {
  subjectState.via = via;
  const r = fakeResponse();
  await s.runAs(() => listAllDocumentsHandler(req(), r.res));
  const body = r.json() as { data: Array<{ id: string }> };
  return body.data.map((d) => d.id);
}

async function zippedNames(via: SubjectVia): Promise<string[]> {
  subjectState.via = via;
  const r = fakeResponse();
  await s.runAs(() => bulkDownloadDocumentsHandler(req({ ids: [willDocId, otherDocId] }), r.res));
  await r.finished;
  const zip = await JSZip.loadAsync(r.body());
  return Object.keys(zip.files);
}

beforeAll(async () => {
  s = await createTestScope('doc-will-vis');
  subjectState.userId = s.userId;
  const will = await s.runAs(() => createWillDraft(s.userId, null));
  const pdf = Buffer.from('%PDF-1.7 will');
  willDocId = (await s.runAs(() => createDocument({
    userId: s.userId, ownerType: 'WILL', ownerId: will.id, fileName: 'will-v1.pdf', mimeType: 'application/pdf', buffer: pdf,
  }))).id;
  otherDocId = (await s.runAs(() => createDocument({
    userId: s.userId, ownerType: 'OTHER', ownerId: s.userId, fileName: 'note.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 note'),
  }))).id;
});

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.document.deleteMany({ where: { userId: s.userId } });
    await prisma.documentBlob.deleteMany({ where: { userId: s.userId } });
    await prisma.will.deleteMany({ where: { userId: s.userId } });
  });
  await s.cleanup();
});

describe('vault list and zip hide WILL documents from anyone but the owner', () => {
  it('lists the will for the owner', async () => {
    expect(await listedIds('SELF')).toEqual(expect.arrayContaining([willDocId, otherDocId]));
  });

  it('leaves the will out of a CA list', async () => {
    const ids = await listedIds('CA');
    expect(ids).toContain(otherDocId);
    expect(ids).not.toContain(willDocId);
  });

  it('leaves the will out of a family list', async () => {
    const ids = await listedIds('FAMILY');
    expect(ids).toContain(otherDocId);
    expect(ids).not.toContain(willDocId);
  });

  it('zips the will for the owner', async () => {
    const names = await zippedNames('SELF');
    expect(names.some((n) => n.endsWith('will-v1.pdf'))).toBe(true);
  });

  it('leaves the will out of a CA zip', async () => {
    const names = await zippedNames('CA');
    expect(names.some((n) => n.endsWith('note.pdf'))).toBe(true);
    expect(names.some((n) => n.endsWith('will-v1.pdf'))).toBe(false);
  });

  it('leaves the will out of a family zip', async () => {
    const names = await zippedNames('FAMILY');
    expect(names.some((n) => n.endsWith('note.pdf'))).toBe(true);
    expect(names.some((n) => n.endsWith('will-v1.pdf'))).toBe(false);
  });
});
