/**
 * API-boundary types for the Insurance Policy Health Check & Audit Engine.
 *
 * Same three conventions as mfAnalytics.types.ts:
 *  1. All money values are branded Money strings — never `number`.
 *  2. All dates are ISO strings — never `Date`.
 *  3. Missing/unknown is `null` with a status beside it, never `undefined`.
 *
 * This file is the contract layer between the API and the frontend.
 * Never redeclare these shapes locally on the frontend.
 */

import type { Money } from './decimal.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Lifecycle states of a PolicyHealthCheck run. */
export type PolicyCheckStatus =
  | 'EXTRACTING'
  | 'EXTRACTED'
  | 'VERIFIED'
  | 'ANALYZING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED';

/** How we classified a document the user uploaded. */
export type PolicyDocClassification =
  | 'POLICY_WORDING'
  | 'POLICY_SCHEDULE'
  | 'ENDORSEMENT'
  | 'OTHER';

/**
 * How serious a finding is. Mirrors MfFindingSeverity so the two layers read
 * consistently to a user seeing both analyses side-by-side.
 */
export type PolicyFindingSeverity = 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';

/**
 * What area of the policy a finding covers. Deterministic: a rule that changes
 * which category it uses must bump its version.
 */
export type PolicyFindingCategory =
  | 'CO_PAYMENT'
  | 'ROOM_RENT'
  | 'SUB_LIMIT'
  | 'WAITING_PERIOD'
  | 'NCB'
  | 'RESTORATION'
  | 'EXCLUSION'
  | 'BENEFIT'
  | 'COVERAGE'
  | 'OTHER';

/**
 * The overall health verdict: GREEN (strong policy), AMBER (notable
 * limitations), RED (serious gaps), INCOMPLETE (too little data to decide).
 * Informational/non-binding — mirrors the MF analytics verdict shape.
 */
export type PolicyVerdictKind = 'GREEN' | 'AMBER' | 'RED' | 'INCOMPLETE';

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * A traceable citation: exactly which document page and clause produced a
 * finding. Without this the finding is an opinion and the report is
 * unverifiable.
 */
export interface PolicyEvidence {
  /** Id of the PolicyExtractionDoc row. */
  docId: string;
  /** 1-based page number within the document. */
  page: number;
  /** Clause heading or section title if discernible. Null if not. */
  clauseHeading: string | null;
  /** Verbatim extracted text the finding rests on. */
  extractedText: string;
}

// ---------------------------------------------------------------------------
// Extracted fields
// ---------------------------------------------------------------------------

/**
 * A single field extracted from policy documents. The LLM must cite the source
 * for every non-null value; `NOT_FOUND` means the field was searched for and
 * not found, never that we forgot to search.
 */
export interface ExtractedPolicyField<T> {
  value: T | null;
  /** 0-1. Confidence in the extracted value. */
  confidence: number;
  /** Id of the PolicyExtractionDoc row this value came from. Null if NOT_FOUND. */
  sourceDocId: string | null;
  /** 1-based page number within the source document. Null if NOT_FOUND. */
  sourcePage: number | null;
  /** Clause heading where the value appeared. Null if NOT_FOUND. */
  clauseHeading: string | null;
  /** EXTRACTED = from document; USER_EDITED = user corrected it; NOT_FOUND = absent. */
  status: 'EXTRACTED' | 'USER_EDITED' | 'NOT_FOUND';
}

