import { Decimal, toAmount2 } from '@everypaisa/shared';
import { prisma } from '../../../../lib/prisma.js';
import { loanGivenOutstanding } from '../../../loans/loansGiven.service.js';
import { loanPosition, OUTSTANDING_LOAN_STATUSES, type LoanPosition, type StoredLoan } from '../../../loans/loans.service.js';
import { computeCardSummary } from '../../../banking/creditCards.service.js';
import { clip, SOLE, type EstateAdapter, type EstateCandidate } from '../types.js';

const LOAN_WORDS: Record<string, string> = {
  HOME: 'Home', CAR: 'Car', PERSONAL: 'Personal', EDUCATION: 'Education', BUSINESS: 'Business', GOLD: 'Gold',
  LAS: 'Securities-backed', OTHER: 'Other',
};

export const loansGivenAdapter: EstateAdapter = {
  id: 'loansGiven',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.loanGiven.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { entries: true },
      orderBy: { lentOn: 'asc' },
    });
    const out: EstateCandidate[] = [];
    for (const l of rows) {
      const owed = loanGivenOutstanding(l);
      if (!owed.greaterThan(0)) continue;
      out.push({
        sourceKey: `loanGiven:${l.id}`, side: 'ASSET', kind: 'LOAN_GIVEN', label: clip(`Money lent to ${l.borrowerName}`, 160),
        ref: null, value: toAmount2(owed), valueAsOf: null, ownership: SOLE, review: 'CONFIRMED', note: null,
      });
    }
    return out;
  },
};

type LoanFields = { id: string; loanType: string; lenderName: string; accountNumberLast4: string | null };

export const LOAN_SCHEDULE_FAILED_NOTE =
  'The repayment schedule could not be worked out, so the full amount borrowed is shown - check the balance.';

/** One loan as an estate liability. Pure, so the schedule-failed path is testable. */
export function loanCandidate(l: LoanFields, position: Pick<LoanPosition, 'outstanding' | 'scheduleFailed'>): EstateCandidate {
  return {
    sourceKey: `loan:${l.id}`, side: 'LIABILITY', kind: 'LOAN',
    label: clip(`${LOAN_WORDS[l.loanType] ?? 'Other'} loan - ${l.lenderName}`, 160),
    ref: l.accountNumberLast4 ? `XXXX${l.accountNumberLast4}` : null,
    value: toAmount2(Decimal.max(position.outstanding, 0)), valueAsOf: null, ownership: SOLE,
    review: position.scheduleFailed ? 'NEEDS_REVIEW' : 'CONFIRMED',
    note: position.scheduleFailed ? LOAN_SCHEDULE_FAILED_NOTE : null,
  };
}

export const loansAdapter: EstateAdapter = {
  id: 'loans',
  version: '1',
  async collect({ userId }) {
    // A defaulted loan is still a debt of the estate.
    const rows = await prisma.loan.findMany({
      where: { userId, status: { in: OUTSTANDING_LOAN_STATUSES } },
      include: { payments: { orderBy: { paidOn: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((l) => loanCandidate(l, loanPosition(l as unknown as StoredLoan)));
  },
};

export const creditCardsAdapter: EstateAdapter = {
  id: 'creditCards',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.creditCard.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { statements: { orderBy: { dueDate: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    });
    const out: EstateCandidate[] = [];
    for (const card of rows) {
      // Same rule as the dashboard: the stored balance when there is one, else unpaid statements.
      const owed = card.outstandingBalance
        ? new Decimal(card.outstandingBalance.toString())
        : new Decimal(computeCardSummary(card).outstanding);
      if (!owed.greaterThan(0)) continue;
      out.push({
        sourceKey: `card:${card.id}`, side: 'LIABILITY', kind: 'CREDIT_CARD', label: clip(`${card.issuerBank} ${card.cardName}`, 160),
        ref: `XXXX${card.last4}`, value: toAmount2(owed), valueAsOf: null, ownership: SOLE, review: 'CONFIRMED', note: null,
      });
    }
    return out;
  },
};
