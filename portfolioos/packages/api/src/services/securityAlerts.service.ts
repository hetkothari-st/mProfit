/**
 * Security alerts, built on the AuditLog trail.
 *
 * To the account owner (fire-and-forget; never blocks or fails a sign-in):
 *   - a sign-in from a browser/OS not seen on this account in 90 days. Keyed
 *     on the user agent, not the IP: phone IPs change constantly, devices
 *     don't;
 *   - the Nth failed sign-in on their email within 15 minutes.
 *
 * To the operator (SECURITY_ALERT_EMAIL; logged at error level either way),
 * from a scan every 15 minutes:
 *   - one IP failing sign-ins against many accounts (credential stuffing);
 *   - one user exporting, or revealing PII, far more than normal.
 *   Each finding is written as a `security_alert` audit row and not repeated
 *   for the same subject within the hour.
 */
import type { Request } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeAuditLog } from '../lib/audit.js';
import { sendEmail } from './notifications/email.service.js';

export const NEW_DEVICE_LOOKBACK_DAYS = 90;
export const FAILED_LOGIN_THRESHOLD = 5;
export const FAILED_LOGIN_WINDOW_MIN = 15;
export const STUFFING_ACCOUNTS_THRESHOLD = 10;
export const EXPORTS_PER_HOUR_THRESHOLD = 40;
export const PII_VIEWS_PER_HOUR_THRESHOLD = 30;

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** "Chrome on Windows" from a user agent; good enough to tell a person. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return 'an unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'a browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iOS/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'an unknown system';
  return `${browser} on ${os}`;
}

function notice(name: string, heading: string, lines: string[]): { html: string; text: string } {
  const body = lines.map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`).join('');
  return {
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111;max-width:520px">
<p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p><h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h2>${body}
<p style="margin:16px 0 0;color:#666;font-size:13px">EveryPaisa security</p></div>`,
    text: [`Hi ${name},`, heading, ...lines, 'EveryPaisa security'].join('\n\n'),
  };
}

/**
 * Call after a successful sign-in has been audited. Emails the user when the
 * device is new to the account. Never throws.
 */
