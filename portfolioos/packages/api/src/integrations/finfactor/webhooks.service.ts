/**
 * Finfactor webhook handlers.
 *
 * Finvu pushes JSON events to a configured webhook URL whenever a
 * consent or FI-data lifecycle event occurs. We accept the payload,
 * verify the HMAC signature when FINFACTOR_WEBHOOK_SECRET is set, then
 * react to the documented event types:
 *
 *   /webhook/consent       — consent status changed (APPROVED / REJECTED /
 *                            REVOKED / EXPIRED) — update AaConsent row.
 *   /webhook/data          — new FI data fetched and available
 *                            (we don't auto-trigger sync from here yet;
 *                            an admin/cron picks it up).
 *   /webhook/historical    — historical data backfill completed.
 *   /webhook/cohort        — Finfactor cohort/nudge changes.
 *   /webhook/subscription  — user subscription lifecycle.
 *
 * Webhook routes are mounted UNAUTHENTICATED — Finvu can't supply our
 * JWT — so HMAC verification is the only access control. If the secret
 * isn't configured we accept the payload (dev convenience) but log a
 * warning. Production deployments must set the secret.
 */

import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

const SIGNATURE_HEADER = 'x-finfactor-signature';

export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env['FINFACTOR_WEBHOOK_SECRET'];
  if (!secret) {
    logger.warn({}, 'FINFACTOR_WEBHOOK_SECRET not set — accepting webhook without verification');
    return true;
  }
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // constant-time compare
  const a = Buffer.from(signature.replace(/^sha256=/i, ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function pickSignatureHeader(headers: Record<string, string | string[] | undefined>): string | undefined {
  const raw = headers[SIGNATURE_HEADER] ?? headers[SIGNATURE_HEADER.toUpperCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function pickString(o: unknown, ...keys: string[]): string | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const obj = o as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

export async function handleConsentWebhook(payload: unknown) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'invalid_payload' };
  const handle = pickString(payload, 'consentHandle', 'ConsentHandle');
  const status = pickString(payload, 'status', 'consentStatus', 'ConsentStatus');
  if (!handle || !status) return { ok: false, reason: 'missing_fields' };

  const consent = await prisma.aaConsent.findFirst({ where: { consentHandle: handle } });
  if (!consent) {
    logger.warn({ handle, status }, 'consent webhook: no matching AaConsent row');
    return { ok: false, reason: 'consent_not_found' };
  }

  const updates: Record<string, unknown> = { status, metadata: payload as object };
  if (status === 'APPROVED' && !consent.approvedAt) updates['approvedAt'] = new Date();
  if (status === 'REVOKED' && !consent.revokedAt) updates['revokedAt'] = new Date();
  const consentId = pickString(payload, 'consentId', 'ConsentId');
  if (consentId) updates['consentId'] = consentId;
  const expiry = pickString(payload, 'expiresAt', 'consentExpiry');
  if (expiry) {
    const d = new Date(expiry);
    if (!Number.isNaN(d.getTime())) updates['expiresAt'] = d;
  }

  await prisma.aaConsent.update({ where: { id: consent.id }, data: updates });
  return { ok: true, consentId: consent.id, status };
}

export async function handleDataWebhook(payload: unknown) {
  // For now we just log — auto-sync on every data event is deferred until
  // we add a per-user lock + budget gate so a flood of webhooks can't fan
  // out into N concurrent expensive syncs.
  logger.info({ payload }, 'Finfactor data webhook received');
  return { ok: true };
}

export async function handleHistoricalWebhook(payload: unknown) {
  logger.info({ payload }, 'Finfactor historical webhook received');
  return { ok: true };
}

export async function handleCohortWebhook(payload: unknown) {
  logger.info({ payload }, 'Finfactor cohort webhook received');
  return { ok: true };
}

export async function handleSubscriptionWebhook(payload: unknown) {
  logger.info({ payload }, 'Finfactor subscription webhook received');
  return { ok: true };
}
