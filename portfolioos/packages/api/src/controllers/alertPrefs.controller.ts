import type { Request, Response } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { getLoanAlertPrefs, setLoanAlertPrefs } from '../services/notifications/alertPrefs.service.js';

const prefsBody = z.object({ loanRateAlerts: z.boolean() }).strict();

/** GET /api/notifications/preferences */
export async function getAlertPrefsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await getLoanAlertPrefs(req.user.id));
}

/** PUT /api/notifications/preferences */
export async function putAlertPrefsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const prefs = prefsBody.parse(req.body);
  ok(res, await setLoanAlertPrefs(req.user.id, prefs));
}
