/**
 * §9 Insurance service — policies, premium history, claims, premium
 * reminders, and an auto-match hook that links PREMIUM_PAID CanonicalEvents
 * to the right InsurancePolicy.
 *
 * Policy numbers are personal data: stored AES-256-GCM encrypted
 * (policyNumberEnc) with a keyed fingerprint (policyNumberHash) for duplicate
 * checks and email matching, and only the last 4 ever leave this service —
 * the full number only through `revealPolicyNumber`, which audit-logs first.
 * The legacy plaintext column is no longer written or read, and existing
 * values are encrypted on startup (`backfillPolicyNumberEncryption`).
 *
 * "Next premium due" comes from the shared premium schedule
 * (@portfolioos/shared buildPremiumSchedule) — the same code the web app uses
 * — and is re-stored after every change that can move it, so reminders and
 * the screen agree.
 *
 * Match priority for premium emails (§9.1):
 *   1. metadata.policyNumber, compared by fingerprint (formatting-insensitive)
 *   2. metadata.insurer matches InsurancePolicy.insurer (case-insensitive)
 *      AND amount is within ±5% of InsurancePolicy.premiumAmount
 */

import { Prisma, type InsuranceClaim } from '@prisma/client';
import {
  Decimal,
  addDaysIso,
  addMonthsIso,
  buildPremiumSchedule,
  daysBetweenIso,
  defaultGraceDays,
  formatINR,
  nextPremiumDue,
  premiumDueOn,
  PREMIUM_FREQUENCY_MONTHS,
  CLAIM_GUIDES,
  claimProgress,
  isClaimKind,
  hasSurrenderValue,
  type ClaimGuide,
  type NextPremiumDue,
  type TaxBucket,
} from '@portfolioos/shared';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { decryptIdentifier, encryptIdentifier, hashIdentifier } from './pfCredentials.service.js';

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

/** Reminders before a premium falls due, in days. */
const UPCOMING_REMINDER_DAYS = [1, 7, 15, 30] as const;
/** Last-call reminder this close to the end of the grace period. */
const FINAL_GRACE_DAYS = 5;
/** How far back reminders still look for an unpaid premium. */
const REMINDER_LOOKBACK_DAYS = 120;

const POLICY_NUMBER_PURPOSE = 'insurance-policy-number';

const TYPE_LABELS: Record<string, string> = {
  TERM: 'Term life',
  WHOLE_LIFE: 'Whole life',
  ULIP: 'ULIP',
  ENDOWMENT: 'Endowment',
  HEALTH: 'Health',
  MOTOR: 'Motor',
  HOME: 'Home',
  TRAVEL: 'Travel',
  PERSONAL_ACCIDENT: 'Personal accident',
};

// ── Input types ──────────────────────────────────────────────────────

export interface Nominee {
  name: string;
  relation: string;
  /** Percent of the payout; when any nominee has one, they must total 100. */
  sharePercent?: number | null;
  isMinor?: boolean;
  /** Receives the payout for a minor nominee. */
  appointeeName?: string | null;
  appointeeRelation?: string | null;
}

export interface PolicyContacts {
  helpline?: string | null;
  claimEmail?: string | null;
  claimUrl?: string | null;
  tpaName?: string | null;
  tpaHelpline?: string | null;
  agentName?: string | null;
  agentPhone?: string | null;
  agentEmail?: string | null;
}

export interface CreatePolicyInput {
  insurer: string;
  policyNumber: string;
  type: (typeof POLICY_TYPES)[number];
  planName?: string | null;
  policyHolder: string;
  nominees?: Nominee[] | null;
  contacts?: PolicyContacts | null;
  sumAssured: string;
  premiumAmount: string;
  premiumFrequency: (typeof PREMIUM_FREQUENCIES)[number];
  startDate: string;
  maturityDate?: string | null;
  /**
   * When the next premium falls due, as the user sees it. Premiums before it
   * aren't tracked here (they're assumed settled). Defaults to today.
   */
  nextPremiumDue?: string | null;
  gracePeriodDays?: number | null;
  vehicleId?: string | null;
  portfolioId?: string | null;
  healthCoverDetails?: unknown;
  status?: (typeof POLICY_STATUSES)[number];
  /** Health policies: who the cover is for, for the section 126 deduction. */
  taxBucket?: TaxBucket | null;
  /** Health policies: the insured is a senior citizen (raises the limit). */
  seniorCitizen?: boolean | null;
  /** Savings policies: the surrender value the insurer quoted. */
  surrenderValue?: string | null;
  /** When it was quoted; defaults to today when a value is given. */
  surrenderValueAsOf?: string | null;
}

export type UpdatePolicyInput = Partial<CreatePolicyInput>;

export interface AddPremiumInput {
  paidOn: string;
  amount: string;
  periodFrom: string;
  periodTo: string;
  canonicalEventId?: string | null;
}

/** One line in the user's own log of a claim: a call, a letter, a visit. */
export interface ClaimLogEntry {
  on: string;
  note: string;
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
  /** Claims guide it follows (shared CLAIM_KINDS). */
  kind?: string | null;
  documentsCompletedOn?: string | null;
  surveyorAllocatedOn?: string | null;
  /** Guide document ids ticked off. */
  checklist?: Record<string, boolean> | null;
  timeline?: ClaimLogEntry[] | null;
  rejectionReason?: string | null;
  grievanceFiledOn?: string | null;
  grievanceRef?: string | null;
  ombudsmanFiledOn?: string | null;
  ombudsmanRef?: string | null;
}

