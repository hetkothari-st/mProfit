/**
 * Transactional email sender.
 *
 * Thin wrapper around nodemailer + SMTP. Configuration comes from
 * SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM /
 * SMTP_SECURE in env.ts. When SMTP_HOST is unset we fall back to a
 * dry-run mode that logs the would-be message and returns
 * `{ sent: false, reason: 'smtp_not_configured' }` so callers can record
 * the skip in a structured way (e.g. the rent reminder pipeline marks
 * `emailStatus = 'skipped'`).
 *
 * Every send is logged with subject + recipient (not the body) so an
 * operator can audit what went out without spilling PII into the log.
 */

import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

/**
 * SMTP config the caller passes in per-send. Per-user creds come from
 * UserNotificationConfig (via getEmailConfigForUser), with the global
 * env vars retained as a fallback for solo / dev installations.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Auto-derived from HTML if absent. */
  text?: string;
  /** Reply-To header (e.g. landlord's actual email). */
  replyTo?: string;
  /**
   * Per-user SMTP config. When omitted we fall back to env-var SMTP
   * (legacy / single-tenant mode); when env is also empty the send
   * returns { sent: false, reason: 'smtp_not_configured' }.
   */
  config?: SmtpConfig;
}

export type SendEmailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: string };

function envFallbackConfig(): SmtpConfig | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? (env.SMTP_SECURE === 'true' ? 465 : 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = input.config ?? envFallbackConfig();
  if (!cfg) {
    logger.warn(
      { to: input.to, subject: input.subject },
      '[email] no SMTP config — skipping send (dry-run)',
    );
    return { sent: false, reason: 'smtp_not_configured' };
  }
  try {
    // Build a fresh transporter per send so per-user config doesn't
    // leak across users. nodemailer's connection pool isn't worth the
    // shared-state risk for a low-volume rent reminder pipeline.
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    const info = await transporter.sendMail({
      from: cfg.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, ''),
      replyTo: input.replyTo,
    });
    logger.info(
      { to: input.to, subject: input.subject, messageId: info.messageId },
      '[email] sent',
    );
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: input.to, subject: input.subject }, '[email] send failed');
    return { sent: false, reason: msg };
  }
}
