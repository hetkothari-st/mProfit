/**
 * Insurance documents → the user's policies.
 *
 * Runs after documents are read (insuranceDocPipeline), after a policy is
 * added, and after the user approves a suggested policy. Every READ document
 * is matched to a policy by its policy number, compared by fingerprint
 * (hashPolicyNumber) so the number is never decrypted for matching:
 *
 *   matched          → MATCHED, linked to the policy, and what the document
 *                      says is recorded where it is safe to:
 *                        premium receipt  → a premium payment (unless that
 *                                           premium is already recorded)
 *                        claim letter     → a new claim, or the claim's
 *                                           status moved forward
 *                        policy document,
 *                        renewal notice   → linked only
 * Linked documents are then filed into Documents (insuranceDocFiling).
 *
 *   no policy yet    → a policy document or renewal notice becomes a
 *                      SUGGESTED policy the user approves (one per number,
 *                      the latest document); anything else waits as READ
 *                      until the policy exists.
 *
 * Documents that failed the source check (NEEDS_REVIEW) are never applied
 * automatically. `note` says, in words, what happened to each document.
 */

import { Prisma, type InsuranceDocument, type InsuranceDocStatus } from '@prisma/client';
import { addMonthsIso, daysBetweenIso, formatINR, PREMIUM_FREQUENCY_MONTHS } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import type { InsuranceDocExtract } from '../../ingestion/insurance/insuranceDocReader.js';
import { extractOf, sealedExtractColumns } from './insuranceDocExtract.js';
import { fileMatchedInsuranceDocuments } from './insuranceDocFiling.js';
import { pendingRenewals, type RenewalChange } from './insuranceRenewal.js';
import {
  addClaim,
  addPremiumPayment,
  createPolicy,
  normalizePolicyNumber,
  updateClaim,
  type CreatePolicyInput,
} from './insurance.service.js';

/** Encrypt readings stored in plain text before readings were sealed. */
async function sealLegacyExtracts(userId: string): Promise<void> {
  const legacy = await prisma.insuranceDocument.findMany({
    where: { userId, extract: { not: Prisma.DbNull } },
    select: { id: true, extract: true, extractEnc: true },
  });
  for (const doc of legacy) {
    const x = await extractOf({ extract: doc.extract, extractEnc: null });
    await prisma.insuranceDocument.update({
      where: { id: doc.id },
      data: x ? await sealedExtractColumns(x) : { extract: Prisma.DbNull },
    });
  }
}

// ── Applying a matched document ──────────────────────────────────────

