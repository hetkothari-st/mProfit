import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createWillDraft } from '../../src/services/will/will.service.js';
import {
  getSignedCopy, getWillExecution, recordWillExecution, signedCopyMime,
} from '../../src/services/will/willExecute.service.js';
import {
  FAKE_PDF, GIF_BYTES, HTML_BYTES, JPEG_BYTES, PNG_BYTES, WEBP_BYTES, makeGeneratedWill, wipeWills,
} from './willExecuteFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

/** Wills are generated on TODAY (2026-10-12); these tests sign them a little later. */
const LATER = '2026-11-02';
const deps = { today: () => LATER };
const fields = (p: Partial<{ executedOn: string; witnesses: string[] }> = {}) => ({
  executedOn: '2026-10-20', witnesses: ['Asha Rao', 'Vikram Shah'], ...p,
});
const signedDocs = (userId: string) =>
  runAsSystem(() => prisma.document.count({ where: { userId, ownerType: 'WILL', category: 'executed' } }));
const willRow = (id: string) => runAsSystem(() => prisma.will.findUniqueOrThrow({ where: { id } }));

let a: TestScope;
let b: TestScope;

beforeAll(async () => {
  a = await createTestScope('will-exec-a');
  b = await createTestScope('will-exec-b');
});
afterAll(async () => {
  await wipeWills(a.userId);
  await wipeWills(b.userId);
  await a.cleanup();
  await b.cleanup();
});

