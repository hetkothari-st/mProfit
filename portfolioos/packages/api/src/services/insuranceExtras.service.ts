/**
 * Insurance hub, phase 5 — premiums imported from insurance statements, and
 * the yearly tax summary.
 *
 * The insurance-statement parser stores each premium as a Transaction
 * (assetClass INSURANCE, DEPOSIT; orderNo = policy number, broker = insurer,
 * quantity × price = amount, tradeDate = paid on). Here they're matched to
 * the user's policies the same way premium emails are (insurance.service
 * tryMatchPremiumEvent): policy number by fingerprint first, then insurer
 * plus an amount within ±5%. The user confirms a suggestion to link it, which
 * records a PremiumPayment for the premium-schedule row it covers —
 * idempotent through PremiumPayment.sourceTransactionId. Only an exact
 * policy-number match is linked automatically, on import.
 *
 * Statement policy numbers are personal data: only their last 4 leave here.
 */
import { Prisma } from '@prisma/client';
import {
  Decimal,
  PREMIUM_FREQUENCY_MONTHS,
  buildPremiumSchedule,
  buildTaxSummary,
  daysBetweenIso,
  parseFinancialYear,
  taxYearOf,
  type PremiumPaymentLike,
  type TaxSummary,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { runAsUser } from '../lib/requestContext.js';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { hashPolicyNumber, normalizePolicyNumber, restoreNextPremiumDue } from './insurance.service.js';

const AMOUNT_TOLERANCE = new Decimal('0.05');
/** Most imported premiums looked at per policy page. */
const MAX_IMPORTED = 500;

const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const todayIso = () => new Date().toISOString().slice(0, 10);

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

// ── Matching ─────────────────────────────────────────────────────────

export interface ImportedPremium {
  id: string;
  tradeDate: Date;
  quantity: { toString(): string };
  price: { toString(): string };
  orderNo: string | null;
  broker: string | null;
}

export interface MatchablePolicy {
  id: string;
  insurer: string;
  premiumAmount: { toString(): string };
  policyNumber: string | null;
  policyNumberHash: string | null;
}

export type ImportMatch = 'POLICY_NUMBER' | 'INSURER_AMOUNT';

const IMPORTED_SELECT = {
  id: true,
  tradeDate: true,
  quantity: true,
  price: true,
  orderNo: true,
  broker: true,
} satisfies Prisma.TransactionSelect;

const MATCH_SELECT = {
  id: true,
  insurer: true,
  premiumAmount: true,
  policyNumber: true,
  policyNumberHash: true,
} satisfies Prisma.InsurancePolicySelect;

/** The user's insurance premiums that came in from an import. */
function importedPremiumsWhere(userId: string): Prisma.TransactionWhereInput {
  return {
    assetClass: 'INSURANCE',
    transactionType: 'DEPOSIT',
    portfolio: { userId },
    OR: [{ importJobId: { not: null } }, { sourceAdapter: { not: null } }],
  };
}

const amountOf = (t: ImportedPremium) => new Decimal(t.quantity.toString()).times(t.price.toString());

function statementNumber(t: ImportedPremium): string | null {
  return t.orderNo && normalizePolicyNumber(t.orderNo).length >= 3 ? t.orderNo : null;
}

/** The policy an imported premium's policy number belongs to, by fingerprint. */
export function policyByNumber<P extends MatchablePolicy>(t: ImportedPremium, policies: readonly P[]): P | null {
  const raw = statementNumber(t);
  if (!raw) return null;
  const hash = hashPolicyNumber(raw);
  const wanted = normalizePolicyNumber(raw);
  return (
    policies.find((p) =>
      p.policyNumberHash
        ? p.policyNumberHash === hash
        : Boolean(p.policyNumber) && normalizePolicyNumber(p.policyNumber!) === wanted,
    ) ?? null
  );
}

function insurerAndAmountMatch(t: ImportedPremium, p: MatchablePolicy): boolean {
  const theirs = t.broker?.trim().toLowerCase();
  if (!theirs) return false;
  const ours = p.insurer.toLowerCase();
  if (!ours.includes(theirs) && !theirs.includes(ours)) return false;
  const premium = new Decimal(p.premiumAmount.toString());
  const base = Decimal.max(premium, new Decimal('0.01'));
  return amountOf(t).minus(premium).abs().div(base).lte(AMOUNT_TOLERANCE);
}

/**
 * How an imported premium matches `policy`, if at all: a policy number that
 * belongs to one of the user's policies decides it; otherwise insurer plus
 * an amount within ±5%.
 */
export function matchImportedPremium(
  t: ImportedPremium,
  policy: MatchablePolicy,
  all: readonly MatchablePolicy[],
): ImportMatch | null {
  const byNumber = policyByNumber(t, all);
  if (byNumber) return byNumber.id === policy.id ? 'POLICY_NUMBER' : null;
  return insurerAndAmountMatch(t, policy) ? 'INSURER_AMOUNT' : null;
}

interface SchedulePolicy {
  startDate: Date;
  premiumFrequency: string;
  maturityDate: Date | null;
}

const asLike = (p: { periodFrom: Date; periodTo: Date; paidOn: Date; amount: { toString(): string } }): PremiumPaymentLike => ({
  periodFrom: isoOf(p.periodFrom),
  periodTo: isoOf(p.periodTo),
  paidOn: isoOf(p.paidOn),
  amount: p.amount.toString(),
});

/**
 * The premium-schedule row a payment made on `paidOn` covers: the unpaid
 * premium due nearest to it (the earlier on a tie) — so a premium paid a few
 * days early or in the grace period lands on the right one.
 */
export function premiumPeriodFor(
  policy: SchedulePolicy,
  payments: readonly PremiumPaymentLike[],
  paidOn: string,
): { periodFrom: string; periodTo: string } {
  const start = isoOf(policy.startDate);
  const maturity = policy.maturityDate ? isoOf(policy.maturityDate) : null;
  if (!PREMIUM_FREQUENCY_MONTHS[policy.premiumFrequency]) {
    return { periodFrom: start, periodTo: maturity ?? start };
  }
  const today = todayIso();
  const rows = buildPremiumSchedule(
    { startDate: start, premiumFrequency: policy.premiumFrequency, maturityDate: maturity },
    payments,
    { today: paidOn > today ? paidOn : today, futurePeriods: 1 },
  );
  const open = rows.filter((r) => r.status !== 'PAID');
  const pool = open.length > 0 ? open : rows;
  if (pool.length === 0) return { periodFrom: paidOn, periodTo: paidOn };
  const gap = (due: string) => Math.abs(daysBetweenIso(paidOn, due));
  const best = pool.reduce((a, r) => (gap(r.dueDate) < gap(a.dueDate) ? r : a));
  return { periodFrom: best.periodFrom, periodTo: best.periodTo };
}

// ── Suggestions ──────────────────────────────────────────────────────

export interface ImportSuggestion {
  transactionId: string;
  paidOn: string;
  amount: string;
  insurer: string | null;
  /** Last 4 of the policy number on the statement, if it had one. */
  policyNumberLast4: string | null;
  matchedBy: ImportMatch;
  /** The premium it would be recorded against. */
  periodFrom: string;
  periodTo: string;
}

async function ownedPolicy(userId: string, policyId: string) {
  const policy = await prisma.insurancePolicy.findFirst({ where: { id: policyId, userId } });
  if (!policy) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);
  return policy;
}

