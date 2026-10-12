import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderWillText, selectWillTemplate, WILL_SECTIONS, willSectionData } from '@everypaisa/shared';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { saveBuffer } from '../../src/lib/documentStorage.js';
import { createWillDraft, saveWillSection } from '../../src/services/will/will.service.js';
import {
  canonicalJson, generateWill, getWillVersionPdf, previewWill, sha256Hex,
} from '../../src/services/will/willGenerate.service.js';
import { renderWillPdf } from '../../src/services/will/willPdf.js';
import { TODAY, validWillPayload } from './willFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const deps = { renderPdf: renderWillPdf, today: () => TODAY };
let a: TestScope;
let b: TestScope;

/** A draft holding validWillPayload(), saved section by section the way the wizard does. */
async function validDraft(scope: TestScope, fromWillId: string | null = null): Promise<{ id: string; revision: number }> {
  const d = await scope.runAs(() => createWillDraft(scope.userId, fromWillId));
  const p = validWillPayload();
  let revision = 0;
  for (const section of WILL_SECTIONS) {
    const res = await scope.runAs(() =>
      saveWillSection(scope.userId, d.id, section, { revision, currentStep: 7, data: willSectionData(p, section) }),
    );
    revision = res.revision;
  }
  return { id: d.id, revision };
}

const willDocs = (userId: string) =>
  runAsSystem(() => prisma.document.count({ where: { userId, ownerType: 'WILL' } }));

beforeAll(async () => {
  a = await createTestScope('will-gen-a');
  b = await createTestScope('will-gen-b');
});
afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.willVersion.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
    await prisma.will.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
  });
  await a.cleanup();
  await b.cleanup();
});

describe('preview', () => {
  it('renders the summary and the will from the stored draft', async () => {
    const d = await validDraft(b);
    const pv = await b.runAs(() => previewWill(b.userId, d.id, deps));
    expect(pv).toMatchObject({ templateId: 'isa-hindu', templateVersion: 1, generatedOn: TODAY });
    expect(renderWillText(pv.document)).toContain('LAST WILL AND TESTAMENT');
    expect(renderWillText(pv.summary)).toContain('will carry out your will as executor');
    await runAsSystem(() => prisma.will.deleteMany({ where: { userId: b.userId } }));
  });

  it('refuses while a blocker remains, naming rule ids only', async () => {
    const d = await b.runAs(() => createWillDraft(b.userId, null));
    await expect(b.runAs(() => previewWill(b.userId, d.id, deps))).rejects.toMatchObject({
      statusCode: 422, details: { reason: 'WILL_BLOCKED', ruleIds: expect.arrayContaining(['REQUIRED_FIELDS', 'EXECUTOR_APPOINTED']) },
    });
    await runAsSystem(() => prisma.will.deleteMany({ where: { userId: b.userId } }));
  });
});

describe('generate', () => {
  let firstWillId = '';
  let firstVersionId = '';

  it('needs the acknowledgement', async () => {
    const d = await validDraft(a);
    firstWillId = d.id;
    await expect(a.runAs(() => generateWill(a.userId, d.id, { revision: d.revision, acknowledge: false }, deps)))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a stale revision and leaves no PDF behind', async () => {
    await expect(a.runAs(() => generateWill(a.userId, firstWillId, { revision: 0, acknowledge: true }, deps)))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(await willDocs(a.userId)).toBe(0);
  });

  it('a failing PDF render changes nothing', async () => {
    const draft = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    const failing = { ...deps, renderPdf: async () => { throw new Error('render failed'); } };
    await expect(a.runAs(() => generateWill(a.userId, firstWillId, { revision: draft.revision, acknowledge: true }, failing)))
      .rejects.toThrow('render failed');
    const after = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    expect(after.status).toBe('DRAFT');
    expect(await willDocs(a.userId)).toBe(0);
  });

  it('a save that lands mid-generate wins: the PDF is removed and the draft stays a draft', async () => {
    const draft = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    const racing = {
      ...deps,
      renderPdf: async (input: Parameters<typeof renderWillPdf>[0]) => {
        await saveWillSection(a.userId, firstWillId, 'instructions', { revision: draft.revision, currentStep: 8, data: { text: 'Changed in another tab' } });
        return renderWillPdf(input);
      },
    };
    await expect(a.runAs(() => generateWill(a.userId, firstWillId, { revision: draft.revision, acknowledge: true }, racing)))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(await willDocs(a.userId)).toBe(0);
    expect((await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }))).status).toBe('DRAFT');
    // Put the original wording back for the next test.
    const now = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    await a.runAs(() => saveWillSection(a.userId, firstWillId, 'instructions', { revision: now.revision, currentStep: 8, data: validWillPayload().instructions }));
  });

  it('creates the version, the sealed snapshot and the PDF document', async () => {
    const draft = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    const res = await a.runAs(() => generateWill(a.userId, firstWillId, { revision: draft.revision, acknowledge: true }, deps));
    firstVersionId = res.version.id;
    expect(res.version).toMatchObject({ willId: firstWillId, versionNo: 1, status: 'GENERATED', generatedOn: TODAY, templateId: 'isa-hindu' });

    const p = validWillPayload();
    const v = await a.runAs(() => prisma.willVersion.findUniqueOrThrow({ where: { id: firstVersionId } }));
    expect(v.textHash).toBe(sha256Hex(renderWillText(selectWillTemplate(p).render(p, { generatedOn: TODAY }))));
    expect(v.inputHash).toBe(sha256Hex(canonicalJson(p)));
    expect(v.findingsJson).toEqual([{ ruleId: 'LEGAL_REVIEW_RECOMMENDED', severity: 'INFO' }]);
    expect(Buffer.from(v.snapshotSealed).includes(Buffer.from('Ramesh'))).toBe(false);

    const will = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    expect(will.status).toBe('GENERATED');
    expect(will.generatedAt).not.toBeNull();

    const pdf = await a.runAs(() => getWillVersionPdf(a.userId, firstVersionId));
    expect(pdf.fileName).toBe('will-v1.pdf');
    expect(sha256Hex(pdf.buffer)).toBe(v.pdfSha256);
    const doc = await a.runAs(() => prisma.document.findUniqueOrThrow({ where: { id: v.documentId } }));
    expect(doc).toMatchObject({ ownerType: 'WILL', ownerId: firstWillId, mimeType: 'application/pdf' });
  });

  it('another user cannot download it', async () => {
    await expect(b.runAs(() => getWillVersionPdf(b.userId, firstVersionId))).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a newer generated will supersedes the older one', async () => {
    const d = await validDraft(a, firstWillId);
    const res = await a.runAs(() => generateWill(a.userId, d.id, { revision: d.revision, acknowledge: true }, deps));
    expect(res.version.versionNo).toBe(2);
    const first = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    expect(first).toMatchObject({ status: 'SUPERSEDED', supersededById: d.id });
  });

  it('a tampered PDF fails its integrity check', async () => {
    const v = await a.runAs(() => prisma.willVersion.findUniqueOrThrow({ where: { id: firstVersionId } }));
    const doc = await a.runAs(() => prisma.document.findUniqueOrThrow({ where: { id: v.documentId } }));
    await saveBuffer(a.userId, doc.storageKey, Buffer.from('%PDF-1.7 tampered'));
    await expect(a.runAs(() => getWillVersionPdf(a.userId, firstVersionId))).rejects.toMatchObject({ statusCode: 500, code: 'WILL_PDF_INTEGRITY' });
  });
});