/** All structured data extracted from the user's policy documents. */
export interface ExtractedPolicyDataDTO {
  // ---- Basic policy information ----
  /** Full name of the insured / policy holder. */
  insuredName: ExtractedPolicyField<string>;
  /** Policy number as printed on the schedule. */
  policyNumber: ExtractedPolicyField<string>;
  /** Name of the insurer. */
  insurerName: ExtractedPolicyField<string>;
  /** Plan / product name. */
  planName: ExtractedPolicyField<string>;
  /** Policy type: INDIVIDUAL, FAMILY_FLOATER, GROUP, SENIOR_CITIZEN, etc. */
  policyType: ExtractedPolicyField<string>;
  /** ISO date of policy start. */
  policyStartDate: ExtractedPolicyField<string>;
  /** ISO date of policy end (renewal due date). */
  policyEndDate: ExtractedPolicyField<string>;
  /** Total sum insured. Money string. */
  sumInsured: ExtractedPolicyField<Money>;
  /** Annual premium (excluding GST). Money string. */
  premiumAmountInr: ExtractedPolicyField<Money>;
  /** Number of adults covered. */
  adultsCount: ExtractedPolicyField<number>;
  /** Number of children covered. */
  childrenCount: ExtractedPolicyField<number>;

  // ---- Coverage ----
  /** Whether in-patient hospitalisation (IPD) is covered. */
  inPatientCovered: ExtractedPolicyField<boolean>;
  /** Whether day-care procedures are covered. */
  dayCareCovered: ExtractedPolicyField<boolean>;
  /** Pre-hospitalisation coverage days. */
  preHospDays: ExtractedPolicyField<number>;
  /** Post-hospitalisation coverage days. */
  postHospDays: ExtractedPolicyField<number>;
  /** Whether AYUSH (Ayurveda/Yoga/Unani/Siddha/Homeopathy) is covered. */
  ayushCovered: ExtractedPolicyField<boolean>;
  /** Whether ambulance cover is included. */
  ambulanceCovered: ExtractedPolicyField<boolean>;
  /** Ambulance limit per hospitalisation. Money string. Null if not capped. */
  ambulanceLimitInr: ExtractedPolicyField<Money | null>;
  /** Whether domiciliary (home) treatment is covered. */
  domiciliaryCovered: ExtractedPolicyField<boolean>;
  /** Whether maternity is covered. */
  maternityCovered: ExtractedPolicyField<boolean>;
  /** Maternity limit per delivery. Money string. Null if no separate limit. */
  maternityLimitInr: ExtractedPolicyField<Money | null>;

  // ---- Financial restrictions ----
  /** Co-payment percentage (0-100). Zero means no co-pay. */
  copaymentPct: ExtractedPolicyField<string>;
  /** Whether co-payment applies only to senior citizens. */
  copaymentSeniorCitizenOnly: ExtractedPolicyField<boolean>;
  /** Room-rent limit type: ACTUAL, SUB_LIMIT_FIXED, SUB_LIMIT_PCT, NO_LIMIT. */
  roomRentLimitType: ExtractedPolicyField<string>;
  /** Fixed room rent limit per day. Money string. Null if percent-based. */
  roomRentLimitInr: ExtractedPolicyField<Money | null>;
  /** Room rent as % of sum insured per day. Null if fixed-amount. */
  roomRentLimitPct: ExtractedPolicyField<string | null>;
  /** Whether proportionate deductions apply when room exceeds limit. */
  proportionateDeductionApplies: ExtractedPolicyField<boolean>;
  /** Disease-specific sub-limits map: disease name → limit (Money string). */
  diseaseSubLimits: ExtractedPolicyField<Record<string, Money>>;
  /** Deductible amount (non-cumulative). Money string. Null if none. */
  deductibleInr: ExtractedPolicyField<Money | null>;
  /** Cumulative deductible (super top-up trigger). Money string. Null if none. */
  cumulativeDeductibleInr: ExtractedPolicyField<Money | null>;

  // ---- Waiting periods ----
  /** Initial waiting period (days) before any claim is accepted. */
  initialWaitingDays: ExtractedPolicyField<number>;
  /** PED (pre-existing disease) waiting period (days). */
  pedWaitingDays: ExtractedPolicyField<number>;
  /** Specific disease waiting period (days) for diseases listed separately. */
  specificDiseaseWaitingDays: ExtractedPolicyField<number>;
  /** Maternity waiting period (days). Null if maternity not covered. */
  maternityWaitingDays: ExtractedPolicyField<number | null>;

