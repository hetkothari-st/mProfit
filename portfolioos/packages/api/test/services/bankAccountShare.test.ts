import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Sharing bank details puts the full account number into a message the user
// sends onward, so it's treated like a reveal: owner-scoped, audited
// (`pii_share`), and fails if the audit write fails. A missing branch
// address/name is filled from the IFSC and saved so it's editable afterwards.

const db = vi.hoisted(() => ({
  bankAccount: { findFirst: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));
const lookupIfsc = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/prisma.js', () => ({ prisma: db }));
vi.mock('../../src/services/ifscLookup.service.js', () => ({ lookupIfsc }));

import { shareAccountDetails } from '../../src/services/bankAccounts.service.js';
import { encryptIdentifier } from '../../src/services/pfCredentials.service.js';
import { BadRequestError, NotFoundError } from '../../src/lib/errors.js';

const FULL = '50100123456789';
let enc: string;

beforeAll(async () => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  enc = await encryptIdentifier(FULL);
});

beforeEach(() => {
  vi.clearAllMocks();
  db.auditLog.create.mockResolvedValue({});
  db.bankAccount.update.mockResolvedValue({});
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ba1',
    bankName: 'HDFC Bank',
    accountHolder: 'HET KOTHARI',
    accountNumberEnc: enc,
    ifsc: 'HDFC0000240',
    branch: 'Borivali',
    branchAddress: 'Shop 1, Borivali West, Mumbai 400092',
    ...overrides,
  };
}

describe('shareAccountDetails', () => {
  it('builds the share text and writes a pii_share audit row', async () => {
    db.bankAccount.findFirst.mockResolvedValue(row());

    const { text } = await shareAccountDetails('u1', 'ba1', { ip: '1.2.3.4', userAgent: 'vitest' });

    expect(text).toBe(
      [
        'HDFC Bank account details',
        'Account holder: HET KOTHARI',
        `Account number: ${FULL}`,
        'IFSC: HDFC0000240',
        'Branch: Borivali',
        'Branch address: Shop 1, Borivali West, Mumbai 400092',
      ].join('\n'),
    );
    expect(db.bankAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ba1', userId: 'u1' } }),
    );
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        action: 'pii_share',
        resource: 'BankAccount:ba1',
        ip: '1.2.3.4',
        userAgent: 'vitest',
      }),
    });
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain(FULL);
    // Everything already on file — no outside call, no write.
    expect(lookupIfsc).not.toHaveBeenCalled();
    expect(db.bankAccount.update).not.toHaveBeenCalled();
  });

  it('fills a missing branch and address from the IFSC and saves them', async () => {
    db.bankAccount.findFirst.mockResolvedValue(row({ branch: null, branchAddress: null }));
    lookupIfsc.mockResolvedValue({
      ifsc: 'HDFC0000240',
      bank: 'HDFC Bank',
      branch: 'MUMBAI - SANDOZ HOUSE',
      address: 'SANDOZ HOUSE, DR. A.B.ROAD, WORLI, MUMBAI',
      city: 'GREATER MUMBAI',
      state: 'MAHARASHTRA',
    });

    const { text } = await shareAccountDetails('u1', 'ba1', {});

    expect(lookupIfsc).toHaveBeenCalledWith('HDFC0000240');
    expect(db.bankAccount.update).toHaveBeenCalledWith({
      where: { id: 'ba1' },
      data: {
        branch: 'MUMBAI - SANDOZ HOUSE',
        branchAddress: 'SANDOZ HOUSE, DR. A.B.ROAD, WORLI, MUMBAI',
      },
    });
    expect(text).toContain('Branch: MUMBAI - SANDOZ HOUSE');
    expect(text).toContain('Branch address: SANDOZ HOUSE, DR. A.B.ROAD, WORLI, MUMBAI');
  });

  it("keeps the user's own branch name when only the address is missing", async () => {
    db.bankAccount.findFirst.mockResolvedValue(row({ branchAddress: null }));
    lookupIfsc.mockResolvedValue({
      ifsc: 'HDFC0000240',
      bank: 'HDFC Bank',
      branch: 'MUMBAI - SANDOZ HOUSE',
      address: 'SANDOZ HOUSE, WORLI',
      city: null,
      state: null,
    });

    const { text } = await shareAccountDetails('u1', 'ba1', {});

    expect(db.bankAccount.update).toHaveBeenCalledWith({
      where: { id: 'ba1' },
      data: { branchAddress: 'SANDOZ HOUSE, WORLI' },
    });
    expect(text).toContain('Branch: Borivali');
  });

  it('still shares, without the address, when the IFSC lookup fails', async () => {
    db.bankAccount.findFirst.mockResolvedValue(row({ branchAddress: null }));
    lookupIfsc.mockRejectedValue(new Error('IFSC lookup failed: HTTP 503'));

    const { text } = await shareAccountDetails('u1', 'ba1', {});

    expect(text).toContain(`Account number: ${FULL}`);
    expect(text).not.toContain('Branch address');
    expect(db.bankAccount.update).not.toHaveBeenCalled();
  });

  it('skips the lookup and the IFSC line when no IFSC is saved', async () => {
    db.bankAccount.findFirst.mockResolvedValue(row({ ifsc: null, branchAddress: null }));

    const { text } = await shareAccountDetails('u1', 'ba1', {});

    expect(lookupIfsc).not.toHaveBeenCalled();
    expect(text).not.toContain('IFSC');
  });

  it('refuses when only last4 is saved', async () => {
    db.bankAccount.findFirst.mockResolvedValue(row({ accountNumberEnc: null }));
    await expect(shareAccountDetails('u1', 'ba1', {})).rejects.toBeInstanceOf(BadRequestError);
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(lookupIfsc).not.toHaveBeenCalled();
  });

  it("404s on another user's account", async () => {
    db.bankAccount.findFirst.mockResolvedValue(null);
    await expect(shareAccountDetails('u2', 'ba1', {})).rejects.toBeInstanceOf(NotFoundError);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not share when the audit write fails', async () => {
    db.bankAccount.findFirst.mockResolvedValue(row());
    db.auditLog.create.mockRejectedValue(new Error('db down'));
    await expect(shareAccountDetails('u1', 'ba1', {})).rejects.toThrow('db down');
  });
});
