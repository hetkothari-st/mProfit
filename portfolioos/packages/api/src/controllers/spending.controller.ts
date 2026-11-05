import type { Request, Response } from 'express';
import { z } from 'zod';
import { SPEND_CATEGORIES } from '@everypaisa/shared';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { listUncategorisedPayees, setPayeeCategory } from '../services/spending/spendCategorisation.js';

const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(5) });
const tagSchema = z.object({
  payeeKey: z.string().trim().min(1).max(120),
  // null clears the user's tag; 'uncategorised' is not a choice.
  category: z.enum(SPEND_CATEGORIES.filter((c) => c !== 'uncategorised') as [string, ...string[]]).nullable(),
});

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

export async function uncategorisedHandler(req: Request, res: Response) {
  const { limit } = listSchema.parse(req.query);
  return ok(res, await listUncategorisedPayees(userId(req), limit));
}

export async function tagPayeeHandler(req: Request, res: Response) {
  const uid = userId(req);
  const body = tagSchema.parse(req.body);
  const changed = await setPayeeCategory(uid, body.payeeKey, body.category);
  return ok(res, { changed, uncategorised: await listUncategorisedPayees(uid) });
}
