import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { createDocument } from '../../src/services/document.service.js';
import { recordWillExecution } from '../../src/services/will/willExecute.service.js';
import { buildLegacyView } from '../../src/services/legacy/view.service.js';
import { FAKE_PDF, PNG_BYTES, makeGeneratedWill, wipeWills } from './willExecuteFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

/** Wills are generated on 2026-10-12; they are signed a little later. */
const deps = { today: () => '2026-11-02' };
const fields = { executedOn: '2026-10-20', witnesses: ['Asha Rao', 'Vikram Shah'] };
const willRow = (id: string) => runAsSystem(() => prisma.will.findUniqueOrThrow({ where: { id } }));

let a: TestScope;
let planId = '';
let otherDocId = '';

beforeAll(async () => {
  a = await createTestScope('will-succession-a');
  planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: a.userId, status: 'RELEASED', releasedAt: new Date() } }))).id;
  otherDocId = (await a.runAs(() => createDocument({
    userId: a.userId, ownerType: 'OTHER', ownerId: a.userId, fileName: 'deed.pdf', mimeType: 'application/pdf', buffer: FAKE_PDF,
  }))).id;
});
afterAll(async () => {
  await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: a.userId } }));
  await wipeWills(a.userId);
  await a.cleanup();
});

const mkNominee = (email: string, documentIds: string[]) =>
  runAsSystem(() => prisma.legacyNominee.create({ data: {
    planId, userId: a.userId, nameEnc: encryptSecret('N'), emailEnc: encryptSecret(email), relationship: 'Executor', priority: 1,
    categories: ['DOCUMENTS'], documentIds,
  } })).then((n) => n.id);
const nomineeDocs = (id: string) =>
  runAsSystem(() => prisma.legacyNominee.findUniqueOrThrow({ where: { id } })).then((n) => n.documentIds);

describe('replacing a signed copy that a Succession nominee shares', () => {
  it('moves every nominee holding the old copy to the new one, and the released view includes it', async () => {
    const { willId } = await makeGeneratedWill(a);
    await a.runAs(() => recordWillExecution(a.userId, willId, { fields, file: { buffer: FAKE_PDF } }, deps));
    const oldId = (await willRow(willId)).executedDocumentId ?? '';
    const executor = await mkNominee('executor@test.local', [oldId, otherDocId]);
    const unrelated = await mkNominee('friend@test.local', [otherDocId]);

    await a.runAs(() => recordWillExecution(a.userId, willId, { fields, file: { buffer: PNG_BYTES } }, deps));
    const newId = (await willRow(willId)).executedDocumentId ?? '';
    expect(newId).not.toBe(oldId);
    expect(await nomineeDocs(executor)).toEqual([newId, otherDocId]);
    expect(await nomineeDocs(unrelated)).toEqual([otherDocId]);

    const view = await buildLegacyView(a.userId, executor);
    expect(view.documents.map((d) => d.id).sort()).toEqual([newId, otherDocId].sort());
  });
});
