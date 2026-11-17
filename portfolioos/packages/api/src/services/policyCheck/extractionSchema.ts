/**
 * Policy data extraction schema.
 *
 * Two representations of the same shape, guaranteed not to drift:
 *
 *  1. `PolicyExtractionSchema` — Zod validator. Used to validate the LLM's
 *     response after it returns via tool_use. Anything that fails the parse
 *     is recorded as a failure; the user can correct the fields manually.
 *
 *  2. `ANTHROPIC_TOOL_JSON_SCHEMA` — the JSON Schema passed to the Anthropic
 *     SDK's `tools: [{ input_schema }]`. Mirrors the Zod schema exactly.
 *
 * Both represent an `ExtractedPolicyField<T>` per field, so every value
 * carries confidence + source citation.
 *
 * The extraction test (`extractionSchema.test.ts`) asserts the two cannot
 * drift by comparing every field present in both.
 *
 * NEVER INVENT DATA: every rule that calls `extract` checks that fields
 * are EXTRACTED or USER_EDITED before trusting them, and the system prompt
 * instructs the model to set null with status NOT_FOUND rather than guess.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

export function extractedField<T extends z.ZodTypeAny>(valueType: T) {
  return z.object({
    value: valueType.nullable(),
    confidence: z.number().min(0).max(1),
    sourceDocId: z.string().nullable(),
    sourcePage: z.number().int().min(1).nullable(),
    clauseHeading: z.string().nullable(),
    status: z.enum(['EXTRACTED', 'USER_EDITED', 'NOT_FOUND']),
  });
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const PolicyExtractionSchema = z.object({
  // ---- Basic policy information ----
  insuredName: extractedField(z.string()),
  policyNumber: extractedField(z.string()),
  insurerName: extractedField(z.string()),
  planName: extractedField(z.string()),
  policyType: extractedField(z.string()),
  policyStartDate: extractedField(z.string()),
  policyEndDate: extractedField(z.string()),
  sumInsured: extractedField(z.string()),
  premiumAmountInr: extractedField(z.string()),
  adultsCount: extractedField(z.number().int().min(0)),
  childrenCount: extractedField(z.number().int().min(0)),

  // ---- Coverage ----
  inPatientCovered: extractedField(z.boolean()),
  dayCareCovered: extractedField(z.boolean()),
  preHospDays: extractedField(z.number().int().min(0)),
  postHospDays: extractedField(z.number().int().min(0)),
  ayushCovered: extractedField(z.boolean()),
  ambulanceCovered: extractedField(z.boolean()),
  ambulanceLimitInr: extractedField(z.string().nullable()),
  domiciliaryCovered: extractedField(z.boolean()),
  maternityCovered: extractedField(z.boolean()),
  maternityLimitInr: extractedField(z.string().nullable()),

  // ---- Financial restrictions ----
  copaymentPct: extractedField(z.string()),
  copaymentSeniorCitizenOnly: extractedField(z.boolean()),
  roomRentLimitType: extractedField(z.string()),
  roomRentLimitInr: extractedField(z.string().nullable()),
  roomRentLimitPct: extractedField(z.string().nullable()),
  proportionateDeductionApplies: extractedField(z.boolean()),
  diseaseSubLimits: extractedField(z.record(z.string(), z.string())),
  deductibleInr: extractedField(z.string().nullable()),
  cumulativeDeductibleInr: extractedField(z.string().nullable()),

  // ---- Waiting periods ----
  initialWaitingDays: extractedField(z.number().int().min(0)),
  pedWaitingDays: extractedField(z.number().int().min(0)),
  specificDiseaseWaitingDays: extractedField(z.number().int().min(0)),
  maternityWaitingDays: extractedField(z.number().int().min(0).nullable()),

  // ---- NCB ----
  ncbAvailable: extractedField(z.boolean()),
  ncbIncrementPct: extractedField(z.string().nullable()),
  ncbMaxPct: extractedField(z.string().nullable()),
  ncbType: extractedField(z.string().nullable()),

  // ---- Restoration ----
  restorationAvailable: extractedField(z.boolean()),
  restorationCount: extractedField(z.number().int().min(0).nullable()),
  restorationForSameIllness: extractedField(z.boolean().nullable()),
  restorationConditionsText: extractedField(z.string().nullable()),

  // ---- Exclusions ----
  permanentExclusions: extractedField(z.array(z.string())),
  specificExclusions: extractedField(z.array(z.string())),

  // ---- Benefits ----
  healthCheckupCovered: extractedField(z.boolean()),
  criticalIllnessCoverInr: extractedField(z.string().nullable()),
  opdCovered: extractedField(z.boolean()),
  opdLimitInr: extractedField(z.string().nullable()),
  otherBenefits: extractedField(z.array(z.string())),

  // ---- Continuity of cover (optional so checks extracted earlier still validate) ----
  continuousCoverSince: extractedField(z.string()).optional(),
  continuityCreditNote: extractedField(z.string().nullable()).optional(),
});

export type PolicyExtraction = z.infer<typeof PolicyExtractionSchema>;

// ---------------------------------------------------------------------------
// Anthropic tool JSON Schema (must match the Zod schema above exactly)
// ---------------------------------------------------------------------------

/** JSON Schema for one extracted field with a string value. */
function fieldSchema(
  valueSchema: object,
  description: string,
): object {
  return {
    type: 'object',
    description,
    required: ['value', 'confidence', 'sourceDocId', 'sourcePage', 'clauseHeading', 'status'],
    properties: {
      value: { ...valueSchema, nullable: true },
      confidence: { type: 'number', minimum: 0, maximum: 1, description: '0-1 confidence' },
      sourceDocId: { type: ['string', 'null'], description: 'PolicyExtractionDoc id' },
      sourcePage: { type: ['integer', 'null'], minimum: 1, description: '1-based page number' },
      clauseHeading: { type: ['string', 'null'], description: 'Clause or section heading' },
      status: { type: 'string', enum: ['EXTRACTED', 'USER_EDITED', 'NOT_FOUND'] },
    },
  };
}

