import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import {
  listProfilesIManage,
  recordEnteredProfile,
  resolveActAs,
} from '../services/family/managedProfile.service.js';

/**
 * The manager's side of managed family profiles. Mounted at
 * `/api/managed-profiles`, and refused while acting for a profile — a
 * profile cannot list or enter other profiles.
 */
export const managedProfilesRouter = Router();
managedProfilesRouter.use(authenticate);

function caller(req: Request) {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

/** Profiles I keep, for the "Managing" switcher. */
managedProfilesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await listProfilesIManage(caller(req).id));
  }),
);

/**
 * Called when the manager switches into a profile. Confirms they may (the
 * same check every acting request makes) and records the switch in the
 * audit log, so "who looked after grandpa's books, and when" has an answer.
 */
managedProfilesRouter.post(
  '/:profileId/enter',
  asyncHandler(async (req: Request, res: Response) => {
    const me = caller(req);
    const profile = await resolveActAs(me, req.params.profileId!);
    await recordEnteredProfile(me.id, profile.id, {
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
    ok(res, { id: profile.id });
  }),
);
