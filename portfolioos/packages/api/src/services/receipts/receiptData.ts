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
import { inr } from './format.js';

export type ReceiptKind = 'RENT' | 'PREMIUM' | 'LOAN_PAYMENT' | 'LOAN_DISBURSEMENT' | 'VOUCHER';

export interface ReceiptField {
  label: string;
  value: string;
}

/** One run of the receipt's sentence; `strong` runs are the facts it attests. */
export interface StatementPart {
  text: string;
  strong?: boolean;
}

export interface ReceiptDocument {
  kind: ReceiptKind;
  /** What the document calls itself: "Rent Receipt", "Premium Receipt", … */
  title: string;
  /**
   * The number printed on the document. Derived and human-sized for a
   * generated voucher — nobody writes `AUTO-LOANDISB-cmu5bbo7801rys4hpvj05wore`
   * on a receipt, and a database id on a document handed to a tenant is both
   * ugly and a small leak. A hand-posted voucher keeps the number its author
   * chose, because that one was written by a person for people.
   */
  number: string;
  /** The voucher number verbatim, printed small in the footer for reconciling. */
  ledgerRef: string;
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
  /** Printed under the issuer's name on the letterhead, when known. */
  issuerEmail?: string;
  /**
   * The receipt said as one sentence — "Received with thanks from … the sum
   * of … towards …". It is what makes a slip of paper read as a receipt
   * rather than a table of fields, and it is how receipts in India are
   * written by hand; the fields below it are the same facts, for reference.
   */
  statement: StatementPart[];
  /**
   * True when the receipt records money RECEIVED (so it is signed by the
   * person issuing it) rather than money paid out. Decides the signature line
   * and whether "Received from" or "Paid to" leads.
   */
  isInflow: boolean;
}

/** Fields whose value is a sum of money, printed with Rs. and grouping. */
const RUPEE_FIELDS = new Set(['Amount', 'Principal', 'Interest']);

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

/** Short codes for the derived receipt number, one per kind of document. */
const KIND_CODE: Record<ReceiptKind, string> = {
  RENT: 'RR',
  PREMIUM: 'PR',
  LOAN_PAYMENT: 'LP',
  LOAN_DISBURSEMENT: 'LD',
  VOUCHER: 'VR',
};

/**
 * `LD/20290917/WORE` — kind, date, and the tail of the source id.
 *
 * Deterministic, so the same payment always produces the same receipt number
 * and a reissued copy matches the one already filed. The id tail is what keeps
 * two receipts of the same kind on the same day apart.
 */
function displayNumber(voucherNo: string, kind: ReceiptKind, isoDate: string): string {
  if (!voucherNo.startsWith('AUTO-')) return voucherNo;
  const tail = voucherNo.slice(-4).toUpperCase();
  return `${KIND_CODE[kind]}/${isoDate.replace(/-/g, '')}/${tail}`;
}

/** Tokens that are abbreviations, and stay in capitals wherever they appear. */
const ACRONYMS = new Set(['emi', 'ulip', 'nps', 'epf', 'ppf']);

/** Lower-case words, except abbreviations: `EMI` stays `EMI`, not `Emi`. */
function words(token: string): string {
  return token
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
    .join(' ');
}

/** `HOME` → `Home loan`, `PROCESSING_FEE` → `Processing fee`, `EMI` → `EMI`. */
function humanise(token: string, suffix = ''): string {
  const w = words(token);
  const sentence = w.charAt(0).toUpperCase() + w.slice(1);
  return suffix ? `${sentence} ${suffix}` : sentence;
}

