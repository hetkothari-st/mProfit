import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import JSZip from 'jszip';
import type { Request, Response } from 'express';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { acceptUploads, failStuckDocument, processDocument } from '../../src/services/docSorter/sorter.service.js';
import { buildFolderZip, createPerson, mergePeople, renamePerson, updateFile } from '../../src/services/docSorter/sorterEdit.service.js';
import { patchFile } from '../../src/controllers/documentSorter.controller.js';
import { makeTextPdf } from './makeFiles.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const queue = { accepts: true, jobs: [] as Array<{ documentId: string }> };
vi.mock('../../src/lib/queue.js', async (orig) => ({
  ...(await orig<object>()),
  getDocSortQueue: () => ({ add: vi.fn(async (j: { documentId: string }) => void queue.jobs.push(j)) }),
  // The real helper waits up to 5 s for Redis; here the test decides whether the queue took the job.
  enqueueBounded: async () => queue.accepts,
}));

let s: TestScope;
beforeAll(async () => {
  s = await createTestScope('sorter-hard');
});
beforeEach(() => {
  queue.accepts = true;
  queue.jobs = [];
});

const stmt = (name: string, marker: string) =>
  `HDFC BANK\nAccount Statement\nAccount Holder: ${name}\nStatement Period: 01/01/2026 to 31/03/2026\nOpening Balance Closing Balance Withdrawals Deposits Narration Particulars Debit Credit\n${marker}`;
// pdfkit stamps each PDF with a creation time, so "the same file" must be the same buffer.
const pdfs = new Map<string, Buffer>();
const drop = async (text: string, name = 'scan.pdf') => {
  const buffer = pdfs.get(text) ?? (await makeTextPdf(text));
  pdfs.set(text, buffer);
  const [u] = await s.runAs(async () => acceptUploads(s.userId, [{ originalName: name, buffer }]));
  return u!;
};
const row = (id: string) => s.runAs(() => prisma.document.findUniqueOrThrow({ where: { id } }));

describe('concurrent filing', () => {
  it('gives eight same-type, same-date documents eight different names and one person', async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, (_, i) => drop(stmt('Meena Kapoor', `marker ${i}`)).then((u) => u.id)));
    await Promise.all(ids.map((id) => s.runAs(() => processDocument(id))));
    const rows = await s.runAs(() => prisma.document.findMany({ where: { id: { in: ids } } }));
    expect(new Set(rows.map((r) => r.fileName.toLowerCase())).size).toBe(8);
    expect(new Set(rows.map((r) => r.personId)).size).toBe(1);
    expect(rows.every((r) => r.sortStatus === 'FILED')).toBe(true);
  });

  it('leaves no orphaned file bytes behind after racing identical uploads', async () => {
    const buf = await makeTextPdf(stmt('Meena Kapoor', 'identical'));
    await Promise.all([1, 2, 3, 4].map(() => s.runAs(() => acceptUploads(s.userId, [{ originalName: 'x.pdf', buffer: buf }]))));
    const docs = await s.runAs(() => prisma.document.count({ where: { userId: s.userId } }));
    const blobs = await runAsSystem(() => prisma.documentBlob.count({ where: { userId: s.userId } }));
    expect(blobs).toBe(docs);
  });

  it('writes a zip that holds every file even if two rows ever share a name', async () => {
    const [a, b] = await Promise.all([drop(stmt('Ravi Teja', 'one')), drop(stmt('Ravi Teja', 'two'))]);
    for (const u of [a, b]) await s.runAs(() => processDocument(u.id));
    const docA = await row(a.id);
    // Force the collision a race used to create.
    await s.runAs(() => prisma.document.update({ where: { id: b.id }, data: { fileName: docA.fileName } }));
    const { buffer } = await s.runAs(() => buildFolderZip(s.userId, { personId: docA.personId! }));
    const entries = Object.keys((await JSZip.loadAsync(buffer)).files).filter((n) => !n.endsWith('/'));
    expect(entries).toHaveLength(2);
  });

  it('never ends a zip folder name with a dot (Windows cannot extract it)', async () => {
    const u = await drop(stmt('Rahul S.', 'dot'));
    await s.runAs(() => processDocument(u.id));
    const personId = (await row(u.id)).personId!;
    const { buffer } = await s.runAs(() => buildFolderZip(s.userId, { personId }));
    expect(Object.keys((await JSZip.loadAsync(buffer)).files).every((n) => !/\.\//.test(n))).toBe(true);
  });
});

