/**
 * The Policy Health Check engine's shared contract.
 *
 * Mirrors the structure of `services/mfAnalytics/types.ts` and
 * `services/advisor/types.ts`. Same invariants:
 *
 *  - `PolicyAnalysisFacts` is immutable JSON-round-trippable: no Decimal,
 *    no Date, no undefined. Every numeric is a Decimal string, every date
 *    is an ISO string. `mfFacts.builder.ts` asserts the round trip; we do
 *    the same here in the facts builder.
 *
 *  - Rules are synchronous and pure: no await, no I/O, no Date.now(), no
 *    mutation of facts. `evaluate(facts)` → `PolicyFinding[]`.
 *
 *  - `makePolicyFinding` refuses to build an indefensible finding: non-empty
 *    evidence, non-empty whatWouldChangeThis, headline ≤120 chars,
 *    confidence ∈ [0,1].
 *
 *  - `createdAt` is `facts.asOf`, not the wall clock, so a replay over a
 *    stored factsSnapshot produces the same finding timestamps.
 */

import type {
  PolicyFieldConflict,
  PolicyFindingCategory,
  PolicyFindingDTO,
  PolicyFindingSeverity,
  PolicyEvidence,
} from '@everypaisa/shared';
import { toDecimal } from '@everypaisa/shared';
import type { PolicyExtraction } from './extractionSchema.js';
import type { TermExtraction } from './termExtractionSchema.js';
import type { SavingsExtraction } from './savingsExtractionSchema.js';
import type { MotorExtraction } from './motorExtractionSchema.js';

// ---------------------------------------------------------------------------
// Thresholds (passed through facts so tests can override without changing
// production calibration)
// ---------------------------------------------------------------------------

export interface PolicyRuleConstants {
  /** Co-payment percentage at which we flag it as CRITICAL (default 20). */
  copaymentCriticalPct: string;
  /** Co-payment percentage at which we flag it as WARNING (default 10). */
  copaymentWarningPct: string;
  /** Room rent % of SI per day threshold below which we flag (default 1.5). */
  roomRentLowPct: string;
  /** Room rent daily amount below which we flag for a standard policy (default 3000). */
  roomRentLowInr: string;
  /** PED waiting period days above which we flag as WARNING (default 1095 = 3 years). */
  pedWaitingWarningDays: number;
  /** Initial waiting period days above which we flag (default 60). */
  initialWaitingWarningDays: number;
  /** Regulatory cap on PED / specific-disease waits (days). */
  regulatoryMaxWaitingDays: number;
  /** Moratorium length in continuous months. */
  moratoriumMonths: number;
  /** ISO date from which the cap applies to newly issued policies. */
  regulatoryCapEffectiveDate: string;
  /** Minimum acceptable sum insured in INR (default 500000 = 5L). */
  minSumInsuredInr: string;
  /** Sum insured below which restoration is CRITICAL (default 1000000 = 10L). */
  restorationCriticalBelowInr: string;
}

export const DEFAULT_POLICY_RULE_CONSTANTS: PolicyRuleConstants = {
  copaymentCriticalPct: '20',
  copaymentWarningPct: '10',
  roomRentLowPct: '1.5',
  roomRentLowInr: '3000',
  pedWaitingWarningDays: 1095,
  /** IRDAI Master Circular on Health Insurance Business (29 May 2024): PED / specific-disease waits capped at 3 years. */
  regulatoryMaxWaitingDays: 1095,
  /** Same circular: moratorium reduced from 96 to 60 continuous months. */
  moratoriumMonths: 60,
  /** Policies starting on/after this date are covered by the 2024 caps without ambiguity. */
  regulatoryCapEffectiveDate: '2024-04-01',
  initialWaitingWarningDays: 60,
  minSumInsuredInr: '500000',
  restorationCriticalBelowInr: '1000000',
};

// ---------------------------------------------------------------------------
// Insurer intelligence snapshot
// ---------------------------------------------------------------------------

