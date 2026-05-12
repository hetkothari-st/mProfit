/**
 * Per-user notification settings — SMTP config and default rent payment
 * instructions. The SMTP password is encrypted with AES-256-GCM via
 * lib/secrets.ts before it touches the DB and is *never* returned to
 * the client; reads emit a "***" placeholder so the form can show that
 * a password is configured without exposing it.
 *
 * The rent reminder pipeline consumes `getEmailConfigForUser(userId)`
 * which returns a hydrated SmtpConfig (with password decrypted in
 * memory) for the email service. Per-user config takes precedence; if
 * the user hasn't set one up, env vars fall in as a fallback for
 * solo / dev installations.
 */

import { prisma } from '../../lib/prisma.js';
import { encryptSecret, decryptSecret } from '../../lib/secrets.js';
import type { SmtpConfig } from './email.service.js';
import { sendEmail } from './email.service.js';

export interface NotificationConfigInput {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  /** Plain password; the service encrypts it before storage. */
  smtpPass?: string;
  fromName: string;
  fromEmail: string;
  paymentInstructions?: string | null;
}

export interface NotificationConfigPublic {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  /** Always "***" when a password is set, empty string when not. */
  smtpPassMask: string;
  fromName: string;
  fromEmail: string;
  paymentInstructions: string | null;
  hasPassword: boolean;
}

export async function getNotificationConfig(
  userId: string,
): Promise<NotificationConfigPublic | null> {
  const row = await prisma.userNotificationConfig.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecure: row.smtpSecure,
    smtpUser: row.smtpUser,
    smtpPassMask: row.smtpPassEnc ? '***' : '',
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    paymentInstructions: row.paymentInstructions,
    hasPassword: !!row.smtpPassEnc,
  };
}

export async function upsertNotificationConfig(
  userId: string,
  input: NotificationConfigInput,
): Promise<NotificationConfigPublic> {
  const existing = await prisma.userNotificationConfig.findUnique({ where: { userId } });
  // Only re-encrypt when the user actually supplied a new password.
  // Leaving it blank in the form preserves the previously-saved value.
  const smtpPassEnc =
    input.smtpPass && input.smtpPass.trim().length > 0
      ? encryptSecret(input.smtpPass.trim())
      : existing?.smtpPassEnc;

  if (!smtpPassEnc) {
    throw new Error('SMTP password is required on first save');
  }

  await prisma.userNotificationConfig.upsert({
    where: { userId },
    update: {
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      smtpUser: input.smtpUser,
      smtpPassEnc,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      paymentInstructions: input.paymentInstructions ?? null,
    },
    create: {
      userId,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      smtpUser: input.smtpUser,
      smtpPassEnc,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      paymentInstructions: input.paymentInstructions ?? null,
    },
  });
  const out = await getNotificationConfig(userId);
  if (!out) throw new Error('Failed to read back saved config');
  return out;
}

export async function deleteNotificationConfig(userId: string): Promise<void> {
  await prisma.userNotificationConfig.deleteMany({ where: { userId } });
}

/**
 * Hydrate an SmtpConfig the email service can actually use (password
 * decrypted in-memory). Returns null when the user hasn't set up a
 * config yet — caller will fall back to env or surface
 * smtp_not_configured.
 */
export async function getEmailConfigForUser(userId: string): Promise<SmtpConfig | null> {
  const row = await prisma.userNotificationConfig.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    host: row.smtpHost,
    port: row.smtpPort,
    secure: row.smtpSecure,
    user: row.smtpUser,
    pass: decryptSecret(row.smtpPassEnc),
    from: `${row.fromName} <${row.fromEmail}>`,
  };
}

/**
 * Per-user default payment instructions (UPI handle, bank details, …).
 * Property-level instructions override this in the reminder template.
 */
export async function getUserPaymentInstructions(userId: string): Promise<string | null> {
  const row = await prisma.userNotificationConfig.findUnique({
    where: { userId },
    select: { paymentInstructions: true },
  });
  return row?.paymentInstructions ?? null;
}

/**
 * Send a dry-run email so the landlord can verify creds before
 * approving any real reminders. Throws on bad config so the test
 * button surfaces a clear error.
 */
export async function sendTestEmail(userId: string, to: string): Promise<{ ok: boolean; reason?: string }> {
  const config = await getEmailConfigForUser(userId);
  if (!config) return { ok: false, reason: 'smtp_not_configured' };
  const result = await sendEmail({
    to,
    subject: 'PortfolioOS — test email',
    html: `<p>This is a test email from PortfolioOS to confirm your SMTP setup is working.</p>
           <p>If you received this, you're good to go — rent reminders will be sent from this address.</p>`,
    config,
  });
  return result.sent ? { ok: true } : { ok: false, reason: result.reason };
}
