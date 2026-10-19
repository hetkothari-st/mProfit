import { describe, it, expect, beforeAll, vi } from 'vitest';
import JSZip from 'jszip';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { acceptUploads, processDocument } from '../../src/services/documents/docSorter/sorter.service.js';
import { buildFolderZip, getTree } from '../../src/services/documents/docSorter/sorterEdit.service.js';
import { makeTextPdf, makeTextPng } from './makeFiles.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

vi.mock('../../src/lib/queue.js', async (orig) => ({
  ...(await orig<object>()),
  getDocSortQueue: () => ({ add: vi.fn(async () => undefined) }),
}));

let s: TestScope;
beforeAll(async () => {
  s = await createTestScope('sorter-e2e');
});

/** A user drops a text bank statement, a text ITR and a photographed income certificate. */
describe('drop → sort → download, end to end', () => {
  it('files everything under the right people and types, names it, zips it, and ignores a re-drop', async () => {
    const drop = async () => ({
      bank: { originalName: 'scan001.pdf', buffer: await makeTextPdf('HDFC BANK\nAccount Statement\nAccount Holder: Rahul Sharma\nStatement Period: 01/01/2026 to 31/03/2026\nOpening Balance Closing Balance Withdrawals Deposits Narration Debit Credit') },
      itr: { originalName: 'IMG_2231.pdf', buffer: await makeTextPdf('INCOME TAX RETURN ITR-V Acknowledgement\nAssessment Year 2025-26\nName: Rahul Sharma\nTotal Income') },
      cert: { originalName: 'photo.png', buffer: await makeTextPng('INCOME CERTIFICATE\nName of Applicant: Kavita Rao\nAnnual Income Rs 6,00,000\nTahsildar') },
    });
    const files = await drop();
    const acks = await s.runAs(() => acceptUploads(s.userId, [files.bank, files.itr, files.cert]));
    expect(acks.map((a) => a.status)).toEqual(['PROCESSING', 'PROCESSING', 'PROCESSING']);
    for (const a of acks) await s.runAs(() => processDocument(a.id));

    const tree = await s.runAs(() => getTree(s.userId));
    expect(tree.unassigned).toHaveLength(0);
    expect(tree.people.map((p) => p.displayName).sort()).toEqual(['Kavita Rao', 'Rahul Sharma']);
    const rahul = tree.people.find((p) => p.displayName === 'Rahul Sharma')!;
    expect(rahul.types.flatMap((t) => t.files.map((f) => f.fileName)).sort()).toEqual(['Bank Statement_2026-03-31.pdf', 'ITR_2025-03-31.pdf']);
    const kavita = tree.people.find((p) => p.displayName === 'Kavita Rao')!;
    const today = new Date().toISOString().slice(0, 10);
    expect(kavita.types.map((t) => t.docType)).toEqual(['INCOME_CERTIFICATE']);
    expect(kavita.types[0]!.files[0]!.fileName).toBe(`Income Certificate_${today}.png`);

    const all = await s.runAs(() => buildFolderZip(s.userId, {}));
    const entries = Object.keys((await JSZip.loadAsync(all.buffer)).files).filter((n) => !n.endsWith('/')).sort();
    expect(entries).toEqual([
      `Kavita Rao/Income Certificate/Income Certificate_${today}.png`,
      'Rahul Sharma/Bank Statement/Bank Statement_2026-03-31.pdf',
      'Rahul Sharma/ITR/ITR_2025-03-31.pdf',
    ]);

    const before = await s.runAs(() => prisma.document.count({ where: { userId: s.userId } }));
    const again = await s.runAs(() => acceptUploads(s.userId, [files.bank, files.itr, files.cert]));
    expect(again.every((a) => a.duplicateOf)).toBe(true);
    expect(await s.runAs(() => prisma.document.count({ where: { userId: s.userId } }))).toBe(before);
  }, 120_000);
});