export interface InsurerMetricsFacts {
  insurerName: string;
  financialYear: string | null;
  /** Claim Settlement Ratio (% by count). NOT the same as ICR. */
  claimSettlementRatio: string | null;
  /** Incurred Claim Ratio (claims incurred / net premium). NOT the same as CSR. */
  incurredClaimRatio: string | null;
  claimsTotal: number | null;
  claimsSettled: number | null;
  source: string | null;
  retrievedAt: string | null;
}

// ---------------------------------------------------------------------------
// PolicyAnalysisFacts — the immutable input to every rule
// ---------------------------------------------------------------------------

/**
 * Everything the engine knows when it evaluates rules.
 *
 * JSON-round-trippable: snapshotted verbatim onto `PolicyHealthCheck.factsSnapshot`
 * so a stored run can be replayed against newer rules without re-extracting.
 *
 * Fields come from two sources:
 *  1. `extraction` — what the LLM extracted from the policy documents (after
 *     any user corrections). Every field is an `ExtractedPolicyField<T>` with
 *     a status of EXTRACTED, USER_EDITED or NOT_FOUND.
 *  2. `insurer` — IRDAI metrics for the insurer named in the policy.
 *
 * Rules must check `extraction.<field>.status !== 'NOT_FOUND'` before using
 * a value. A rule that uses a NOT_FOUND value as though it were a real value
 * is a rule that makes claims about data that does not exist.
 */
export interface PolicyAnalysisFacts {
  /** ISO date-time of this analysis. Rules read this, never Date.now(). */
  asOf: string;
  userId: string;
  policyId: string;
  checkId: string;

  /**
   * Thresholds passed through facts so tests can override a single boundary
   * without touching production calibration. Mirrors MfAnalysisFacts.constants.
   */
  constants: PolicyRuleConstants;

  /** All extracted policy fields, versioned and cited. */
  extraction: PolicyExtraction;

  /** IRDAI metrics for the insurer. Null if no data available. */
  insurer: InsurerMetricsFacts | null;

  /** Disagreements between documents found at extraction. Absent on older runs. */
  conflicts?: PolicyFieldConflict[];
}

// ---------------------------------------------------------------------------
// Rule contract
// ---------------------------------------------------------------------------

/**
 * What a policy rule is.
 *
 * Adding a rule = one file that exports this, appended to rules/registry.ts.
 * No engine change required.
 *
 * `policyType` lists the policy types this rule applies to (e.g. `['HEALTH']`).
 * Rules with an empty `policyType` apply to all types.
 *
 * `evaluate` is **synchronous and pure**: no await, no I/O, no Date.now(),
 * no randomness, no mutation of facts.
 */
export interface PolicyRule {
  /** Dotted, stable, never reused: "policy.copay.mandatory". */
  id: string;
  /** Bump on any threshold or logic change that could alter output. */
  version: string;
  /** Policy types this rule applies to. Empty = all types. */
  policyType: string[];
  category: PolicyFindingCategory;
  /** Pure, synchronous, no I/O. */
  evaluate(facts: PolicyAnalysisFacts): PolicyFindingDTO[];
}

// ---------------------------------------------------------------------------
// Finding construction
// ---------------------------------------------------------------------------

export const POLICY_HEADLINE_MAX_CHARS = 120;

/** The parts of a PolicyFindingDTO that a rule authors. */
export interface PolicyFindingInput {
  ruleId: string;
  ruleVersion: string;
  code: string;
  category: PolicyFindingCategory;
  severity: PolicyFindingSeverity;
  /** 0-1. Evidence-quality confidence. */
  confidence: string;
  /** ≤120 chars. Deterministic from a template. Never LLM-authored. */
  headline: string;
  /** At least one cited location — no evidence = no finding. */
  evidence: PolicyEvidence[];
  /** What the user would need to change for this finding to go away. */
  whatWouldChangeThis: string;
}

/**
 * Build a PolicyFindingDTO, refusing to build an indefensible one.
 *
 * Four enforced invariants (mirrors makeFinding in mfAnalytics/types.ts):
 *  1. whatWouldChangeThis is non-empty.
 *  2. evidence is non-empty.
 *  3. headline fits in POLICY_HEADLINE_MAX_CHARS.
 *  4. confidence is in [0, 1].
 *
 * id is deterministic (ruleId@version:code) so identical input → identical id.
 * createdAt is facts.asOf so replay produces the same timestamps.
 */