describe('signedCopyMime', () => {
  it('accepts PDF, PNG, JPEG and WebP bytes only', () => {
    expect(signedCopyMime(FAKE_PDF)).toBe('application/pdf');
    expect(signedCopyMime(PNG_BYTES)).toBe('image/png');
    expect(signedCopyMime(JPEG_BYTES)).toBe('image/jpeg');
    expect(signedCopyMime(WEBP_BYTES)).toBe('image/webp');
    expect(signedCopyMime(GIF_BYTES)).toBeNull();
    expect(signedCopyMime(HTML_BYTES)).toBeNull();
    expect(signedCopyMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('recording the signed will', () => {
  let willId = '';
  let firstDocId = '';

  it('stores the signed copy, seals the witnesses and sets the review date', async () => {
    ({ willId } = await makeGeneratedWill(a));
    const r = await a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields(), file: { buffer: FAKE_PDF } }, deps));
    expect(r).toMatchObject({ newCopy: true, replacedCopy: false });
    expect(r.execution).toMatchObject({
      willId, version: 1, status: 'EXECUTED', generatedOn: '2026-10-12', executedOn: '2026-10-20',
      nextReviewAt: '2028-10-20', witnesses: ['Asha Rao', 'Vikram Shah'], warnings: [],
    });
    expect(r.execution.signedCopy).toMatchObject({ fileName: 'will-v1-signed.pdf', mimeType: 'application/pdf', sizeBytes: FAKE_PDF.length });

    const row = await willRow(willId);
    expect(row.status).toBe('EXECUTED');
    expect(row.executedAt?.toISOString().slice(0, 10)).toBe('2026-10-20');
    expect(row.executionSealed).not.toBeNull();
    const sealed = Buffer.from(row.executionSealed ?? new Uint8Array());
    expect(sealed.includes(Buffer.from('Asha'))).toBe(false);
    expect(sealed.includes(Buffer.from('Vikram'))).toBe(false);
    firstDocId = row.executedDocumentId ?? '';
    const doc = await runAsSystem(() => prisma.document.findUniqueOrThrow({ where: { id: firstDocId } }));
    expect(doc).toMatchObject({ ownerType: 'WILL', ownerId: willId, category: 'executed', mimeType: 'application/pdf' });

    const back = await a.runAs(() => getWillExecution(a.userId, willId));
    expect(back.witnesses).toEqual(['Asha Rao', 'Vikram Shah']);
    const file = await a.runAs(() => getSignedCopy(a.userId, willId));
    expect(file.buffer.equals(FAKE_PDF)).toBe(true);
    expect(file).toMatchObject({ mimeType: 'application/pdf', fileName: 'will-v1-signed.pdf', versionNo: 1 });
  });

  it('corrects the details without a new file and keeps the copy', async () => {
    const r = await a.runAs(() =>
      recordWillExecution(a.userId, willId, { fields: fields({ witnesses: ['Asha Rao', 'Vikram K Shah'] }), file: null }, deps),
    );
    expect(r).toMatchObject({ newCopy: false, replacedCopy: false });
    expect(r.execution.witnesses).toEqual(['Asha Rao', 'Vikram K Shah']);
    expect((await willRow(willId)).executedDocumentId).toBe(firstDocId);
  });

  it('replaces the copy with a photo and removes the old file', async () => {
    const r = await a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields(), file: { buffer: PNG_BYTES } }, deps));
    expect(r).toMatchObject({ newCopy: true, replacedCopy: true });
    expect(r.execution.signedCopy).toMatchObject({ fileName: 'will-v1-signed.png', mimeType: 'image/png' });
    expect(await runAsSystem(() => prisma.document.count({ where: { id: firstDocId } }))).toBe(0);
    expect(await signedDocs(a.userId)).toBe(1);
  });

  it('warns when a witness is a beneficiary, and keeps the warning on read', async () => {
    const r = await a.runAs(() =>
      recordWillExecution(a.userId, willId, { fields: fields({ witnesses: ['  sunita   VERMA', 'Vikram Shah'] }), file: null }, deps),
    );
    expect(r.execution.warnings).toEqual(['WITNESS_IS_BENEFICIARY']);
    expect((await a.runAs(() => getWillExecution(a.userId, willId))).warnings).toEqual(['WITNESS_IS_BENEFICIARY']);
  });

  it('refuses the testator as a witness and the same person twice, without echoing names', async () => {
    const err = await a
      .runAs(() => recordWillExecution(a.userId, willId, { fields: fields({ witnesses: ['Ramesh Kumar Verma', 'Asha Rao'] }), file: null }, deps))
      .catch((e: unknown) => e as { statusCode: number; details: unknown });
    expect(err.statusCode).toBe(422);
    expect(err.details).toEqual({ issues: [{ path: 'witnesses.0', code: 'witness_is_testator' }] });
    await expect(
      a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields({ witnesses: ['Asha Rao', 'ASHA rao'] }), file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 422, details: { issues: [{ path: 'witnesses.1', code: 'duplicate_witness' }] } });
  });

  it('refuses dates in the future or before the will was generated', async () => {
    await expect(
      a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields({ executedOn: '2026-11-03' }), file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 422, details: { issues: [{ path: 'executedOn', code: 'in_future' }] } });
    await expect(
      a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields({ executedOn: '2026-10-11' }), file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 422, details: { issues: [{ path: 'executedOn', code: 'before_generated' }] } });
    await expect(
      a.runAs(() => recordWillExecution(a.userId, willId, { fields: { executedOn: '20/10/2026', witnesses: ['Asha Rao'] }, file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('another user cannot read or record it', async () => {
    await expect(b.runAs(() => getWillExecution(b.userId, willId))).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      b.runAs(() => recordWillExecution(b.userId, willId, { fields: fields(), file: { buffer: FAKE_PDF } }, deps)),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(b.runAs(() => getSignedCopy(b.userId, willId))).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a replaced will is read-only but keeps its record', async () => {
    await makeGeneratedWill(a);
    const old = await a.runAs(() => getWillExecution(a.userId, willId));
    expect(old).toMatchObject({ status: 'SUPERSEDED', executedOn: '2026-10-20', nextReviewAt: null });
    await expect(
      a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields(), file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 409, details: { reason: 'WILL_NOT_EXECUTABLE' } });
  });

  it('a draft cannot be signed', async () => {
    const draft = await a.runAs(() => createWillDraft(a.userId, null));
    await expect(a.runAs(() => getWillExecution(a.userId, draft.id))).rejects.toMatchObject({
      statusCode: 409, details: { reason: 'WILL_NOT_EXECUTABLE' },
    });
  });
});

describe('refusals that store nothing', () => {
  let willId = '';

  it('refuses bad bytes and needs a file the first time', async () => {
    ({ willId } = await makeGeneratedWill(b));
    await expect(
      b.runAs(() => recordWillExecution(b.userId, willId, { fields: fields(), file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 400, details: { field: 'file' } });
    for (const buffer of [HTML_BYTES, GIF_BYTES]) {
      await expect(
        b.runAs(() => recordWillExecution(b.userId, willId, { fields: fields(), file: { buffer } }, deps)),
      ).rejects.toMatchObject({ statusCode: 400, details: { reason: 'WILL_UPLOAD_TYPE' } });
    }
    expect(await signedDocs(b.userId)).toBe(0);
    expect((await willRow(willId)).status).toBe('GENERATED');
  });

  it('cleans up the new file when the save loses a race', async () => {
    const racing = {
      today: () => LATER,
      beforeCommit: () => runAsSystem(async () => {
        await prisma.will.update({ where: { id: willId }, data: { executedDocumentId: 'saved-by-another-tab' } });
      }),
    };
    await expect(
      b.runAs(() => recordWillExecution(b.userId, willId, { fields: fields(), file: { buffer: FAKE_PDF } }, racing)),
    ).rejects.toMatchObject({ statusCode: 409, details: { reason: 'WILL_EXECUTION_CONFLICT' } });
    expect(await signedDocs(b.userId)).toBe(0);
    const row = await willRow(willId);
    expect(row).toMatchObject({ status: 'GENERATED', executionSealed: null });
  });
});
