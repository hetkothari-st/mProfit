/**
 * Provider-agnostic transactional SMS sender.
 *
 * Currently wraps Twilio (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_FROM_NUMBER). Plug other providers (MSG91, Fast2SMS, etc.) by
 * adding a new case to `dispatch()` that conforms to the `SmsProvider`
 * shape below.
 *
 * Set SMS_PROVIDER='none' (or leave the Twilio credentials blank) to
 * disable real sends. The function then returns
 * `{ sent: false, reason: 'sms_not_configured' }` so callers can mark
 * the SMS channel as skipped and surface the gap in the UI — no
 * silently-dropped messages.
 *
 * Compliance note: India enforces TRAI DLT registration on transactional
 * SMS. Templates must be pre-approved by the carriers (header + content
 * template). The body here is treated as the variable payload; the
 * caller is responsible for keeping it under 160 chars and aligned with
 * the registered template. See docs/ops/sms-dlt.md (TODO) for the
 * approval workflow.
 */

import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export interface SendSmsInput {
  /** E.164 — e.g. "+919876543210". We'll prepend +91 if a 10-digit
   *  Indian mobile is passed without a country code. */
  to: string;
  body: string;
}

export type SendSmsResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: string };

function normalisePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (/^\+?\d{8,15}$/.test(cleaned)) {
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
      return `+91${cleaned}`;
    }
    return `+${cleaned}`;
  }
  return null;
}

async function sendViaTwilio(to: string, body: string): Promise<SendSmsResult> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    return { sent: false, reason: 'twilio_credentials_missing' };
  }
  // Lazy import so apps that don't use SMS don't pay the load cost.
  const twilio = (await import('twilio')).default;
  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  try {
    const msg = await client.messages.create({
      from: env.TWILIO_FROM_NUMBER,
      to,
      body,
    });
    return { sent: true, messageId: msg.sid };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { sent: false, reason };
  }
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const to = normalisePhone(input.to);
  if (!to) {
    return { sent: false, reason: 'invalid_phone_format' };
  }
  if (env.SMS_PROVIDER === 'none') {
    logger.warn(
      { to, body: input.body.slice(0, 40) },
      '[sms] provider disabled (SMS_PROVIDER=none) — skipping send (dry-run)',
    );
    return { sent: false, reason: 'sms_not_configured' };
  }
  let result: SendSmsResult;
  if (env.SMS_PROVIDER === 'twilio') {
    result = await sendViaTwilio(to, input.body);
  } else {
    result = { sent: false, reason: `unknown_provider:${env.SMS_PROVIDER}` };
  }
  if (result.sent) {
    logger.info({ to, provider: env.SMS_PROVIDER, messageId: result.messageId }, '[sms] sent');
  } else {
    logger.warn({ to, provider: env.SMS_PROVIDER, reason: result.reason }, '[sms] send failed');
  }
  return result;
}
