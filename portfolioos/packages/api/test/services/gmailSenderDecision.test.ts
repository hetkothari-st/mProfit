import { describe, it, expect, vi, beforeEach } from 'vitest';

// Approving or rejecting one inbox document can be widened to its sender:
// every pending document from that sender now, and each new one as it is
// fetched. Only pending statement documents are touched.

const db = vi.hoisted(() => ({
  docFindMany: vi.fn(),
  docFindUnique: vi.fn(),
  docUpdate: vi.fn(),
  docUpdateMany: vi.fn(),
  ruleFindFirst: vi.fn(),
  ruleCreate: vi.fn(),
  ruleUpdate: vi.fn(),
  ruleDeleteMany: vi.fn(),
  createImportJob: vi.fn(),
}));
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    gmailDiscoveredDoc: {
      findMany: db.docFindMany,
      findUnique: db.docFindUnique,
      update: db.docUpdate,
      updateMany: db.docUpdateMany,
    },
    gmailAutoApproveRule: {
      findFirst: db.ruleFindFirst,
      create: db.ruleCreate,
      update: db.ruleUpdate,
      deleteMany: db.ruleDeleteMany,
    },
  },
}));
vi.mock('../../src/services/imports/import.service.js', () => ({ createImportJob: db.createImportJob }));
vi.mock('../../src/lib/fileStore.js', () => ({ ensureLocalFile: vi.fn(async () => undefined) }));

const { approveAllFromSender, rejectAllFromSender, sweepAutoApprovals } = await import(
  '../../src/services/gmail/gmailDocApproval.service.js'
);

const SENDER = 'donotreply@camsonline.com';
const pendingDoc = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  userId: 'u1',
  fromAddress: SENDER,
  fileName: `${id}.pdf`,
  classifiedDocType: 'CAS',
  status: 'PENDING_APPROVAL',
  contentHash: `h-${id}`,
  storagePath: `/tmp/${id}.pdf`,
  blobKey: `b-${id}`,
  scanJob: { kind: 'FULL' },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.ruleFindFirst.mockResolvedValue(null);
  db.ruleCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'r1', ...data }));
  db.docUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data }));
  db.createImportJob.mockImplementation(async () => ({ id: `job-${db.createImportJob.mock.calls.length}` }));
});

describe('approveAllFromSender', () => {
  it('approves every pending statement from the sender and approves its future ones', async () => {
    db.docFindMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    db.docFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => pendingDoc(where.id));

    expect(await approveAllFromSender('u1', SENDER)).toEqual({ ids: ['d1', 'd2'], failed: 0 });

    const where = db.docFindMany.mock.calls[0]![0].where;
    expect(where).toEqual({ userId: 'u1', fromAddress: SENDER, status: 'PENDING_APPROVAL', scanJob: { kind: { not: 'INSURANCE' } } });
    expect(db.createImportJob).toHaveBeenCalledTimes(2);
    expect(db.ruleCreate).toHaveBeenCalledWith({
      data: { userId: 'u1', fromAddress: SENDER, docType: null, enabled: true, autoReject: false },
    });
    // A per-type rule left over for this sender would outrank the sender rule.
    expect(db.ruleDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', fromAddress: SENDER, docType: { not: null } } });
  });

  it('one document failing does not stop the rest', async () => {
    db.docFindMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    db.docFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => pendingDoc(where.id));
    db.createImportJob.mockRejectedValueOnce(new Error('file missing'));
    expect(await approveAllFromSender('u1', SENDER)).toEqual({ ids: ['d2'], failed: 1 });
  });
});

describe('rejectAllFromSender', () => {
  it('rejects every pending document from the sender and rejects its future ones', async () => {
    db.docFindMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    db.ruleFindFirst.mockResolvedValue({ id: 'old', enabled: true });

    expect(await rejectAllFromSender('u1', SENDER)).toEqual({ ids: ['d1', 'd2'], failed: 0 });

    const call = db.docUpdateMany.mock.calls[0]![0];
    // Re-checks the status: a document approved meanwhile is left alone.
    expect(call.where).toEqual({ userId: 'u1', id: { in: ['d1', 'd2'] }, status: 'PENDING_APPROVAL' });
    expect(call.data.status).toBe('REJECTED');
    expect(db.ruleUpdate).toHaveBeenCalledWith({ where: { id: 'old' }, data: { enabled: false, autoReject: true } });
  });

  it('with nothing pending still sets the rule for future mail', async () => {
    db.docFindMany.mockResolvedValue([]);
    expect(await rejectAllFromSender('u1', SENDER)).toEqual({ ids: [], failed: 0 });
    expect(db.docUpdateMany).not.toHaveBeenCalled();
    expect(db.ruleCreate).toHaveBeenCalledWith({
      data: { userId: 'u1', fromAddress: SENDER, docType: null, enabled: false, autoReject: true },
    });
  });
});

describe('sweepAutoApprovals (new documents after a scan)', () => {
  it('rejects documents from a rejected sender and approves those from an approved one', async () => {
    db.docFindMany.mockResolvedValue([
      pendingDoc('bad', { fromAddress: 'spam@x.com' }),
      pendingDoc('good'),
      pendingDoc('unknown', { fromAddress: 'new@bank.com' }),
    ]);
    db.ruleFindFirst.mockImplementation(async ({ where }: { where: { fromAddress: string; docType: string | null } }) => {
      if (where.docType !== null) return null;
      if (where.fromAddress === 'spam@x.com') return { id: 'rr', enabled: false, autoReject: true };
      if (where.fromAddress === SENDER) return { id: 'ra', enabled: true, autoReject: false };
      return null;
    });
    db.docFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'bad' ? pendingDoc('bad', { fromAddress: 'spam@x.com' }) : pendingDoc(where.id),
    );

    expect(await sweepAutoApprovals('u1', 'scan1')).toBe(1);

    const statusOf = (id: string) => db.docUpdate.mock.calls.find((c) => c[0].where.id === id)?.[0].data.status;
    expect(statusOf('bad')).toBe('REJECTED');
    expect(statusOf('good')).toBe('IMPORTING');
    expect(statusOf('unknown')).toBeUndefined();
  });
});
