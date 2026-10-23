import type { LoanPaymentDTO } from '@/api/loans/loans.api';

/**
 * The EMI payment recorded for a schedule month. A payment saved without a
 * month counts for the month it was paid in — the same rule the server's
 * schedule uses to mark the row paid, so Undo finds what the row shows.
 */
export function findEmiPayment(
  payments: Pick<LoanPaymentDTO, 'id' | 'paymentType' | 'forMonth' | 'paidOn'>[],
  month: string,
) {
  return payments.find(
    (p) => p.paymentType === 'EMI' && (p.forMonth ?? p.paidOn.slice(0, 7)) === month,
  );
}