export function notifyIfNewDevice(userId: string, req: Request): void {
  void (async () => {
    const ua = req.header('user-agent') ?? null;
    const device = describeDevice(ua);
    const since = new Date(Date.now() - NEW_DEVICE_LOOKBACK_DAYS * 86_400_000);
    const prior = await runAsSystem(() =>
      prisma.auditLog.findMany({
        where: { userId, action: 'login', createdAt: { gte: since } },
        select: { userAgent: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
    // The row for this sign-in is already written: a first-ever sign-in has
    // nothing before it and is not "new device" news.
    if (prior.length <= 1) return;
    const seen = prior.slice(1).some((r) => describeDevice(r.userAgent) === device);
    if (seen) return;
    const user = await runAsSystem(() =>
      prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } }),
    );
    if (!user) return;
    const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    await sendEmail({
      to: user.email,
      subject: 'New sign-in to your EveryPaisa account',
      ...notice(user.name, 'New sign-in to your account', [
        `Your account was just signed in to from ${device} (${when} IST, IP ${req.ip ?? 'unknown'}).`,
        "If this was you, there's nothing to do.",
        "If it wasn't, reset your password now from the sign-in page, and check Settings for anything you don't recognise.",
      ]),
    });
  })().catch((err: unknown) => logger.warn({ err, userId }, '[security] new-device notice failed'));
}

/**
 * Call after a failed sign-in has been audited. On the Nth failure in the
 * window (only then, so it's one email per burst) emails the account owner.
 * Says nothing about whether the account exists. Never throws.
 */
export function notifyIfLoginBurst(email: string): void {
  void (async () => {
    const normalized = email.trim().toLowerCase();
    const failures = await runAsSystem(() =>
      prisma.auditLog.count({
        where: {
          action: 'login_failed',
          createdAt: { gte: minutesAgo(FAILED_LOGIN_WINDOW_MIN) },
          // The login controller records this email lowercased.
          metadata: { path: ['email'], equals: normalized },
        },
      }),
    );
    if (failures !== FAILED_LOGIN_THRESHOLD) return;
    const user = await runAsSystem(() =>
      prisma.user.findFirst({ where: { email: { equals: normalized, mode: 'insensitive' } }, select: { email: true, name: true } }),
    );
    if (!user) return;
    await sendEmail({
      to: user.email,
      subject: 'Failed sign-in attempts on your EveryPaisa account',
      ...notice(user.name, 'Several failed sign-in attempts', [
        `There have been ${FAILED_LOGIN_THRESHOLD} failed attempts to sign in to your account in the last ${FAILED_LOGIN_WINDOW_MIN} minutes.`,
        "If this was you, you can ignore this, or use 'Forgot password' to reset it.",
        "If it wasn't, someone may be guessing your password. Use a strong password you don't use anywhere else.",
      ]),
    });
  })().catch((err: unknown) => logger.warn({ err }, '[security] failed-login notice failed'));
}

export interface SecurityFinding {
  key: string;
  summary: string;
}

/** Look for abuse patterns in the last window of the audit trail. */
export async function findSuspiciousActivity(): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  const failed = await runAsSystem(() =>
    prisma.auditLog.findMany({
      where: { action: 'login_failed', createdAt: { gte: minutesAgo(15) } },
      select: { ip: true, metadata: true },
    }),
  );
  const accountsByIp = new Map<string, Set<string>>();
  for (const r of failed) {
    if (!r.ip) continue;
    const email = String((r.metadata as { email?: unknown } | null)?.email ?? '').toLowerCase();
    if (!accountsByIp.has(r.ip)) accountsByIp.set(r.ip, new Set());
    accountsByIp.get(r.ip)!.add(email);
  }
  for (const [ip, emails] of accountsByIp) {
    if (emails.size >= STUFFING_ACCOUNTS_THRESHOLD) {
      findings.push({
        key: `stuffing:${ip}`,
        summary: `IP ${ip} failed sign-ins against ${emails.size} different accounts in 15 minutes (credential stuffing?).`,
      });
    }
  }

  for (const [action, threshold, label] of [
    ['data_export', EXPORTS_PER_HOUR_THRESHOLD, 'downloads/exports'],
    ['pii_view', PII_VIEWS_PER_HOUR_THRESHOLD, 'PII reveals'],
  ] as const) {
    const rows = await runAsSystem(() =>
      prisma.auditLog.groupBy({
        by: ['userId'],
        where: { action, createdAt: { gte: minutesAgo(60) }, userId: { not: null } },
        _count: { _all: true },
      }),
    );
    for (const r of rows) {
      if (r.userId && r._count._all >= threshold) {
        findings.push({
          key: `${action}:${r.userId}`,
          summary: `User ${r.userId} made ${r._count._all} ${label} in the last hour.`,
        });
      }
    }
  }
  return findings;
}

/** Scan, then alert on each finding not already alerted on within the hour. */
export async function runSecurityScan(): Promise<{ findings: number; alerted: number }> {
  const findings = await findSuspiciousActivity();
  let alerted = 0;
  for (const f of findings) {
    const recent = await runAsSystem(() =>
      prisma.auditLog.findFirst({
        where: { action: 'security_alert', resource: f.key, createdAt: { gte: minutesAgo(60) } },
        select: { id: true },
      }),
    );
    if (recent) continue;
    await writeAuditLog({ action: 'security_alert', resource: f.key, metadata: { summary: f.summary } });
    logger.error({ key: f.key }, `[security] ${f.summary}`);
    const to = process.env.SECURITY_ALERT_EMAIL;
    if (to) {
      await sendEmail({
        to,
        subject: `[EveryPaisa security] ${f.summary.slice(0, 90)}`,
        ...notice('team', 'Suspicious activity', [f.summary, 'Details are in the AuditLog (action = security_alert).']),
      });
    }
    alerted += 1;
  }
  return { findings: findings.length, alerted };
}
