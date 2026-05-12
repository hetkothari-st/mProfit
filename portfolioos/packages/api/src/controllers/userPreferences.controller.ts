import type { Request, Response } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { getUserPreferences, updateUserPreferences } from '../services/userPreferences.service.js';

const assetSectionPrefSchema = z.object({
  key: z.string().min(1),
  visible: z.boolean(),
  order: z.number().int().min(0),
});

const updatePreferencesSchema = z.object({
  assetSections: z.array(assetSectionPrefSchema),
});

export async function getPreferencesHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const prefs = await getUserPreferences(req.user.id);
  ok(res, prefs);
}

export async function updatePreferencesHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updatePreferencesSchema.parse(req.body);
  const prefs = await updateUserPreferences(req.user.id, body);
  ok(res, prefs);
}
