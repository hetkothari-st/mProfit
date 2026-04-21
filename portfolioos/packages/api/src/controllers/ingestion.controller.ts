import type { Request, Response } from 'express';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { checkBudget } from '../ingestion/llm/budget.js';

/**
 * §6.11 / §17 LLM spend gauge.
 *
 * Returns the current month-to-date spend alongside the warn / cap
 * thresholds, so the web UI can render a budget bar and surface the
 * "warn" and "capped" states that `checkBudget` already classifies
 * server-side.
 *
 * Money fields serialise as strings (§3.2) — the bar's math happens
 * in `decimal.js` on the client, not as floats.
 */
export async function getBudget(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const b = await checkBudget(req.user.id);
  ok(res, {
    status: b.status,
    spentInr: b.spent.toString(),
    warnInr: b.warn.toString(),
    capInr: b.cap.toString(),
  });
}
