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

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Auto-derived from HTML if absent. */
  text?: string;
  /** Override the configured SMTP_FROM. Optional. */
  from?: string;
  /** Reply-To header (e.g. landlord's actual email). */
  replyTo?: string;
}

export type SendEmailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: string };

let cachedTransporter: Transporter | null = null;

function isConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function buildTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? (env.SMTP_SECURE === 'true' ? 465 : 587),
    secure: env.SMTP_SECURE === 'true',
    auth: {
      user: env.SMTP_USER!,
      pass: env.SMTP_PASS!,
    },
  });
  return cachedTransporter;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!isConfigured()) {
    logger.warn(
      { to: input.to, subject: input.subject },
      '[email] SMTP not configured — skipping send (dry-run)',
    );
    return { sent: false, reason: 'smtp_not_configured' };
  }
  try {
    const info = await buildTransporter().sendMail({
      from: input.from ?? env.SMTP_FROM,
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
