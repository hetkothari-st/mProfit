/**
 * Finfactor (Account Aggregator) controller.
 *
 * Thin HTTP layer over the documented Wealthscape Mutual Fund endpoints.
 * The body is parsed with Zod for safety, then forwarded verbatim to
 * Finfactor; the response is returned as-is so the UI can show the raw
 * sandbox JSON. Auth is delegated to the route's authenticate middleware
 * — the *user* is authenticated against PortfolioOS, but the upstream
 * call uses the FIU channel token from env (FINFACTOR_API_TOKEN).
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../lib/response.js';
import { BadRequestError, UnauthorizedError } from '../lib/errors.js';
import { finfactorBaseUrl, isFinfactorConfigured } from '../integrations/finfactor/client.js';
import { isFinfactorDemoMode } from '../integrations/finfactor/demo.js';
import {
  fetchBenchmarkPointToPoint,
  fetchBenchmarkTrailing,
  fetchMfAnalysis,
  fetchMfHoldingsByIsin,
  fetchMfInsights,
  fetchMfInsightsNoPii,
  fetchMfLinkedAccounts,
  fetchMfLinkedAccountsHoldingFolio,
  fetchMfStatement,
} from '../integrations/finfactor/mf.service.js';
import {
  approveConsentDemo,
  decryptEcres,
  initiateConsent,
  listUserConsents,
  revokeConsent,
} from '../integrations/finfactor/consent.service.js';
import { syncFinvuMutualFunds } from '../integrations/finfactor/sync.service.js';
import {
  handleCohortWebhook,
  handleConsentWebhook,
  handleDataWebhook,
  handleHistoricalWebhook,
  handleSubscriptionWebhook,
  pickSignatureHeader,
  verifyWebhookSignature,
} from '../integrations/finfactor/webhooks.service.js';

const baseSchema = z.object({
  uniqueIdentifier: z.string().min(1, 'uniqueIdentifier is required'),
});

const insightsSchema = baseSchema.extend({
  filterZeroValueAccounts: z.boolean().optional(),
  filterZeroValueHoldings: z.boolean().optional(),
});

const linkedAccountsSchema = baseSchema.extend({
  filterCdslNsdl: z.boolean().optional(),
  filterZeroValueAccounts: z.boolean().optional(),
  filterZeroValueHoldings: z.boolean().optional(),
});

const statementSchema = baseSchema.extend({
  txnOrder: z.enum(['ASC', 'DESC']).optional(),
  dateRangeFrom: z.string().optional(),
  dateRangeTo: z.string().optional(),
  isins: z.array(z.string()).optional(),
  accountIds: z.array(z.string()).optional(),
  maskedFolioNos: z.array(z.string()).optional(),
  filterCdslNsdl: z.boolean().optional(),
});

const analysisSchema = baseSchema.extend({
  filterCdslNsdl: z.boolean().optional(),
  filterZeroValueAccounts: z.boolean().optional(),
  filterZeroValueHoldings: z.boolean().optional(),
});

const benchmarkTrailingSchema = z.object({
  benchmarks: z.string().min(1, 'benchmarks is required (comma-separated codes)'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  ranges: z.string().min(1, 'ranges is required (e.g. "1M,3M,1Y")'),
});

const benchmarkP2PSchema = z.object({
  benchmarks: z.string().min(1, 'benchmarks is required'),
  point_1: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'point_1 must be YYYY-MM-DD'),
  point_2: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'point_2 must be YYYY-MM-DD'),
});

function ensureAuth(req: Request): void {
  if (!req.user) throw new UnauthorizedError();
  if (!isFinfactorConfigured()) {
    throw new BadRequestError(
      'Finfactor is not configured. Set FINFACTOR_API_TOKEN in the API env.',
    );
  }
}

export async function getFinfactorStatus(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, {
    configured: isFinfactorConfigured(),
    demoMode: isFinfactorDemoMode(),
    baseUrl: finfactorBaseUrl(),
  });
}

export async function postMfInsights(req: Request, res: Response) {
  ensureAuth(req);
  const body = insightsSchema.parse(req.body);
  const data = await fetchMfInsights(body);
  ok(res, data);
}

export async function postMfInsightsNoPii(req: Request, res: Response) {
  ensureAuth(req);
  const body = insightsSchema.parse(req.body);
  const data = await fetchMfInsightsNoPii(body);
  ok(res, data);
}

export async function postMfLinkedAccounts(req: Request, res: Response) {
  ensureAuth(req);
  const body = linkedAccountsSchema.parse(req.body);
  const data = await fetchMfLinkedAccounts(body);
  ok(res, data);
}

export async function postMfLinkedAccountsHoldingFolio(req: Request, res: Response) {
  ensureAuth(req);
  const body = linkedAccountsSchema.parse(req.body);
  const data = await fetchMfLinkedAccountsHoldingFolio(body);
  ok(res, data);
}

export async function postMfStatement(req: Request, res: Response) {
  ensureAuth(req);
  const body = statementSchema.parse(req.body);
  const data = await fetchMfStatement(body);
  ok(res, data);
}

export async function postMfAnalysis(req: Request, res: Response) {
  ensureAuth(req);
  const body = analysisSchema.parse(req.body);
  const data = await fetchMfAnalysis(body);
  ok(res, data);
}

export async function postMfHoldingByIsin(req: Request, res: Response) {
  ensureAuth(req);
  const isin = req.params['isin'];
  if (!isin) throw new BadRequestError('isin path param required');
  const body = linkedAccountsSchema.parse(req.body);
  const data = await fetchMfHoldingsByIsin(isin, body);
  ok(res, data);
}

export async function postBenchmarkTrailing(req: Request, res: Response) {
  ensureAuth(req);
  const body = benchmarkTrailingSchema.parse(req.body);
  const data = await fetchBenchmarkTrailing(body);
  ok(res, data);
}

export async function postBenchmarkPointToPoint(req: Request, res: Response) {
  ensureAuth(req);
  const body = benchmarkP2PSchema.parse(req.body);
  const data = await fetchBenchmarkPointToPoint(body);
  ok(res, data);
}

// ─── Consent ────────────────────────────────────────────────────────────────

const consentInitiateSchema = z.object({
  fiTypes: z.array(z.string()).optional(),
  fipIds: z.array(z.string()).optional(),
  purposeCode: z.string().optional(),
  purposeText: z.string().optional(),
  durationDays: z.number().int().positive().optional(),
  customerIdentifier: z.string().optional(),
});

export async function postConsentInitiate(req: Request, res: Response) {
  ensureAuth(req);
  const body = consentInitiateSchema.parse(req.body ?? {});
  const result = await initiateConsent(req.user!.id, body);
  ok(res, result);
}

export async function getConsents(req: Request, res: Response) {
  ensureAuth(req);
  const consents = await listUserConsents(req.user!.id);
  ok(res, consents);
}

export async function postConsentRevoke(req: Request, res: Response) {
  ensureAuth(req);
  const handle = req.params['handle'];
  if (!handle) throw new BadRequestError('consent handle path param required');
  const result = await revokeConsent(req.user!.id, handle);
  ok(res, result);
}

export async function postConsentApproveDemo(req: Request, res: Response) {
  ensureAuth(req);
  if (!isFinfactorDemoMode()) {
    throw new BadRequestError('consent demo-approve is only available in demo mode');
  }
  const handle = req.params['handle'];
  if (!handle) throw new BadRequestError('consent handle path param required');
  const result = await approveConsentDemo(req.user!.id, handle);
  ok(res, result);
}

const ecresSchema = z.object({ ecres: z.string().min(1) });
export async function postDecryptEcres(req: Request, res: Response) {
  ensureAuth(req);
  const { ecres } = ecresSchema.parse(req.body ?? {});
  const decoded = await decryptEcres(ecres);
  ok(res, decoded);
}

// ─── Sync (project Finvu MF data into portfolio holdings) ───────────────────

const syncSchema = z.object({
  uniqueIdentifier: z.string().min(1),
  portfolioId: z.string().optional(),
});

export async function postSyncMutualFunds(req: Request, res: Response) {
  ensureAuth(req);
  const body = syncSchema.parse(req.body ?? {});
  const result = await syncFinvuMutualFunds(req.user!.id, body);
  ok(res, result);
}

// ─── Webhook handlers (unauthenticated; HMAC-verified) ──────────────────────
//
// Mounted on a separate router because they cannot use the `authenticate`
// middleware — Finvu doesn't supply our JWT. Each handler verifies the
// X-Finfactor-Signature header against FINFACTOR_WEBHOOK_SECRET and then
// dispatches to the service-level handler.

type WebhookKind = 'consent' | 'data' | 'historical' | 'cohort' | 'subscription';

function makeWebhookHandler(kind: WebhookKind) {
  return async function (req: Request, res: Response) {
    const signature = pickSignatureHeader(req.headers as Record<string, string | string[] | undefined>);
    const rawBody = JSON.stringify(req.body ?? {});
    if (!verifyWebhookSignature(rawBody, signature)) {
      res.status(401);
      ok(res, { ok: false, reason: 'invalid_signature' });
      return;
    }
    let result;
    switch (kind) {
      case 'consent':
        result = await handleConsentWebhook(req.body);
        break;
      case 'data':
        result = await handleDataWebhook(req.body);
        break;
      case 'historical':
        result = await handleHistoricalWebhook(req.body);
        break;
      case 'cohort':
        result = await handleCohortWebhook(req.body);
        break;
      case 'subscription':
        result = await handleSubscriptionWebhook(req.body);
        break;
    }
    ok(res, result);
  };
}

export const postConsentWebhook = makeWebhookHandler('consent');
export const postDataWebhook = makeWebhookHandler('data');
export const postHistoricalWebhook = makeWebhookHandler('historical');
export const postCohortWebhook = makeWebhookHandler('cohort');
export const postSubscriptionWebhook = makeWebhookHandler('subscription');
