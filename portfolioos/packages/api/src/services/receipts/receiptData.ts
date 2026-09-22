/**
 * Turning a voucher into a receipt.
 *
 * A voucher is a double-entry record; a receipt is a document you hand to
 * somebody. They describe the same event and almost none of the same fields,
 * so this is where the gap is closed: the voucher supplies the number, date
 * and amount, and the row it was derived from supplies everything that makes
 * the paper meaningful — which tenant, which property, which months, which
 * policy, which loan.
 *
 * The link back to the source is the voucher number. `generateVouchersFromActivity`
 * mints them as `AUTO-RENT-<rentReceiptId>`, `AUTO-PREM-<premiumPaymentId>`
 * and `AUTO-LOAN-<loanPaymentId>`, so the id is already in hand and no extra
 * column is needed. A voucher that was posted by hand has no source row and
 * still produces a receipt — just a plainer one, from the ledger alone.
 *
 * Everything here reads under the CALLER's identity. A CA gets the client's
 * rows through the CA policies and a narrowed grant hides what it should; the
 * receipt is then built from what was actually readable, never from a
 * privileged read that would paper over the gap.
 */

import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import { toDecimal } from '@everypaisa/shared';
import { amountInWords } from './amountInWords.js';

export type ReceiptKind = 'RENT' | 'PREMIUM' | 'LOAN_PAYMENT' | 'LOAN_DISBURSEMENT' | 'VOUCHER';

export interface ReceiptField {
  label: string;
  value: string;
}

export interface ReceiptDocument {
  kind: ReceiptKind;
  /** What the document calls itself: "Rent Receipt", "Premium Receipt", … */
  title: string;
  /** The voucher number, which is also the receipt number. */
  number: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  amount: string;
  amountWords: string;
  /** Who paid, when that is known. */
  receivedFrom?: string;
  /** Who was paid, when that is known. */
  paidTo?: string;
  /** The body: the facts that make this receipt about something. */
  fields: ReceiptField[];
  narration?: string;
  /** The ledger legs, printed small at the foot so the paper reconciles. */
  entries: Array<{ debit: string; credit: string; amount: string }>;
  /** Name shown as the issuer — the account holder. */
  issuedBy: string;
  /**
   * True when the receipt records money RECEIVED (so it is signed by the
   * person issuing it) rather than money paid out. Decides the signature line
   * and whether "Received from" or "Paid to" leads.
   */
  isInflow: boolean;
}

const RUPEE_FIELDS = new Set(['Amount']);

