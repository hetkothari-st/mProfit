/**
 * Personal accident policy extraction schema (individual or family cover).
 *
 * Zod validator + the matching Anthropic tool JSON Schema; a test asserts they
 * cannot drift. Every field carries confidence + source (doc, page, clause).
 * Anything not explicitly stated is NOT_FOUND with a null value. Occupation and
 * health details are deliberately NOT extracted.
 */

import { z } from 'zod';
import { arrayField, boolField, extractedField, intField, stringField } from './extractionSchema.js';

export const PaExtractionSchema = z.object({
  // ---- Basics ----
  insuredName: extractedField(z.string()),
  policyNumber: extractedField(z.string()),
  insurerName: extractedField(z.string()),
  planName: extractedField(z.string()),
  policyStartDate: extractedField(z.string()),
  policyEndDate: extractedField(z.string()),
  coverBasis: extractedField(z.string()),
  coverTerritory: extractedField(z.string()),
  premiumAmountInr: extractedField(z.string()),

  // ---- Lump-sum benefits ----
  accidentalDeathInr: extractedField(z.string().nullable()),
  permanentTotalDisabilityInr: extractedField(z.string().nullable()),
  permanentPartialDisabilityCovered: extractedField(z.boolean()),

  // ---- Recovery benefits ----
  temporaryDisabilityCovered: extractedField(z.boolean()),
  temporaryDisabilityWeeklyInr: extractedField(z.string().nullable()),
  temporaryDisabilityMaxWeeks: extractedField(z.number().int().min(1).max(520)),
  medicalExpensesCovered: extractedField(z.boolean()),
  medicalExpensesLimitInr: extractedField(z.string().nullable()),
  hospitalCashDailyInr: extractedField(z.string().nullable()),

  // ---- Extras ----
  childEducationBenefit: extractedField(z.boolean()),
  loanEmiCover: extractedField(z.boolean()),
  ambulanceCover: extractedField(z.boolean()),

  // ---- Exclusions and other ----
  exclusions: extractedField(z.array(z.string())),
  otherBenefits: extractedField(z.array(z.string())),
});

export type PaExtraction = z.infer<typeof PaExtractionSchema>;

export const PA_TOOL_JSON_SCHEMA = {
  type: 'object',
  required: ['insurerName', 'policyNumber', 'coverBasis'],
  properties: {
    insuredName: stringField('Name of the insured person (or the proposer for a family cover)'),
    policyNumber: stringField('Policy number from the schedule'),
    insurerName: stringField('Name of the insurer'),
    planName: stringField('Plan / product name'),
    policyStartDate: stringField('Start of the policy period as YYYY-MM-DD'),
    policyEndDate: stringField('End of the policy period (expiry) as YYYY-MM-DD'),
    coverBasis: stringField('INDIVIDUAL (one person) | FAMILY_FLOATER (one sum shared by several people)'),
    coverTerritory: stringField('WORLDWIDE (cover applies anywhere) | INDIA_ONLY (accidents in India only)'),
    premiumAmountInr: stringField('Total premium payable including GST, in INR (decimal string)'),

    accidentalDeathInr: stringField('Sum payable on accidental death, in INR (decimal string). Null if not stated.'),
    permanentTotalDisabilityInr: stringField('Sum payable on permanent total disability, in INR (decimal string). Null if not stated.'),
    permanentPartialDisabilityCovered: boolField('Whether permanent partial disability (loss of a limb, an eye, hearing, etc.) is paid as a share of the sum insured'),

    temporaryDisabilityCovered: boolField('Whether temporary total disablement (income loss while recovering) is covered'),
    temporaryDisabilityWeeklyInr: stringField('Weekly benefit for temporary total disablement, in INR. Null if absent or not stated.'),
    temporaryDisabilityMaxWeeks: intField('Maximum number of weeks the temporary disablement benefit is paid'),
    medicalExpensesCovered: boolField('Whether accident-related medical or hospital expenses are reimbursed'),
    medicalExpensesLimitInr: stringField('Limit for accident medical expenses in INR. Null if absent or not stated.'),
    hospitalCashDailyInr: stringField('Daily hospital cash benefit in INR. Null if absent.'),

    childEducationBenefit: boolField('Whether a child education benefit is included'),
    loanEmiCover: boolField('Whether loan EMI / loan protection cover is included'),
    ambulanceCover: boolField('Whether ambulance charges are covered'),

    exclusions: arrayField('List of named exclusions'),
    otherBenefits: arrayField('Other notable benefits listed in the policy'),
  },
} as const;

export const PA_EXTRACTION_TOOL_NAME = 'extract_personal_accident_policy_data';
export const PA_EXTRACTION_TOOL_DESCRIPTION =
  'Extract structured data from an Indian personal accident insurance policy. ' +
  'Set every field to NOT_FOUND with a null value if not explicitly stated. Never invent or assume data. ' +
  'Do not extract occupation, health details or the nominee.';
