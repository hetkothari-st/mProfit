import { Router, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { AI_CONNECTOR_AREAS } from '@everypaisa/shared';
import { mcpOAuthLimiter } from '../middleware/rateLimit.js';
import { OAuthError, exchangeToken, mcpConfig, registerClient, revokeToken, startAuthorization } from '../services/mcp/oauth.service.js';
import { env } from '../config/env.js';

/** Every connector route is invisible unless MCP_ENABLED=true and API_PUBLIC_URL is set. */
export function mcpEnabledGate(_req: Request, res: Response, next: NextFunction): void {
  if (!mcpConfig().enabled) {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }
  next();
}

/**
 * Chatbots call these server to server; the MCP Inspector calls them from a
 * browser. Bearer only, no cookies, so any origin without credentials is safe.
 * Mounted BEFORE the global CORS middleware in src/index.ts.
 */
export const mcpCors = cors({ origin: '*', credentials: false, exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id'] });

function sendOAuthError(res: Response, err: unknown, next: NextFunction): void {
  if (err instanceof OAuthError) {
    res.status(err.status).set('Cache-Control', 'no-store').json({ error: err.error, error_description: err.description });
    return;
  }
  next(err);
}

const SCOPES = AI_CONNECTOR_AREAS.map((a) => `area:${a}`);

export const mcpOAuthRouter = Router();
mcpOAuthRouter.use(['/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server', '/oauth'], mcpEnabledGate);

function protectedResource(_req: Request, res: Response): void {
  const { issuer, resource } = mcpConfig();
  res.json({ resource, authorization_servers: [issuer], scopes_supported: SCOPES, bearer_methods_supported: ['header'], resource_name: 'EveryPaisa' });
}
mcpOAuthRouter.get('/.well-known/oauth-protected-resource', protectedResource);
mcpOAuthRouter.get('/.well-known/oauth-protected-resource/mcp', protectedResource);

mcpOAuthRouter.get('/.well-known/oauth-authorization-server', (_req, res) => {
  const { issuer } = mcpConfig();
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: SCOPES,
    authorization_response_iss_parameter_supported: true,
  });
});

mcpOAuthRouter.post('/oauth/register', mcpOAuthLimiter, (req, res, next) => {
  registerClient(req.body).then((r) => res.status(201).set('Cache-Control', 'no-store').json(r), (e) => sendOAuthError(res, e, next));
});

mcpOAuthRouter.get('/oauth/authorize', (req, res, next) => {
  startAuthorization(req.query as Record<string, unknown>).then(
    ({ reqId }) => res.redirect(302, `${env.FRONTEND_URL.replace(/\/+$/, '')}/connect/authorize?req=${encodeURIComponent(reqId)}`),
    (e) => {
      if (e instanceof OAuthError && e.redirectTo) {
        res.redirect(302, e.redirectTo);
        return;
      }
      if (e instanceof OAuthError) {
        res.status(e.status).type('text/plain').send(`EveryPaisa could not start this connection: ${e.description}`);
        return;
      }
      next(e);
    },
  );
});

mcpOAuthRouter.post('/oauth/token', mcpOAuthLimiter, (req, res, next) => {
  exchangeToken((req.body ?? {}) as Record<string, unknown>).then(
    (t) => res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache').json(t),
    (e) => sendOAuthError(res, e, next),
  );
});

mcpOAuthRouter.post('/oauth/revoke', mcpOAuthLimiter, (req, res, next) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  revokeToken(token).then(() => res.status(200).end(), next);
});
