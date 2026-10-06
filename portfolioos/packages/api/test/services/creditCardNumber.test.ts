import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Full card numbers are stored encrypted and only ever leave the server
// through the audited reveal endpoint — the same contract as bank account
// numbers: ciphertext never appears in a DTO, reveal is owner-scoped, and
// every successful reveal writes an AuditLog row (§3.7 / §15.8).

const db = vi.hoisted(() => ({
  creditCard: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}));

vi.mock('../../src/lib/prisma.js', () => ({ prisma: db }));

import {
  createCard,
  updateCard,
  listCards,
  getCard,
  revealCardNumber,
} from '../../src/services/creditCards.service.js';
import {
  encryptIdentifier,
  decryptIdentifier,
} from '../../src/services/pfCredentials.service.js';
import { BadRequestError, NotFoundError } from '../../src/lib/errors.js';

// Standard test PANs (they pass the Luhn check; no real account behind them).
const VISA = '4111111111111111';
const AMEX = '378282246310005';

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

beforeEach(() => {
  vi.clearAllMocks();
  db.creditCard.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'cc1',
    ...data,
  }));
  db.creditCard.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      userId: 'u1',
      last4: '0000',
      cardNumberEnc: null,
      ...data,
    }),
  );
  db.auditLog.create.mockResolvedValue({});
});

const baseInput = {
  issuerBank: 'HDFC Bank',
  cardName: 'Infinia',
  last4: '9999',
  creditLimit: '100000',
  statementDay: 1,
  dueDay: 20,
};

describe('credit card full number — storage', () => {
  it('encrypts the full number on create and derives last4 from it', async () => {
    const dto = await createCard('u1', { ...baseInput, cardNumber: VISA });

    const data = db.creditCard.create.mock.calls[0]![0].data;
    expect(await decryptIdentifier(data.cardNumberEnc)).toBe(VISA);
    expect(data.last4).toBe('1111');

    expect(dto).not.toHaveProperty('cardNumberEnc');
    expect(dto.hasCardNumber).toBe(true);
    expect(JSON.stringify(dto)).not.toContain(VISA);
  });

  it('normalises spaces and hyphens, and takes 15-digit Amex numbers', async () => {
    await createCard('u1', { ...baseInput, cardNumber: '3782 822463-10005' });
    const data = db.creditCard.create.mock.calls[0]![0].data;
    expect(await decryptIdentifier(data.cardNumberEnc)).toBe(AMEX);
    expect(data.last4).toBe('0005');
  });

  it.each([
    ['letters', '4111 11AB 1111 1111'],
    ['too short', '41111111111'],
    ['a typo (fails the Luhn check)', '4111111111111112'],
  ])('rejects %s', async (_why, cardNumber) => {
    await expect(createCard('u1', { ...baseInput, cardNumber })).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(db.creditCard.create).not.toHaveBeenCalled();
  });

  it('keeps last4-only cards working', async () => {
    const dto = await createCard('u1', baseInput);
    const data = db.creditCard.create.mock.calls[0]![0].data;
    expect(data.cardNumberEnc).toBeNull();
    expect(data.last4).toBe('9999');
    expect(dto.hasCardNumber).toBe(false);
  });

  it('update with a new number re-encrypts and refreshes last4', async () => {
    db.creditCard.findFirst.mockResolvedValue({ id: 'cc1' });
    const dto = await updateCard('u1', 'cc1', { cardNumber: AMEX });

    const data = db.creditCard.update.mock.calls[0]![0].data;
    expect(await decryptIdentifier(data.cardNumberEnc)).toBe(AMEX);
    expect(data.last4).toBe('0005');
    expect(dto).not.toHaveProperty('cardNumberEnc');
    expect(dto.hasCardNumber).toBe(true);
  });

  it('update with null clears the stored number but keeps last4', async () => {
    db.creditCard.findFirst.mockResolvedValue({ id: 'cc1' });
    await updateCard('u1', 'cc1', { cardNumber: null });

    const data = db.creditCard.update.mock.calls[0]![0].data;
    expect(data.cardNumberEnc).toBeNull();
    expect(data).not.toHaveProperty('last4');
  });

  it('update without the field leaves the stored number alone', async () => {
    db.creditCard.findFirst.mockResolvedValue({ id: 'cc1' });
    await updateCard('u1', 'cc1', { cardName: 'Infinia Metal' });
    expect(db.creditCard.update.mock.calls[0]![0].data).not.toHaveProperty('cardNumberEnc');
  });

  it('list and get never expose the ciphertext', async () => {
    db.creditCard.findMany.mockResolvedValue([
      { id: 'a', userId: 'u1', last4: '1111', cardNumberEnc: 'CIPHERTEXT', statements: [] },
      { id: 'b', userId: 'u1', last4: '2222', cardNumberEnc: null, statements: [] },
    ]);
    const list = await listCards('u1');
    expect(list.map((c) => c.hasCardNumber)).toEqual([true, false]);
    for (const c of list) expect(c).not.toHaveProperty('cardNumberEnc');

    db.creditCard.findFirst.mockResolvedValue({
      id: 'a',
      userId: 'u1',
      last4: '1111',
      cardNumberEnc: 'CIPHERTEXT',
      statements: [],
    });
    const one = await getCard('u1', 'a');
    expect(one).not.toHaveProperty('cardNumberEnc');
    expect(one.hasCardNumber).toBe(true);
  });
});

describe('revealCardNumber', () => {
  it('returns the plaintext to the owner and writes a pii_view audit row', async () => {
    db.creditCard.findFirst.mockResolvedValue({ id: 'cc1', cardNumberEnc: await encryptIdentifier(VISA) });

    const value = await revealCardNumber('u1', 'cc1', { ip: '1.2.3.4', userAgent: 'vitest' });

    expect(value).toBe(VISA);
    expect(db.creditCard.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cc1', userId: 'u1' } }),
    );
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        action: 'pii_view',
        resource: 'CreditCard:cc1',
        ip: '1.2.3.4',
        userAgent: 'vitest',
      }),
    });
    // The audit trail records THAT it was viewed, never the value itself.
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain(VISA);
  });

  it("404s on another user's card without auditing", async () => {
    db.creditCard.findFirst.mockResolvedValue(null);
    await expect(revealCardNumber('u2', 'cc1', {})).rejects.toBeInstanceOf(NotFoundError);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns null when only last4 was saved, without auditing', async () => {
    db.creditCard.findFirst.mockResolvedValue({ id: 'cc1', cardNumberEnc: null });
    expect(await revealCardNumber('u1', 'cc1', {})).toBeNull();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('fails loudly on undecryptable ciphertext', async () => {
    db.creditCard.findFirst.mockResolvedValue({
      id: 'cc1',
      cardNumberEnc: 'bm90LWEtcmVhbC1jaXBoZXJ0ZXh0LXBheWxvYWQ=',
    });
    await expect(revealCardNumber('u1', 'cc1', {})).rejects.toBeInstanceOf(BadRequestError);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not reveal when the audit write fails', async () => {
    db.creditCard.findFirst.mockResolvedValue({ id: 'cc1', cardNumberEnc: await encryptIdentifier(VISA) });
    db.auditLog.create.mockRejectedValue(new Error('db down'));
    await expect(revealCardNumber('u1', 'cc1', {})).rejects.toThrow('db down');
  });
});
