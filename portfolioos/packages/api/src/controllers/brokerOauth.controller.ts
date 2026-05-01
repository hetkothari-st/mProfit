import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../lib/response.js';
import { UnauthorizedError, BadRequestError } from '../lib/errors.js';
import { env } from '../config/env.js';
import {
  setupBrokerCredential,
  startBrokerOauth,
  handleBrokerCallback,
  getBrokerStatus,
  refreshSession,
  type BrokerId,
} from '../services/brokerOauth/index.js';
import { prisma } from '../lib/prisma.js';

const brokerSchema = z.enum(['zerodha', 'upstox', 'angel']);

const setupSchema = z.object({
  brokerId: brokerSchema,
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1).optional(),
  redirectUri: z.string().url().optional(),
  clientCode: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  totpSecret: z.string().min(8).optional(),
});

export async function setup(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const body = setupSchema.parse(req.body);
  const r = await setupBrokerCredential({
    userId,
    brokerId: body.brokerId,
    apiKey: body.apiKey,
    apiSecret: body.apiSecret ?? null,
    redirectUri: body.redirectUri ?? null,
    clientCode: body.clientCode ?? null,
    password: body.password ?? null,
    totpSecret: body.totpSecret ?? null,
  });
  return ok(res, r);
}

const startSchema = z.object({ brokerId: brokerSchema });

export async function start(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const { brokerId } = startSchema.parse({ brokerId: req.params.brokerId });
  const r = await startBrokerOauth(userId, brokerId);
  return ok(res, r);
}

/**
 * GET /api/fo/brokers/:brokerId/callback?state=...&request_token=...&code=...
 *
 * The broker redirects the user-agent here. We exchange the
 * request_token/code for an access_token, persist it, then return a tiny
 * HTML page that posts a message to its window.opener (which is the popup
 * launcher in the React app) and closes itself.
 */
export async function callback(req: Request, res: Response) {
  const brokerId = brokerSchema.parse(req.params.brokerId);
  const state = String(req.query.state ?? '');
  const code = req.query.code ? String(req.query.code) : undefined;
  const requestToken = req.query.request_token ? String(req.query.request_token) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;

  if (!state) {
    return res.status(400).send(htmlClose({ ok: false, error: 'Missing state' }));
  }
  if (brokerId === 'zerodha' && status && status !== 'success') {
    return res.status(400).send(htmlClose({ ok: false, error: `Kite returned status=${status}` }));
  }

  try {
    const r = await handleBrokerCallback({ brokerId, state, code, requestToken });
    return res.send(htmlClose({ ok: true, brokerId: r.brokerId }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth failed';
    return res.status(400).send(htmlClose({ ok: false, error: msg }));
  }
}

export async function status(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const brokerId = req.params.brokerId
    ? brokerSchema.parse(req.params.brokerId)
    : null;
  if (brokerId) {
    return ok(res, await getBrokerStatus(userId, brokerId));
  }
  const all = await Promise.all(
    (['zerodha', 'upstox', 'angel'] as const).map(async (b) => ({
      brokerId: b,
      ...(await getBrokerStatus(userId, b)),
    })),
  );
  return ok(res, all);
}

export async function refresh(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const brokerId = brokerSchema.parse(req.params.brokerId);
  const cred = await prisma.brokerCredential.findUnique({
    where: { userId_brokerId: { userId, brokerId } },
  });
  if (!cred) throw new BadRequestError('Set up broker credentials first');
  await refreshSession(cred.id);
  return ok(res, await getBrokerStatus(userId, brokerId));
}

export async function disconnect(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const brokerId = brokerSchema.parse(req.params.brokerId);
  await prisma.brokerCredential.deleteMany({ where: { userId, brokerId } });
  return ok(res, { success: true });
}

/**
 * Returns the absolute URL the broker should redirect to after the user
 * authorizes the app. Usable by the frontend so users see exactly what to
 * paste into developers.kite.trade / Upstox dashboard.
 */
export async function redirectInfo(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const brokerId = brokerSchema.parse(req.params.brokerId);
  const base = (env.FRONTEND_URL ?? '').replace(/\/$/, '');
  const apiBase = absoluteApiBase(req);
  return ok(res, {
    brokerId,
    redirectUri: `${apiBase}/api/fo/brokers/${brokerId}/callback`,
    frontendCallbackHint: `${base}/fo`,
  });
}

function absoluteApiBase(req: Request): string {
  // Trust X-Forwarded-* if behind a proxy; falls back to req.protocol/host.
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.get('host');
  return `${proto}://${host}`.replace(/\/$/, '');
}

function htmlClose(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  // Escape `</` so the JSON cannot break out of the script tag if any field
  // happens to contain it.
  const safe = json.replace(/</g, '\\u003c');
  return `<!doctype html><html><head><title>Broker login</title></head><body style="font-family:system-ui;padding:24px;color:#111">
<p>${payload.ok ? 'Login successful — closing window…' : 'Login failed.'}</p>
<pre style="font-size:12px;color:#666">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
<script>
  (function(){
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'broker_oauth_result', payload: ${safe} }, '*');
      }
    } catch (e) {}
    setTimeout(function(){ try { window.close(); } catch (e) {} }, 600);
  })();
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
