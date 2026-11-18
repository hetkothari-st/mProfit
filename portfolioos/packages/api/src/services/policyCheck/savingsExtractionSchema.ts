/**
 * Savings-plan extraction schema (endowment, money-back, whole life, ULIP).
 *
 * One schema covers traditional and unit-linked plans: fields that do not
 * apply to a plan (e.g. fund charges on an endowment) are simply NOT_FOUND.
 * Zod validator + the matching Anthropic tool JSON Schema; a test asserts they
 * cannot drift. Every field carries confidence + source (doc, page, clause).
 */

import { z } from 'zod';
import { arrayField, boolField, extractedField, intField, stringField } from './extractionSchema.js';

export const SavingsExtractionSchema = z.object({
  // ---- Basics ----
  insuredName: extractedField(z.string()),
  policyNumber: extractedField(z.string()),
  insurerName: extractedField(z.string()),
  planName: extractedField(z.string()),
  policyStartDate: extractedField(z.string()),
  ageAtEntry: extractedField(z.number().int().min(0).max(100)),

  // ---- Cover and premium ----
  sumAssured: extractedField(z.string()),
  policyTermYears: extractedField(z.number().int().min(1).max(100)),
  premiumPayingTermYears: extractedField(z.number().int().min(1).max(100)),
  premiumAmountInr: extractedField(z.string()),
  premiumFrequency: extractedField(z.string()),
  premiumType: extractedField(z.string()),

  // ---- Traditional plans: what you get back ----
  maturityBenefitGuaranteedInr: extractedField(z.string().nullable()),
  maturityBenefitIllustratedInr: extractedField(z.string().nullable()),
  participating: extractedField(z.boolean()),
  survivalBenefits: extractedField(z.boolean()),
  guaranteedSurrenderFromYear: extractedField(z.number().int().min(0).max(100).nullable()),
  loanAvailable: extractedField(z.boolean()),

  // ---- ULIP: charges and lock-in ----
  premiumAllocationChargePct: extractedField(z.string().nullable()),
  fundManagementChargePct: extractedField(z.string().nullable()),
  policyAdminChargeStated: extractedField(z.boolean()),
  mortalityChargeStated: extractedField(z.boolean()),
  lockInYears: extractedField(z.number().int().min(0).max(30).nullable()),
  freeSwitchesPerYear: extractedField(z.number().int().min(0).max(100).nullable()),
  ulipDeathBenefitBasis: extractedField(z.string()),
  fundOptions: extractedField(z.array(z.string())),

  // ---- Claim and policy terms ----
  suicideExclusionMonths: extractedField(z.number().int().min(0).max(120)),
  gracePeriodDays: extractedField(z.number().int().min(0).max(120)),
  freeLookDays: extractedField(z.number().int().min(0).max(120)),
  nomineePresent: extractedField(z.boolean()),

  // ---- Exclusions and other ----
  exclusions: extractedField(z.array(z.string())),
  otherBenefits: extractedField(z.array(z.string())),
});

export type SavingsExtraction = z.infer<typeof SavingsExtractionSchema>;

export const SAVINGS_TOOL_JSON_SCHEMA = {
  type: 'object',
  required: ['insurerName', 'policyNumber', 'sumAssured'],
  properties: {
    insuredName: stringField('Full name of the life insured'),
    policyNumber: stringField('Policy number from the schedule'),
    insurerName: stringField('Name of the life insurer'),
    planName: stringField('Plan / product name'),
    policyStartDate: stringField('Date of commencement as YYYY-MM-DD'),
    ageAtEntry: intField('Age of the life insured at entry, in years'),

    sumAssured: stringField('Basic sum assured / death benefit in INR (decimal string, no symbol or commas)'),
    policyTermYears: intField('Policy term in years'),
    premiumPayingTermYears: intField('Number of years premiums are payable'),
    premiumAmountInr: stringField('Annual premium excluding GST in INR (decimal string)'),
    premiumFrequency: stringField('ANNUAL | HALF_YEARLY | QUARTERLY | MONTHLY | SINGLE'),
    premiumType: stringField('REGULAR | LIMITED | SINGLE'),

    maturityBenefitGuaranteedInr: stringField(
      'Total GUARANTEED amount payable at maturity in INR, only if the document states a guaranteed figure. Null for plans whose maturity amount depends on bonuses or fund performance.',
    ),
    maturityBenefitIllustratedInr: stringField(
      'Maturity amount shown in a benefit illustration at an assumed (non-guaranteed) bonus or return, in INR. Null if no illustration.',
    ),
    participating: boolField('Whether the plan shares in the insurer profits through bonuses (with-profits / participating)'),
    survivalBenefits: boolField('Whether money-back or survival benefits are paid during the term'),
    guaranteedSurrenderFromYear: intField(
      'Policy year from which a guaranteed surrender value is payable (e.g. 3 means after 3 years of premiums). Null if not stated.',
    ),
    loanAvailable: boolField('Whether a loan against the policy is available'),

    premiumAllocationChargePct: stringField(
      'Premium allocation charge in the FIRST policy year, as a percent number (e.g. "6.5"). ULIP only; null otherwise.',
    ),
    fundManagementChargePct: stringField(
      'Highest annual fund management charge among the fund options, as a percent number (e.g. "1.35"). ULIP only.',
    ),
    policyAdminChargeStated: boolField('Whether a policy administration charge is stated (ULIP)'),
    mortalityChargeStated: boolField('Whether mortality charges are stated (ULIP)'),
    lockInYears: intField('Lock-in period in years before partial withdrawal or surrender. ULIP only.'),
    freeSwitchesPerYear: intField('Number of free fund switches per year. ULIP only.'),
    ulipDeathBenefitBasis: stringField(
      'How a ULIP death benefit is set: HIGHER_OF (higher of sum assured and fund value) | SUM_ASSURED_PLUS_FUND (both are paid) | OTHER. Null if not a ULIP.',
    ),
    fundOptions: arrayField('Names of the fund options offered (ULIP)'),

    suicideExclusionMonths: intField('Months from start (or revival) during which death by suicide is excluded or limited'),
    gracePeriodDays: intField('Grace period for late premium payment, in days'),
    freeLookDays: intField('Free-look period in days'),
    nomineePresent: boolField('Whether a nominee is recorded in the documents'),

    exclusions: arrayField('List of named exclusions'),
    otherBenefits: arrayField('Other notable benefits listed in the policy'),
  },
} as const;

export const SAVINGS_EXTRACTION_TOOL_NAME = 'extract_savings_policy_data';
export const SAVINGS_EXTRACTION_TOOL_DESCRIPTION =
  'Extract structured data from an Indian endowment, money-back, whole-life or ULIP policy document. ' +
  'Set every field to NOT_FOUND with a null value if not explicitly stated. Never invent or assume data. ' +
  'Report maturity benefits only as stated: separate the guaranteed amount from any illustrated, non-guaranteed amount.';
