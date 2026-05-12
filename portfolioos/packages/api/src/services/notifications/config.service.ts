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
import { sendViaGmailApi, getGmailSendAccount } from './gmailSender.service.js';

/**
 * Auto-detect SMTP host/port/secure from the user's email domain so the
 * landlord never has to type that boilerplate. Returns null for domains
 * we don't recognise — caller will surface an error asking the user to
 * either use a supported provider or extend this map.
 */
interface SmtpDefaults {
  host: string;
  port: number;
  secure: boolean;
}

const SMTP_DEFAULTS_BY_DOMAIN: Record<string, SmtpDefaults> = {
  'gmail.com': { host: 'smtp.gmail.com', port: 587, secure: false },
  'googlemail.com': { host: 'smtp.gmail.com', port: 587, secure: false },
  'outlook.com': { host: 'smtp-mail.outlook.com', port: 587, secure: false },
  'hotmail.com': { host: 'smtp-mail.outlook.com', port: 587, secure: false },
  'live.com': { host: 'smtp-mail.outlook.com', port: 587, secure: false },
  'office365.com': { host: 'smtp.office365.com', port: 587, secure: false },
  'yahoo.com': { host: 'smtp.mail.yahoo.com', port: 587, secure: false },
  'yahoo.in': { host: 'smtp.mail.yahoo.com', port: 587, secure: false },
  'icloud.com': { host: 'smtp.mail.me.com', port: 587, secure: false },
  'me.com': { host: 'smtp.mail.me.com', port: 587, secure: false },
  'zoho.com': { host: 'smtp.zoho.in', port: 587, secure: false },
  'zoho.in': { host: 'smtp.zoho.in', port: 587, secure: false },
};

function smtpDefaultsFor(email: string): SmtpDefaults | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  return SMTP_DEFAULTS_BY_DOMAIN[domain] ?? null;
}

export interface NotificationConfigInput {
  /** Plain password / app password; the service encrypts it before storage. */
  smtpPass?: string;
  /**
   * Default payment instructions text (UPI handle, bank details, …).
   * Edited from the rental reminders panel; the property-level field
   * overrides this when set.
   */
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
    throw new Error('App password is required on first save');
  }

  // Auto-derive every other field from the user's app profile so the
  // landlord never has to retype name/email/host/port/secure. The profile
  // email becomes both the smtpUser and the from address — which matches
  // what every consumer SMTP provider (Gmail / Outlook / Yahoo / iCloud)
  // requires anyway (envelope FROM must match authenticated mailbox).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  if (!user) throw new Error('User not found');
  const defaults = smtpDefaultsFor(user.email);
  if (!defaults) {
    throw new Error(
      `We can't auto-detect SMTP settings for ${user.email}. ` +
      'Use a Gmail / Outlook / Yahoo / iCloud / Zoho address, ' +
      'or ask the admin to add your domain.',
    );
  }

  await prisma.userNotificationConfig.upsert({
    where: { userId },
    update: {
      smtpHost: defaults.host,
      smtpPort: defaults.port,
      smtpSecure: defaults.secure,
      smtpUser: user.email,
      smtpPassEnc,
      fromName: user.name ?? user.email,
      fromEmail: user.email,
      ...(input.paymentInstructions !== undefined
        ? { paymentInstructions: input.paymentInstructions ?? null }
        : {}),
    },
    create: {
      userId,
      smtpHost: defaults.host,
      smtpPort: defaults.port,
      smtpSecure: defaults.secure,
      smtpUser: user.email,
      smtpPassEnc,
      fromName: user.name ?? user.email,
      fromEmail: user.email,
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
  const html = `<p>This is a test email from PortfolioOS to confirm your sending setup is working.</p>
                <p>If you received this, you're good to go — rent reminders will be sent from this address.</p>`;
  const subject = 'PortfolioOS — test email';

  // The supported path is Gmail OAuth ("Connect Gmail"). When that's
  // not present, refuse the test up-front instead of trying the legacy
  // SMTP path — most users who land here have a stale app-password
  // row from earlier testing that silently fails Gmail auth with
  // "535 Username and Password not accepted", which is the worst
  // possible error to surface.
  const gmailAccount = await getGmailSendAccount(userId);
  if (!gmailAccount) {
    return { ok: false, reason: 'gmail_not_connected' };
  }
  const r = await sendViaGmailApi({ userId, to, subject, html });
  return r.sent ? { ok: true } : { ok: false, reason: r.reason };
}

/**
 * Returns whether the user has a working email sender (Gmail OAuth or
 * SMTP config). Used by the Settings UI to decide which CTA to render.
 */
export async function getSenderStatus(userId: string): Promise<{
  gmailConnected: boolean;
  gmailEmail: string | null;
  smtpConfigured: boolean;
}> {
  const gmail = await getGmailSendAccount(userId);
  const smtp = await prisma.userNotificationConfig.findUnique({
    where: { userId },
    select: { smtpPassEnc: true },
  });
  return {
    gmailConnected: !!gmail,
    gmailEmail: gmail?.email ?? null,
    smtpConfigured: !!smtp?.smtpPassEnc,
  };
}