async function ownedImportedPremium(userId: string, transactionId: string) {
  const t = await prisma.transaction.findFirst({
    where: { id: transactionId, ...importedPremiumsWhere(userId) },
    select: IMPORTED_SELECT,
  });
  if (!t) throw new NotFoundError(`Imported premium ${transactionId} not found`);
  return t;
}

/** Imported premiums that look like this policy's and aren't linked or dismissed, newest first. */
export async function listImportSuggestions(userId: string, policyId: string): Promise<ImportSuggestion[]> {
  const policy = await ownedPolicy(userId, policyId);
  const [policies, imported] = await Promise.all([
    prisma.insurancePolicy.findMany({ where: { userId }, select: MATCH_SELECT }),
    prisma.transaction.findMany({
      where: importedPremiumsWhere(userId),
      select: IMPORTED_SELECT,
      orderBy: { tradeDate: 'asc' },
      take: MAX_IMPORTED,
    }),
  ]);

  const matched = imported.flatMap((t) => {
    const by = matchImportedPremium(t, policy, policies);
    return by ? [{ t, by }] : [];
  });
  if (matched.length === 0) return [];

  const ids = matched.map((m) => m.t.id);
  const [linked, dismissed, payments] = await Promise.all([
    prisma.premiumPayment.findMany({
      where: { sourceTransactionId: { in: ids }, policy: { userId } },
      select: { sourceTransactionId: true },
    }),
    prisma.insuranceImportDismissal.findMany({
      where: { userId, policyId, transactionId: { in: ids } },
      select: { transactionId: true },
    }),
    prisma.premiumPayment.findMany({ where: { policyId } }),
  ]);
  const skip = new Set<string | null>([
    ...linked.map((l) => l.sourceTransactionId),
    ...dismissed.map((d) => d.transactionId),
  ]);

  // Oldest first, each taking the next open premium, so a run of yearly
  // statements lands on successive premiums rather than all on one.
  const taken = payments.map(asLike);
  const out: ImportSuggestion[] = [];
  for (const { t, by } of matched) {
    if (skip.has(t.id)) continue;
    const paidOn = isoOf(t.tradeDate);
    const amount = amountOf(t).toFixed(2);
    const period = premiumPeriodFor(policy, taken, paidOn);
    taken.push({ ...period, paidOn, amount });
    const number = statementNumber(t);
    out.push({
      transactionId: t.id,
      paidOn,
      amount,
      insurer: t.broker,
      policyNumberLast4: number ? normalizePolicyNumber(number).slice(-4) : null,
      matchedBy: by,
      ...period,
    });
  }
  return out.reverse();
}

