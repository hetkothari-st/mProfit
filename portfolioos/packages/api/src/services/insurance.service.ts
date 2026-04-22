/**
 * §9 Insurance service — policies, premium history, claims, renewal alerts,
 * and an auto-match hook that links PREMIUM_PAID CanonicalEvents to the
 * right InsurancePolicy.
 *
 * Match priority (§9.1):
 *   1. metadata.policyNumber matches InsurancePolicy.policyNumber (exact)
 *   2. metadata.insurer matches InsurancePolicy.insurer (case-insensitive)
 *      AND amount is within ±5% of InsurancePolicy.premiumAmount
 *
 * nextPremiumDue is recomputed after every premium payment using
 * advanceByFrequency() — one period forward from the paidOn date.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';
import { logger } from '../lib/logger.js';

// ── Constants ────────────────────────────────────────────────────────

export const POLICY_TYPES = [
  'TERM',
  'WHOLE_LIFE',
  'ULIP',
  'ENDOWMENT',
  'HEALTH',
  'MOTOR',
  'HOME',
  'TRAVEL',
  'PERSONAL_ACCIDENT',
] as const;

export const PREMIUM_FREQUENCIES = [
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'ANNUAL',
  'SINGLE',
] as const;

export const POLICY_STATUSES = [
  'ACTIVE',
  'LAPSED',
  'SURRENDERED',
  'MATURED',
  'CLAIMED',
] as const;

export const CLAIM_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SETTLED',
] as const;

// Renewal alert thresholds (days before nextPremiumDue).
const ALERT_THRESHOLDS = [30, 15, 7, 1] as const;

// ── Input types ──────────────────────────────────────────────────────

export interface CreatePolicyInput {
  insurer: string;
  policyNumber: string;
  type: (typeof POLICY_TYPES)[number];
  planName?: string | null;
  policyHolder: string;
  nominees?: unknown;
  sumAssured: string;
  premiumAmount: string;
  premiumFrequency: (typeof PREMIUM_FREQUENCIES)[number];
  startDate: string;
  maturityDate?: string | null;
  nextPremiumDue?: string | null;
  vehicleId?: string | null;
  portfolioId?: string | null;
  healthCoverDetails?: unknown;
  status?: (typeof POLICY_STATUSES)[number];
}

export type UpdatePolicyInput = Partial<CreatePolicyInput>;

export interface AddPremiumInput {
  paidOn: string;
  amount: string;
  periodFrom: string;
  periodTo: string;
  canonicalEventId?: string | null;
}

export interface AddClaimInput {
  claimNumber?: string | null;
  claimDate: string;
  claimType: string;
  claimedAmount: string;
  status: (typeof CLAIM_STATUSES)[number];
  settledAmount?: string | null;
  settledOn?: string | null;
  documents?: unknown;
}

export type UpdateClaimInput = Partial<AddClaimInput>;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Advance a date string (YYYY-MM-DD) by one premium frequency period.
 * Used to recompute nextPremiumDue after a payment.
 */
function advanceByFrequency(
  dateStr: string,
  freq: (typeof PREMIUM_FREQUENCIES)[number],
): string {
  const d = new Date(dateStr);
  switch (freq) {
    case 'MONTHLY':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'QUARTERLY':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'HALF_YEARLY':
      d.setMonth(d.getMonth() + 6);
      break;
    case 'ANNUAL':
      d.setFullYear(d.getFullYear() + 1);
      break;
    case 'SINGLE':
      // One-time premium — no next due.
      return '';
  }
  return d.toISOString().slice(0, 10);
}

