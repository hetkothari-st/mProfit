import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import {
  getInsuranceFetchStatus,
  scanInsuranceNow,
  setInsuranceFetch,
} from '../services/insurance/insuranceGmailFetch.service.js';

/** Which Gmail accounts may be searched for insurance documents, and how the last scan went. */
export async function getInsuranceFetchHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await getInsuranceFetchStatus(req.user.id));
}

/** Give or withdraw permission for one Gmail account. */
export async function setInsuranceFetchHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body ?? {});
  ok(res, await setInsuranceFetch(req.user.id, req.params.mailboxId!, enabled, req));
}

export async function scanInsuranceNowHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await scanInsuranceNow(req.user.id, req.params.mailboxId!));
}
