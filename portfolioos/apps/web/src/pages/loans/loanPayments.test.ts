import { describe, it, expect } from 'vitest';
import { findEmiPayment } from './loanPayments';

const pay = (id: string, paidOn: string, forMonth: string | null, paymentType = 'EMI') => ({ id, paymentType, paidOn, forMonth });

describe('findEmiPayment', () => {
  it('matches an EMI by its month', () => {
    expect(findEmiPayment([pay('a', '2026-03-04', '2026-03')], '2026-03')?.id).toBe('a');
  });

  it('matches an EMI saved without a month by the month it was paid in (Undo used to say "Payment not found")', () => {
    expect(findEmiPayment([pay('b', '2026-04-05T00:00:00.000Z', null)], '2026-04')?.id).toBe('b');
  });

  it('ignores prepayments', () => {
    expect(findEmiPayment([pay('c', '2026-04-05', null, 'PREPAYMENT')], '2026-04')).toBeUndefined();
  });
});