interface MatchPolicy {
  id: string;
  insurer: string;
  policyNumber: string | null;
  policyNumberHash: string | null;
  premiumFrequency: string;
  startDate: Date;
  maturityDate: Date | null;
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

/** The scheduled premium a payment on `paidOn` most likely settled. */
function premiumPeriodFor(policy: MatchPolicy, x: InsuranceDocExtract, paidOn: string): { from: string; to: string } {
  const months = PREMIUM_FREQUENCY_MONTHS[policy.premiumFrequency as keyof typeof PREMIUM_FREQUENCY_MONTHS];
  const start = iso(policy.startDate)!;
  if (x.period_from) {
    return { from: x.period_from, to: x.period_to ?? (months ? addMonthsIso(x.period_from, months) : x.period_from) };
  }
  if (!months) return { from: start, to: iso(policy.maturityDate) ?? start };
  // The due date nearest the payment: premiums are paid a little early, or
  // late within the grace period.
  let best = start;
  for (let i = 0; i < 1200; i++) {
    const due = addMonthsIso(start, i * months);
    if (Math.abs(daysBetweenIso(due, paidOn)) < Math.abs(daysBetweenIso(best, paidOn))) best = due;
    if (due > paidOn) break;
  }
  return { from: best, to: addMonthsIso(best, months) };
}

async function applyPremiumReceipt(userId: string, policy: MatchPolicy, x: InsuranceDocExtract): Promise<string> {
  const amount = x.premium_paid_amount ?? x.premium_amount;
  const paidOn = x.premium_paid_on;
  if (!amount || !paidOn) {
    return 'Linked to the policy. The receipt does not show both the amount and the date paid, so no payment was recorded.';
  }
  const period = premiumPeriodFor(policy, x, paidOn);
  const existing = await prisma.premiumPayment.findMany({
    where: { policyId: policy.id },
    select: { periodFrom: true },
  });
  // The schedule pairs payments with premiums by month; one per premium.
  if (existing.some((p) => iso(p.periodFrom)!.slice(0, 7) === period.from.slice(0, 7))) {
    return `Linked to the policy. The premium due ${fmtDay(period.from)} was already recorded.`;
  }
  await addPremiumPayment(userId, policy.id, { paidOn, amount, periodFrom: period.from, periodTo: period.to });
  return `Recorded a premium of ${formatINR(amount)} paid on ${fmtDay(paidOn)}.`;
}

const CLAIM_STAGE: Record<string, number> = { SUBMITTED: 0, UNDER_REVIEW: 1, APPROVED: 2, REJECTED: 3, SETTLED: 3 };

async function applyClaimLetter(userId: string, policy: MatchPolicy, x: InsuranceDocExtract): Promise<string> {
  const c = x.claim;
  if (!c) return 'Linked to the policy. No claim details were found in the letter.';
  const wanted = c.claim_number ? normalizePolicyNumber(c.claim_number) : null;
  const claims = await prisma.insuranceClaim.findMany({
    where: { policyId: policy.id },
    select: { id: true, claimNumber: true, status: true },
  });
  const existing = wanted ? claims.find((k) => k.claimNumber && normalizePolicyNumber(k.claimNumber) === wanted) : undefined;

  try {
    if (existing) {
      // Letters can be read out of order: only ever move a claim forward.
      if (!c.status || (CLAIM_STAGE[c.status] ?? 0) <= (CLAIM_STAGE[existing.status] ?? 0)) {
        return 'Linked to the policy and its claim. Nothing new for the claim.';
      }
      await updateClaim(userId, existing.id, {
        status: c.status,
        ...(c.settled_amount && { settledAmount: c.settled_amount }),
        ...(c.settled_on && { settledOn: c.settled_on }),
        ...(c.rejection_reason && { rejectionReason: c.rejection_reason }),
      });
      return `Updated the claim: ${c.status.toLowerCase().replace('_', ' ')}.`;
    }
    if (!c.claim_date || !c.claimed_amount) {
      return 'Linked to the policy. The letter does not show the claim date and amount, so no claim was added.';
    }
    await addClaim(userId, policy.id, {
      claimNumber: c.claim_number,
      claimDate: c.claim_date,
      claimType: c.claim_type ?? 'Claim',
      claimedAmount: c.claimed_amount,
      status: c.status ?? 'SUBMITTED',
      settledAmount: c.settled_amount,
      settledOn: c.settled_on,
      rejectionReason: c.rejection_reason,
    });
    return `Added a claim of ${formatINR(c.claimed_amount)} made on ${fmtDay(c.claim_date)}.`;
  } catch (err) {
    // The letter contradicts itself (e.g. settled before it was made): link it, say why.
    if (err instanceof BadRequestError) return `Linked to the policy. The claim was not recorded: ${err.message}.`;
    throw err;
  }
}

async function applyToPolicy(userId: string, policy: MatchPolicy, x: InsuranceDocExtract): Promise<string> {
  switch (x.doc_kind) {
    case 'PREMIUM_RECEIPT':
      return applyPremiumReceipt(userId, policy, x);
    case 'CLAIM_LETTER':
      return applyClaimLetter(userId, policy, x);
    default:
      return 'Linked to the policy.';
  }
}

// ── Matching ─────────────────────────────────────────────────────────

const SUGGESTS_POLICY = new Set(['POLICY_DOCUMENT', 'RENEWAL_NOTICE']);

export interface InsuranceMatchSummary {
  matched: number;
  suggested: number;
  waiting: number;
}

function sameInsurer(a: string, b: string | null): boolean {
  if (!b) return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.includes(y) || y.includes(x);
}

/** Match every READ (or suggested) document of one user. Must run as that user. */
export async function matchInsuranceDocuments(userId: string): Promise<InsuranceMatchSummary> {
  const summary: InsuranceMatchSummary = { matched: 0, suggested: 0, waiting: 0 };
  await sealLegacyExtracts(userId);

  // Oldest first, so a claim moves through its letters in order.
  const docs = await prisma.insuranceDocument.findMany({
    where: { userId, status: { in: ['READ', 'SUGGESTED'] } },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
  });
  if (docs.length === 0) return summary;

  const policies: MatchPolicy[] = await prisma.insurancePolicy.findMany({
    where: { userId },
    select: {
      id: true,
      insurer: true,
      policyNumber: true,
      policyNumberHash: true,
      premiumFrequency: true,
      startDate: true,
      maturityDate: true,
    },
  });

  const unmatched: { doc: InsuranceDocument; x: InsuranceDocExtract; hash: string }[] = [];
  for (const doc of docs) {
    const x = await extractOf(doc);
    if (!x || !doc.policyNumberHash) {
      if (doc.status === 'SUGGESTED') await setStatus(doc.id, 'READ', null);
      continue;
    }
    const wanted = normalizePolicyNumber(x.policy_number!);
    let found = policies.filter((p) =>
      p.policyNumberHash
        ? p.policyNumberHash === doc.policyNumberHash
        : Boolean(p.policyNumber) && normalizePolicyNumber(p.policyNumber!) === wanted,
    );
    // The same number at two insurers: the insurer on the document decides.
    if (found.length > 1) found = found.filter((p) => sameInsurer(p.insurer, x.insurer));
    if (found.length > 1) {
      await setStatus(doc.id, 'READ', 'More than one of your policies has this number, so it was not linked.');
      summary.waiting++;
      continue;
    }
    if (found.length === 1) {
      const policy = found[0]!;
      const note = await applyToPolicy(userId, policy, x);
      await prisma.insuranceDocument.update({
        where: { id: doc.id },
        data: { status: 'MATCHED', policyId: policy.id, note },
      });
      summary.matched++;
      continue;
    }
    unmatched.push({ doc, x, hash: doc.policyNumberHash });
  }

  // One suggestion per policy number: the latest document that can describe
  // a policy (renewals carry this year's figures). A suggestion already shown
  // stays, so the list does not reshuffle under the user.
  const suggestion = new Map<string, string>();
  for (const { doc, x, hash } of unmatched) {
    if (!SUGGESTS_POLICY.has(x.doc_kind) || !x.insurer) continue;
    const current = suggestion.get(hash);
    const currentIsShown = current && unmatched.find((u) => u.doc.id === current)?.doc.status === 'SUGGESTED';
    if (!currentIsShown) suggestion.set(hash, doc.id);
  }
  for (const { doc, hash } of unmatched) {
    if (suggestion.get(hash) === doc.id) {
      if (doc.status !== 'SUGGESTED') await setStatus(doc.id, 'SUGGESTED', null);
      summary.suggested++;
    } else {
      await setStatus(doc.id, 'READ', 'Waiting for its policy to be added.');
      summary.waiting++;
    }
  }

  if (summary.matched > 0 || summary.suggested > 0) logger.info({ userId, ...summary }, '[insurance] documents matched');
  // Linked documents go into the policy holder's folder in Documents.
  await fileMatchedInsuranceDocuments(userId);
  return summary;
}

async function setStatus(id: string, status: InsuranceDocStatus, note: string | null): Promise<void> {
  await prisma.insuranceDocument.update({ where: { id }, data: { status, note } });
}

// ── What the user sees and does ──────────────────────────────────────

/** A document as the API returns it: the policy number only by its last 4. */
export interface InsuranceDocumentDto {
  id: string;
  fileName: string;
  fromAddress: string | null;
  receivedAt: string | null;
  docKind: string | null;
  status: InsuranceDocStatus;
  problems: string[];
  errorMessage: string | null;
  note: string | null;
  policyId: string | null;
  policyNumberLast4: string | null;
  extract: Omit<InsuranceDocExtract, 'policy_number'> | null;
  /** A renewal notice's proposed policy changes, while waiting for the user's answer. */
  renewal: RenewalChange[] | null;
}

export async function listInsuranceDocuments(userId: string): Promise<InsuranceDocumentDto[]> {
  const rows = await prisma.insuranceDocument.findMany({
    where: { userId, status: { not: 'DISMISSED' } },
    orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  const renewals = await pendingRenewals(userId);
  const out: InsuranceDocumentDto[] = [];
  for (const r of rows) {
    const x = await extractOf(r);
    let shown: InsuranceDocumentDto['extract'] = null;
    let last4: string | null = null;
    if (x) {
      const { policy_number, ...rest } = x;
      shown = rest;
      last4 = policy_number ? normalizePolicyNumber(policy_number).slice(-4) || null : null;
    }
    out.push({
      id: r.id,
      fileName: r.fileName,
      fromAddress: r.fromAddress,
      receivedAt: r.receivedAt?.toISOString() ?? null,
      docKind: r.docKind,
      status: r.status,
      problems: Array.isArray(r.problems) ? (r.problems as string[]) : [],
      errorMessage: r.errorMessage,
      note: r.note,
      policyId: r.policyId,
      policyNumberLast4: last4,
      extract: shown,
      renewal: renewals.get(r.id) ?? null,
    });
  }
  return out;
}

export type ApprovePolicyInput = Omit<CreatePolicyInput, 'policyNumber'>;

/**
 * Add the policy a document describes, with the figures the user confirmed
 * (the form starts from the reading), then match everything waiting for it.
 * The policy number always comes from the document.
 */
export async function approveSuggestedPolicy(userId: string, docId: string, input: ApprovePolicyInput) {
  const doc = await prisma.insuranceDocument.findFirst({ where: { id: docId, userId } });
  if (!doc) throw new NotFoundError(`InsuranceDocument ${docId} not found`);
  if (!['SUGGESTED', 'READ', 'NEEDS_REVIEW'].includes(doc.status)) {
    throw new BadRequestError('This document is already linked to a policy');
  }
  const x = await extractOf(doc);
  if (!x?.policy_number || !SUGGESTS_POLICY.has(x.doc_kind)) {
    throw new BadRequestError('This document does not describe a policy');
  }

  let policyId: string | null = null;
  try {
    policyId = (await createPolicy(userId, { ...input, policyNumber: x.policy_number })).id;
  } catch (err) {
    // Added meanwhile (another tab, or by hand): matching links to it.
    if (!(err instanceof ConflictError)) throw err;
  }
  // The user checked the figures in the form, so a document held for review
  // is accepted as the source of this policy.
  await prisma.insuranceDocument.update({
    where: { id: doc.id },
    data: { status: 'READ', note: null, ...(doc.policyNumberHash ? {} : await sealedExtractColumns(x)) },
  });
  await matchInsuranceDocuments(userId);
  const linked = await prisma.insuranceDocument.findUnique({ where: { id: doc.id }, select: { policyId: true } });
  return { policyId: linked?.policyId ?? policyId };
}

/** "Not mine" / "not useful": hide a document and never suggest it again. */
export async function dismissInsuranceDocument(userId: string, docId: string): Promise<void> {
  const doc = await prisma.insuranceDocument.findFirst({ where: { id: docId, userId }, select: { status: true } });
  if (!doc) throw new NotFoundError(`InsuranceDocument ${docId} not found`);
  if (doc.status === 'MATCHED' || doc.status === 'FILED') {
    throw new BadRequestError('This document is linked to a policy');
  }
  await setStatus(docId, 'DISMISSED', null);
}