  // ---- NCB (No-Claim Bonus) ----
  /** Whether NCB is included. */
  ncbAvailable: ExtractedPolicyField<boolean>;
  /** NCB accumulation: % of SI added per claim-free year. */
  ncbIncrementPct: ExtractedPolicyField<string | null>;
  /** Maximum NCB cap as % of base sum insured. */
  ncbMaxPct: ExtractedPolicyField<string | null>;
  /** Whether NCB is in the form of an SI bonus or a premium discount. */
  ncbType: ExtractedPolicyField<string | null>;

  // ---- Restoration / super reinstatement ----
  /** Whether the sum insured can be restored after exhaustion. */
  restorationAvailable: ExtractedPolicyField<boolean>;
  /** Number of times restoration is available per policy year. */
  restorationCount: ExtractedPolicyField<number | null>;
  /** Whether restoration applies to the SAME illness as exhaustion. */
  restorationForSameIllness: ExtractedPolicyField<boolean | null>;
  /** Verbatim conditions text for restoration (from document). */
  restorationConditionsText: ExtractedPolicyField<string | null>;

  // ---- Permanent exclusions ----
  /** List of named permanent exclusions. */
  permanentExclusions: ExtractedPolicyField<string[]>;
  /** List of disease-specific permanent exclusions. */
  specificExclusions: ExtractedPolicyField<string[]>;

  // ---- Benefits ----
  /** Whether annual health check-up is covered. */
  healthCheckupCovered: ExtractedPolicyField<boolean>;
  /** Critical illness rider or in-built cover. Money string. Null if absent. */
  criticalIllnessCoverInr: ExtractedPolicyField<Money | null>;
  /** Whether OPD (out-patient department) is covered. */
  opdCovered: ExtractedPolicyField<boolean>;
  /** OPD annual limit. Money string. Null if not separately capped. */
  opdLimitInr: ExtractedPolicyField<Money | null>;
  /** Other notable benefits (free-text list from document). */
  otherBenefits: ExtractedPolicyField<string[]>;

  // ---- Continuity of cover (optional: absent on checks created earlier) ----
  /**
   * ISO date from which the DOCUMENT states cover has been continuous (with this
   * or a previous insurer): "continuous coverage since", "date of first
   * enrolment", "portability credit from". Never inferred from the policy start.
   */
  continuousCoverSince?: ExtractedPolicyField<string>;
  /** Verbatim continuity / portability credit wording, if any. */
  continuityCreditNote?: ExtractedPolicyField<string | null>;
}

/** Where a value in a document conflict came from. */
export interface PolicyConflictSource {
  value: string;
  docId: string | null;
  page: number | null;
  classification: PolicyDocClassification;
  clauseHeading: string | null;
}

/**
 * Two documents (or two places in one) give different values for the same
 * field. RESOLVED_BY_PRECEDENCE: a higher-precedence document type
 * (endorsement > schedule > wording) supplied `chosen`. UNRESOLVED: equal
 * precedence disagrees — the highest-confidence value was kept provisionally
 * and the user must confirm it.
 */