export function makePolicyFinding(
  facts: Pick<PolicyAnalysisFacts, 'checkId' | 'asOf'>,
  input: PolicyFindingInput,
): PolicyFindingDTO {
  const counterfactual = input.whatWouldChangeThis.trim();
  if (counterfactual.length === 0) {
    throw new Error(
      `[${input.ruleId}] finding ${input.code} has an empty whatWouldChangeThis. ` +
        'A finding that cannot say what would clear it is an opinion, not an observation.',
    );
  }

  if (input.evidence.length === 0) {
    throw new Error(
      `[${input.ruleId}] finding ${input.code} cites no evidence. ` +
        'Without evidence there is nothing to verify the claim against.',
    );
  }

  const headline = input.headline.trim();
  if (headline.length === 0 || headline.length > POLICY_HEADLINE_MAX_CHARS) {
    throw new Error(
      `[${input.ruleId}] finding ${input.code} headline must be 1-${POLICY_HEADLINE_MAX_CHARS} ` +
        `characters, got ${headline.length}.`,
    );
  }

  const confidence = toDecimal(input.confidence);
  if (confidence.lessThan(0) || confidence.greaterThan(1)) {
    throw new Error(
      `[${input.ruleId}] finding ${input.code} confidence must be in [0,1], got ${input.confidence}. ` +
        'It is a fraction, not a percentage.',
    );
  }

  return {
    id: `${input.ruleId}@${input.ruleVersion}:${input.code}`,
    checkId: facts.checkId,
    ruleId: input.ruleId,
    ruleVersion: input.ruleVersion,
    code: input.code,
    category: input.category,
    severity: input.severity,
    confidence: input.confidence,
    headline,
    evidence: input.evidence,
    whatWouldChangeThis: counterfactual,
    createdAt: facts.asOf,
  };
}

// ---------------------------------------------------------------------------
// Term life
// ---------------------------------------------------------------------------

export interface TermRuleConstants {
  /** Cover ending before this age is a WARNING (default 60: before retirement). */
  horizonWarnAge: number;
  /** Cover ending before this age is a NOTICE (default 70). */
  horizonNoticeAge: number;
  /** Usual suicide-exclusion length in months (12). Longer is a WARNING. */
  standardSuicideMonths: number;
  /** IRDAI minimum grace period for non-monthly premiums (30 days). */
  minGraceDays: number;
  /** ...and for monthly premiums (15 days). */
  minGraceMonthlyDays: number;
  /** Section 45, Insurance Act 1938: 3 years (36 months) to contest a claim. */
  contestabilityMonths: number;
}

export const DEFAULT_TERM_RULE_CONSTANTS: TermRuleConstants = {
  horizonWarnAge: 60,
  horizonNoticeAge: 70,
  standardSuicideMonths: 12,
  minGraceDays: 30,
  minGraceMonthlyDays: 15,
  contestabilityMonths: 36,
};

/** The input to every term rule: same shape as the health facts, a term extraction. */
export interface TermAnalysisFacts {
  asOf: string;
  userId: string;
  policyId: string;
  checkId: string;
  productType: 'TERM';
  constants: TermRuleConstants;
  extraction: TermExtraction;
  /** IRDAI life-insurer metrics. Null if unavailable. */
  insurer: InsurerMetricsFacts | null;
  conflicts?: PolicyFieldConflict[];
}

export interface TermRule {
  id: string;
  version: string;
  category: PolicyFindingCategory;
  /** Pure, synchronous, no I/O. */
  evaluate(facts: TermAnalysisFacts): PolicyFindingDTO[];
}

// ---------------------------------------------------------------------------
// Savings plans (endowment / money-back / whole life / ULIP)
// ---------------------------------------------------------------------------

