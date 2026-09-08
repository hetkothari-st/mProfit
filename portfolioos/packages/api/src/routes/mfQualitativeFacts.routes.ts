/**
 * `/api/admin/mf-qualitative-facts` — admin CRUD over the one hand-entered
 * input in the MF analytics layer (`07-IMPLEMENTATION-PLAN.md` Task 6.2).
 *
 * **Why this is not a branch of `mfAnalytics.routes.ts`.** That router applies
 * `requireFeature('MF_ANALYTICS')` at router level, which is a *plan* gate: it
 * asks whether the caller has paid for the analytics product. That is exactly
 * the wrong question here. A PLUS subscriber must not be able to write a row
 * that marks a fund down for every other user, and an ADMIN on the FREE tier
 * must still be able to correct one. Entitlement and authority are different
 * axes, and mounting this under the entitled router would conflate them.
 *
 * The gate is therefore `requireRole('ADMIN')` from `middleware/authenticate.ts`
 * — the same construction `billing.routes.ts` uses for its ADMIN-only plan
 * escape hatch, which is the repo's one existing precedent for an admin-only
 * route. `requireFeature` is deliberately absent.
 *
 * Both middlewares are applied with `router.use` rather than repeated per line:
 * a per-route list is a list you can forget to extend, and the one route that
 * then loses `requireRole` is an ungated write onto shared reference data.
 * `use` makes the gate structural — a route added below is gated by existing.
 *
 * `asyncHandler` wraps EVERY handler, without exception (`CONTEXT.md §4`). An
 * async Express handler without it turns a rejected promise into an unhandled
 * rejection that kills the Node process; every handler here awaits the database.
 *
 * These rows are shared market data with no owner and no RLS (they are absent
 * from `USER_SCOPED_MODELS`, asserted by `mf-reference-not-user-scoped`). Auth
 * and role gate WHO MAY WRITE; they are not, and must not be mistaken for,
 * tenant isolation — there is no tenant to isolate. The `AuditLog` row each
 * mutation writes is what makes an unowned write attributable.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getQualitativeFactCatalog,
  listQualitativeFacts,
  createQualitativeFact,
  updateQualitativeFact,
  deleteQualitativeFact,
} from '../controllers/mfQualitativeFacts.controller.js';

export const mfQualitativeFactsRouter = Router();

mfQualitativeFactsRouter.use(authenticate);
mfQualitativeFactsRouter.use(requireRole('ADMIN'));

// What each `factType` does to a score. Declared before `/:id` would ever be
// reachable so "catalog" can never be read as an id.
mfQualitativeFactsRouter.get('/catalog', asyncHandler(getQualitativeFactCatalog));

// Filter by `schemeCode`, `amcCode` or `factType`; `includeExpired=true` also
// returns facts whose `validTo` has passed (they still explain an old score).
mfQualitativeFactsRouter.get('/', asyncHandler(listQualitativeFacts));

// Create against `schemeCodes[]` or every ACTIVE scheme of an `amcCode`.
// Duplicates on `(schemeCode, factType, validFrom)` are reported, not inserted.
mfQualitativeFactsRouter.post('/', asyncHandler(createQualitativeFact));

// Correct dates, value or source. `schemeCode` and `factType` are immutable —
// see the controller header.
mfQualitativeFactsRouter.patch('/:id', asyncHandler(updateQualitativeFact));

// Hard delete, for a fact that was wrong rather than one that has ended.
mfQualitativeFactsRouter.delete('/:id', asyncHandler(deleteQualitativeFact));