export const stringField = (desc: string) => fieldSchema({ type: ['string', 'null'] }, desc);
export const boolField = (desc: string) => fieldSchema({ type: ['boolean', 'null'] }, desc);
export const intField = (desc: string) => fieldSchema({ type: ['integer', 'null'], minimum: 0 }, desc);
const recordField = (desc: string) =>
  fieldSchema({ type: ['object', 'null'], additionalProperties: { type: 'string' } }, desc);
export const arrayField = (desc: string) =>
  fieldSchema({ type: ['array', 'null'], items: { type: 'string' } }, desc);

export const ANTHROPIC_TOOL_JSON_SCHEMA = {
  type: 'object',
  required: ['insuredName', 'policyNumber', 'insurerName', 'planName', 'policyType'],
  properties: {
    // Basic info
    insuredName: stringField('Full name of insured / policyholder'),
    policyNumber: stringField('Policy number from the schedule'),
    insurerName: stringField('Name of insurer company'),
    planName: stringField('Plan or product name'),
    policyType: stringField('INDIVIDUAL, FAMILY_FLOATER, GROUP, SENIOR_CITIZEN, etc.'),
    policyStartDate: stringField('Policy start date as YYYY-MM-DD'),
    policyEndDate: stringField('Policy end date / renewal due date as YYYY-MM-DD'),
    sumInsured: stringField('Total sum insured in INR (decimal string, no symbol or commas)'),
    premiumAmountInr: stringField('Annual premium excluding GST (decimal string)'),
    adultsCount: intField('Number of adults covered'),
    childrenCount: intField('Number of children covered'),

    // Coverage
    inPatientCovered: boolField('Whether in-patient hospitalisation (IPD) is covered'),
    dayCareCovered: boolField('Whether day-care procedures are covered'),
    preHospDays: intField('Pre-hospitalisation coverage days'),
    postHospDays: intField('Post-hospitalisation coverage days'),
    ayushCovered: boolField('Whether AYUSH (Ayurveda/Yoga/Unani/Siddha/Homeopathy) is covered'),
    ambulanceCovered: boolField('Whether ambulance cover is included'),
    ambulanceLimitInr: stringField('Ambulance limit per hospitalisation in INR. Null if no cap.'),
    domiciliaryCovered: boolField('Whether domiciliary (home) treatment is covered'),
    maternityCovered: boolField('Whether maternity is covered'),
    maternityLimitInr: stringField('Maternity limit per delivery in INR. Null if no separate limit.'),

    // Financial restrictions
    copaymentPct: stringField('Co-payment percentage as decimal string (0 = no copay)'),
    copaymentSeniorCitizenOnly: boolField('Whether copayment applies only to senior citizens'),
    roomRentLimitType: stringField('ACTUAL | SUB_LIMIT_FIXED | SUB_LIMIT_PCT | NO_LIMIT'),
    roomRentLimitInr: stringField('Fixed room rent limit per day in INR. Null if percent-based.'),
    roomRentLimitPct: stringField('Room rent as % of sum insured per day. Null if fixed-amount.'),
    proportionateDeductionApplies: boolField(
      'Whether proportionate deductions apply when room exceeds limit. ONLY set to true if explicitly stated in the policy wording.',
    ),
    diseaseSubLimits: recordField('Map of disease name to limit amount in INR'),
    deductibleInr: stringField('Non-cumulative deductible amount in INR. Null if none.'),
    cumulativeDeductibleInr: stringField('Cumulative deductible (super top-up trigger) in INR. Null if none.'),

    // Waiting periods
    initialWaitingDays: intField('Initial waiting period days'),
    pedWaitingDays: intField('Pre-existing disease waiting period days'),
    specificDiseaseWaitingDays: intField('Specific disease waiting period days'),
    maternityWaitingDays: intField('Maternity waiting period days. Null if maternity not covered.'),

    // NCB
    ncbAvailable: boolField('Whether No-Claim Bonus is included'),
    ncbIncrementPct: stringField('NCB accumulation: % of SI added per claim-free year'),
    ncbMaxPct: stringField('Maximum NCB cap as % of base sum insured'),
    ncbType: stringField('BONUS_SI (sum insured increase) or PREMIUM_DISCOUNT'),

    // Restoration
    restorationAvailable: boolField('Whether the sum insured can be restored after exhaustion'),
    restorationCount: intField('Number of times restoration is available per policy year. Null = unlimited.'),
    restorationForSameIllness: boolField(
      'Whether restoration applies to the SAME illness. ONLY set if explicitly stated.',
    ),
    restorationConditionsText: stringField('Verbatim restoration conditions text from the document'),

    // Exclusions
    permanentExclusions: arrayField('List of named permanent exclusions'),
    specificExclusions: arrayField('List of disease-specific permanent exclusions'),

    // Benefits
    healthCheckupCovered: boolField('Whether annual health check-up is covered'),
    criticalIllnessCoverInr: stringField('Critical illness rider or in-built cover in INR. Null if absent.'),
    opdCovered: boolField('Whether OPD (out-patient department) is covered'),
    opdLimitInr: stringField('OPD annual limit in INR. Null if not separately capped.'),
    otherBenefits: arrayField('Other notable benefits listed in the policy'),

    // Continuity of cover
    continuousCoverSince: stringField(
      'YYYY-MM-DD from which the document STATES cover is continuous (with this or a previous insurer): ' +
        '"continuous coverage since", "date of first enrolment", "portability credit from". ' +
        'NOT the current policy start date unless the document says continuity begins there. Null if not stated.',
    ),
    continuityCreditNote: stringField(
      'Verbatim wording about continuity / portability / migration credit (e.g. waiting periods waived, credit granted). Null if absent.',
    ),
  },
} as const;

// ---------------------------------------------------------------------------
// Tool metadata
// ---------------------------------------------------------------------------

export const POLICY_EXTRACTION_TOOL_NAME = 'extract_policy_data';
export const POLICY_EXTRACTION_TOOL_DESCRIPTION =
  'Extract structured data from an Indian health insurance policy document. ' +
  'Set every field to NOT_FOUND with null value if not explicitly stated in the document. ' +
  'Never invent or assume data. For proportionateDeductionApplies and restorationForSameIllness, ' +
  'only set true if explicitly confirmed in the wording.';
