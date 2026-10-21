/**
 * Renewal notices → proposed changes to the policy, applied only when the
 * user confirms.
 *
 * A renewal notice linked to a policy (insuranceDocMatching) may carry this
 * year's premium, sum assured, cover end date and premium due date. Every one
 * of those figures has already been checked against the PDF (a document that
 * failed the check is never linked). What it proposes:
 *
 *   premium, sum assured   when the notice's figure differs from the policy's
 *   cover end date          only ever later (a renewal extends cover)
 *   next premium due        only ever later — earlier premiums then count as
 *                           paid, which is what the insurer is saying
 *
 * Only the latest renewal notice of a policy proposes anything, so an old
 * notice read late never undoes a newer one. The user applies or ignores it;
 * either way it is recorded on the document (renewalAction).
 */

import { Decimal, formatINR } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import type { InsuranceDocExtract } from '../../ingestion/insurance/insuranceDocReader.js';
import { extractOf } from './insuranceDocExtract.js';
import { updatePolicy, type UpdatePolicyInput } from './insurance.service.js';

export type RenewalField = 'premiumAmount' | 'sumAssured' | 'maturityDate' | 'nextPremiumDue';

export interface RenewalChange {
  field: RenewalField;
  label: string;
  /** As shown to the user: "₹24,000.00", "10 Apr 2026", or null when not recorded. */
  from: string | null;
  to: string;
  /** The value sent to updatePolicy. */
  value: string;
}

interface RenewalPolicy {
  premiumAmount: { toString(): string };
  sumAssured: { toString(): string };
  maturityDate: Date | null;
  nextPremiumDue: Date | null;
  premiumFrequency: string;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function fmtDay(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const sameMoney = (a: string, b: string) => new Decimal(a).equals(new Decimal(b));

/** What a renewal notice would change on its policy; empty when it is already up to date. */
export function proposeRenewal(policy: RenewalPolicy, x: InsuranceDocExtract): RenewalChange[] {
  const changes: RenewalChange[] = [];
  const premium = policy.premiumAmount.toString();
  if (x.premium_amount && !sameMoney(x.premium_amount, premium)) {
    changes.push({
      field: 'premiumAmount',
      label: 'Premium',
      from: formatINR(premium),
      to: formatINR(x.premium_amount),
      value: x.premium_amount,
    });
  }
  const sum = policy.sumAssured.toString();
  if (x.sum_assured && !sameMoney(x.sum_assured, sum)) {
    changes.push({
      field: 'sumAssured',
      label: 'Sum assured',
      from: formatINR(sum),
      to: formatINR(x.sum_assured),
      value: x.sum_assured,
    });
  }
  const end = iso(policy.maturityDate);
  if (x.end_date && (!end || x.end_date > end)) {
    changes.push({
      field: 'maturityDate',
      label: 'Cover until',
      from: end ? fmtDay(end) : null,
      to: fmtDay(x.end_date),
      value: x.end_date,
    });
  }
  const due = iso(policy.nextPremiumDue);
  if (x.next_premium_due && policy.premiumFrequency !== 'SINGLE' && (!due || x.next_premium_due > due)) {
    changes.push({
      field: 'nextPremiumDue',
      label: 'Next premium due',
      from: due ? fmtDay(due) : null,
      to: fmtDay(x.next_premium_due),
      value: x.next_premium_due,
    });
  }
  return changes;
}

const POLICY_SELECT = {
  premiumAmount: true,
  sumAssured: true,
  maturityDate: true,
  nextPremiumDue: true,
  premiumFrequency: true,
} as const;

/**
 * For each renewal notice still waiting for the user's answer, what it would
 * change. Keyed by document id; a notice with nothing to change, or a newer
 * notice for the same policy, is left out.
 */
export async function pendingRenewals(userId: string): Promise<Map<string, RenewalChange[]>> {
  const notices = await prisma.insuranceDocument.findMany({
    where: { userId, docKind: 'RENEWAL_NOTICE', policyId: { not: null }, status: { in: ['MATCHED', 'FILED'] } },
    orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
  });
  const out = new Map<string, RenewalChange[]>();
  const seenPolicy = new Set<string>();
  for (const n of notices) {
    // Only the latest notice of each policy speaks for it, answered or not.
    if (seenPolicy.has(n.policyId!)) continue;
    seenPolicy.add(n.policyId!);
    if (n.renewalAction) continue;
    const policy = await prisma.insurancePolicy.findFirst({ where: { id: n.policyId!, userId }, select: POLICY_SELECT });
    const x = await extractOf(n);
    if (!policy || !x) continue;
    const changes = proposeRenewal(policy, x);
    if (changes.length > 0) out.set(n.id, changes);
  }
  return out;
}

/** The user's answer to a renewal notice: apply its changes to the policy, or ignore them. */
export async function answerRenewal(userId: string, docId: string, apply: boolean): Promise<{ applied: RenewalField[] }> {
  const doc = await prisma.insuranceDocument.findFirst({ where: { id: docId, userId } });
  if (!doc || doc.docKind !== 'RENEWAL_NOTICE' || !doc.policyId) {
    throw new NotFoundError(`Renewal notice ${docId} not found`);
  }
  if (doc.renewalAction) throw new BadRequestError('This renewal notice was already answered');

  // Recomputed here, never taken from the request.
  const changes = (await pendingRenewals(userId)).get(doc.id);
  if (apply && !changes) throw new BadRequestError('This renewal notice has nothing left to change');

  if (apply && changes) {
    const input: UpdatePolicyInput = {};
    for (const c of changes) input[c.field] = c.value;
    await updatePolicy(userId, doc.policyId, input);
  }
  await prisma.insuranceDocument.update({
    where: { id: doc.id },
    data: { renewalAction: apply ? 'APPLIED' : 'IGNORED' },
  });
  return { applied: apply && changes ? changes.map((c) => c.field) : [] };
}
