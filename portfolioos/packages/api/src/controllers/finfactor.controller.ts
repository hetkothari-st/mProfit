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
