/**
 * Motor policy extraction schema (private car and two-wheeler).
 *
 * Zod validator + the matching Anthropic tool JSON Schema; a test asserts they
 * cannot drift. Every field carries confidence + source (doc, page, clause).
 * Anything not explicitly stated is NOT_FOUND with a null value. The vehicle
 * registration number is deliberately NOT extracted (it is an identifier).
 */

import { z } from 'zod';
import { arrayField, boolField, extractedField, intField, stringField } from './extractionSchema.js';

export const MotorExtractionSchema = z.object({
  // ---- Basics ----
  insuredName: extractedField(z.string()),
  policyNumber: extractedField(z.string()),
  insurerName: extractedField(z.string()),
  planName: extractedField(z.string()),
  policyStartDate: extractedField(z.string()),
  policyEndDate: extractedField(z.string()),
  vehicleMake: extractedField(z.string()),
  vehicleModel: extractedField(z.string()),
  manufacturingYear: extractedField(z.number().int().min(1950).max(2100)),

  // ---- Cover ----
  policyKind: extractedField(z.string()),
  idvInr: extractedField(z.string().nullable()),
  premiumAmountInr: extractedField(z.string()),

  // ---- No-claim bonus ----
  ncbPercent: extractedField(z.number().int().min(0).max(100)),
  ncbProtect: extractedField(z.boolean()),

  // ---- Add-ons ----
  zeroDepreciation: extractedField(z.boolean()),
  engineProtect: extractedField(z.boolean()),
  returnToInvoice: extractedField(z.boolean()),
  consumablesCover: extractedField(z.boolean()),
  roadsideAssistance: extractedField(z.boolean()),
  tyreProtect: extractedField(z.boolean()),
  keyReplacement: extractedField(z.boolean()),

  // ---- Personal accident ----
  ownerDriverPaInr: extractedField(z.string().nullable()),
  passengerPaInr: extractedField(z.string().nullable()),

  // ---- Deductibles ----
  compulsoryDeductibleInr: extractedField(z.string().nullable()),
  voluntaryDeductibleInr: extractedField(z.string().nullable()),

  // ---- Exclusions and other ----
  exclusions: extractedField(z.array(z.string())),
  otherBenefits: extractedField(z.array(z.string())),
});

export type MotorExtraction = z.infer<typeof MotorExtractionSchema>;

export const MOTOR_TOOL_JSON_SCHEMA = {
  type: 'object',
  required: ['insurerName', 'policyNumber', 'policyKind'],
  properties: {
    insuredName: stringField('Name of the policyholder / owner'),
    policyNumber: stringField('Policy number from the schedule'),
    insurerName: stringField('Name of the general insurer'),
    planName: stringField('Plan / product name'),
    policyStartDate: stringField('Start of the policy period as YYYY-MM-DD'),
    policyEndDate: stringField('End of the policy period (expiry) as YYYY-MM-DD'),
    vehicleMake: stringField('Vehicle manufacturer, e.g. Maruti Suzuki'),
    vehicleModel: stringField('Vehicle model and variant'),
    manufacturingYear: intField('Year of manufacture, 4 digits'),

    policyKind: stringField(
      'COMPREHENSIVE (own damage plus third party) | THIRD_PARTY_ONLY (liability cover only) | OWN_DAMAGE_ONLY (standalone own damage)',
    ),
    idvInr: stringField('Insured Declared Value (IDV) in INR (decimal string). Null for a third-party-only policy.'),
    premiumAmountInr: stringField('Total premium payable including GST, in INR (decimal string)'),

    ncbPercent: intField('No-claim bonus percentage applied this year, as a whole number (e.g. 50). 0 if none stated.'),
    ncbProtect: boolField('Whether the no-claim bonus protection add-on is included'),

    zeroDepreciation: boolField('Whether zero depreciation / nil depreciation / bumper-to-bumper cover is included'),
    engineProtect: boolField('Whether engine protect / engine and gearbox protection is included'),
    returnToInvoice: boolField('Whether return-to-invoice cover is included'),
    consumablesCover: boolField('Whether consumables cover is included'),
    roadsideAssistance: boolField('Whether roadside assistance is included'),
    tyreProtect: boolField('Whether tyre protect is included'),
    keyReplacement: boolField('Whether key / lock replacement cover is included'),

    ownerDriverPaInr: stringField('Compulsory personal accident cover for the owner-driver, in INR. Null if not covered or not stated.'),
    passengerPaInr: stringField('Personal accident cover for passengers / unnamed persons per person, in INR. Null if absent.'),

    compulsoryDeductibleInr: stringField('Compulsory deductible per claim in INR. Null if not stated.'),
    voluntaryDeductibleInr: stringField('Voluntary deductible the owner opted for, in INR. Null if none or not stated.'),

    exclusions: arrayField('List of named exclusions'),
    otherBenefits: arrayField('Other notable benefits listed in the policy'),
  },
} as const;

export const MOTOR_EXTRACTION_TOOL_NAME = 'extract_motor_policy_data';
export const MOTOR_EXTRACTION_TOOL_DESCRIPTION =
  'Extract structured data from an Indian motor insurance policy (private car or two-wheeler). ' +
  'Set every field to NOT_FOUND with a null value if not explicitly stated. Never invent or assume data. ' +
  'Do not extract the vehicle registration number or chassis / engine numbers.';
