import { describe, it, expect, beforeAll, vi } from 'vitest';
import JSZip from 'jszip';
import type { NextFunction, Request, Response } from 'express';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { fakeResponse } from '../helpers/fakeResponse.js';
import { prisma } from '../../src/lib/prisma.js';
import { acceptUploads, processDocument } from '../../src/services/docSorter/sorter.service.js';
import { buildFolderZip, getTree, mergePeople, renamePerson, updateFile } from '../../src/services/docSorter/sorterEdit.service.js';
import { requireFeature } from '../../src/middleware/requirePlan.js';
import { patchFile } from '../../src/controllers/documentSorter.controller.js';
import { makeTextPdf } from './makeFiles.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

vi.mock('../../src/lib/queue.js', async (orig) => ({
  ...(await orig<object>()),
  getDocSortQueue: () => ({ add: vi.fn(async () => undefined) }),
}));

let s: TestScope;
let other: TestScope;

const stmt = (name: string, marker: string) =>
  `HDFC BANK\nAccount Statement\nAccount Holder: ${name}\nStatement Period: 01/01/2026 to 31/03/2026\nOpening Balance Closing Balance Withdrawals Deposits Narration Particulars Debit Credit\n${marker}`;
const itr = (name: string, marker: string) =>
  `INCOME TAX RETURN ITR-V Acknowledgement\nAssessment Year 2025-26\nName: ${name}\nTotal Income\n${marker}`;

async function fileIt(scope: TestScope, text: string, name = 'scan.pdf'): Promise<string> {
  const [u] = await scope.runAs(async () => acceptUploads(scope.userId, [{ originalName: name, buffer: await makeTextPdf(text) }]));
  await scope.runAs(() => processDocument(u!.id));
  return u!.id;
}

beforeAll(async () => {
  s = await createTestScope('sorter-api');
  other = await createTestScope('sorter-api-other');
});

describe('getTree', () => {
  it('groups FILED files under person → type and lists the rest as unassigned', async () => {
    await fileIt(s, stmt('Rahul Sharma', 'a'));
    await fileIt(s, itr('Rahul Sharma', 'b'));
    const [u] = await s.runAs(async () => acceptUploads(s.userId, [{ originalName: 'pending.pdf', buffer: await makeTextPdf('hello') }]));
    const tree = await s.runAs(() => getTree(s.userId));
    const rahul = tree.people.find((p) => p.displayName === 'Rahul Sharma')!;
    expect(rahul.types.map((t) => t.docType).sort()).toEqual(['BANK_STATEMENT', 'ITR']);
    expect(rahul.types.find((t) => t.docType === 'ITR')!.files[0]).toMatchObject({ fileName: 'ITR_2025-03-31.pdf', sortStatus: 'FILED' });
    expect(tree.unassigned.map((f) => f.id)).toContain(u!.id);
  });
});

describe('updateFile', () => {
  it('re-types a file and renames it, keeping the date', async () => {
    const id = await fileIt(s, stmt('Anita Verma', 'c'));
    const f = await s.runAs(() => updateFile(s.userId, id, { docType: 'FD_CERTIFICATE' }));
    expect(f).toMatchObject({ docType: 'FD_CERTIFICATE', fileName: 'FD Certificate_2026-03-31.pdf', sortStatus: 'FILED' });
  });

  it('files a NEEDS_REVIEW document once a person and a type are assigned', async () => {
    const id = await fileIt(s, 'Income Certificate\nThis is to certify annual income Rs 3,00,000 Tahsildar');
    const person = await s.runAs(() => prisma.documentPerson.findFirstOrThrow({ where: { userId: s.userId, displayName: 'Anita Verma' } }));
    const f = await s.runAs(() => updateFile(s.userId, id, { personId: person.id, docType: 'INCOME_CERTIFICATE' }));
    expect(f).toMatchObject({ sortStatus: 'FILED', personId: person.id });
  });

  it("cannot touch another user's file or assign another user's person", async () => {
    const mine = await fileIt(s, stmt('Priya Nair', 'd'));
    const theirs = await fileIt(other, stmt('Zed Other', 'e'));
    await expect(s.runAs(() => updateFile(s.userId, theirs, { docType: 'ITR' }))).rejects.toThrow(/not found/i);
    const theirPerson = await other.runAs(() => prisma.documentPerson.findFirstOrThrow({ where: { userId: other.userId } }));
    await expect(s.runAs(() => updateFile(s.userId, mine, { personId: theirPerson.id }))).rejects.toThrow(/not found/i);
  });
});

describe('people', () => {
  it('renames a person, and refuses a name that is already another folder', async () => {
    await fileIt(s, stmt('Suresh Iyer', 'f'));
    const p = await s.runAs(() => prisma.documentPerson.findFirstOrThrow({ where: { userId: s.userId, displayName: 'Suresh Iyer' } }));
    expect(await s.runAs(() => renamePerson(s.userId, p.id, 'Suresh K Iyer'))).toMatchObject({ displayName: 'Suresh K Iyer' });
    await expect(s.runAs(() => renamePerson(s.userId, p.id, 'Rahul Sharma'))).rejects.toThrow(/already/i);
  });

  it('merges one person into another and resolves file-name collisions with -2', async () => {
    const a = await fileIt(s, stmt('Meera Joshi', 'g'));
    const b = await fileIt(s, stmt('Meera Josh', 'h')); // a typo folder
    const from = (await s.runAs(() => prisma.document.findUniqueOrThrow({ where: { id: b } }))).personId!;
    const into = (await s.runAs(() => prisma.document.findUniqueOrThrow({ where: { id: a } }))).personId!;
    expect(from).not.toBe(into);
    await s.runAs(() => mergePeople(s.userId, from, into));
    const names = (await s.runAs(() => prisma.document.findMany({ where: { personId: into, docType: 'BANK_STATEMENT' } }))).map((d) => d.fileName).sort();
    expect(names).toEqual(['Bank Statement_2026-03-31-2.pdf', 'Bank Statement_2026-03-31.pdf']);
    expect(await s.runAs(() => prisma.documentPerson.count({ where: { id: from } }))).toBe(0);
  });
});

describe('buildFolderZip', () => {
  it('zips one person/type folder with readable names and nothing from other folders', async () => {
    const id = await fileIt(s, stmt('Kiran Rao', 'i'));
    await fileIt(s, itr('Kiran Rao', 'j'));
    const doc = await s.runAs(() => prisma.document.findUniqueOrThrow({ where: { id } }));
    const { buffer } = await s.runAs(() => buildFolderZip(s.userId, { personId: doc.personId!, docType: 'BANK_STATEMENT' }));
    const names = Object.keys((await JSZip.loadAsync(buffer)).files).filter((n) => !n.endsWith('/'));
    expect(names).toEqual(['Kiran Rao/Bank Statement/Bank Statement_2026-03-31.pdf']);
  });
});

describe('http layer', () => {
  it('blocks a FREE plan with the plan-gate error', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireFeature('DOCUMENT_SORTER')({ user: { id: 'u', plan: 'FREE' } } as unknown as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('PLUS') }));
  });

  it('lets a PLUS plan through', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireFeature('DOCUMENT_SORTER')({ user: { id: 'u', plan: 'PLUS' } } as unknown as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a malformed edit body before touching the database', async () => {
    const r = fakeResponse();
    const req = { user: { id: s.userId }, params: { id: 'x' }, body: { docType: 'NOT_A_TYPE', docDate: '31/03/2026' } } as unknown as Request;
    await expect(patchFile(req, r.res)).rejects.toThrow();
  });
});
