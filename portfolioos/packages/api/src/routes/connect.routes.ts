import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import { AppError, ForbiddenError } from '../lib/errors.js';
import { mcpEnabledGate } from './mcpOAuth.routes.js';
import { OAuthError, decide, getAuthRequest, listConnections, revokeConnection } from '../services/mcp/oauth.service.js';
import { notifyNewConnection } from '../services/mcp/notice.service.js';

/** Connecting a chatbot is for the signed-in person's own account only (v1). */
function rejectActAs(req: Request, _res: Response, next: NextFunction): void {
  if (req.actor) {
    next(new ForbiddenError('AI connectors work on your own account only. Switch back to your own account.'));
    return;
  }
  next();
}

function asApp(err: unknown): never {
  if (err instanceof OAuthError) throw new AppError(err.description, err.status, err.error.toUpperCase());
  throw err;
}

export const connectRouter = Router();
connectRouter.use(mcpEnabledGate, authenticate, rejectActAs);

// Ungated on purpose: a downgraded user must always be able to see and revoke.
connectRouter.get('/connections', asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listConnections(req.user!.id) });
}));
connectRouter.delete('/connections/:id', asyncHandler(async (req: Request, res: Response) => {
  await revokeConnection(req.user!.id, req.params.id!, req).catch(asApp);
  res.json({ success: true, data: { revoked: true } });
}));

connectRouter.get('/requests/:reqId', asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getAuthRequest(req.params.reqId!, req.user!.id).catch(asApp) });
}));
// Approving needs the plan; declining never does, so a FREE user's Cancel
// still tells the chatbot access_denied instead of leaving it waiting.
const approveNeedsPlan = requireFeature('AI_CONNECTOR');
function gateApprove(req: Request, res: Response, next: NextFunction): void {
  if ((req.body as { approve?: unknown } | undefined)?.approve === true) {
    approveNeedsPlan(req, res, next);
    return;
  }
  next();
}

connectRouter.post('/requests/:reqId/decision', gateApprove, asyncHandler(async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { approve?: unknown; areas?: unknown };
  const r = await decide(req.params.reqId!, req.user!.id, { approve: body.approve === true, areas: body.areas }, req).catch(asApp);
  if (r.isNewConnection && r.grantId) void notifyNewConnection(req.user!.id, r.clientName, r.grantId);
  res.json({ success: true, data: { redirectTo: r.redirectTo } });
}));