/** `240 months` reads as a number; `240 months (20 years)` reads as a tenure. */
function tenureLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${months} months`;
  const yearPart = `${years} year${years === 1 ? '' : 's'}`;
  return rest === 0
    ? `${months} months (${yearPart})`
    : `${months} months (${yearPart} ${rest}m)`;
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

  const date = istDate(voucher.date);
  const base = {
    ledgerRef: voucher.voucherNo,
    date,
    amount,
    amountWords: amountInWords(amount),
    narration: voucher.narration ?? undefined,
    entries: voucher.entries.map((e) => ({
      debit: `${e.debitAccount.code} ${e.debitAccount.name}`,
      credit: `${e.creditAccount.code} ${e.creditAccount.name}`,
      amount: toDecimal(e.amount.toString()).toFixed(2),
    })),
    issuedBy: owner?.name || owner?.email || 'Account holder',
    issuerEmail: owner?.name && owner.email ? owner.email : undefined,
  };

  // "the sum of forty-five thousand rupees only (Rs. 45,000.00)" — the words
  // lead, as on a cheque, and the figure confirms them.
  const inWords = base.amountWords.charAt(0).toLowerCase() + base.amountWords.slice(1);
  const sum: StatementPart[] = [
    { text: ' the sum of ' },
    { text: inWords, strong: true },
    { text: ` (${inr(amount)})` },
  ];

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
        number: displayNumber(voucher.voucherNo, 'RENT', date),
        title: 'Rent Receipt',
        isInflow: true,
        receivedFrom: receipt.tenancy.tenantName,
        statement: [
          { text: 'Received with thanks from ' },
          { text: receipt.tenancy.tenantName, strong: true },
          ...sum,
          { text: ' towards rent of ' },
          { text: receipt.tenancy.property.name, strong: true },
          { text: ' for the month of ' },
          { text: monthLabel(receipt.forMonth), strong: true },
          { text: '.' },
        ],
        fields: [
          { label: 'Property', value: receipt.tenancy.property.name },
          ...(receipt.tenancy.property.address
            ? [{ label: 'Address', value: receipt.tenancy.property.address }]
            : []),
          { label: 'For the month of', value: monthLabel(receipt.forMonth) },
          { label: 'Rent due on', value: dayLabel(receipt.dueDate) },
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
        number: displayNumber(voucher.voucherNo, 'PREMIUM', date),
        title: 'Premium Payment Receipt',
        isInflow: false,
        paidTo: payment.policy.insurer,
        statement: [
          { text: 'Paid to ' },
          { text: payment.policy.insurer, strong: true },
          ...sum,
          { text: ' towards the premium on ' },
          { text: payment.policy.planName || humanise(payment.policy.type, 'policy'), strong: true },
          { text: ' held by ' },
          { text: payment.policy.policyHolder, strong: true },
          { text: `, covering ${dayLabel(payment.periodFrom)} to ${dayLabel(payment.periodTo)}.` },
        ],
        fields: [
          { label: 'Policy', value: payment.policy.planName || humanise(payment.policy.type) },
          { label: 'Cover', value: humanise(payment.policy.type) },
          { label: 'Policy holder', value: payment.policy.policyHolder },
          {
            label: 'Covering',
            value: `${dayLabel(payment.periodFrom)} to ${dayLabel(payment.periodTo)}`,
          },
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
        number: displayNumber(voucher.voucherNo, 'LOAN_PAYMENT', date),
        title: 'Loan Payment Receipt',
        isInflow: false,
        paidTo: payment.loan.lenderName,
        statement: [
          { text: 'Paid to ' },
          { text: payment.loan.lenderName, strong: true },
          ...sum,
          { text: ` towards ${words(payment.paymentType)} on the ` },
          { text: `${words(payment.loan.loanType)} loan`, strong: true },
          { text: ' of ' },
          { text: payment.loan.borrowerName, strong: true },
          { text: '.' },
        ],
        fields: [
          { label: 'Loan', value: humanise(payment.loan.loanType, 'loan') },
          { label: 'Borrower', value: payment.loan.borrowerName },
          { label: 'Towards', value: humanise(payment.paymentType) },
          ...(principal ? [{ label: 'Principal', value: principal }] : []),
          ...(interest ? [{ label: 'Interest', value: interest }] : []),
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
        number: displayNumber(voucher.voucherNo, 'LOAN_DISBURSEMENT', date),
        title: 'Loan Disbursement Advice',
        isInflow: true,
        receivedFrom: loan.lenderName,
        statement: [
          { text: 'Received from ' },
          { text: loan.lenderName, strong: true },
          ...sum,
          { text: ', being the disbursement of the ' },
          { text: `${words(loan.loanType)} loan`, strong: true },
          { text: ' sanctioned to ' },
          { text: loan.borrowerName, strong: true },
          { text: '.' },
        ],
        fields: [
          { label: 'Loan', value: humanise(loan.loanType, 'loan') },
          { label: 'Borrower', value: loan.borrowerName },
          { label: 'Rate of interest', value: `${loan.interestRate.toString()}% p.a.` },
          { label: 'Tenure', value: tenureLabel(loan.tenureMonths) },
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
    number: displayNumber(voucher.voucherNo, 'VOUCHER', date),
    title: inflow ? 'Receipt' : voucher.type === 'PAYMENT' ? 'Payment Voucher' : 'Voucher',
    isInflow: inflow,
    statement: [
      {
        text: inflow
          ? 'Received'
          : voucher.type === 'PAYMENT'
            ? 'Paid'
            : `Recorded as a ${words(voucher.type)} entry,`,
      },
      ...sum,
      { text: voucher.narration ? ` towards ${voucher.narration}.` : '.' },
    ],
    fields: [
      { label: 'Voucher type', value: humanise(voucher.type) },
      { label: 'Amount', value: amount },
    ],
  };
}

export { RUPEE_FIELDS };
