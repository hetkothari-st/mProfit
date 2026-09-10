import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Full bank account numbers are stored encrypted and only ever leave the
// server through the audited reveal endpoint. These tests pin that contract:
// ciphertext never appears in a DTO, reveal is owner-scoped, and every
// successful reveal writes an AuditLog row (§3.7 / §15.8).

const db = vi.hoisted(() => ({
  bankAccount: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}));

vi.mock('../../src/lib/prisma.js', () => ({ prisma: db }));

import {
  createAccount,
  updateAccount,
  listAccounts,
  getAccount,
  revealAccountNumber,
} from '../../src/services/bankAccounts.service.js';
import {
  encryptIdentifier,
  decryptIdentifier,
} from '../../src/services/pfCredentials.service.js';
import { BadRequestError, NotFoundError } from '../../src/lib/errors.js';

const FULL = '50100123456789';

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

beforeEach(() => {
  vi.clearAllMocks();
  db.bankAccount.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ba1',
    ...data,
  }));
  db.bankAccount.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      userId: 'u1',
      last4: '0000',
      accountNumberEnc: null,
      ...data,
    }),
  );
  db.auditLog.create.mockResolvedValue({});
});

const baseInput = {
  bankName: 'HDFC Bank',
  accountType: 'SAVINGS' as const,
  accountHolder: 'TEST USER',
  last4: '9999',
};

describe('bank account full number — storage', () => {
  it('encrypts the full number on create and derives last4 from it', async () => {
    const dto = await createAccount('u1', { ...baseInput, accountNumber: FULL });

    const data = db.bankAccount.create.mock.calls[0]![0].data;
    expect(data.accountNumberEnc).toBeTruthy();
    expect(await decryptIdentifier(data.accountNumberEnc)).toBe(FULL);
    expect(data.last4).toBe('6789');

    expect(dto).not.toHaveProperty('accountNumberEnc');
    expect(dto.hasAccountNumber).toBe(true);
    expect(JSON.stringify(dto)).not.toContain(FULL);
  });

  it('normalises spaces and hyphens before encrypting', async () => {
    await createAccount('u1', { ...baseInput, accountNumber: '5010 0123-456789' });
    const data = db.bankAccount.create.mock.calls[0]![0].data;
    expect(await decryptIdentifier(data.accountNumberEnc)).toBe(FULL);
  });

  it('rejects a full number that is not 6–18 digits', async () => {
    await expect(
      createAccount('u1', { ...baseInput, accountNumber: '12AB34' }),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(db.bankAccount.create).not.toHaveBeenCalled();
  });

  it('keeps last4-only accounts working', async () => {
    const dto = await createAccount('u1', baseInput);
    const data = db.bankAccount.create.mock.calls[0]![0].data;
    expect(data.accountNumberEnc).toBeNull();
    expect(data.last4).toBe('9999');
    expect(dto.hasAccountNumber).toBe(false);
  });

  it('update with a new number re-encrypts and refreshes last4', async () => {
    db.bankAccount.findFirst.mockResolvedValue({ id: 'ba1' });
    const dto = await updateAccount('u1', 'ba1', { accountNumber: '998877664321' });

    const data = db.bankAccount.update.mock.calls[0]![0].data;
    expect(await decryptIdentifier(data.accountNumberEnc)).toBe('998877664321');
    expect(data.last4).toBe('4321');
    expect(dto).not.toHaveProperty('accountNumberEnc');
    expect(dto.hasAccountNumber).toBe(true);
  });

  it('update with null clears the stored number but keeps last4', async () => {
    db.bankAccount.findFirst.mockResolvedValue({ id: 'ba1' });
    await updateAccount('u1', 'ba1', { accountNumber: null });

    const data = db.bankAccount.update.mock.calls[0]![0].data;
    expect(data.accountNumberEnc).toBeNull();
    expect(data).not.toHaveProperty('last4');
  });

  it('list and get never expose the ciphertext', async () => {
    db.bankAccount.findMany.mockResolvedValue([
      { id: 'a', userId: 'u1', last4: '1111', accountNumberEnc: 'CIPHERTEXT', snapshots: [] },
      { id: 'b', userId: 'u1', last4: '2222', accountNumberEnc: null, snapshots: [] },
    ]);
    const list = await listAccounts('u1');
    expect(list.map((a) => a.hasAccountNumber)).toEqual([true, false]);
    for (const a of list) expect(a).not.toHaveProperty('accountNumberEnc');

    db.bankAccount.findFirst.mockResolvedValue({
      id: 'a',
      userId: 'u1',
      last4: '1111',
      accountNumberEnc: 'CIPHERTEXT',
      snapshots: [],
    });
    const one = await getAccount('u1', 'a');
    expect(one).not.toHaveProperty('accountNumberEnc');
    expect(one.hasAccountNumber).toBe(true);
  });
});

describe('revealAccountNumber', () => {
  it('returns the plaintext to the owner and writes a pii_view audit row', async () => {
    db.bankAccount.findFirst.mockResolvedValue({
      id: 'ba1',
      accountNumberEnc: await encryptIdentifier(FULL),
    });

    const value = await revealAccountNumber('u1', 'ba1', { ip: '1.2.3.4', userAgent: 'vitest' });

    expect(value).toBe(FULL);
    expect(db.bankAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ba1', userId: 'u1' } }),
    );
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        action: 'pii_view',
        resource: 'BankAccount:ba1',
        ip: '1.2.3.4',
        userAgent: 'vitest',
      }),
    });
    // The audit trail records THAT it was viewed, never the value itself.
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain(FULL);
  });

  it("404s on another user's account without auditing", async () => {
    db.bankAccount.findFirst.mockResolvedValue(null);
    await expect(revealAccountNumber('u2', 'ba1', {})).rejects.toBeInstanceOf(NotFoundError);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns null when only last4 was saved, without auditing', async () => {
    db.bankAccount.findFirst.mockResolvedValue({ id: 'ba1', accountNumberEnc: null });
    expect(await revealAccountNumber('u1', 'ba1', {})).toBeNull();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('fails loudly on undecryptable ciphertext', async () => {
    db.bankAccount.findFirst.mockResolvedValue({ id: 'ba1', accountNumberEnc: 'bm90LWEtcmVhbC1jaXBoZXJ0ZXh0LXBheWxvYWQ=' });
    await expect(revealAccountNumber('u1', 'ba1', {})).rejects.toBeInstanceOf(BadRequestError);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not reveal when the audit write fails', async () => {
    db.bankAccount.findFirst.mockResolvedValue({
      id: 'ba1',
      accountNumberEnc: await encryptIdentifier(FULL),
    });
    db.auditLog.create.mockRejectedValue(new Error('db down'));
    await expect(revealAccountNumber('u1', 'ba1', {})).rejects.toThrow('db down');
  });
});
