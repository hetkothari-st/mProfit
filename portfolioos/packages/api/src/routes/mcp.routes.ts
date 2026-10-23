import { Router, type NextFunction, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AiConnectorArea } from '@everypaisa/shared';
import { prisma } from '../lib/prisma.js';
import { hasEffectiveFeature } from '../lib/effectivePlan.js';
import { enterUserContext, runAsUser } from '../lib/requestContext.js';
import { logger } from '../lib/logger.js';
import { mcpDayLimiter, mcpMinuteLimiter } from '../middleware/rateLimit.js';
import { mcpEnabledGate } from './mcpOAuth.routes.js';
import { mcpConfig, resolveAccessToken } from '../services/mcp/oauth.service.js';
import { buildMcpServer } from '../services/mcp/server.js';

interface McpLocals { grantId: string; userId: string; areas: AiConnectorArea[]; memberUserIds: string[]; clientName: string }

function challenge(res: Response, invalid: boolean): void {
  const { issuer } = mcpConfig();
  const meta = `resource_metadata="${issuer}/.well-known/oauth-protected-resource"`;
  res.set('WWW-Authenticate', invalid ? `Bearer error="invalid_token", ${meta}` : `Bearer ${meta}`);
  res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
}

/** Bearer check on every request: no caching, so a revoke lands on the very next call. */
async function mcpBearer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization') ?? '';
    if (!header.startsWith('Bearer ')) return challenge(res, false);
    const ctx = await resolveAccessToken(header.slice(7).trim());
    if (!ctx) return challenge(res, true);
    res.locals.mcp = ctx;
    next();
  } catch (err) {
    next(err);
  }
}

export const mcpRouter = Router();
mcpRouter.all('/mcp', mcpEnabledGate);
mcpRouter.get('/mcp', (_req, res) => {
  res.status(405).set('Allow', 'POST').end();
});
mcpRouter.delete('/mcp', (_req, res) => {
  res.status(405).set('Allow', 'POST').end();
});
mcpRouter.post('/mcp', mcpBearer, mcpMinuteLimiter, mcpDayLimiter, async (req: Request, res: Response, next: NextFunction) => {
  const ctx = res.locals.mcp as McpLocals;
  try {
    // Everything below runs in the connecting user's RLS context, like authenticate().
    enterUserContext(ctx.userId);
    // The plan as it stands now: a lapsed paid plan is FREE, so its connector stops reading data.
    const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { plan: true, planExpiresAt: true } });
    const planOk = hasEffectiveFeature(user, 'AI_CONNECTOR');
    void runAsUser(ctx.userId, () => prisma.mcpGrant.update({ where: { id: ctx.grantId }, data: { lastUsedAt: new Date() } }))
      .catch((err) => logger.warn({ err }, 'mcp.last_used.failed'));
    const server = buildMcpServer({ userId: ctx.userId, grantId: ctx.grantId, areas: ctx.areas, memberUserIds: ctx.memberUserIds, planOk, now: new Date() });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      // Unawaited: a rejection here would be unhandled and exit the process.
      transport.close().catch((err: unknown) => logger.warn({ err }, 'mcp.transport_close_failed'));
      server.close().catch((err: unknown) => logger.warn({ err }, 'mcp.server_close_failed'));
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    next(err);
  }
});
