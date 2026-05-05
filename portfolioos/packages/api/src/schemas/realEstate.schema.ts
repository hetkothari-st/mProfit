/**
 * Zod validation schemas for the real-estate (`OwnedProperty`) endpoints.
 * Kept in a dedicated file rather than inline in the controller to make
 * the request shape easy to review independent of handler logic.
 */

import { z } from 'zod';
import {
  PROPERTY_TYPES,
  PROPERTY_STATUSES,
  OWNERSHIP_TYPES,
  MAINTENANCE_FREQUENCIES,
} from '@portfolioos/shared';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Expected decimal string');
const moneyString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string');

export const createOwnedPropertySchema = z.object({
  name: z.string().min(1).max(200),
  propertyType: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES).optional(),
  portfolioId: z.string().nullable().optional(),

  address: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  pincode: z.string().max(10).nullable().optional(),
  country: z.string().max(100).optional(),

  builtUpSqft: decimalString.nullable().optional(),
  carpetSqft: decimalString.nullable().optional(),
  plotAreaSqft: decimalString.nullable().optional(),
  floors: z.number().int().min(0).max(500).nullable().optional(),

  ownershipType: z.enum(OWNERSHIP_TYPES).optional(),
  ownershipPercent: decimalString.optional(),
  coOwners: z.string().max(500).nullable().optional(),

  purchaseDate: isoDate.nullable().optional(),
  purchasePrice: moneyString.nullable().optional(),
  stampDuty: moneyString.nullable().optional(),
  registrationFee: moneyString.nullable().optional(),
  brokerage: moneyString.nullable().optional(),
  otherCosts: moneyString.nullable().optional(),

  currentValue: moneyString.nullable().optional(),
  currentValueSource: z.string().max(60).nullable().optional(),
  currentValueAsOf: z.string().nullable().optional(),

  loanId: z.string().nullable().optional(),
  insurancePolicyId: z.string().nullable().optional(),
  rentalPropertyId: z.string().nullable().optional(),

  annualPropertyTax: moneyString.nullable().optional(),
  propertyTaxDueMonth: z.number().int().min(1).max(12).nullable().optional(),
  societyName: z.string().max(200).nullable().optional(),
  monthlyMaintenance: moneyString.nullable().optional(),
  maintenanceFrequency: z.enum(MAINTENANCE_FREQUENCIES).nullable().optional(),

  ownerName: z.string().max(200).nullable().optional(),
  electricityConsumerNo: z.string().max(60).nullable().optional(),
  waterConnectionNo: z.string().max(60).nullable().optional(),
  gasConnectionNo: z.string().max(60).nullable().optional(),
  khataNo: z.string().max(60).nullable().optional(),
  surveyNo: z.string().max(60).nullable().optional(),

  builderName: z.string().max(200).nullable().optional(),
  projectName: z.string().max(200).nullable().optional(),
  reraRegNo: z.string().max(100).nullable().optional(),
  expectedPossessionDate: isoDate.nullable().optional(),
  paymentSchedulePaidPct: decimalString.nullable().optional(),

  leaseholdEndDate: isoDate.nullable().optional(),

  notes: z.string().max(5000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateOwnedPropertySchema = createOwnedPropertySchema.partial();

export const markSoldSchema = z.object({
  saleDate: isoDate,
  salePrice: moneyString,
  saleBrokerage: moneyString.nullable().optional(),
});

export const refreshValueSchema = z.object({
  currentValue: moneyString,
  currentValueSource: z.string().max(60).nullable().optional(),
});