/** ISO date of a `Date`, in IST terms, for a document meant to be filed in India. */
function istDate(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function monthLabel(forMonth: string): string {
  // "2025-05" → "May 2025". Left as-is if it is not the expected shape.
  const m = /^(\d{4})-(\d{2})$/.exec(forMonth);
  if (!m) return forMonth;
  const date = new Date(Number.parseInt(m[1]!, 10), Number.parseInt(m[2]!, 10) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function dayLabel(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** The source row id a generated voucher number carries, if it carries one. */
function sourceIdOf(voucherNo: string, prefix: string): string | null {
  return voucherNo.startsWith(prefix) ? voucherNo.slice(prefix.length) : null;
}

export async function buildReceipt(
  userId: string,
  voucherId: string,
): Promise<ReceiptDocument> {
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, userId },
    include: {
      entries: {
        include: {
          debitAccount: { select: { code: true, name: true } },
          creditAccount: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (!voucher) throw new NotFoundError('Voucher not found');

  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  const total = voucher.entries.reduce(
    (sum, e) => sum.plus(toDecimal(e.amount.toString())),
    toDecimal(0),
  );
  const amount = total.toFixed(2);

  const base = {
    number: voucher.voucherNo,
    date: istDate(voucher.date),
    amount,
    amountWords: amountInWords(amount),
    narration: voucher.narration ?? undefined,
    entries: voucher.entries.map((e) => ({
      debit: `${e.debitAccount.code} ${e.debitAccount.name}`,
      credit: `${e.creditAccount.code} ${e.creditAccount.name}`,
      amount: toDecimal(e.amount.toString()).toFixed(2),
    })),
    issuedBy: owner?.name || owner?.email || 'Account holder',
  };

  const rentId = sourceIdOf(voucher.voucherNo, 'AUTO-RENT-');
  if (rentId) {
    const receipt = await prisma.rentReceipt.findUnique({
      where: { id: rentId },
      include: { tenancy: { include: { property: true } } },
    });
    if (receipt) {
      return {
        ...base,
        kind: 'RENT',
        title: 'Rent Receipt',
        isInflow: true,
        receivedFrom: receipt.tenancy.tenantName,
        fields: [
          { label: 'Property', value: receipt.tenancy.property.name },
          ...(receipt.tenancy.property.address
            ? [{ label: 'Address', value: receipt.tenancy.property.address }]
            : []),
          { label: 'For the month of', value: monthLabel(receipt.forMonth) },
          { label: 'Rent due', value: dayLabel(receipt.dueDate) },
          { label: 'Received on', value: dayLabel(receipt.receivedOn ?? voucher.date) },
          { label: 'Amount', value: amount },
        ],
      };
    }
  }

  const premiumId = sourceIdOf(voucher.voucherNo, 'AUTO-PREM-');
  if (premiumId) {
    const payment = await prisma.premiumPayment.findUnique({
      where: { id: premiumId },
      include: { policy: true },
    });
    if (payment) {
      return {
        ...base,
        kind: 'PREMIUM',
        title: 'Premium Payment Receipt',
        isInflow: false,
        paidTo: payment.policy.insurer,
        fields: [
          { label: 'Policy', value: payment.policy.planName || payment.policy.type },
          { label: 'Policy holder', value: payment.policy.policyHolder },
          {
            label: 'Covering',
            value: `${dayLabel(payment.periodFrom)} to ${dayLabel(payment.periodTo)}`,
          },
          { label: 'Paid on', value: dayLabel(payment.paidOn) },
          { label: 'Amount', value: amount },
        ],
      };
    }
  }

  const loanPaymentId = sourceIdOf(voucher.voucherNo, 'AUTO-LOAN-');
  if (loanPaymentId) {
    const payment = await prisma.loanPayment.findUnique({
      where: { id: loanPaymentId },
      include: { loan: true },
    });
    if (payment) {
      const principal = payment.principalPart
        ? toDecimal(payment.principalPart.toString()).toFixed(2)
        : null;
      const interest = payment.interestPart
        ? toDecimal(payment.interestPart.toString()).toFixed(2)
        : null;
      return {
        ...base,
        kind: 'LOAN_PAYMENT',
        title: 'Loan Payment Receipt',
        isInflow: false,
        paidTo: payment.loan.lenderName,
        fields: [
          { label: 'Loan', value: `${payment.loan.loanType} — ${payment.loan.lenderName}` },
          { label: 'Borrower', value: payment.loan.borrowerName },
          { label: 'Payment type', value: payment.paymentType },
          ...(principal ? [{ label: 'Principal', value: principal }] : []),
          ...(interest ? [{ label: 'Interest', value: interest }] : []),
          { label: 'Paid on', value: dayLabel(payment.paidOn) },
          { label: 'Amount', value: amount },
        ],
      };
    }
  }

  // A disbursement is money IN, against a loan that is not a payment at all,
  // so it gets its own document rather than falling through to the generic
  // one: "Voucher AUTO-LOANDISB-…" is not something anyone would file.
  const disbursementId = sourceIdOf(voucher.voucherNo, 'AUTO-LOANDISB-');
  if (disbursementId) {
    const loan = await prisma.loan.findUnique({ where: { id: disbursementId } });
    if (loan) {
      return {
        ...base,
        kind: 'LOAN_DISBURSEMENT',
        title: 'Loan Disbursement Advice',
        isInflow: true,
        receivedFrom: loan.lenderName,
        fields: [
          { label: 'Loan', value: `${loan.loanType} — ${loan.lenderName}` },
          { label: 'Borrower', value: loan.borrowerName },
          { label: 'Rate of interest', value: `${loan.interestRate.toString()}% p.a.` },
          { label: 'Tenure', value: `${loan.tenureMonths} months` },
          { label: 'Disbursed on', value: dayLabel(loan.disbursementDate) },
          { label: 'Amount', value: amount },
        ],
      };
    }
  }

  // Anything else — a hand-posted voucher, or a generated one whose source row
  // has since been deleted. Still a valid receipt; it just speaks in ledger
  // terms because that is all there is to say.
  const inflow = voucher.type === 'RECEIPT';
  return {
    ...base,
    kind: 'VOUCHER',
    title: inflow ? 'Receipt' : voucher.type === 'PAYMENT' ? 'Payment Voucher' : 'Voucher',
    isInflow: inflow,
    fields: [
      { label: 'Voucher type', value: voucher.type },
      { label: 'Date', value: dayLabel(voucher.date) },
      { label: 'Amount', value: amount },
    ],
  };
}

export { RUPEE_FIELDS };
