import type { Request, Response } from 'express';
import { z } from 'zod';
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
  addPremiumPayment,
  removePremiumPayment,
  addClaim,
  updateClaim,
  removeClaim,
  generateRenewalAlerts,
} from '../services/insurance.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const moneyString = z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string');

const createPolicySchema = z.object({
  insurer: z.string().min(1).max(200),
  policyNumber: z.string().min(1).max(100),
  type: z.enum(POLICY_TYPES),
  planName: z.string().max(300).nullable().optional(),
  policyHolder: z.string().min(1).max(200),
  nominees: z.unknown().optional(),
  sumAssured: moneyString,
  premiumAmount: moneyString,
  premiumFrequency: z.enum(PREMIUM_FREQUENCIES),
  startDate: isoDate,
  maturityDate: isoDate.nullable().optional(),
  nextPremiumDue: isoDate.nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  portfolioId: z.string().nullable().optional(),
  healthCoverDetails: z.unknown().optional(),
  status: z.enum(POLICY_STATUSES).optional(),
});

const updatePolicySchema = createPolicySchema.partial();

const addPremiumSchema = z.object({
  paidOn: isoDate,
  amount: moneyString,
  periodFrom: isoDate,
  periodTo: isoDate,
  canonicalEventId: z.string().nullable().optional(),
});

const addClaimSchema = z.object({
  claimNumber: z.string().max(100).nullable().optional(),
  claimDate: isoDate,
  claimType: z.string().min(1).max(200),
  claimedAmount: moneyString,
  status: z.enum(CLAIM_STATUSES),
  settledAmount: moneyString.nullable().optional(),
  settledOn: isoDate.nullable().optional(),
  documents: z.unknown().optional(),
});

const updateClaimSchema = addClaimSchema.partial();

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

export async function triggerRenewalAlertsHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const created = await generateRenewalAlerts(req.user.id);
  ok(res, { created });
}
