import { describe, it, expect, vi, beforeEach } from 'vitest';

// Connecting Gmail fetches every financial document already in the inbox —
// its whole history, or the part earlier scans did not cover — and each night
// the mail that arrived since. Never a second scan while one is running.

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  mailboxFindFirst: vi.fn(),
  mailboxFindMany: vi.fn(),
  add: vi.fn(),
}));
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    gmailScanJob: { findMany: db.findMany, findFirst: db.findFirst, create: db.create },
    mailboxAccount: { findFirst: db.mailboxFindFirst, findMany: db.mailboxFindMany },
  },
}));
vi.mock('../../src/lib/queue.js', () => ({
  getGmailScanQueue: () => ({ add: db.add }),
  enqueueBounded: async (p: Promise<unknown>) => {
    await p;
    return true;
  },
}));

const { startInboxBackfill, scanNewMail, INBOX_BEGINNING } = await import('../../src/services/gmail/gmailScanJobs.service.js');
const { runInboxScansForAll } = await import('../../src/jobs/gmailScanJobs.js');
const { obviouslyNotFinancial } = await import('../../src/jobs/gmailScanWorker.js');

const NOW = new Date('2026-11-02T06:00:00Z');
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

beforeEach(() => {
  vi.clearAllMocks();
  db.mailboxFindFirst.mockResolvedValue({ id: 'mb1' });
  db.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new-job', ...data }));
  db.add.mockResolvedValue({});
});

describe('startInboxBackfill (on connect)', () => {
  it('fetches the whole mailbox history when nothing was scanned before', async () => {
    db.findMany.mockResolvedValue([]);
    expect(await startInboxBackfill('u1', 'mb1', NOW)).toEqual({ started: true, jobId: 'new-job' });
    const data = db.create.mock.calls[0]![0].data;
    expect(data.lookbackFrom).toEqual(INBOX_BEGINNING);
    expect(data.lookbackTo).toEqual(NOW);
    expect(data.kind).toBe('FULL');
    expect(db.add).toHaveBeenCalledWith({ scanJobId: 'new-job' });
  });

  it('fetches only the older part an earlier 5-year scan left out', async () => {
    db.findMany.mockResolvedValue([{ id: 'old', status: 'COMPLETED', lookbackFrom: day('2021-11-02'), lookbackTo: day('2026-10-01') }]);
    await startInboxBackfill('u1', 'mb1', NOW);
    const data = db.create.mock.calls[0]![0].data;
    expect(data.lookbackFrom).toEqual(INBOX_BEGINNING);
    expect(data.lookbackTo).toEqual(day('2021-11-03'));
  });

  it('starts nothing on reconnect when the whole history is already covered', async () => {
    db.findMany.mockResolvedValue([{ id: 'all', status: 'COMPLETED', lookbackFrom: INBOX_BEGINNING, lookbackTo: day('2026-10-01') }]);
    expect(await startInboxBackfill('u1', 'mb1', NOW)).toEqual({ started: false, jobId: null });
    expect(db.create).not.toHaveBeenCalled();
  });

  it('starts nothing while a scan of this mailbox is still running', async () => {
    db.findMany.mockResolvedValue([{ id: 'busy', status: 'DOWNLOADING', lookbackFrom: INBOX_BEGINNING, lookbackTo: NOW }]);
    expect(await startInboxBackfill('u1', 'mb1', NOW)).toEqual({ started: false, jobId: 'busy' });
    expect(db.create).not.toHaveBeenCalled();
  });
});

describe('scanNewMail (nightly)', () => {
  it('fetches the mail since the last scan, with a day of overlap', async () => {
    db.findMany.mockResolvedValue([{ id: 'all', status: 'COMPLETED', lookbackFrom: INBOX_BEGINNING, lookbackTo: day('2026-10-30') }]);
    db.findFirst.mockResolvedValue({ lookbackTo: day('2026-10-30') });
    expect(await scanNewMail('u1', 'mb1', NOW)).toBe('incremental');
    const data = db.create.mock.calls[0]![0].data;
    expect(data.lookbackFrom).toEqual(day('2026-10-29'));
    expect(data.lookbackTo).toEqual(NOW);
  });

  it('does nothing when the last scan ended moments ago', async () => {
    db.findMany.mockResolvedValue([{ id: 'all', status: 'COMPLETED', lookbackFrom: INBOX_BEGINNING, lookbackTo: NOW }]);
    db.findFirst.mockResolvedValue({ lookbackTo: new Date(NOW.getTime() - 60_000) });
    expect(await scanNewMail('u1', 'mb1', NOW)).toBe('up-to-date');
    expect(db.create).not.toHaveBeenCalled();
  });

  it('fetches the whole history if it never was', async () => {
    db.findMany.mockResolvedValue([]);
    expect(await scanNewMail('u1', 'mb1', NOW)).toBe('backfill');
  });
});

describe('runInboxScansForAll', () => {
  it('starts each connected mailbox, and one failing does not stop the rest', async () => {
    db.mailboxFindMany.mockResolvedValue([{ id: 'mb1', userId: 'u1' }, { id: 'mb2', userId: 'u2' }]);
    db.findMany.mockRejectedValueOnce(new Error('db hiccup')).mockResolvedValueOnce([]);
    expect(await runInboxScansForAll(NOW)).toEqual({ failed: 1, backfill: 1 });
    expect(db.mailboxFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { provider: 'GMAIL_OAUTH', isActive: true } }));
  });
});

describe('obviouslyNotFinancial (sorting without the AI model)', () => {
  const doc = (fileName: string, subject = '', fromAddress = 'friend@gmail.com') => ({ fileName, subject, fromAddress });

  it('sets aside attachments with no financial term anywhere', () => {
    expect(obviouslyNotFinancial(doc('wedding_photos.pdf', 'Pics from Goa trip'), 'Day one at the beach')).toBe(true);
    expect(obviouslyNotFinancial(doc('resume_final.pdf', 'My CV'), 'Experience: 5 years in design')).toBe(true);
  });

  it('sends every kind of statement the app imports to the model', () => {
    const financial = [
      doc('Payslip_Oct2026.pdf', 'Your payslip for October', 'hr@acme.com'),
      doc('CAS_Sep2026.pdf', 'Consolidated Account Statement', 'donotreply@camsonline.com'),
      doc('demat.pdf', 'Your NSDL statement'),
      doc('policy.pdf', 'Your Star Health policy document'),
      doc('Form16_FY2025-26.pdf', 'Form 16'),
      doc('statement.pdf', 'Account statement', 'alerts@hdfcbank.net'),
      doc('ContractNote_291025.pdf', 'Contract note', 'noreply@zerodha.com'),
      doc('EPF_passbook.pdf', 'EPF passbook'),
      doc('receipt.pdf', 'Rent receipt for October'),
    ];
    for (const d of financial) expect(obviouslyNotFinancial(d, ''), d.fileName).toBe(false);
  });

  it('judges a scanned PDF (no text) by its file name, subject and sender', () => {
    expect(obviouslyNotFinancial(doc('scan001.pdf', 'Bank statement attached'), '')).toBe(false);
    expect(obviouslyNotFinancial(doc('scan001.pdf', 'Photo of the dog'), '')).toBe(true);
  });
});
