import { describe, it, expect } from 'vitest';
import { Decimal } from '@everypaisa/shared';
import type { SplitExpenseDto, SplitMemberDto } from '@everypaisa/shared';
import { checkForm, cleanAmount, emptyForm, formFromExpense, toPayload } from './expenseForm';

const M: SplitMemberDto[] = [
  { id: 'b', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null },
  { id: 'a', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null },
  { id: 'c', displayName: 'Chetan', userId: null, contactId: 'c3', isMe: false, leftAt: null },
];

const base = () => ({ ...emptyForm(M, 'INR', '2026-10-08'), description: 'Dinner', amount: '100' });

describe('expenseForm', () => {
  it('cleanAmount strips formatting', () => {
    expect(cleanAmount(' ₹1,234.50 ')).toBe('1234.50');
  });

  it('emptyForm: I paid, everyone included, EQUAL, group currency', () => {
    const f = emptyForm(M, 'INR', '2026-10-08');
    expect(f.singlePayerId).toBe('a');
    expect(f.splitMode).toBe('EQUAL');
    expect(Object.values(f.included).every(Boolean)).toBe(true);
    expect(f.currency).toBe('INR');
  });

  it('EQUAL preview totals exactly with extra paisa to lowest id', () => {
    const r = checkForm(base(), M, 'INR');
    expect(r.ok).toBe(true);
    expect(r.preview).toEqual([
      { memberId: 'a', amount: '33.34' }, { memberId: 'b', amount: '33.33' }, { memberId: 'c', amount: '33.33' },
    ]);
  });

  it('no participants', () => {
    const f = base();
    f.included = { a: false, b: false, c: false };
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: false, error: 'Pick at least one person to split with' });
  });

  it('EXACT remaining and success', () => {
    const f = { ...base(), splitMode: 'EXACT' as const, values: { a: '60', b: '30', c: '' } };
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: false, remaining: '10.00' });
    f.values.c = '10';
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: true, remaining: '0.00' });
  });

  it('percent off by', () => {
    const f = { ...base(), splitMode: 'PERCENT' as const, values: { a: '50', b: '40', c: '' } };
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: false, error: 'Percentages add up to 90%, not 100%' });
  });

  it('multiple payers must add up', () => {
    const f = { ...base(), payerMode: 'multiple' as const, payerAmounts: { a: '60', b: '30', c: '' } };
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: false, error: 'Paid amounts add up to ₹90.00, not ₹100.00' });
  });

  it('blank rate allowed; invalid rate rejected', () => {
    const blank = { ...base(), currency: 'USD', fxRate: '' };
    expect(checkForm(blank, M, 'INR').ok).toBe(true);
    expect(toPayload(blank, M, 'INR').fxRate).toBeNull();
    expect(checkForm({ ...blank, fxRate: 'abc' }, M, 'INR')).toMatchObject({ ok: false, error: 'Enter a valid exchange rate or leave it blank' });
    expect(checkForm({ ...blank, fxRate: '0' }, M, 'INR').ok).toBe(false);
    expect(checkForm({ ...blank, fxRate: '83.1' }, M, 'INR').ok).toBe(true);
  });

  it('bad amount and missing description', () => {
    expect(checkForm({ ...base(), amount: '0' }, M, 'INR').error).toBe('Enter an amount above 0 with at most 2 decimals');
    expect(checkForm({ ...base(), amount: '10.005' }, M, 'INR').error).toBe('Enter an amount above 0 with at most 2 decimals');
    expect(checkForm({ ...base(), description: '  ' }, M, 'INR').error).toBe('Add a description');
  });

  it('toPayload EQUAL sends only included members; same-currency sends no fxRate', () => {
    const f = base();
    f.included.c = false;
    expect(toPayload(f, M, 'INR')).toEqual({
      description: 'Dinner', date: '2026-10-08', amount: '100', currency: 'INR', fxRate: null,
      splitMode: 'EQUAL', payers: [{ memberId: 'a', amount: '100' }],
      shares: [{ memberId: 'b' }, { memberId: 'a' }],
    });
  });

  it('toPayload SHARES drops blank/zero values and sends USD rate', () => {
    const f = { ...base(), splitMode: 'SHARES' as const, currency: 'USD', fxRate: '83.1', values: { a: '2', b: '1', c: '0' } };
    const p = toPayload(f, M, 'INR');
    expect(p.shares).toEqual([{ memberId: 'b', value: '1' }, { memberId: 'a', value: '2' }]);
    expect(p.fxRate).toBe('83.1');
  });


  it('formFromExpense round-trips an EXACT multi-payer expense', () => {
    const e = {
      id: 'e1', groupId: 'g', description: 'Taxi', date: '2026-10-01', amount: '90.0000', currency: 'INR',
      fxRate: '1', baseAmount: '90.0000', splitMode: 'EXACT', createdById: 'u1', createdAt: '2026-10-01T00:00:00Z',
      sourceType: 'MANUAL', deletedAt: null,
      payers: [{ memberId: 'a', amount: '60.0000', baseAmount: '60.0000' }, { memberId: 'b', amount: '30.0000', baseAmount: '30.0000' }],
      shares: [{ memberId: 'a', amount: '45.0000', baseAmount: '45.0000', rawInput: '45' }, { memberId: 'b', amount: '45.0000', baseAmount: '45.0000', rawInput: '45' }],
    } as SplitExpenseDto;
    const f = formFromExpense(e, M);
    expect(f).toMatchObject({ amount: '90', payerMode: 'multiple', payerAmounts: { a: '60', b: '30' }, values: { a: '45', b: '45' } });
    expect(checkForm(f, M, 'INR').ok).toBe(true);
  });

  it('emptyForm with a left member excludes it from included', () => {
    const withLeft = [
      ...M,
      { id: 'd', displayName: 'Dave', userId: 'u4', contactId: 'c4', isMe: false, leftAt: '2026-09-01T00:00:00Z' },
    ];
    const f = emptyForm(withLeft, 'INR', '2026-10-08');
    expect(f.included).toEqual({ a: true, b: true, c: true });
    expect(f.included.d).toBeUndefined();
  });

  it('checkForm/toPayload ignore left members even if included is true', () => {
    const withLeft = [
      ...M,
      { id: 'd', displayName: 'Dave', userId: 'u4', contactId: 'c4', isMe: false, leftAt: '2026-09-01T00:00:00Z' },
    ];
    const f = { ...base(), included: { a: true, b: true, c: true, d: true } };
    const check = checkForm(f, withLeft, 'INR');
    expect(check.ok).toBe(true);
    expect(check.preview.map((p) => p.memberId)).toEqual(['a', 'b', 'c']);
    const payload = toPayload(f, withLeft, 'INR');
    expect(payload.shares.map((s) => s.memberId)).toEqual(['b', 'a', 'c']);
  });

  it('PERCENT expense with rawInput null round-trips (amounts 33.34/33.33/33.33 of 100)', () => {
    const e = {
      id: 'e2', groupId: 'g', description: 'Lunch', date: '2026-10-02', amount: '100.0000', currency: 'INR',
      fxRate: '1', baseAmount: '100.0000', splitMode: 'PERCENT' as const, createdById: 'u1', createdAt: '2026-10-02T00:00:00Z',
      sourceType: 'MANUAL', deletedAt: null,
      payers: [{ memberId: 'a', amount: '100.0000', baseAmount: '100.0000' }],
      shares: [
        { memberId: 'a', amount: '33.3400', baseAmount: '33.3400', rawInput: null },
        { memberId: 'b', amount: '33.3300', baseAmount: '33.3300', rawInput: null },
        { memberId: 'c', amount: '33.3300', baseAmount: '33.3300', rawInput: null },
      ],
    } as SplitExpenseDto;
    const f = formFromExpense(e, M);
    expect(checkForm(f, M, 'INR').ok).toBe(true);
    const payload = toPayload(f, M, 'INR');
    const sum = payload.shares.reduce((acc, s) => acc.plus(s.value || '0'), new Decimal(0));
    expect(sum.toNumber()).toBe(100);
  });

  it('SHARES expense with rawInput null uses amounts as weights', () => {
    const e = {
      id: 'e3', groupId: 'g', description: 'Taxi', date: '2026-10-03', amount: '200.0000', currency: 'INR',
      fxRate: '1', baseAmount: '200.0000', splitMode: 'SHARES' as const, createdById: 'u1', createdAt: '2026-10-03T00:00:00Z',
      sourceType: 'MANUAL', deletedAt: null,
      payers: [{ memberId: 'a', amount: '200.0000', baseAmount: '200.0000' }],
      shares: [
        { memberId: 'a', amount: '100.0000', baseAmount: '100.0000', rawInput: null },
        { memberId: 'b', amount: '100.0000', baseAmount: '100.0000', rawInput: null },
      ],
    } as SplitExpenseDto;
    const f = formFromExpense(e, M);
    expect(f.values).toMatchObject({ a: '100', b: '100' });
    expect(checkForm(f, M, 'INR').ok).toBe(true);
  });

  it('PERCENT expense with rawInput set round-trips to those raw values', () => {
    const e = {
      id: 'e4', groupId: 'g', description: 'Dinner', date: '2026-10-04', amount: '100.0000', currency: 'INR',
      fxRate: '1', baseAmount: '100.0000', splitMode: 'PERCENT' as const, createdById: 'u1', createdAt: '2026-10-04T00:00:00Z',
      sourceType: 'MANUAL', deletedAt: null,
      payers: [{ memberId: 'a', amount: '100.0000', baseAmount: '100.0000' }],
      shares: [
        { memberId: 'a', amount: '50.0000', baseAmount: '50.0000', rawInput: '50' },
        { memberId: 'b', amount: '30.0000', baseAmount: '30.0000', rawInput: '30' },
        { memberId: 'c', amount: '20.0000', baseAmount: '20.0000', rawInput: '20' },
      ],
    } as SplitExpenseDto;
    const f = formFromExpense(e, M);
    expect(f.values).toMatchObject({ a: '50', b: '30', c: '20' });
    expect(checkForm(f, M, 'INR').ok).toBe(true);
  });
});