export interface PolicyFieldConflict {
  field: string;
  status: 'RESOLVED_BY_PRECEDENCE' | 'UNRESOLVED';
  chosen: PolicyConflictSource;
  other: PolicyConflictSource;
  reason: string;
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/** One specific observation about the policy with deterministic evidence. */
export interface PolicyFindingDTO {
  id: string;
  checkId: string;
  ruleId: string;
  ruleVersion: string;
  /** Stable code, e.g. `MANDATORY_COPAY_10PCT`. Used as a verdict reason. */
  code: string;
  category: PolicyFindingCategory;
  severity: PolicyFindingSeverity;
  /** 0-1. Evidence-quality confidence, not a probability. */
  confidence: string;
  /** ≤120 chars. Deterministic from a template; never LLM-authored. */
  headline: string;
  /** Evidence list — always non-empty. Every claim is traceable. */
  evidence: PolicyEvidence[];
  /** What the user would need to change (or know) to clear this finding. */
  whatWouldChangeThis: string;
  /** ISO date-time of the analysis run, not the wall clock. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

/** The overall verdict on the policy's health. Append-only; no row is edited. */
export interface PolicyVerdictDTO {
  id: string;
  checkId: string;
  verdict: PolicyVerdictKind;
  /** 0-100. Null if the analysis was INCOMPLETE. */
  score: string | null;
  /** Finding codes that drove this verdict, in decision-table order. */
  reasons: string[];
  /** LLM-narrated prose. Null until `proseVerified` is true. */
  prose: string | null;
  proseModel: string | null;
  proseVerified: boolean;
  /** Id of the newer verdict that superseded this one. Null if still current. */
  supersededById: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Check and document records
// ---------------------------------------------------------------------------

/** Summary of one document associated with a health check. */
export interface PolicyExtractionDocDTO {
  id: string;
  checkId: string;
  documentId: string;
  classification: PolicyDocClassification;
  pageCount: number;
  /** Whether OCR was used (scanned PDF or image). */
  ocrUsed: boolean;
}

/** Full health check record — what the polling endpoint and report page read. */
export interface PolicyHealthCheckDTO {
  id: string;
  userId: string;
  policyId: string;
  status: PolicyCheckStatus;
  /** ISO date-time of the reference snapshot used for analysis. */
  asOf: string;
  /** Engine run version string, e.g. `policy_check_v1`. */
  scoringVersion: string;
  /** What triggered this run: USER_REQUEST, DOCUMENT_UPLOAD, SCHEDULE. */
  triggeredBy: string;
  /** ISO date-time the run was created. */
  startedAt: string;
  /** ISO date-time the run completed. Null while still running. */
  completedAt: string | null;
  /** LLM cost for this run in INR. Null if no LLM was used. */
  llmSpendInr: string | null;
  docs: PolicyExtractionDocDTO[];
  /** Present after extraction completes. */
  extractedData: ExtractedPolicyDataDTO | null;
  /** Present after analysis completes. */
  findings: PolicyFindingDTO[];
  /** Present after verdict is decided. */
  verdict: PolicyVerdictDTO | null;
}

// ---------------------------------------------------------------------------
// Insurer intelligence
// ---------------------------------------------------------------------------

/** IRDAI-sourced metrics for a specific insurer and financial year. */
export interface InsurerMetricsDTO {
  id: string;
  insurerName: string;
  /** e.g. "2023-24". */
  financialYear: string;
  /**
   * Claim Settlement Ratio (% of claims settled by number).
   * NOT the same as ICR. CSR tells you how often claims are settled, not
   * what fraction of premium was paid out.
   */
  claimSettlementRatio: string | null;
  /**
   * Incurred Claim Ratio (claims incurred / net premium earned, as %).
   * NOT the same as CSR. ICR measures the insurer's loss ratio; a very high
   * ICR can indicate financial stress, a very low one potential under-claim
   * or over-pricing.
   */
  incurredClaimRatio: string | null;
  claimsTotal: number | null;
  claimsSettled: number | null;
  claimsPending: number | null;
  /** Claims repudiated in the year (by number). */
  claimsRepudiated: number | null;
  /** Health-segment net claims incurred, INR (Money string). */
  claimsIncurredInr: Money | null;
  /** Health-segment net earned premium, INR (Money string). */
  netEarnedPremiumInr: Money | null;
  /**
   * What the claim COUNTS cover. 'ALL_LINES' = the insurer also writes motor,
   * fire etc., so its settlement ratio is not health-specific.
   */
  claimsScope: 'HEALTH_ONLY' | 'ALL_LINES' | null;
  /** How claimSettlementRatio was computed. */
  methodology: string | null;
  /** Complaints per 10,000 policies, plus any other complaint data from IRDAI. */
  complaints: Record<string, unknown> | null;
  /** Source: "IRDAI Annual Report 2023-24". */
  source: string;
  /** ISO date-time this data was seeded / retrieved. */
  retrievedAt: string;
}

// ---------------------------------------------------------------------------
// Financial simulator
// ---------------------------------------------------------------------------

/** Inputs to the financial scenario simulator. */
export interface FinancialSimulatorInput {
  /** Total hospital bill (Money string). */
  totalBillInr: Money;
  /** Room rent charged per day (Money string). Null if not known. */
  roomRentPerDayInr: Money | null;
  /** Number of days of hospitalisation. Null if not known. */
  durationDays: number | null;
  /** Override the extracted co-payment % for scenario testing. */
  copaymentPctOverride: string | null;
  /** Override the extracted room rent limit for scenario testing. */
  roomRentLimitOverride: Money | null;
}

/** Output of the financial scenario simulator. */
export interface FinancialSimulatorOutput {
  /** Amount the insurer will pay. Money string. */
  insurerPayableInr: Money;
  /** User's co-payment contribution. Money string. */
  copaymentInr: Money;
  /** User's deductible contribution. Money string. Zero if no deductible. */
  deductibleInr: Money;
  /**
   * Room-rent deduction (proportionate). Money string.
   * ONLY set when the extracted data confirms proportionate deductions apply;
   * never assumed to be zero from the absence of a clause.
   */
  roomRentDeductionInr: Money;
  /** Other non-payable charges (e.g. registration fees, consumables). Money string. */
  otherNonPayableInr: Money;
  /** User's total out-of-pocket: copay + deductible + room deductions + other. */
  userContributionInr: Money;
  /**
   * Whether this is a partial estimate because some inputs were missing.
   * When true, `missingInputs` names exactly which ones.
   */
  isPartialEstimate: boolean;
  /** Names the specific inputs that are missing, so the user can supply them. */
  missingInputs: string[];
}

// ---------------------------------------------------------------------------
// Score snapshot (stored on PolicyHealthCheck.scoreSnapshot)
// ---------------------------------------------------------------------------

/** One scoring pillar's breakdown. */
export interface PolicyPillarScore {
  /** Pillar name, e.g. "coverage_comprehensiveness". */
  pillar: string;
  /** 0-100 score for this pillar. Null if insufficient data. */
  score: string | null;
  /** Post-redistribution weight applied to this pillar. */
  appliedWeight: string;
  /** Inputs that drove this pillar score. */
  inputs: Record<string, { value: string | null; note: string | null }>;
}

/** Stored on PolicyHealthCheck.scoreSnapshot and returned with the verdict. */
export interface PolicyScoreSnapshot {
  /** 0-100 overall. Null if INCOMPLETE_ANALYSIS. */
  overall: string | null;
  pillars: PolicyPillarScore[];
  /**
   * Rating category: 80-100 → Strong; 65-79 → Good;
   * 45-64 → Needs Attention; <45 → Significant Limitations;
   * null → INCOMPLETE_ANALYSIS.
   */
  ratingCategory: string | null;
  /** Top 2-3 aspects that pulled the score up. */
  strongestAspects: string[];
  /** Top 2-3 aspects that pulled the score down. */
  weakestAspects: string[];
  /**
   * Critical issues that the user must know regardless of score.
   * Populated from CRITICAL findings.
   */
  criticalIssues: string[];
  /**
   * Scoring engine version. Bump when weights or thresholds change, so a
   * stored snapshot stays interpretable by the version that produced it.
   */
  scoringVersion: string;
  /**
   * Whether the analysis was incomplete because too many fields were NOT_FOUND.
   * When true, `overall` is null and no rating is shown.
   */
  incompleteAnalysis: boolean;
}