function toDate(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

// ── Policy CRUD ──────────────────────────────────────────────────────

export async function listPolicies(userId: string) {
  return prisma.insurancePolicy.findMany({
    where: { userId },
    include: {
      premiumHistory: { orderBy: { paidOn: 'desc' }, take: 5 },
      claims: { orderBy: { claimDate: 'desc' } },
      vehicle: { select: { id: true, registrationNo: true, make: true, model: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getPolicy(userId: string, policyId: string) {
  const policy = await prisma.insurancePolicy.findFirst({
    where: { id: policyId, userId },
    include: {
      premiumHistory: { orderBy: { paidOn: 'desc' } },
      claims: { orderBy: { claimDate: 'desc' } },
      vehicle: { select: { id: true, registrationNo: true, make: true, model: true } },
    },
  });
  if (!policy) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);
  return policy;
}

export async function createPolicy(userId: string, input: CreatePolicyInput) {
  return prisma.insurancePolicy.create({
    data: {
      userId,
      insurer: input.insurer,
      policyNumber: input.policyNumber,
      type: input.type,
      planName: input.planName ?? null,
      policyHolder: input.policyHolder,
      nominees: input.nominees as Prisma.InputJsonValue ?? Prisma.JsonNull,
      sumAssured: new Prisma.Decimal(input.sumAssured),
      premiumAmount: new Prisma.Decimal(input.premiumAmount),
      premiumFrequency: input.premiumFrequency,
      startDate: toDate(input.startDate),
      maturityDate: input.maturityDate ? toDate(input.maturityDate) : null,
      nextPremiumDue: input.nextPremiumDue ? toDate(input.nextPremiumDue) : null,
      vehicleId: input.vehicleId ?? null,
      portfolioId: input.portfolioId ?? null,
      healthCoverDetails: input.healthCoverDetails as Prisma.InputJsonValue ?? Prisma.JsonNull,
      status: input.status ?? 'ACTIVE',
    },
  });
}

export async function updatePolicy(
  userId: string,
  policyId: string,
  input: UpdatePolicyInput,
) {
  const existing = await prisma.insurancePolicy.findFirst({ where: { id: policyId, userId } });
  if (!existing) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);

  return prisma.insurancePolicy.update({
    where: { id: policyId },
    data: {
      ...(input.insurer !== undefined && { insurer: input.insurer }),
      ...(input.policyNumber !== undefined && { policyNumber: input.policyNumber }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.planName !== undefined && { planName: input.planName }),
      ...(input.policyHolder !== undefined && { policyHolder: input.policyHolder }),
      ...(input.nominees !== undefined && {
        nominees: input.nominees as Prisma.InputJsonValue ?? Prisma.JsonNull,
      }),
      ...(input.sumAssured !== undefined && { sumAssured: new Prisma.Decimal(input.sumAssured) }),
      ...(input.premiumAmount !== undefined && {
        premiumAmount: new Prisma.Decimal(input.premiumAmount),
      }),
      ...(input.premiumFrequency !== undefined && { premiumFrequency: input.premiumFrequency }),
      ...(input.startDate !== undefined && { startDate: toDate(input.startDate) }),
      ...(input.maturityDate !== undefined && {
        maturityDate: input.maturityDate ? toDate(input.maturityDate) : null,
      }),
      ...(input.nextPremiumDue !== undefined && {
        nextPremiumDue: input.nextPremiumDue ? toDate(input.nextPremiumDue) : null,
      }),
      ...(input.vehicleId !== undefined && { vehicleId: input.vehicleId }),
      ...(input.portfolioId !== undefined && { portfolioId: input.portfolioId }),
      ...(input.healthCoverDetails !== undefined && {
        healthCoverDetails: input.healthCoverDetails as Prisma.InputJsonValue ?? Prisma.JsonNull,
      }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
}

export async function deletePolicy(userId: string, policyId: string) {
  const existing = await prisma.insurancePolicy.findFirst({ where: { id: policyId, userId } });
  if (!existing) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);
  await prisma.insurancePolicy.delete({ where: { id: policyId } });
}

// ── Premium payments ─────────────────────────────────────────────────

export async function addPremiumPayment(
  userId: string,
  policyId: string,
  input: AddPremiumInput,
) {
  const policy = await prisma.insurancePolicy.findFirst({ where: { id: policyId, userId } });
  if (!policy) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.premiumPayment.create({
      data: {
        policyId,
        paidOn: toDate(input.paidOn),
        amount: new Prisma.Decimal(input.amount),
        periodFrom: toDate(input.periodFrom),
        periodTo: toDate(input.periodTo),
        canonicalEventId: input.canonicalEventId ?? null,
      },
    });

    // Advance nextPremiumDue by one period from paidOn.
    const nextDue = advanceByFrequency(
      input.paidOn,
      policy.premiumFrequency as (typeof PREMIUM_FREQUENCIES)[number],
    );
    if (nextDue) {
      await tx.insurancePolicy.update({
        where: { id: policyId },
        data: { nextPremiumDue: toDate(nextDue) },
      });
    }

    return p;
  });

  return payment;
}

export async function removePremiumPayment(userId: string, paymentId: string) {
  const payment = await prisma.premiumPayment.findFirst({
    where: { id: paymentId },
    include: { policy: { select: { userId: true } } },
  });
  if (!payment || payment.policy.userId !== userId) {
    throw new NotFoundError(`PremiumPayment ${paymentId} not found`);
  }
  await prisma.premiumPayment.delete({ where: { id: paymentId } });
}

// ── Claims ───────────────────────────────────────────────────────────

export async function addClaim(userId: string, policyId: string, input: AddClaimInput) {
  const policy = await prisma.insurancePolicy.findFirst({ where: { id: policyId, userId } });
  if (!policy) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);

  return prisma.insuranceClaim.create({
    data: {
      policyId,
      claimNumber: input.claimNumber ?? null,
      claimDate: toDate(input.claimDate),
      claimType: input.claimType,
      claimedAmount: new Prisma.Decimal(input.claimedAmount),
      status: input.status,
      settledAmount: input.settledAmount ? new Prisma.Decimal(input.settledAmount) : null,
      settledOn: input.settledOn ? toDate(input.settledOn) : null,
      documents: input.documents as Prisma.InputJsonValue ?? Prisma.JsonNull,
    },
  });
}

export async function updateClaim(
  userId: string,
  claimId: string,
  input: UpdateClaimInput,
) {
  const claim = await prisma.insuranceClaim.findFirst({
    where: { id: claimId },
    include: { policy: { select: { userId: true } } },
  });
  if (!claim || claim.policy.userId !== userId) throw new NotFoundError(`InsuranceClaim ${claimId} not found`);

  return prisma.insuranceClaim.update({
    where: { id: claimId },
    data: {
      ...(input.claimNumber !== undefined && { claimNumber: input.claimNumber }),
      ...(input.claimDate !== undefined && { claimDate: toDate(input.claimDate) }),
      ...(input.claimType !== undefined && { claimType: input.claimType }),
      ...(input.claimedAmount !== undefined && {
        claimedAmount: new Prisma.Decimal(input.claimedAmount),
      }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.settledAmount !== undefined && {
        settledAmount: input.settledAmount ? new Prisma.Decimal(input.settledAmount) : null,
      }),
      ...(input.settledOn !== undefined && {
        settledOn: input.settledOn ? toDate(input.settledOn) : null,
      }),
      ...(input.documents !== undefined && {
        documents: input.documents as Prisma.InputJsonValue ?? Prisma.JsonNull,
      }),
    },
  });
}

export async function removeClaim(userId: string, claimId: string) {
  const claim = await prisma.insuranceClaim.findFirst({
    where: { id: claimId },
    include: { policy: { select: { userId: true } } },
  });
  if (!claim || claim.policy.userId !== userId) throw new NotFoundError(`InsuranceClaim ${claimId} not found`);
  await prisma.insuranceClaim.delete({ where: { id: claimId } });
}

// ── Auto-match hook (§9.1) ───────────────────────────────────────────

interface PremiumEventContext {
  id: string;
  userId: string;
  amount: Prisma.Decimal | null;
  counterparty: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Attempt to match a PREMIUM_PAID CanonicalEvent to an InsurancePolicy.
 * Returns the matched policyId and periodTo estimate, or null if no match.
 */
async function tryMatchPremiumEvent(
  event: PremiumEventContext,
): Promise<{ policyId: string; periodTo: string } | null> {
  if (!event.amount) return null;

  const policies = await prisma.insurancePolicy.findMany({
    where: { userId: event.userId, status: 'ACTIVE' },
  });
  if (policies.length === 0) return null;

  const meta = event.metadata ?? {};
  const metaPolicyNo = typeof meta['policyNumber'] === 'string' ? meta['policyNumber'] : null;
  const metaInsurer = typeof meta['insurer'] === 'string'
    ? meta['insurer'].toLowerCase()
    : (event.counterparty?.toLowerCase() ?? null);

  // Priority 1: exact policyNumber match.
  if (metaPolicyNo) {
    const exact = policies.find(
      (p) => p.policyNumber.toLowerCase() === metaPolicyNo.toLowerCase(),
    );
    if (exact) {
      const periodTo = advanceByFrequency(
        new Date().toISOString().slice(0, 10),
        exact.premiumFrequency as (typeof PREMIUM_FREQUENCIES)[number],
      );
      return { policyId: exact.id, periodTo: periodTo || new Date().toISOString().slice(0, 10) };
    }
  }

  // Priority 2: insurer name + amount within ±5%.
  if (metaInsurer) {
    const amountNum = event.amount.toNumber();
    const candidates = policies.filter((p) => {
      if (!p.insurer.toLowerCase().includes(metaInsurer) &&
          !metaInsurer.includes(p.insurer.toLowerCase())) return false;
      const pAmt = p.premiumAmount.toNumber();
      return Math.abs(amountNum - pAmt) / Math.max(pAmt, 0.01) <= 0.05;
    });
    if (candidates.length === 1) {
      const policy = candidates[0]!;
      const periodTo = advanceByFrequency(
        new Date().toISOString().slice(0, 10),
        policy.premiumFrequency as (typeof PREMIUM_FREQUENCIES)[number],
      );
      return { policyId: policy.id, periodTo: periodTo || new Date().toISOString().slice(0, 10) };
    }
  }

  return null;
}

/**
 * Fire-and-forget hook called by the projection pipeline after a
 * PREMIUM_PAID event is projected to CashFlow. Attempts to link the
 * payment to an InsurancePolicy and create a PremiumPayment row.
 */
export async function hookAutoMatchPremiumPayment(
  event: PremiumEventContext,
  cashFlowId: string,
): Promise<void> {
  try {
    const match = await tryMatchPremiumEvent(event);
    if (!match) return;

    const today = new Date().toISOString().slice(0, 10);
    const policy = await prisma.insurancePolicy.findUnique({
      where: { id: match.policyId },
      select: { premiumFrequency: true, nextPremiumDue: true },
    });
    if (!policy) return;

    const periodFrom = policy.nextPremiumDue
      ? policy.nextPremiumDue.toISOString().slice(0, 10)
      : today;

    await addPremiumPayment(event.userId, match.policyId, {
      paidOn: today,
      amount: event.amount!.toString(),
      periodFrom,
      periodTo: match.periodTo,
      canonicalEventId: event.id,
    });

    logger.info(
      { eventId: event.id, policyId: match.policyId, cashFlowId },
      '[insurance] auto-matched premium payment',
    );
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), eventId: event.id },
      '[insurance] hookAutoMatchPremiumPayment failed — non-fatal',
    );
  }
}

// ── Renewal alert cron (§9.2) ─────────────────────────────────────────

/**
 * For every active policy whose nextPremiumDue falls within a threshold
 * window, upsert an Alert row. Called by the daily insurance cron.
 * Passing userId=undefined processes all users (system context).
 */
export async function generateRenewalAlerts(userId?: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Max window is 30 days out.
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 30);

  const policies = await prisma.insurancePolicy.findMany({
    where: {
      ...(userId ? { userId } : {}),
      status: 'ACTIVE',
      nextPremiumDue: { gte: today, lte: cutoff },
    },
    select: { id: true, userId: true, insurer: true, planName: true, type: true, nextPremiumDue: true, premiumAmount: true },
  });

  let created = 0;
  for (const policy of policies) {
    const dueDate = policy.nextPremiumDue!;
    const daysLeft = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Only alert at exact threshold crossings.
    if (!(ALERT_THRESHOLDS as readonly number[]).includes(daysLeft)) continue;

    const label = policy.planName ?? policy.type;
    const triggerDate = new Date();

    // Upsert: one alert per (userId, policyId, daysLeft threshold).
    const metaKey = `insurance_renewal:${policy.id}:${daysLeft}d`;
    const existing = await prisma.alert.findFirst({
      where: {
        userId: policy.userId,
        type: 'INSURANCE_PREMIUM',
        metadata: { path: ['key'], equals: metaKey },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        userId: policy.userId,
        type: 'INSURANCE_PREMIUM',
        title: `${policy.insurer} — ${label} premium due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        description: `Premium of ₹${policy.premiumAmount.toFixed(2)} due on ${dueDate.toLocaleDateString('en-IN')}.`,
        triggerDate,
        metadata: { key: metaKey, policyId: policy.id, daysLeft },
      },
    });
    created++;
  }

  return created;
}
