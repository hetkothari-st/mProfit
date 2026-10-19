import { describe, it, expect } from 'vitest';
import { decimalInput } from '../../src/lib/zodMoney.js';
import { baseTransactionSchema } from '../../src/controllers/transaction.controller.js';

// R-05: `z.union([z.number(), z.string()])` passed these straight into
// `new Decimal(...)`, which accepts NaN/Infinity/hex; Postgres numeric stores
// NaN, poisoning every holdings sum it touches. "abc" threw a plain error → 500.
const HOSTILE = ['NaN', 'Infinity', '-Infinity', '0x10', '0b11', 'abc', ' 12 ', '', '1e30'];

describe('decimalInput', () => {
  const schema = decimalInput(1e12);

  it.each(HOSTILE)('rejects %j', (v) => {
    expect(schema.safeParse(v).success).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1e13])('rejects the number %s', (v) => {
    expect(schema.safeParse(v).success).toBe(false);
  });

  it.each(['0', '12', '-5', '33.33', '.5', '100.005', '1e-7', 42, 0.1])('accepts %j', (v) => {
    expect(schema.safeParse(v).success).toBe(true);
  });
});

describe('transaction body', () => {
  const valid = {
    portfolioId: 'ckabcdefghijklmnopqrstuvw',
    transactionType: 'BUY',
    assetClass: 'EQUITY',
    tradeDate: '2026-01-15',
    quantity: '10',
    price: '100',
  };

  it('accepts a normal buy', () => {
    expect(baseTransactionSchema.safeParse(valid).success).toBe(true);
  });

  it.each(['quantity', 'price', 'brokerage'])('rejects NaN in %s', (field) => {
    expect(baseTransactionSchema.safeParse({ ...valid, [field]: 'NaN' }).success).toBe(false);
  });
});
