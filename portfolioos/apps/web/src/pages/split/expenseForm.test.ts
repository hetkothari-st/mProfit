import { describe, it, expect } from 'vitest';
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

  it('foreign currency needs a rate', () => {
    const f = { ...base(), currency: 'USD', fxRate: '' };
    expect(checkForm(f, M, 'INR')).toMatchObject({ ok: false, error: 'Enter the USD → INR exchange rate' });
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
});
