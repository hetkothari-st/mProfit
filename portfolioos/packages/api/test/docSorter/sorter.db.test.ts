import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { acceptUploads, processDocument } from '../../src/services/docSorter/sorter.service.js';
import { makeEncryptedPdf, makeTextPdf } from './makeFiles.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

// The queue is Redis-backed; the service only needs to enqueue, and these tests call processDocument directly.
const enqueued: Array<{ documentId: string; userId: string; password?: string }> = [];
vi.mock('../../src/lib/queue.js', async (orig) => ({
  ...(await orig<object>()),
  getDocSortQueue: () => ({ add: vi.fn(async (job: (typeof enqueued)[number]) => void enqueued.push(job)) }),
}));

let s: TestScope;
let other: TestScope;
beforeAll(async () => {
  s = await createTestScope('sorter-svc');
  other = await createTestScope('sorter-svc-other');
});

const BANK =
  'HDFC BANK\nAccount Statement\nAccount Holder: Rahul Sharma\nStatement Period: 01/01/2026 to 31/03/2026\nOpening Balance Closing Balance Withdrawals Deposits Narration Particulars Debit Credit';

const upload = async (scope: TestScope, name: string, buffer: Buffer) => {
  const [u] = await scope.runAs(() => acceptUploads(scope.userId, [{ originalName: name, buffer }]));
  return u!;
};
const doc = (scope: TestScope, id: string) =>
  scope.runAs(() => prisma.document.findUniqueOrThrow({ where: { id }, include: { person: true } }));

describe('sorter service', () => {
  it('files a bank statement under the person and renames it', async () => {
    const u = await upload(s, 'scan001.pdf', await makeTextPdf(BANK));
    expect(u.status).toBe('PROCESSING');
    await s.runAs(() => processDocument(u.id));
    const d = await doc(s, u.id);
    expect(d).toMatchObject({ sortStatus: 'FILED', docType: 'BANK_STATEMENT', fileName: 'Bank Statement_2026-03-31.pdf' });
    expect(d.person).toMatchObject({ displayName: 'Rahul Sharma', autoCreated: true });
  });

  it('same bytes twice → no new row', async () => {
    const buf = await makeTextPdf(`${BANK}\nunique marker A`);
    const a = await upload(s, 'x.pdf', buf);
    const b = await upload(s, 'y.pdf', buf);
    expect(b.duplicateOf).toBe(a.id);
    expect(await s.runAs(() => prisma.document.count({ where: { userId: s.userId, id: { in: [a.id, b.id] } } }))).toBe(1);
  });

  it('concurrent identical uploads create one row and do not throw', async () => {
    const buf = await makeTextPdf(`${BANK}\nunique marker B`);
    const rs = await Promise.all([1, 2, 3].map(() => upload(s, 'z.pdf', buf)));
    expect(new Set(rs.map((r) => r.duplicateOf ?? r.id)).size).toBe(1);
  });

  it('a second document of the same type and date gets -2', async () => {
    const u = await upload(s, 'again.pdf', await makeTextPdf(`${BANK}\nunique marker C`));
    await s.runAs(() => processDocument(u.id));
    expect((await doc(s, u.id)).fileName).toBe('Bank Statement_2026-03-31-2.pdf');
  });

  it('matches the same person on a later document instead of creating another', async () => {
    const u = await upload(s, 'third.pdf', await makeTextPdf(`${BANK.replace('Rahul Sharma', 'Sharma Rahul')}\nunique marker D`));
    await s.runAs(() => processDocument(u.id));
    expect(await s.runAs(() => prisma.documentPerson.count({ where: { userId: s.userId } }))).toBe(1);
  });

  it('a document with no readable name goes to NEEDS_REVIEW and invents no person', async () => {
    const before = await s.runAs(() => prisma.documentPerson.count({ where: { userId: s.userId } }));
    const u = await upload(s, 'noname.pdf', await makeTextPdf('Income Certificate\nThis is to certify annual income Rs 3,00,000 Tahsildar'));
    await s.runAs(() => processDocument(u.id));
    const d = await doc(s, u.id);
    expect(d).toMatchObject({ sortStatus: 'NEEDS_REVIEW', personId: null, docType: 'INCOME_CERTIFICATE' });
    expect(await s.runAs(() => prisma.documentPerson.count({ where: { userId: s.userId } }))).toBe(before);
  });

  it('a password-protected PDF waits for a password instead of failing', async () => {
    const u = await upload(s, 'locked.pdf', await makeEncryptedPdf('secret'));
    await s.runAs(() => processDocument(u.id));
    expect(await doc(s, u.id)).toMatchObject({ sortStatus: 'NEEDS_PASSWORD' });
    await s.runAs(() => processDocument(u.id, { password: 'secret' }));
    expect(await doc(s, u.id)).toMatchObject({ sortStatus: expect.stringMatching(/FILED|NEEDS_REVIEW/) });
  });

  it('an unreadable file ends in review with an IngestionFailure row and never throws', async () => {
    const u = await upload(s, 'junk.pdf', Buffer.from('%PDF-1.4 garbage garbage'));
    await expect(s.runAs(() => processDocument(u.id))).resolves.toBeUndefined();
    expect(['FAILED', 'NEEDS_REVIEW']).toContain((await doc(s, u.id)).sortStatus);
    expect(await s.runAs(() => prisma.ingestionFailure.count({ where: { userId: s.userId, sourceAdapter: 'docsorter' } }))).toBeGreaterThan(0);
  });

  it('stores a file type it cannot read as NEEDS_REVIEW without enqueueing it', async () => {
    const before = enqueued.length;
    const u = await upload(s, 'letter.docx', Buffer.from('PK\u0003\u0004 pretend office file'));
    expect(u.status).toBe('NEEDS_REVIEW');
    expect(enqueued.length).toBe(before);
  });

  it("another user cannot see this user's documents, and identical bytes are independent per user", async () => {
    expect(await other.runAs(() => prisma.document.findMany({ where: { userId: s.userId } }))).toHaveLength(0);
    const o = await upload(other, 'x.pdf', await makeTextPdf(BANK));
    expect(o.duplicateOf).toBeUndefined();
  });
});
