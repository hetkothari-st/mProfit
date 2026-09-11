import type { Request, Response } from 'express';
import { z } from 'zod';
import { CLAIM_KINDS, TAX_BUCKETS } from '@portfolioos/shared';
import {
  POLICY_TYPES,
  PREMIUM_FREQUENCIES,
  POLICY_STATUSES,
  CLAIM_STATUSES,
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  revealPolicyNumber,
  addPremiumPayment,
  removePremiumPayment,
  addClaim,
  updateClaim,
  removeClaim,
  generateRenewalAlerts,
} from '../services/insurance.service.js';
import {
  dismissImportSuggestion,
  getTaxSummary,
  linkImportedPremium,
  listImportSuggestions,
} from '../services/insuranceExtras.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const moneyString = z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string');
const text = (max: number) => z.string().max(max).nullable().optional();

// Business rules (shares total 100, a minor needs an appointee, valid emails)
// are checked in the service.
const nomineeSchema = z.object({
  name: z.string().max(100),
  relation: z.string().max(50),
  sharePercent: z.number().min(0).max(100).nullable().optional(),
  isMinor: z.boolean().optional(),
  appointeeName: text(100),
  appointeeRelation: text(50),
});

const contactsSchema = z.object({
  helpline: text(200),
  claimEmail: text(200),
  claimUrl: text(200),
  tpaName: text(200),
  tpaHelpline: text(200),
  agentName: text(200),
  agentPhone: text(200),
  agentEmail: text(200),
});

const createPolicySchema = z.object({
  insurer: z.string().min(1).max(200),
  policyNumber: z.string().min(1).max(100),
  type: z.enum(POLICY_TYPES),
  planName: z.string().max(300).nullable().optional(),
  policyHolder: z.string().min(1).max(200),
  nominees: z.array(nomineeSchema).max(10).nullable().optional(),
  contacts: contactsSchema.nullable().optional(),
  sumAssured: moneyString,
  premiumAmount: moneyString,
  premiumFrequency: z.enum(PREMIUM_FREQUENCIES),
  startDate: isoDate,
  maturityDate: isoDate.nullable().optional(),
  nextPremiumDue: isoDate.nullable().optional(),
  gracePeriodDays: z.number().int().min(0).max(90).nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  portfolioId: z.string().nullable().optional(),
  healthCoverDetails: z.unknown().optional(),
  status: z.enum(POLICY_STATUSES).optional(),
  // Which policy types these fit is checked in the service.
  taxBucket: z.enum(TAX_BUCKETS).nullable().optional(),
  seniorCitizen: z.boolean().nullable().optional(),
  surrenderValue: moneyString.nullable().optional(),
  surrenderValueAsOf: isoDate.nullable().optional(),
  criticalIllnessCover: z.boolean().nullable().optional(),
  criticalIllnessSumAssured: moneyString.nullable().optional(),
});

// On update the number is optional: leave it out to keep the saved one.
const updatePolicySchema = createPolicySchema.partial();

const addPremiumSchema = z.object({
  paidOn: isoDate,
  amount: moneyString,
  periodFrom: isoDate,
  periodTo: isoDate,
  canonicalEventId: z.string().nullable().optional(),
});

// Cross-field rules (the guide fits the policy, checklist ids exist, dates in
// order) are checked in the service.
const addClaimSchema = z.object({
  claimNumber: z.string().max(100).nullable().optional(),
  claimDate: isoDate,
  claimType: z.string().min(1).max(200),
  claimedAmount: moneyString,
  status: z.enum(CLAIM_STATUSES),
  settledAmount: moneyString.nullable().optional(),
  settledOn: isoDate.nullable().optional(),
  documents: z.unknown().optional(),
  kind: z.enum(CLAIM_KINDS).nullable().optional(),
  documentsCompletedOn: isoDate.nullable().optional(),
  surveyorAllocatedOn: isoDate.nullable().optional(),
  checklist: z.record(z.boolean()).nullable().optional(),
  timeline: z
    .array(z.object({ on: z.string().max(10), note: z.string().max(500) }))
    .max(200)
    .nullable()
    .optional(),
  rejectionReason: text(1000),
  grievanceFiledOn: isoDate.nullable().optional(),
  grievanceRef: text(100),
  ombudsmanFiledOn: isoDate.nullable().optional(),
  ombudsmanRef: text(100),
});

const updateClaimSchema = addClaimSchema.partial();

const importedPremiumSchema = z.object({ transactionId: z.string().min(1).max(64) });

const taxSummaryQuery = z.object({
  fy: z.string().regex(/^\d{4}-\d{2}$/, 'Expected a financial year like 2026-27').optional(),
});

export async function listPoliciesHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const policies = await listPolicies(req.user.id);
  ok(res, policies);
}

export async function getPolicyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const policy = await getPolicy(req.user.id, req.params['id']!);
  ok(res, policy);
}

export async function createPolicyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createPolicySchema.parse(req.body);
  const policy = await createPolicy(req.user.id, body);
  res.status(201);
  ok(res, policy);
}

export async function updatePolicyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updatePolicySchema.parse(req.body);
  const policy = await updatePolicy(req.user.id, req.params['id']!, body);
  ok(res, policy);
}

export async function deletePolicyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deletePolicy(req.user.id, req.params['id']!);
  ok(res, null);
}

export async function revealPolicyNumberHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const policyNumber = await revealPolicyNumber(req.user.id, req.params['id']!, {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  });
  // Plaintext PII: keep it out of browser and proxy caches.
  res.set('Cache-Control', 'no-store');
  ok(res, { policyNumber });
}

export async function addPremiumHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = addPremiumSchema.parse(req.body);
  const payment = await addPremiumPayment(req.user.id, req.params['id']!, body);
  res.status(201);
  ok(res, payment);
}

export async function removePremiumHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await removePremiumPayment(req.user.id, req.params['paymentId']!);
  ok(res, null);
}

export async function addClaimHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = addClaimSchema.parse(req.body);
  const claim = await addClaim(req.user.id, req.params['id']!, body);
  res.status(201);
  ok(res, claim);
}

export async function updateClaimHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateClaimSchema.parse(req.body);
  const claim = await updateClaim(req.user.id, req.params['claimId']!, body);
  ok(res, claim);
}

export async function removeClaimHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await removeClaim(req.user.id, req.params['claimId']!);
  ok(res, null);
}

export async function listImportSuggestionsHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await listImportSuggestions(req.user.id, req.params['id']!));
}

export async function linkImportedPremiumHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { transactionId } = importedPremiumSchema.parse(req.body);
  const payment = await linkImportedPremium(req.user.id, req.params['id']!, transactionId);
  res.status(201);
  ok(res, payment);
}

export async function dismissImportSuggestionHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { transactionId } = importedPremiumSchema.parse(req.body);
  await dismissImportSuggestion(req.user.id, req.params['id']!, transactionId);
  ok(res, null);
}

export async function taxSummaryHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { fy } = taxSummaryQuery.parse(req.query);
  ok(res, await getTaxSummary(req.user.id, fy));
}

export async function triggerRenewalAlertsHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const created = await generateRenewalAlerts(req.user.id);
  ok(res, { created });
}
