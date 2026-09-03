/**
 * Family dashboard read endpoints.
 *
 * Thin by design: every figure comes from familyAggregate.service, which
 * resolves the caller's EffectiveScope and applies their visibility caps
 * before anything is summed. No handler here computes a number — a second
 * source of family totals is a second place for the permission model to be
 * forgotten, which is precisely how the caps came to be ignored in
 * dashboard.service in the first place.
 *
 * Each response carries its own "what you are not seeing" signal
 * (hiddenMemberCount / hiddenCount / restricted). That is deliberate: a total
 * built from a permitted subset must never be presented as if it were the
 * whole household.
 */

import type { Request, Response } from 'express';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import {
  getFamilyWealth,
  getFamilyGoals,
  getFamilyProtection,
  getFamilyAttention,
} from '../services/family/familyAggregate.service.js';

function callerId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

/** The route is mounted under /:familyId, so this is always present. */
function familyId(req: Request): string {
  return req.params['familyId']!;
}

export async function getWealth(req: Request, res: Response): Promise<void> {
  ok(res, await getFamilyWealth(callerId(req), familyId(req)));
}

export async function getGoals(req: Request, res: Response): Promise<void> {
  ok(res, await getFamilyGoals(callerId(req), familyId(req)));
}

export async function getProtection(req: Request, res: Response): Promise<void> {
  ok(res, await getFamilyProtection(callerId(req), familyId(req)));
}

export async function getAttention(req: Request, res: Response): Promise<void> {
  ok(res, await getFamilyAttention(callerId(req), familyId(req)));
}