function alreadyLinked<P extends { policyId: string }>(payment: P, policyId: string): P {
  if (payment.policyId !== policyId) throw new ConflictError('This payment is already linked to another policy');
  return payment;
}

/**
 * Record an imported premium as paid on `policyId`. Linking the same premium
 * again returns the existing payment; `nextPremiumDue` is re-stored.
 */
export async function linkImportedPremium(userId: string, policyId: string, transactionId: string) {
  const policy = await ownedPolicy(userId, policyId);
  const t = await ownedImportedPremium(userId, transactionId);

  const existing = await prisma.premiumPayment.findFirst({ where: { sourceTransactionId: transactionId } });
  if (existing) return alreadyLinked(existing, policyId);

  const paidOn = isoOf(t.tradeDate);
  const payments = await prisma.premiumPayment.findMany({ where: { policyId } });
  const period = premiumPeriodFor(policy, payments.map(asLike), paidOn);

  try {
    return await runInTransaction(async (tx) => {
      const payment = await tx.premiumPayment.create({
        data: {
          policyId,
          paidOn: toDate(paidOn),
          amount: new Prisma.Decimal(amountOf(t).toFixed(2)),
          periodFrom: toDate(period.periodFrom),
          periodTo: toDate(period.periodTo),
          sourceTransactionId: transactionId,
        },
      });
      await restoreNextPremiumDue(tx, policy);
      return payment;
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Linked meanwhile — by the import hook, or a double click.
    const raced = await prisma.premiumPayment.findFirst({ where: { sourceTransactionId: transactionId } });
    if (!raced) throw err;
    return alreadyLinked(raced, policyId);
  }
}

/** "Not this policy": stop suggesting the imported premium for it. */
export async function dismissImportSuggestion(userId: string, policyId: string, transactionId: string): Promise<void> {
  await ownedPolicy(userId, policyId);
  await ownedImportedPremium(userId, transactionId);
  await prisma.insuranceImportDismissal.upsert({
    where: { policyId_transactionId: { policyId, transactionId } },
    create: { userId, policyId, transactionId },
    update: {},
  });
}

/**
 * Fire-and-forget hook called by the file importer after it commits an
 * INSURANCE transaction. Links it only when its policy number is exactly one
 * of the user's policies; anything less stays a suggestion. Never throws.
 */
export async function hookAutoLinkImportedPremium(userId: string, transactionId: string): Promise<void> {
  try {
    await runAsUser(userId, async () => {
      const t = await prisma.transaction.findFirst({
        where: { id: transactionId, ...importedPremiumsWhere(userId) },
        select: IMPORTED_SELECT,
      });
      if (!t) return;
      const policies = await prisma.insurancePolicy.findMany({ where: { userId }, select: MATCH_SELECT });
      const policy = policyByNumber(t, policies);
      if (!policy) return;
      await linkImportedPremium(userId, policy.id, t.id);
      logger.info({ transactionId, policyId: policy.id }, '[insurance] auto-linked imported premium');
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), transactionId },
      '[insurance] hookAutoLinkImportedPremium failed — non-fatal',
    );
  }
}

// ── Tax summary ──────────────────────────────────────────────────────

/** What the premiums recorded in a financial year are worth at tax time (shared buildTaxSummary). */
export async function getTaxSummary(userId: string, fy?: string | null): Promise<TaxSummary> {
  const year = fy ?? taxYearOf(todayIso());
  if (!parseFinancialYear(year)) throw new BadRequestError('Pick a financial year like 2026-27');

  const policies = await prisma.insurancePolicy.findMany({
    where: { userId },
    include: { premiumHistory: true },
  });
  return buildTaxSummary(
    year,
    policies.map((p) => ({
      id: p.id,
      insurer: p.insurer,
      planName: p.planName,
      type: p.type,
      status: p.status,
      sumAssured: p.sumAssured.toString(),
      premiumAmount: p.premiumAmount.toString(),
      premiumFrequency: p.premiumFrequency,
      startDate: isoOf(p.startDate),
      taxBucket: p.taxBucket,
      seniorCitizen: p.seniorCitizen,
    })),
    policies.flatMap((p) =>
      p.premiumHistory.map((x) => ({
        policyId: p.id,
        paidOn: isoOf(x.paidOn),
        amount: x.amount.toString(),
        periodFrom: isoOf(x.periodFrom),
        periodTo: isoOf(x.periodTo),
      })),
    ),
  );
}