describe('recovering stuck documents', () => {
  it('marks a document that never finished as FAILED and records it, once', async () => {
    const u = await drop(stmt('Stuck Person', 'stuck'));
    await s.runAs(() => failStuckDocument(u.id));
    expect(await row(u.id)).toMatchObject({ sortStatus: 'FAILED' });
    const n = () => s.runAs(() => prisma.ingestionFailure.count({ where: { userId: s.userId, sourceRef: u.id } }));
    expect(await n()).toBe(1);
    await s.runAs(() => failStuckDocument(u.id));
    expect(await n()).toBe(1);
  });

  it('does not touch a document that was filed in the meantime', async () => {
    const u = await drop(stmt('Done Person', 'done'));
    await s.runAs(() => processDocument(u.id));
    await s.runAs(() => failStuckDocument(u.id));
    expect(await row(u.id)).toMatchObject({ sortStatus: 'FILED' });
  });

  it('flags a document for review when the queue cannot take it, instead of leaving it "reading" forever', async () => {
    queue.accepts = false;
    const u = await drop(stmt('Queue Down', 'down'));
    expect(u.status).toBe('NEEDS_REVIEW');
    expect(await row(u.id)).toMatchObject({ sortStatus: 'NEEDS_REVIEW', sortReason: expect.stringMatching(/drop it again/i) });
  });

  it('re-reads a failed or review document when the same file is dropped again', async () => {
    queue.accepts = false;
    const first = await drop(stmt('Retry Person', 'retry'));
    queue.accepts = true;
    const again = await drop(stmt('Retry Person', 'retry'));
    expect(again).toMatchObject({ id: first.id, duplicateOf: first.id, status: 'PROCESSING' });
    expect(await row(first.id)).toMatchObject({ sortStatus: 'PROCESSING' });
  });

  it('leaves an already filed document alone on a re-drop', async () => {
    const first = await drop(stmt('Settled Person', 'settled'));
    await s.runAs(() => processDocument(first.id));
    const again = await drop(stmt('Settled Person', 'settled'));
    expect(again).toMatchObject({ duplicateOf: first.id, status: 'FILED' });
  });
});

describe('manual edits vs the worker', () => {
  it('refuses to move a document that is still being read', async () => {
    const u = await drop(stmt('Busy Person', 'busy'));
    const person = await s.runAs(() => createPerson(s.userId, 'Priya Mehta'));
    await expect(s.runAs(() => updateFile(s.userId, u.id, { personId: person.id, docType: 'ITR' }))).rejects.toThrow(/being read/i);
  });

  it('does not refile a document a person already filed by hand while it was being read', async () => {
    const u = await drop(stmt('Auto Person', 'raced'));
    const mine = await s.runAs(() => createPerson(s.userId, 'Manual Choice'));
    // The user filed it by hand (as NEEDS_PASSWORD documents can be); a stale job then runs.
    await s.runAs(() => prisma.document.update({ where: { id: u.id }, data: { sortStatus: 'NEEDS_PASSWORD' } }));
    await s.runAs(() => updateFile(s.userId, u.id, { personId: mine.id, docType: 'ITR' }));
    await s.runAs(() => processDocument(u.id));
    expect(await row(u.id)).toMatchObject({ personId: mine.id, docType: 'ITR', sortStatus: 'FILED' });
  });
});

describe('folders remember merged and renamed names', () => {
  it('a merged-away name files into the surviving folder instead of coming back', async () => {
    const a = await drop(stmt('Suresh Menon', 'a'));
    const b = await drop(stmt('Suresh Menen', 'b')); // a misspelling that created its own folder
    for (const u of [a, b]) await s.runAs(() => processDocument(u.id));
    const [keep, drop2] = [(await row(a.id)).personId!, (await row(b.id)).personId!];
    expect(keep).not.toBe(drop2);
    await s.runAs(() => mergePeople(s.userId, drop2, keep));
    const c = await drop(stmt('Suresh Menen', 'c'));
    await s.runAs(() => processDocument(c.id));
    expect((await row(c.id)).personId).toBe(keep);
    expect(await s.runAs(() => prisma.documentPerson.count({ where: { userId: s.userId, displayName: 'Suresh Menen' } }))).toBe(0);
  });

  it('a renamed folder still catches the name it used to have', async () => {
    const a = await drop(stmt('Geeta Rao', 'g1'));
    await s.runAs(() => processDocument(a.id));
    const pid = (await row(a.id)).personId!;
    await s.runAs(() => renamePerson(s.userId, pid, 'Geeta Rao Nair'));
    const b = await drop(stmt('Geeta Rao', 'g2'));
    await s.runAs(() => processDocument(b.id));
    expect((await row(b.id)).personId).toBe(pid);
  });
});

describe('creating a person by hand', () => {
  it('creates one from a clean name, and returns the same folder for the same name', async () => {
    const p1 = await s.runAs(() => createPerson(s.userId, 'Asha Bhat'));
    const p2 = await s.runAs(() => createPerson(s.userId, 'bhat asha'));
    expect(p1).toMatchObject({ displayName: 'Asha Bhat', autoCreated: false });
    expect(p2.id).toBe(p1.id);
  });

  it('refuses a name that is not a name', async () => {
    await expect(s.runAs(() => createPerson(s.userId, '../../etc'))).rejects.toThrow(/letters/i);
  });
});

describe('edit validation', () => {
  const call = (body: unknown) => patchFile({ user: { id: s.userId }, params: { id: 'x' }, body } as unknown as Request, {} as Response);
  it.each([['2025-02-31'], ['2025-13-01'], ['2025-00-10']])('rejects the impossible date %s with a validation error, not a 500', async (docDate) => {
    await expect(call({ docDate })).rejects.toMatchObject({ name: 'ZodError' });
  });
});