export type UpdateClaimInput = Partial<AddClaimInput>;

export interface RevealAuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function toDate(s: string): Date {
  return new Date(s.slice(0, 10) + 'T00:00:00Z');
}

function isoOf(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Upper-case letters and digits only — "pol 123/45" and "POL-12345" are the same policy. */
export function normalizePolicyNumber(raw: string): string {
  return raw.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function assertPolicyNumber(raw: string): string {
  const n = normalizePolicyNumber(raw);
  if (n.length < 3 || n.length > 40) {
    throw new BadRequestError('Enter the policy number as printed on the policy (3–40 letters or digits)');
  }
  return n;
}

/** Keyed fingerprint of a policy number, formatting-insensitive. */
export function hashPolicyNumber(raw: string): string {
  return hashIdentifier(normalizePolicyNumber(raw), POLICY_NUMBER_PURPOSE);
}

/** Encrypted number + fingerprint + last 4 — the columns a policy number is stored as. */
async function policyNumberColumns(raw: string, normalized = normalizePolicyNumber(raw)) {
  const original = raw.trim();
  return {
    policyNumberEnc: await encryptIdentifier(original),
    policyNumberHash: hashIdentifier(normalized, POLICY_NUMBER_PURPOSE),
    policyNumberLast4: normalized.slice(-4),
  };
}

const MAX_NOMINEES = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(v: string | null | undefined, max: number): string | null {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
}

/** Nominees, tidied and checked: shares total 100, and a minor has an appointee. */
function validateNominees(input: Nominee[] | null | undefined): Nominee[] | null {
  if (!input || input.length === 0) return null;
  if (input.length > MAX_NOMINEES) throw new BadRequestError(`A policy can list up to ${MAX_NOMINEES} nominees`);

  const nominees = input.map((n) => {
    const name = cleanText(n.name, 100);
    const relation = cleanText(n.relation, 50);
    if (!name || !relation) throw new BadRequestError("Each nominee needs a name and their relationship to you");
    const isMinor = n.isMinor === true;
    const appointeeName = cleanText(n.appointeeName, 100);
    if (isMinor && !appointeeName) {
      throw new BadRequestError(`${name} is a minor — add an appointee to receive the money on their behalf`);
    }
    return {
      name,
      relation,
      sharePercent: n.sharePercent ?? null,
      isMinor,
      appointeeName: isMinor ? appointeeName : null,
      appointeeRelation: isMinor ? cleanText(n.appointeeRelation, 50) : null,
    };
  });

  const withShare = nominees.filter((n) => n.sharePercent !== null);
  if (withShare.length > 0) {
    if (withShare.length !== nominees.length) {
      throw new BadRequestError('Give every nominee a share, or leave the shares blank');
    }
    const total = withShare.reduce((s, n) => s.plus(new Decimal(String(n.sharePercent))), new Decimal(0));
    if (!total.equals(100)) {
      throw new BadRequestError(`Nominee shares add up to ${total.toString()}% — they need to total 100%`);
    }
  }
  return nominees;
}

function validateContacts(input: PolicyContacts | null | undefined): PolicyContacts | null {
  if (!input) return null;
  const out: PolicyContacts = {};
  for (const key of Object.keys(input) as Array<keyof PolicyContacts>) {
    const v = cleanText(input[key], 200);
    if (!v) continue;
    if ((key === 'claimEmail' || key === 'agentEmail') && !EMAIL.test(v)) {
      throw new BadRequestError(`"${v}" isn't an email address`);
    }
    out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The tax and surrender fields as columns, checked against the policy type:
 * the health-deduction fields belong to health policies, and a surrender
 * value to savings policies. A quote without a date is dated today.
 */
function extrasColumns(type: string, input: UpdatePolicyInput) {
  const out: {
    taxBucket?: string | null;
    seniorCitizen?: boolean | null;
    surrenderValue?: Prisma.Decimal | null;
    surrenderValueAsOf?: Date | null;
  } = {};

  if ((input.taxBucket || input.seniorCitizen === true) && type !== 'HEALTH') {
    throw new BadRequestError('Only a health policy counts towards the health-insurance deduction');
  }
  if (input.taxBucket !== undefined) out.taxBucket = input.taxBucket;
  if (input.seniorCitizen !== undefined) out.seniorCitizen = input.seniorCitizen;

  if (input.surrenderValue && !hasSurrenderValue(type)) {
    throw new BadRequestError('Only whole life, endowment and ULIP policies have a surrender value');
  }
  const asOf = input.surrenderValueAsOf ?? null;
  if (asOf && asOf > todayIso()) throw new BadRequestError("The surrender quote can't be dated in the future");
  if (input.surrenderValue !== undefined) {
    out.surrenderValue = input.surrenderValue ? new Prisma.Decimal(input.surrenderValue) : null;
    out.surrenderValueAsOf = input.surrenderValue ? toDate(asOf ?? todayIso()) : null;
  } else if (input.surrenderValueAsOf !== undefined) {
    out.surrenderValueAsOf = asOf ? toDate(asOf) : null;
  }
  return out;
}

// ── Premium schedule ─────────────────────────────────────────────────

interface ScheduleFields {
  type: string;
  premiumFrequency: string;
  startDate: Date;
  maturityDate: Date | null;
  premiumsTrackedFrom: Date | null;
  gracePeriodDays: number | null;
}

interface StoredPayment {
  periodFrom: Date;
  periodTo: Date;
  paidOn: Date;
  amount: { toString(): string };
}

function graceDaysOf(p: Pick<ScheduleFields, 'type' | 'premiumFrequency' | 'gracePeriodDays'>): number {
  return p.gracePeriodDays ?? defaultGraceDays(p.type, p.premiumFrequency);
}

/** The next unpaid premium for a policy, from the shared schedule. */
function nextDueFor(p: ScheduleFields, payments: StoredPayment[]): NextPremiumDue {
  const today = todayIso();
  const rows = buildPremiumSchedule(
    { startDate: isoOf(p.startDate)!, premiumFrequency: p.premiumFrequency, maturityDate: isoOf(p.maturityDate) },
    payments.map((x) => ({
      periodFrom: isoOf(x.periodFrom)!,
      periodTo: isoOf(x.periodTo)!,
      paidOn: isoOf(x.paidOn)!,
      amount: x.amount.toString(),
    })),
    { today, untrackedBefore: isoOf(p.premiumsTrackedFrom) },
  );
  return nextPremiumDue(rows, { today, graceDays: graceDaysOf(p) });
}

/** Re-store `nextPremiumDue` after anything that can move it. */
export async function restoreNextPremiumDue(
  db: Prisma.TransactionClient,
  policy: ScheduleFields & { id: string },
): Promise<void> {
  const payments = await db.premiumPayment.findMany({ where: { policyId: policy.id } });
  const next = nextDueFor(policy, payments);
  await db.insurancePolicy.update({
    where: { id: policy.id },
    data: { nextPremiumDue: next.dueDate ? toDate(next.dueDate) : null },
  });
}

// ── DTO ──────────────────────────────────────────────────────────────

interface StoredPolicyNumber {
  policyNumber?: string | null;
  policyNumberEnc?: string | null;
  policyNumberHash?: string | null;
  policyNumberLast4?: string | null;
}

/**
 * What a policy looks like outside this service: no policy number (not even
 * encrypted) — just its last 4 — plus where the next premium stands.
 */
export function toPolicyDto<
  T extends StoredPolicyNumber &
    Partial<ScheduleFields> & { nextPremiumDue?: Date | null; surrenderValue?: { toString(): string } | null },
>(row: T) {
  const { policyNumber, policyNumberEnc, policyNumberHash: _hash, ...rest } = row;
  const last4 = row.policyNumberLast4 ?? (policyNumber ? normalizePolicyNumber(policyNumber).slice(-4) : null);
  const graceDays =
    row.type && row.premiumFrequency
      ? graceDaysOf({ type: row.type, premiumFrequency: row.premiumFrequency, gracePeriodDays: row.gracePeriodDays ?? null })
      : 0;
  return {
    ...rest,
    policyNumberLast4: last4,
    hasPolicyNumber: Boolean(policyNumberEnc || policyNumber),
    graceDays,
    premiumDue: premiumDueOn(isoOf(row.nextPremiumDue), { today: todayIso(), graceDays }),
    surrenderValue: row.surrenderValue != null ? row.surrenderValue.toString() : null,
  };
}

// ── Policy CRUD ──────────────────────────────────────────────────────

export async function listPolicies(userId: string) {
  const rows = await prisma.insurancePolicy.findMany({
    where: { userId },
    include: {
      premiumHistory: { orderBy: { paidOn: 'desc' }, take: 5 },
      claims: { orderBy: { claimDate: 'desc' } },
      vehicle: { select: { id: true, registrationNo: true, make: true, model: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({ ...toPolicyDto(r), claims: r.claims.map(toClaimDto) }));
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
  return { ...toPolicyDto(policy), claims: policy.claims.map(toClaimDto) };
}

const DUPLICATE_POLICY = 'You already have this policy saved for this insurer';

export async function createPolicy(userId: string, input: CreatePolicyInput) {
  const normalized = assertPolicyNumber(input.policyNumber);
  const nominees = validateNominees(input.nominees);
  const contacts = validateContacts(input.contacts);

  const schedule: ScheduleFields = {
    type: input.type,
    premiumFrequency: input.premiumFrequency,
    startDate: toDate(input.startDate),
    maturityDate: input.maturityDate ? toDate(input.maturityDate) : null,
    premiumsTrackedFrom: toDate(input.nextPremiumDue ?? todayIso()),
    gracePeriodDays: input.gracePeriodDays ?? null,
  };
  const next = nextDueFor(schedule, []);

  try {
    const row = await prisma.insurancePolicy.create({
      data: {
        userId,
        insurer: input.insurer,
        policyNumber: null,
        ...(await policyNumberColumns(input.policyNumber, normalized)),
        type: input.type,
        planName: input.planName ?? null,
        policyHolder: input.policyHolder,
        nominees: nominees ? (nominees as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        contacts: contacts ? (contacts as Prisma.InputJsonValue) : Prisma.JsonNull,
        sumAssured: new Prisma.Decimal(input.sumAssured),
        premiumAmount: new Prisma.Decimal(input.premiumAmount),
        premiumFrequency: input.premiumFrequency,
        startDate: schedule.startDate,
        maturityDate: schedule.maturityDate,
        premiumsTrackedFrom: schedule.premiumsTrackedFrom,
        gracePeriodDays: schedule.gracePeriodDays,
        nextPremiumDue: next.dueDate ? toDate(next.dueDate) : null,
        vehicleId: input.vehicleId ?? null,
        portfolioId: input.portfolioId ?? null,
        healthCoverDetails: (input.healthCoverDetails as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        status: input.status ?? 'ACTIVE',
        ...extrasColumns(input.type, input),
      },
    });
    return toPolicyDto(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(DUPLICATE_POLICY);
    throw err;
  }
}

export async function updatePolicy(
  userId: string,
  policyId: string,
  input: UpdatePolicyInput,
) {
  const existing = await prisma.insurancePolicy.findFirst({ where: { id: policyId, userId } });
  if (!existing) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);

  const newNumber = input.policyNumber?.trim() ? input.policyNumber : null;
  const numberColumns = newNumber
    ? { policyNumber: null, ...(await policyNumberColumns(newNumber, assertPolicyNumber(newNumber))) }
    : {};

  const schedule: ScheduleFields = {
    type: input.type ?? existing.type,
    premiumFrequency: input.premiumFrequency ?? existing.premiumFrequency,
    startDate: input.startDate !== undefined ? toDate(input.startDate) : existing.startDate,
    maturityDate:
      input.maturityDate !== undefined
        ? input.maturityDate
          ? toDate(input.maturityDate)
          : null
        : existing.maturityDate,
    premiumsTrackedFrom: input.nextPremiumDue ? toDate(input.nextPremiumDue) : existing.premiumsTrackedFrom,
    gracePeriodDays: input.gracePeriodDays !== undefined ? input.gracePeriodDays : existing.gracePeriodDays,
  };
  const scheduleChanged =
    input.type !== undefined ||
    input.premiumFrequency !== undefined ||
    input.startDate !== undefined ||
    input.maturityDate !== undefined ||
    input.gracePeriodDays !== undefined ||
    Boolean(input.nextPremiumDue);
  const next = scheduleChanged
    ? nextDueFor(schedule, await prisma.premiumPayment.findMany({ where: { policyId } }))
    : null;

  try {
    const row = await prisma.insurancePolicy.update({
      where: { id: policyId },
      data: {
        ...(input.insurer !== undefined && { insurer: input.insurer }),
        ...numberColumns,
        ...(input.type !== undefined && { type: input.type }),
        ...(input.planName !== undefined && { planName: input.planName }),
        ...(input.policyHolder !== undefined && { policyHolder: input.policyHolder }),
        ...(input.nominees !== undefined && {
          nominees: ((): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
            const n = validateNominees(input.nominees);
            return n ? (n as unknown as Prisma.InputJsonValue) : Prisma.JsonNull;
          })(),
        }),
        ...(input.contacts !== undefined && {
          contacts: ((): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
            const c = validateContacts(input.contacts);
            return c ? (c as Prisma.InputJsonValue) : Prisma.JsonNull;
          })(),
        }),
        ...(input.sumAssured !== undefined && { sumAssured: new Prisma.Decimal(input.sumAssured) }),
        ...(input.premiumAmount !== undefined && {
          premiumAmount: new Prisma.Decimal(input.premiumAmount),
        }),
        ...(input.premiumFrequency !== undefined && { premiumFrequency: input.premiumFrequency }),
        ...(input.startDate !== undefined && { startDate: schedule.startDate }),
        ...(input.maturityDate !== undefined && { maturityDate: schedule.maturityDate }),
        ...(input.nextPremiumDue && { premiumsTrackedFrom: schedule.premiumsTrackedFrom }),
        ...(input.gracePeriodDays !== undefined && { gracePeriodDays: schedule.gracePeriodDays }),
        ...(next && { nextPremiumDue: next.dueDate ? toDate(next.dueDate) : null }),
        ...(input.vehicleId !== undefined && { vehicleId: input.vehicleId }),
        ...(input.portfolioId !== undefined && { portfolioId: input.portfolioId }),
        ...(input.healthCoverDetails !== undefined && {
          healthCoverDetails: (input.healthCoverDetails as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        }),
        ...(input.status !== undefined && { status: input.status }),
        ...extrasColumns(input.type ?? existing.type, input),
      },
    });
    return toPolicyDto(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(DUPLICATE_POLICY);
    throw err;
  }
}

export async function deletePolicy(userId: string, policyId: string) {
  const existing = await prisma.insurancePolicy.findFirst({ where: { id: policyId, userId } });
  if (!existing) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);
  await prisma.insurancePolicy.delete({ where: { id: policyId } });
}

/**
 * The full policy number, for its owner. Writes a `pii_view` AuditLog row
 * before returning; if that write fails, so does the reveal. A number still
 * held in the legacy plaintext column is encrypted on the way.
 */
export async function revealPolicyNumber(
  userId: string,
  policyId: string,
  ctx: RevealAuditContext,
): Promise<string | null> {
  const row = await prisma.insurancePolicy.findFirst({
    where: { id: policyId, userId },
    select: { id: true, policyNumber: true, policyNumberEnc: true },
  });
  if (!row) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);

  let value: string | null = null;
  if (row.policyNumberEnc) {
    try {
      value = await decryptIdentifier(row.policyNumberEnc);
    } catch (err) {
      logger.error({ err: (err as Error).message, policyId }, '[insurance] policy number decrypt failed');
      throw new BadRequestError('Could not decrypt the policy number — the encryption key may have changed');
    }
  } else if (row.policyNumber) {
    value = row.policyNumber;
    try {
      await prisma.insurancePolicy.update({ where: { id: policyId }, data: await policyNumberColumns(value) });
    } catch (err) {
      // Still shown; the startup conversion reports it too.
      logger.warn(
        { policyId, err: err instanceof Error ? err.message : String(err) },
        '[insurance] could not encrypt a legacy policy number on reveal',
      );
    }
  }
  if (!value) return null;

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'pii_view',
      resource: `InsurancePolicy:${policyId}`,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      metadata: { field: 'policyNumber' },
    },
  });
  return value;
}

/**
 * Encrypt every policy number still stored in plain text. Idempotent — run on
 * startup; each value is checked to decrypt back to itself before it's
 * stored. The plaintext stays in its (no longer read) column until a later
 * migration drops it.
 */
export async function backfillPolicyNumberEncryption(): Promise<{ encrypted: number; failed: number }> {
  let encrypted = 0;
  let failed = 0;
  const skipped: string[] = [];

  for (;;) {
    const batch = await prisma.insurancePolicy.findMany({
      where: {
        policyNumberEnc: null,
        policyNumber: { not: null },
        ...(skipped.length > 0 && { id: { notIn: skipped } }),
      },
      select: { id: true, policyNumber: true },
      take: 200,
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      const original = row.policyNumber!.trim();
      try {
        const columns = await policyNumberColumns(original);
        if ((await decryptIdentifier(columns.policyNumberEnc)) !== original) {
          throw new Error('encrypted value did not read back');
        }
        await prisma.insurancePolicy.update({ where: { id: row.id }, data: columns });
        encrypted += 1;
      } catch (err) {
        failed += 1;
        skipped.push(row.id);
        logger.warn(
          {
            policyId: row.id,
            duplicate: isUniqueViolation(err),
            err: err instanceof Error ? err.message : String(err),
          },
          '[insurance] could not encrypt a saved policy number',
        );
      }
    }
  }
  return { encrypted, failed };
}

// ── Premium payments ─────────────────────────────────────────────────

export async function addPremiumPayment(
  userId: string,
  policyId: string,
  input: AddPremiumInput,
) {
  const policy = await prisma.insurancePolicy.findFirst({ where: { id: policyId, userId } });
  if (!policy) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);

  return runInTransaction(async (tx) => {
    const payment = await tx.premiumPayment.create({
      data: {
        policyId,
        paidOn: toDate(input.paidOn),
        amount: new Prisma.Decimal(input.amount),
        periodFrom: toDate(input.periodFrom),
        periodTo: toDate(input.periodTo),
        canonicalEventId: input.canonicalEventId ?? null,
      },
    });
    await restoreNextPremiumDue(tx, policy);
    return payment;
  });
}

export async function removePremiumPayment(userId: string, paymentId: string) {
  const payment = await prisma.premiumPayment.findFirst({
    where: { id: paymentId },
    include: { policy: { select: { userId: true } } },
  });
  if (!payment || payment.policy.userId !== userId) {
    throw new NotFoundError(`PremiumPayment ${paymentId} not found`);
  }
  await runInTransaction(async (tx) => {
    await tx.premiumPayment.delete({ where: { id: paymentId } });
    const policy = await tx.insurancePolicy.findFirst({ where: { id: payment.policyId, userId } });
    if (policy) await restoreNextPremiumDue(tx, policy);
  });
}

// ── Claims ───────────────────────────────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LOG_ENTRIES = 200;

const optDate = (v: string | null | undefined) => (v ? toDate(v) : null);

function isRealDay(v: string): boolean {
  if (!ISO_DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** A claim as the API returns it: money as strings, plus where it stands. */
export function toClaimDto(row: InsuranceClaim) {
  return {
    ...row,
    claimedAmount: row.claimedAmount.toString(),
    settledAmount: row.settledAmount?.toString() ?? null,
    progress: claimProgress(
      {
        kind: row.kind,
        status: row.status,
        claimDate: isoOf(row.claimDate)!,
        documentsCompletedOn: isoOf(row.documentsCompletedOn),
        surveyorAllocatedOn: isoOf(row.surveyorAllocatedOn),
        claimedAmount: row.claimedAmount.toString(),
        settledAmount: row.settledAmount?.toString() ?? null,
        grievanceFiledOn: isoOf(row.grievanceFiledOn),
        ombudsmanFiledOn: isoOf(row.ombudsmanFiledOn),
      },
      todayIso(),
    ),
  };
}

/** The claim's values once the change is applied, for cross-field checks. */
interface ClaimContext {
  policyType: string;
  kind: string | null;
  claimDate: string;
  grievanceFiledOn: string | null;
  ombudsmanFiledOn: string | null;
}

/**
 * Checks the tracker fields: the guide fits the policy, ticked documents are
 * on its checklist, log entries are dated, and escalation isn't dated before
 * the claim. Returns the cleaned checklist / log when they were given.
 */
function checkClaimTracker(input: UpdateClaimInput, ctx: ClaimContext) {
  let guide: ClaimGuide | null = null;
  if (ctx.kind != null) {
    if (!isClaimKind(ctx.kind)) throw new BadRequestError('Pick a claim type from the list');
    guide = CLAIM_GUIDES[ctx.kind];
    if (!guide.appliesTo.includes(ctx.policyType)) {
      throw new BadRequestError(
        `A “${guide.title}” claim doesn’t apply to a ${TYPE_LABELS[ctx.policyType] ?? ctx.policyType} policy`,
      );
    }
  }

  let checklist: Record<string, true> | null | undefined;
  if (input.checklist !== undefined) {
    if (input.checklist === null) {
      checklist = null;
    } else {
      if (!guide) throw new BadRequestError('Pick the claim type before ticking off documents');
      const known = new Set(guide.documents.map((d) => d.id));
      checklist = {};
      for (const [id, done] of Object.entries(input.checklist)) {
        if (!known.has(id)) throw new BadRequestError(`"${id}" isn't on the ${guide.title} checklist`);
        if (done === true) checklist[id] = true;
      }
    }
  }

  let timeline: ClaimLogEntry[] | null | undefined;
  if (input.timeline !== undefined) {
    if (input.timeline === null) {
      timeline = null;
    } else {
      if (input.timeline.length > MAX_LOG_ENTRIES) {
        throw new BadRequestError(`A claim can keep up to ${MAX_LOG_ENTRIES} notes`);
      }
      timeline = input.timeline.map((e) => {
        if (!isRealDay(e.on)) throw new BadRequestError('Each note needs a date');
        const note = cleanText(e.note, 500);
        if (!note) throw new BadRequestError('A note can’t be empty');
        return { on: e.on, note };
      });
    }
  }

  if (ctx.grievanceFiledOn && ctx.grievanceFiledOn < ctx.claimDate) {
    throw new BadRequestError("The complaint can't be dated before the claim");
  }
  if (ctx.ombudsmanFiledOn && ctx.ombudsmanFiledOn < ctx.claimDate) {
    throw new BadRequestError("The Ombudsman complaint can't be dated before the claim");
  }
  return { checklist, timeline };
}

const jsonOrNull = (v: unknown) => (v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

export async function addClaim(userId: string, policyId: string, input: AddClaimInput) {
  const policy = await prisma.insurancePolicy.findFirst({ where: { id: policyId, userId } });
  if (!policy) throw new NotFoundError(`InsurancePolicy ${policyId} not found`);

  const { checklist, timeline } = checkClaimTracker(input, {
    policyType: policy.type,
    kind: input.kind ?? null,
    claimDate: input.claimDate,
    grievanceFiledOn: input.grievanceFiledOn ?? null,
    ombudsmanFiledOn: input.ombudsmanFiledOn ?? null,
  });

  const row = await prisma.insuranceClaim.create({
    data: {
      policyId,
      claimNumber: input.claimNumber ?? null,
      claimDate: toDate(input.claimDate),
      claimType: input.claimType,
      claimedAmount: new Prisma.Decimal(input.claimedAmount),
      status: input.status,
      settledAmount: input.settledAmount ? new Prisma.Decimal(input.settledAmount) : null,
      settledOn: optDate(input.settledOn),
      documents: jsonOrNull(input.documents),
      kind: input.kind ?? null,
      documentsCompletedOn: optDate(input.documentsCompletedOn),
      surveyorAllocatedOn: optDate(input.surveyorAllocatedOn),
      checklist: jsonOrNull(checklist),
      timeline: jsonOrNull(timeline),
      rejectionReason: cleanText(input.rejectionReason, 1000),
      grievanceFiledOn: optDate(input.grievanceFiledOn),
      grievanceRef: cleanText(input.grievanceRef, 100),
      ombudsmanFiledOn: optDate(input.ombudsmanFiledOn),
      ombudsmanRef: cleanText(input.ombudsmanRef, 100),
    },
  });
  return toClaimDto(row);
}

export async function updateClaim(
  userId: string,
  claimId: string,
  input: UpdateClaimInput,
) {
  const claim = await prisma.insuranceClaim.findFirst({
    where: { id: claimId },
    include: { policy: { select: { userId: true, type: true } } },
  });
  if (!claim || claim.policy.userId !== userId) throw new NotFoundError(`InsuranceClaim ${claimId} not found`);

  const pick = (v: string | null | undefined, existing: Date | null) =>
    v !== undefined ? (v ?? null) : isoOf(existing);
  const kind = input.kind !== undefined ? input.kind : claim.kind;
  const tracker = checkClaimTracker(input, {
    policyType: claim.policy.type,
    kind,
    claimDate: pick(input.claimDate, claim.claimDate)!,
    grievanceFiledOn: pick(input.grievanceFiledOn, claim.grievanceFiledOn),
    ombudsmanFiledOn: pick(input.ombudsmanFiledOn, claim.ombudsmanFiledOn),
  });
  // Ticked documents belong to a guide; a different guide starts a fresh list.
  const checklist =
    tracker.checklist !== undefined ? tracker.checklist : kind !== claim.kind ? null : undefined;

  const row = await prisma.insuranceClaim.update({
    where: { id: claimId },
    data: {
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.documentsCompletedOn !== undefined && { documentsCompletedOn: optDate(input.documentsCompletedOn) }),
      ...(input.surveyorAllocatedOn !== undefined && { surveyorAllocatedOn: optDate(input.surveyorAllocatedOn) }),
      ...(checklist !== undefined && { checklist: jsonOrNull(checklist) }),
      ...(tracker.timeline !== undefined && { timeline: jsonOrNull(tracker.timeline) }),
      ...(input.rejectionReason !== undefined && { rejectionReason: cleanText(input.rejectionReason, 1000) }),
      ...(input.grievanceFiledOn !== undefined && { grievanceFiledOn: optDate(input.grievanceFiledOn) }),
      ...(input.grievanceRef !== undefined && { grievanceRef: cleanText(input.grievanceRef, 100) }),
      ...(input.ombudsmanFiledOn !== undefined && { ombudsmanFiledOn: optDate(input.ombudsmanFiledOn) }),
      ...(input.ombudsmanRef !== undefined && { ombudsmanRef: cleanText(input.ombudsmanRef, 100) }),
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
      ...(input.documents !== undefined && { documents: jsonOrNull(input.documents) }),
    },
  });
  return toClaimDto(row);
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

const AMOUNT_TOLERANCE = new Decimal('0.05');

/** The one active policy a PREMIUM_PAID event is for, or null if unclear. */
async function tryMatchPremiumEvent(event: PremiumEventContext): Promise<{ policyId: string } | null> {
  if (!event.amount) return null;

  const policies = await prisma.insurancePolicy.findMany({
    where: { userId: event.userId, status: 'ACTIVE' },
  });
  if (policies.length === 0) return null;

  const meta = event.metadata ?? {};
  const metaPolicyNo = typeof meta['policyNumber'] === 'string' ? meta['policyNumber'] : null;
  const metaInsurer =
    typeof meta['insurer'] === 'string' ? meta['insurer'].toLowerCase() : (event.counterparty?.toLowerCase() ?? null);

  // Priority 1: the policy number, by fingerprint (or, for a not-yet-converted
  // row, by its normalised plaintext).
  if (metaPolicyNo && normalizePolicyNumber(metaPolicyNo).length >= 3) {
    const hash = hashPolicyNumber(metaPolicyNo);
    const wanted = normalizePolicyNumber(metaPolicyNo);
    const exact = policies.find((p) =>
      p.policyNumberHash
        ? p.policyNumberHash === hash
        : Boolean(p.policyNumber) && normalizePolicyNumber(p.policyNumber!) === wanted,
    );
    if (exact) return { policyId: exact.id };
  }

  // Priority 2: insurer name + amount within ±5%.
  if (metaInsurer) {
    const amount = new Decimal(event.amount.toString());
    const candidates = policies.filter((p) => {
      const insurer = p.insurer.toLowerCase();
      if (!insurer.includes(metaInsurer) && !metaInsurer.includes(insurer)) return false;
      const premium = new Decimal(p.premiumAmount.toString());
      const base = Decimal.max(premium, new Decimal('0.01'));
      return amount.minus(premium).abs().div(base).lte(AMOUNT_TOLERANCE);
    });
    if (candidates.length === 1) return { policyId: candidates[0]!.id };
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

    const today = todayIso();
    const policy = await prisma.insurancePolicy.findUnique({
      where: { id: match.policyId },
      select: { premiumFrequency: true, nextPremiumDue: true },
    });
    if (!policy) return;

    // The payment covers the premium that was next due.
    const periodFrom = isoOf(policy.nextPremiumDue) ?? today;
    const months = PREMIUM_FREQUENCY_MONTHS[policy.premiumFrequency];
    const periodTo = months ? addMonthsIso(periodFrom, months) : periodFrom;

    await addPremiumPayment(event.userId, match.policyId, {
      paidOn: today,
      amount: event.amount!.toString(),
      periodFrom,
      periodTo,
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

// ── Premium reminders (§9.2) ──────────────────────────────────────────

interface ReminderPolicy {
  id: string;
  insurer: string;
  planName: string | null;
  type: string;
  premiumFrequency: string;
  gracePeriodDays: number | null;
  nextPremiumDue: Date | null;
  premiumAmount: { toString(): string };
}

interface Reminder {
  key: string;
  state: string;
  title: string;
  description: string;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The reminder a policy needs today, if any. Before the due date it's the
 * nearest of 30/15/7/1 days — so a day the scan didn't run is caught up on the
 * next run — then grace-period, lapse or (no grace) expiry notices. Keys carry
 * the due date: each premium is reminded about once per step, and next year's
 * premium gets its own reminders.
 */
function reminderFor(p: ReminderPolicy, today: string): Reminder | null {
  const due = isoOf(p.nextPremiumDue);
  if (!due) return null;
  const days = daysBetweenIso(today, due);
  const grace = graceDaysOf(p);
  const name = `${p.insurer} — ${p.planName ?? TYPE_LABELS[p.type] ?? p.type}`;
  const amount = formatINR(p.premiumAmount.toString());
  const key = (step: string) => `insurance_premium:${p.id}:${due}:${step}`;

  if (days >= 0) {
    const step = days === 0 ? 0 : UPCOMING_REMINDER_DAYS.find((t) => days <= t);
    if (step === undefined) return null;
    return {
      key: key(`due-${step}`),
      state: 'DUE_SOON',
      title: days === 0 ? `${name} premium is due today` : `${name} premium due in ${plural(days, 'day')}`,
      description:
        `${amount} due on ${fmtDate(due)}.` +
        (grace > 0
          ? ` If you miss it, you have ${plural(grace, 'day')} of grace to pay.`
          : ' Cover ends if it isn’t renewed by then.'),
    };
  }

  if (grace > 0) {
    const graceEnds = addDaysIso(due, grace);
    const left = daysBetweenIso(today, graceEnds);
    if (left >= 0) {
      return {
        key: key(left <= FINAL_GRACE_DAYS ? 'grace-final' : 'grace'),
        state: 'IN_GRACE',
        title: `${name} premium overdue — ${plural(left, 'day')} of grace left`,
        description: `${amount} was due on ${fmtDate(due)}. Pay by ${fmtDate(graceEnds)} to keep the policy in force.`,
      };
    }
    return {
      key: key('lapse'),
      state: 'LAPSE_RISK',
      title: `${name} may have lapsed`,
      description:
        `The premium due on ${fmtDate(due)} isn’t recorded as paid, and the ${plural(grace, 'day')} grace period ` +
        `ended on ${fmtDate(graceEnds)}. Ask ${p.insurer} about reviving it — or record the payment if you did pay.`,
    };
  }

  return {
    key: key('expired'),
    state: 'LAPSE_RISK',
    title: `${name} cover has ended`,
    description: `It was due for renewal on ${fmtDate(due)}. Renew it with ${p.insurer} — you aren’t covered until you do.`,
  };
}

/**
 * Create today's premium reminders for every active policy (or one user's).
 * Run by the daily alert scan (alerts.service runAllAlertScans).
 */
export async function generateRenewalAlerts(userId?: string): Promise<number> {
  const today = todayIso();
  const policies = await prisma.insurancePolicy.findMany({
    where: {
      ...(userId ? { userId } : {}),
      status: 'ACTIVE',
      nextPremiumDue: {
        gte: toDate(addDaysIso(today, -REMINDER_LOOKBACK_DAYS)),
        lte: toDate(addDaysIso(today, 30)),
      },
    },
    select: {
      id: true,
      userId: true,
      insurer: true,
      planName: true,
      type: true,
      premiumFrequency: true,
      gracePeriodDays: true,
      nextPremiumDue: true,
      premiumAmount: true,
    },
  });

  let created = 0;
  for (const policy of policies) {
    const reminder = reminderFor(policy, today);
    if (!reminder) continue;

    const existing = await prisma.alert.findFirst({
      where: {
        userId: policy.userId,
        type: 'INSURANCE_PREMIUM',
        metadata: { path: ['key'], equals: reminder.key },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        userId: policy.userId,
        type: 'INSURANCE_PREMIUM',
        title: reminder.title,
        description: reminder.description,
        triggerDate: new Date(),
        metadata: {
          key: reminder.key,
          policyId: policy.id,
          dueDate: isoOf(policy.nextPremiumDue),
          state: reminder.state,
        },
      },
    });
    created++;
  }

  return created;
}

// ── Claim follow-up reminders ─────────────────────────────────────────

const CLAIM_ALERT_TITLE: Record<'FILE_GRIEVANCE' | 'GO_TO_OMBUDSMAN', string> = {
  FILE_GRIEVANCE: 'time to raise a complaint',
  GO_TO_OMBUDSMAN: 'you can take it to the Insurance Ombudsman',
};

/**
 * One reminder per claim when it's time to escalate: a complaint once the
 * insurer is past IRDAI's time limit (or has rejected / short-paid it), then
 * the Ombudsman once the complaint has gone 30 days. Run by the daily alert
 * scan (alerts.service runAllAlertScans).
 */
export async function generateClaimAlerts(userId?: string): Promise<number> {
  const rows = await prisma.insuranceClaim.findMany({
    where: { ombudsmanFiledOn: null, ...(userId ? { policy: { userId } } : {}) },
    include: { policy: { select: { userId: true, insurer: true, planName: true, type: true } } },
  });

  let created = 0;
  for (const row of rows) {
    const { progress } = toClaimDto(row);
    const action = progress.next.action;
    if (action !== 'FILE_GRIEVANCE' && action !== 'GO_TO_OMBUDSMAN') continue;

    const key = `insurance_claim:${row.id}:${action}`;
    const existing = await prisma.alert.findFirst({
      where: { userId: row.policy.userId, type: 'INSURANCE_CLAIM', metadata: { path: ['key'], equals: key } },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        userId: row.policy.userId,
        type: 'INSURANCE_CLAIM',
        title: `${row.policy.insurer} — ${row.claimType} claim: ${CLAIM_ALERT_TITLE[action]}`,
        description: progress.next.reason,
        triggerDate: new Date(),
        metadata: { key, claimId: row.id, policyId: row.policyId, action },
      },
    });
    created++;
  }
  return created;
}
