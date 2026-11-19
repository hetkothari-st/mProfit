/**
 * Home policy extraction schema (householder / home insurance for a house or flat).
 *
 * Zod validator + the matching Anthropic tool JSON Schema; a test asserts they
 * cannot drift. Every field carries confidence + source (doc, page, clause).
 * Anything not explicitly stated is NOT_FOUND with a null value. The property
 * address is deliberately NOT extracted (it is an identifier).
 */

import { z } from 'zod';
import { arrayField, boolField, extractedField, intField, stringField } from './extractionSchema.js';

export const HomeExtractionSchema = z.object({
  // ---- Basics ----
  insuredName: extractedField(z.string()),
  policyNumber: extractedField(z.string()),
  insurerName: extractedField(z.string()),
  planName: extractedField(z.string()),
  policyStartDate: extractedField(z.string()),
  policyEndDate: extractedField(z.string()),
  policyTermYears: extractedField(z.number().int().min(1).max(10)),

  // ---- What is covered, and for how much ----
  coverScope: extractedField(z.string()),
  sumInsuredStructureInr: extractedField(z.string().nullable()),
  sumInsuredContentsInr: extractedField(z.string().nullable()),
  valuationBasis: extractedField(z.string()),
  averageClause: extractedField(z.boolean()),
  premiumAmountInr: extractedField(z.string()),

  // ---- Perils ----
  floodCovered: extractedField(z.boolean()),
  earthquakeCovered: extractedField(z.boolean()),
  burglaryCovered: extractedField(z.boolean()),
  waterDamageCovered: extractedField(z.boolean()),

  // ---- Extras ----
  electronicsCovered: extractedField(z.boolean()),
  valuablesCovered: extractedField(z.boolean()),
  valuablesLimitInr: extractedField(z.string().nullable()),
  alternateAccommodationInr: extractedField(z.string().nullable()),
  publicLiabilityInr: extractedField(z.string().nullable()),
  personalAccidentInr: extractedField(z.string().nullable()),

  // ---- Deductible, exclusions ----
  deductibleInr: extractedField(z.string().nullable()),
  exclusions: extractedField(z.array(z.string())),
  otherBenefits: extractedField(z.array(z.string())),
});

export type HomeExtraction = z.infer<typeof HomeExtractionSchema>;

export const HOME_TOOL_JSON_SCHEMA = {
  type: 'object',
  required: ['insurerName', 'policyNumber', 'coverScope'],
  properties: {
    insuredName: stringField('Name of the policyholder'),
    policyNumber: stringField('Policy number from the schedule'),
    insurerName: stringField('Name of the general insurer'),
    planName: stringField('Plan / product name, e.g. Bharat Griha Raksha'),
    policyStartDate: stringField('Start of the policy period as YYYY-MM-DD'),
    policyEndDate: stringField('End of the policy period (expiry) as YYYY-MM-DD'),
    policyTermYears: intField('Length of the policy in years (1 for an annual policy, up to 10 for a long-term one)'),

    coverScope: stringField(
      'STRUCTURE_ONLY (the building only) | CONTENTS_ONLY (belongings only) | STRUCTURE_AND_CONTENTS (both)',
    ),
    sumInsuredStructureInr: stringField('Sum insured for the building / structure in INR (decimal string). Null if the building is not covered or not stated.'),
    sumInsuredContentsInr: stringField('Sum insured for household contents in INR (decimal string). Null if contents are not covered or not stated.'),
    valuationBasis: stringField(
      'How a claim is valued: REINSTATEMENT (cost to rebuild or replace new) | MARKET_VALUE | DEPRECIATED (market value or cost less wear and tear). Use the wording of the claim settlement clause.',
    ),
    averageClause: boolField('Whether the policy has an average / under-insurance clause that cuts a claim in proportion when the sum insured is below the true value'),
    premiumAmountInr: stringField('Total premium payable including GST, in INR (decimal string)'),

    floodCovered: boolField('Whether flood / inundation / storm / cyclone damage is covered'),
    earthquakeCovered: boolField('Whether earthquake damage is covered'),
    burglaryCovered: boolField('Whether burglary / theft / house-breaking is covered'),
    waterDamageCovered: boolField('Whether damage from bursting or overflowing pipes and tanks is covered'),

    electronicsCovered: boolField('Whether breakdown of electrical and electronic appliances is covered'),
    valuablesCovered: boolField('Whether jewellery and valuables are covered'),
    valuablesLimitInr: stringField('Maximum payable for jewellery and valuables in INR. Null if absent.'),
    alternateAccommodationInr: stringField('Cover for rent or alternate accommodation after a loss, in INR. Null if absent.'),
    publicLiabilityInr: stringField('Public / third-party liability cover in INR. Null if absent.'),
    personalAccidentInr: stringField('Personal accident cover in INR. Null if absent.'),

    deductibleInr: stringField('Deductible / excess per claim in INR. Null if not stated.'),
    exclusions: arrayField('List of named exclusions'),
    otherBenefits: arrayField('Other notable benefits listed in the policy'),
  },
} as const;

export const HOME_EXTRACTION_TOOL_NAME = 'extract_home_policy_data';
export const HOME_EXTRACTION_TOOL_DESCRIPTION =
  'Extract structured data from an Indian home / householder insurance policy. ' +
  'Set every field to NOT_FOUND with a null value if not explicitly stated. Never invent or assume data. ' +
  'Do not extract the property address.';