export interface SavingsRuleConstants {
  /**
   * Guaranteed annual return below this is a WARNING. Display heuristic, not a
   * regulatory figure: roughly what a bank fixed deposit or small-savings
   * scheme has paid recently.
   */
  lowReturnPct: number;
  /** Guaranteed return below this (but above lowReturnPct) is a NOTICE. */
  okReturnPct: number;
  /**
   * Sum assured under this multiple of the annual premium may not qualify for
   * tax-free maturity proceeds under Section 10(10D) (10x for policies issued
   * on or after 1 April 2012). A general summary, not tax advice.
   */
  minCoverMultiple: number;
  /** IRDAI cap on the annual fund management charge of a ULIP, in percent. */
  ulipFmcCapPct: number;
  /** First-year allocation charge above this is a WARNING. Heuristic. */
  allocationWarnPct: number;
  /** First-year allocation charge above this is a NOTICE. Heuristic. */
  allocationNoticePct: number;
  /** IRDAI minimum ULIP lock-in in years. */
  ulipLockInYears: number;
  /** A guaranteed surrender value starting after this policy year is a NOTICE. */
  lateSurrenderYear: number;
  standardSuicideMonths: number;
  minGraceDays: number;
  minGraceMonthlyDays: number;
}

export const DEFAULT_SAVINGS_RULE_CONSTANTS: SavingsRuleConstants = {
  lowReturnPct: 4,
  okReturnPct: 6.5,
  minCoverMultiple: 10,
  ulipFmcCapPct: 1.35,
  allocationWarnPct: 5,
  allocationNoticePct: 3,
  ulipLockInYears: 5,
  lateSurrenderYear: 3,
  standardSuicideMonths: 12,
  minGraceDays: 30,
  minGraceMonthlyDays: 15,
};

/**
 * The input to every savings rule. planKind comes from the insurance record
 * (ULIP vs ENDOWMENT / WHOLE_LIFE), never from anything extracted.
 */
export interface SavingsAnalysisFacts {
  asOf: string;
  userId: string;
  policyId: string;
  checkId: string;
  productType: 'SAVINGS';
  planKind: 'ULIP' | 'TRADITIONAL';
  constants: SavingsRuleConstants;
  extraction: SavingsExtraction;
  insurer: InsurerMetricsFacts | null;
  conflicts?: PolicyFieldConflict[];
}

export interface SavingsRule {
  id: string;
  version: string;
  category: PolicyFindingCategory;
  /** Pure, synchronous, no I/O. */
  evaluate(facts: SavingsAnalysisFacts): PolicyFindingDTO[];
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export interface MotorRuleConstants {
  /**
   * The usual compulsory owner-driver personal accident cover, in INR
   * (Rs 15 lakh for private cars and two-wheelers). A general summary, not
   * legal advice; the finding tells the user to check it.
   */
  usualOwnerDriverPaInr: number;
  /** Renewal reminder window, in days before expiry. */
  renewalWindowDays: number;
  /** Zero-depreciation and engine add-ons matter most up to this vehicle age. */
  addOnRelevantAgeYears: number;
  /** A voluntary deductible above this (INR) is a NOTICE. */
  voluntaryDeductibleNoticeInr: number;
  /** NCB at or above this percent, without protection, is worth protecting. */
  ncbProtectFromPercent: number;
}

export const DEFAULT_MOTOR_RULE_CONSTANTS: MotorRuleConstants = {
  usualOwnerDriverPaInr: 1_500_000,
  renewalWindowDays: 30,
  addOnRelevantAgeYears: 5,
  voluntaryDeductibleNoticeInr: 5_000,
  ncbProtectFromPercent: 35,
};

export interface MotorAnalysisFacts {
  asOf: string;
  userId: string;
  policyId: string;
  checkId: string;
  productType: 'MOTOR';
  constants: MotorRuleConstants;
  extraction: MotorExtraction;
  /** Always null: IRDAI motor claim data is not in the handbook tables we hold. */
  insurer: InsurerMetricsFacts | null;
  conflicts?: PolicyFieldConflict[];
}

export interface MotorRule {
  id: string;
  version: string;
  category: PolicyFindingCategory;
  /** Pure, synchronous, no I/O. */
  evaluate(facts: MotorAnalysisFacts): PolicyFindingDTO[];
}
