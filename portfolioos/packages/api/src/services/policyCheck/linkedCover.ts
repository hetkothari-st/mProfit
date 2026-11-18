/**
 * Prefill data for the term-cover calculator, read from the user's other
 * records so they don't retype what the app already knows:
 *   - life cover held under their OTHER active policies;
 *   - outstanding balance on their active loans.
 *
 * Everything returned is a suggestion the user can overwrite. Liquid assets are
 * deliberately not prefilled: which holdings count as "drawable" is the user's
 * call, not ours.
 */

import { Decimal, serializeMoney } from '@everypaisa/shared';
import type { LinkedCover } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { loanPosition, OUTSTANDING_LOAN_STATUSES } from '../loans/loans.service.js';

/** Policy types that pay a death benefit to the family. */
export const LIFE_COVER_TYPES = ['TERM', 'WHOLE_LIFE', 'ENDOWMENT', 'ULIP'] as const;

export async function getLinkedCover(userId: string, excludePolicyId: string): Promise<LinkedCover> {
  const [policies, loans] = await Promise.all([
    prisma.insurancePolicy.findMany({
      where: { userId, status: 'ACTIVE', type: { in: [...LIFE_COVER_TYPES] }, id: { not: excludePolicyId } },
      select: { id: true, insurer: true, planName: true, type: true, sumAssured: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.loan.findMany({
      where: { userId, status: { in: OUTSTANDING_LOAN_STATUSES } },
      include: { payments: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  let coverTotal = new Decimal(0);
  const otherPolicies = policies.map((p) => {
    const sa = new Decimal(p.sumAssured.toString());
    coverTotal = coverTotal.plus(sa);
    return {
      policyId: p.id,
      insurer: p.insurer,
      planName: p.planName,
      type: p.type,
      sumAssuredInr: serializeMoney(sa.toDecimalPlaces(0)),
    };
  });

  let loanTotal = new Decimal(0);
  const loanRows = loans.map((l) => {
    const outstanding = loanPosition(l).outstanding;
    loanTotal = loanTotal.plus(outstanding);
    return {
      loanId: l.id,
      lenderName: l.lenderName,
      loanType: l.loanType,
      outstandingInr: serializeMoney(outstanding.toDecimalPlaces(0)),
    };
  });

  return {
    otherPolicies,
    otherLifeCoverInr: serializeMoney(coverTotal.toDecimalPlaces(0)),
    loans: loanRows,
    outstandingLoansInr: serializeMoney(loanTotal.toDecimalPlaces(0)),
  };
}
