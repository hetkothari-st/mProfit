import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { getActOnItView, getAdviceWhy } from '../services/actOnIt/view.js';
import { acceptAdvice, dismissAdvice, markDoneElsewhere, snoozeAdvice } from '../services/actOnIt/lifecycle.js';
import { markPopupSeen, pendingPopup } from '../services/actOnIt/prompts.js';

const idSchema = z.string().trim().min(1).max(64);

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

export async function viewHandler(req: Request, res: Response) {
  return ok(res, await getActOnItView(userId(req)));
}

const ACTIONS = {
  accept: acceptAdvice,
  snooze: snoozeAdvice,
  dismiss: dismissAdvice,
  'done-elsewhere': markDoneElsewhere,
} as const;

/** POST /api/act-on-it/:id/:action — answers with the fresh page. */
export function actionHandler(action: keyof typeof ACTIONS) {
  return async (req: Request, res: Response) => {
    const uid = userId(req);
    await ACTIONS[action](uid, idSchema.parse(req.params['id']));
    return ok(res, await getActOnItView(uid));
  };
}

export async function whyHandler(req: Request, res: Response) {
  return ok(res, await getAdviceWhy(userId(req), idSchema.parse(req.params['id'])));
}

export async function popupHandler(req: Request, res: Response) {
  return ok(res, await pendingPopup(userId(req)));
}

export async function popupSeenHandler(req: Request, res: Response) {
  await markPopupSeen(userId(req), idSchema.parse(req.params['promptId']));
  return ok(res, { seen: true });
}
