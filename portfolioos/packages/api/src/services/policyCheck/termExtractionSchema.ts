/**
 * Term life policy extraction schema — Zod validator + the matching Anthropic
 * tool JSON Schema (a test asserts they cannot drift), exactly as for health.
 *
 * Every field carries confidence + source (doc, page, clause). Never invent:
 * anything not explicitly stated is NOT_FOUND with a null value.
 */

import { z } from 'zod';
import { arrayField, boolField, extractedField, intField, stringField } from './extractionSchema.js';

export const TermExtractionSchema = z.object({
  // ---- Basics ----
  insuredName: extractedField(z.string()),
  policyNumber: extractedField(z.string()),
  insurerName: extractedField(z.string()),
  planName: extractedField(z.string()),
  policyStartDate: extractedField(z.string()),
  ageAtEntry: extractedField(z.number().int().min(0).max(100)),
  smokerStatusDeclared: extractedField(z.string()),

  // ---- Cover and term ----
  sumAssured: extractedField(z.string()),
  policyTermYears: extractedField(z.number().int().min(1).max(100)),
  coverEndsAtAge: extractedField(z.number().int().min(1).max(120)),
  premiumAmountInr: extractedField(z.string()),
  premiumFrequency: extractedField(z.string()),
  premiumType: extractedField(z.string()),
  premiumPayingTermYears: extractedField(z.number().int().min(1).max(100)),

  // ---- Payout ----
  deathBenefitOption: extractedField(z.string()),
  coverIncreasesWithTime: extractedField(z.boolean()),

  // ---- Riders and in-built benefits ----
  criticalIllnessCover: extractedField(z.boolean()),
  criticalIllnessCoverInr: extractedField(z.string().nullable()),
  criticalIllnessCount: extractedField(z.number().int().min(0).nullable()),
  accidentalDeathBenefit: extractedField(z.boolean()),
  accidentalDeathBenefitInr: extractedField(z.string().nullable()),
  waiverOfPremium: extractedField(z.boolean()),
  terminalIllnessBenefit: extractedField(z.boolean()),
  returnOfPremium: extractedField(z.boolean()),

  // ---- Claim-protection terms ----
  suicideExclusionMonths: extractedField(z.number().int().min(0).max(120)),
  gracePeriodDays: extractedField(z.number().int().min(0).max(120)),
  revivalPeriodMonths: extractedField(z.number().int().min(0).max(240).nullable()),
  nomineePresent: extractedField(z.boolean()),

  // ---- Exclusions and other ----
  exclusions: extractedField(z.array(z.string())),
  otherBenefits: extractedField(z.array(z.string())),
});

export type TermExtraction = z.infer<typeof TermExtractionSchema>;

export const TERM_TOOL_JSON_SCHEMA = {
  type: 'object',
  required: ['insurerName', 'policyNumber', 'sumAssured'],
  properties: {
    insuredName: stringField('Full name of the life insured'),
    policyNumber: stringField('Policy number from the schedule'),
    insurerName: stringField('Name of the life insurer'),
    planName: stringField('Plan / product name'),
    policyStartDate: stringField('Date of commencement / risk start as YYYY-MM-DD'),
    ageAtEntry: intField('Age of the life insured at entry, in years'),
    smokerStatusDeclared: stringField('SMOKER or NON_SMOKER as declared in the policy. Null if not stated.'),

    sumAssured: stringField('Base sum assured / death benefit in INR (decimal string, no symbol or commas)'),
    policyTermYears: intField('Policy term (cover duration) in years'),
    coverEndsAtAge: intField('Age at which cover ends, ONLY if stated (e.g. "cover till age 70")'),
    premiumAmountInr: stringField('Annual premium excluding GST in INR (decimal string)'),
    premiumFrequency: stringField('ANNUAL | HALF_YEARLY | QUARTERLY | MONTHLY | SINGLE'),
    premiumType: stringField('REGULAR | LIMITED | SINGLE'),
    premiumPayingTermYears: intField('Number of years premiums are payable'),

    deathBenefitOption: stringField(
      'How the death benefit is paid: LUMP_SUM | MONTHLY_INCOME | LUMP_SUM_PLUS_INCOME | INCREASING | DECREASING | OTHER',
    ),
    coverIncreasesWithTime: boolField('Whether the sum assured steps up over time (inflation cover / increasing cover)'),

    criticalIllnessCover: boolField('Whether a critical illness benefit/rider is included'),
    criticalIllnessCoverInr: stringField('Critical illness sum in INR. Null if absent or not separately stated.'),
    criticalIllnessCount: intField('Number of critical illnesses covered. Null if not stated.'),
    accidentalDeathBenefit: boolField('Whether an accidental death benefit/rider is included'),
    accidentalDeathBenefitInr: stringField('Additional accidental death sum in INR. Null if absent.'),
    waiverOfPremium: boolField('Whether a waiver-of-premium benefit applies on disability / critical illness'),
    terminalIllnessBenefit: boolField('Whether the death benefit is paid early on terminal illness diagnosis'),
    returnOfPremium: boolField('Whether premiums are returned at maturity (return-of-premium / TROP plan)'),

    suicideExclusionMonths: intField('Months from start (or revival) during which death by suicide is excluded or limited'),
    gracePeriodDays: intField('Grace period for late premium payment, in days'),
    revivalPeriodMonths: intField('Period within which a lapsed policy can be revived, in months'),
    nomineePresent: boolField('Whether a nominee / beneficiary is recorded in the documents'),

    exclusions: arrayField('List of named exclusions (e.g. suicide, war, aviation, hazardous sports, non-disclosure)'),
    otherBenefits: arrayField('Other notable benefits listed in the policy'),
  },
} as const;

export const TERM_EXTRACTION_TOOL_NAME = 'extract_term_policy_data';
export const TERM_EXTRACTION_TOOL_DESCRIPTION =
  'Extract structured data from an Indian term life insurance policy document. ' +
  'Set every field to NOT_FOUND with a null value if not explicitly stated. Never invent or assume data. ' +
  'For coverEndsAtAge, nomineePresent and suicideExclusionMonths only report what the document states.';
