/**
 * Rent reminder pipeline (§8 follow-up).
 *
 * Daily cron scans every EXPECTED RentReceipt whose dueDate falls within
 * the next 5/3/1/0 days and creates one PENDING_APPROVAL RentReminder
 * per (receipt, leadDays) tuple. The landlord reviews + optionally edits
 * the message body in the UI, then either approves (which fires off the
 * email + SMS sends) or rejects.
 *
 * No auto-send: every outbound message is a deliberate human action so
 * the system can't spam tenants in the event of a bug. Failed sends
 * surface as `status='FAILED'` with the carrier error captured per
 * channel — the landlord can edit and resend.
 *
 * Templates use a small mustache-style substitution: `{tenantName}`,
 * `{amount}`, `{dueDate}`, `{property}`, `{landlord}`,
 * `{paymentInstructions}`. Stored on the row so a landlord's edits
 * survive sender churn, and so the same row can be retried verbatim.
 */

import { Prisma, type RentReceipt, type Tenancy, type RentalProperty, type RentReminder } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { sendEmail } from './notifications/email.service.js';
import { sendSms } from './notifications/sms.service.js';
import {
  getEmailConfigForUser,
  getUserPaymentInstructions,
} from './notifications/config.service.js';
import { sendViaGmailApi, getGmailSendAccount } from './notifications/gmailSender.service.js';
import { markOverdueReceipts } from './rental.service.js';

export const REMINDER_LEAD_DAYS = [5, 3, 1, 0] as const;
export type ReminderLeadDay = (typeof REMINDER_LEAD_DAYS)[number];

export const REMINDER_STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type ReminderStatus = (typeof REMINDER_STATUS)[keyof typeof REMINDER_STATUS];

interface TemplateVars {
  tenantName: string;
  amount: string;
  dueDate: string;
  property: string;
  landlord: string;
  paymentInstructions: string;
  /**
   * Positive = days before due (5/3/1/0). Negative sentinel `-1` =
   * receipt is OVERDUE (the actual days-overdue is passed separately
   * via `daysOverdue` so the template can render "N days overdue").
   */
  leadDays: number;
  daysOverdue: number;
}

function formatINRPlain(d: Prisma.Decimal): string {
  // Quick INR grouping (Indian lakh/crore style). Display-only.
  const n = Number(d.toString()).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `₹${n}`;
}

function formatIsoDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildTemplate(vars: TemplateVars): { subject: string; body: string; smsBody: string } {
  const isOverdue = vars.leadDays < 0;
  const leadCopy = isOverdue
    ? vars.daysOverdue === 1
      ? 'was due yesterday and is now overdue'
      : `is overdue by ${vars.daysOverdue} days`
    : vars.leadDays === 0
      ? 'is due today'
      : vars.leadDays === 1
        ? 'is due tomorrow'
        : `is due in ${vars.leadDays} days`;

  const subject = isOverdue
    ? `Overdue rent — ${vars.property} (${vars.dueDate})`
    : `Rent reminder — ${vars.property} (${vars.dueDate})`;

  const body = `<!doctype html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f7f5ef;color:#1c1c1c;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f5ef;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="background:#ffffff;border:1px solid #e6e0d4;border-radius:8px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 4px;color:#8a7e5e;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Rent Reminder</p>
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1c1c1c;">Hi ${vars.tenantName},</h1>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.55;">
            This is a friendly reminder that your rent for
            <strong>${vars.property}</strong> ${leadCopy}.
          </p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;background:#fafaf6;border-radius:6px;padding:16px;border:1px solid #ece6d8;">
            <tr><td style="font-size:13px;color:#6b6450;padding:4px 8px;">Amount</td>
                <td style="font-size:15px;font-weight:600;text-align:right;padding:4px 8px;">${vars.amount}</td></tr>
            <tr><td style="font-size:13px;color:#6b6450;padding:4px 8px;">Due date</td>
                <td style="font-size:15px;font-weight:600;text-align:right;padding:4px 8px;">${vars.dueDate}</td></tr>
            <tr><td style="font-size:13px;color:#6b6450;padding:4px 8px;">Property</td>
                <td style="font-size:14px;text-align:right;padding:4px 8px;">${vars.property}</td></tr>
          </table>
          ${
            vars.paymentInstructions
              ? `<p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:#3d3a2e;"><strong>Payment instructions:</strong><br>${vars.paymentInstructions.replace(/\n/g, '<br>')}</p>`
              : ''
          }
          <p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#6b6450;">
            If you've already paid, please ignore this message. Reply to this email if you have any questions.
          </p>
          <p style="margin:16px 0 0;font-size:13px;color:#1c1c1c;">— ${vars.landlord}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const smsBody = `Hi ${vars.tenantName}, your rent of ${vars.amount} for ${vars.property} ${leadCopy} (${vars.dueDate}). — ${vars.landlord}`;

  return { subject, body, smsBody };
}

// ── Cron: enqueue PENDING_APPROVAL reminders ────────────────────────

interface ReceiptWithContext {
  receipt: RentReceipt;
  tenancy: Tenancy;
  property: RentalProperty;
}

function startOfDayUtc(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/**
 * Sentinel leadDays for "overdue receipt — landlord hasn't been paid
 * yet". We use a single row per receipt (uniqued on (receiptId, -1))
 * so a 6-month-overdue tenant gets exactly one pending reminder, not
 * one per missed lead-day. Re-runs of the scan are a no-op once the
 * row exists; the landlord can manually reject + a future scan won't
 * re-create it because the unique constraint still blocks.
 */
const OVERDUE_LEAD_DAYS_SENTINEL = -1;

async function enqueueOne(
  ctx: ReceiptWithContext,
  leadDays: number,
  daysOverdue: number,
): Promise<boolean> {
  // Resolve landlord name + payment instructions in priority order so a
  // multi-property user can override per flat without losing the
  // account-level defaults: per-property → per-user config → env.
  // `RentalProperty.landlordName`/`paymentInstructions` are nullable so
  // a blank string falls through to the next tier.
  const propertyWithExtras = ctx.property as typeof ctx.property & {
    landlordName?: string | null;
    paymentInstructions?: string | null;
  };
  const userPaymentInstructions = await getUserPaymentInstructions(ctx.property.userId);
  const userRow = await prisma.user.findUnique({
    where: { id: ctx.property.userId },
    select: { name: true },
  });
  const landlord =
    propertyWithExtras.landlordName?.trim()
    || userRow?.name?.trim()
    || env.LANDLORD_BRAND_NAME;
  const paymentInstructions =
    propertyWithExtras.paymentInstructions?.trim()
    || userPaymentInstructions?.trim()
    || env.RENT_PAYMENT_INSTRUCTIONS;
  const vars: TemplateVars = {
    tenantName: ctx.tenancy.tenantName,
    amount: formatINRPlain(new Prisma.Decimal(ctx.receipt.expectedAmount.toString())),
    dueDate: formatIsoDate(ctx.receipt.dueDate),
    property: ctx.property.name,
    landlord,
    paymentInstructions,
    leadDays,
    daysOverdue,
  };
  const { subject, body, smsBody } = buildTemplate(vars);
  const channels = {
    email: !!ctx.tenancy.tenantEmail,
    sms: !!ctx.tenancy.tenantPhone,
  };
  try {
    await prisma.rentReminder.create({
      data: {
        receiptId: ctx.receipt.id,
        tenancyId: ctx.tenancy.id,
        leadDays,
        status: REMINDER_STATUS.PENDING_APPROVAL,
        channels,
        subject,
        body,
        smsBody,
      },
    });
    return true;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== 'P2002') {
      logger.error(
        { err, receiptId: ctx.receipt.id, leadDays },
        '[rental.reminders] failed to enqueue reminder',
      );
    }
    return false;
  }
}

/**
 * Two passes:
 *  1. **Upcoming** — every EXPECTED receipt whose dueDate lands on
 *     (today + leadDays) for leadDays in REMINDER_LEAD_DAYS (5/3/1/0).
 *  2. **Overdue** — every OVERDUE receipt for an active tenancy with a
 *     contact, dedup'd to one row per receipt via the sentinel
 *     `leadDays = -1`. Without this pass a tenancy created with a past
 *     startDate (or one whose tenant missed several months) generated
 *     no reminders at all because the lead-day window only looked
 *     forward.
 *
 * Unique constraint on (receiptId, leadDays) means re-running the scan
 * is safe — duplicates are silently dropped.
 *
 * Cron callers use `runInSystemContext` so this query can see every
 * user; non-cron callers may pass a `userId` to scope.
 */
/**
 * Crude tenantContact → tenantEmail/tenantPhone split. Pre-existing
 * tenancies (created before the dedicated fields landed) only have the
 * legacy `tenantContact` string. We don't force a manual edit just to
 * unblock reminders — if the string looks like an email or an Indian
 * 10-digit mobile, route it to the appropriate field once. Anything
 * else stays in tenantContact and the UI surfaces "Add tenant
 * email/phone" so the landlord can edit explicitly.
 */
async function migrateLegacyContactsIfNeeded(userId?: string): Promise<void> {
  const candidates = await prisma.tenancy.findMany({
    where: {
      isActive: true,
      tenantEmail: null,
      tenantPhone: null,
      tenantContact: { not: null },
      ...(userId ? { property: { userId } } : {}),
    },
    select: { id: true, tenantContact: true },
  });
  for (const t of candidates) {
    const raw = (t.tenantContact ?? '').trim();
    if (!raw) continue;
    const data: { tenantEmail?: string; tenantPhone?: string } = {};
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
      data.tenantEmail = raw;
    } else {
      const digits = raw.replace(/\D/g, '');
      if (/^[6-9]\d{9}$/.test(digits)) data.tenantPhone = digits;
      else if (/^91[6-9]\d{9}$/.test(digits)) data.tenantPhone = digits.slice(2);
    }
    if (Object.keys(data).length > 0) {
      await prisma.tenancy.update({ where: { id: t.id }, data });
      logger.info({ tenancyId: t.id, fields: Object.keys(data) }, '[rental.reminders] migrated legacy tenantContact');
    }
  }
}

export async function enqueuePendingReminders(userId?: string): Promise<number> {
  // Step 0a. Promote legacy tenantContact strings to the structured
  // tenantEmail / tenantPhone fields where unambiguous, so reminders
  // can actually send instead of always reporting "missing contact".
  await migrateLegacyContactsIfNeeded(userId);
  // Step 0b. Flip any EXPECTED-but-past-due receipts to OVERDUE first.
  // Existing tenancies created before generate-time OVERDUE stamping
  // landed have rows that linger in EXPECTED past their dueDate; the
  // upcoming-window scan won't match them and the overdue scan won't
  // see them until cron flips the status. Run the same logic inline so
  // the manual "Run scan" button is enough to surface the backlog.
  await markOverdueReceipts(userId);

  const today = startOfDayUtc(new Date());
  let queued = 0;

  // ── 1. Upcoming receipts ──────────────────────────────────────────
  //
  // No contact filter: we queue the reminder regardless of whether the
  // tenancy has an email or phone on file so the landlord sees a
  // "pending" row even when the contact details are missing. The send
  // step still respects per-channel presence and marks the channel as
  // failed with reason="tenant_*_missing" — the UI uses that to prompt
  // the landlord to fill in the tenancy contact fields before approving.
  for (const leadDays of REMINDER_LEAD_DAYS) {
    const target = new Date(today);
    target.setUTCDate(target.getUTCDate() + leadDays);

    const receipts: ReceiptWithContext[] = (await prisma.rentReceipt.findMany({
      where: {
        status: 'EXPECTED',
        dueDate: target,
        tenancy: {
          ...(userId ? { property: { userId } } : {}),
          isActive: true,
        },
      },
      include: { tenancy: { include: { property: true } } },
    })).map((r) => ({
      receipt: r,
      tenancy: r.tenancy,
      property: r.tenancy.property,
    }));

    for (const ctx of receipts) {
      if (await enqueueOne(ctx, leadDays, 0)) queued += 1;
    }
  }

  // ── 2. Overdue receipts (one reminder per receipt, sentinel -1) ──
  const overdueReceipts: ReceiptWithContext[] = (await prisma.rentReceipt.findMany({
    where: {
      status: 'OVERDUE',
      tenancy: {
        ...(userId ? { property: { userId } } : {}),
        isActive: true,
      },
    },
    include: { tenancy: { include: { property: true } } },
  })).map((r) => ({
    receipt: r,
    tenancy: r.tenancy,
    property: r.tenancy.property,
  }));

  for (const ctx of overdueReceipts) {
    const daysOverdue = Math.max(
      1,
      Math.floor((today.getTime() - ctx.receipt.dueDate.getTime()) / 86_400_000),
    );
    if (await enqueueOne(ctx, OVERDUE_LEAD_DAYS_SENTINEL, daysOverdue)) {
      queued += 1;
    }
  }

  if (queued > 0) {
    logger.info({ queued, userId: userId ?? '<all>' }, '[rental.reminders] enqueued');
  }
  return queued;
}

// ── Supersede helper ────────────────────────────────────────────────

/**
 * When a receipt flips to RECEIVED (manual mark or auto-match), abandon
 * any PENDING_APPROVAL reminders for it — there's nothing left to remind
 * about. Called from rental.service.ts after a receipt status change.
 */
export async function supersedePendingForReceipt(receiptId: string): Promise<void> {
  await prisma.rentReminder.updateMany({
    where: { receiptId, status: REMINDER_STATUS.PENDING_APPROVAL },
    data: { status: REMINDER_STATUS.SUPERSEDED },
  });
}

// ── Reads ───────────────────────────────────────────────────────────

export async function listReminders(
  userId: string,
  filter: { status?: ReminderStatus; tenancyId?: string } = {},
) {
  return prisma.rentReminder.findMany({
    where: {
      tenancy: { property: { userId } },
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.tenancyId ? { tenancyId: filter.tenancyId } : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      tenancy: {
        select: {
          id: true,
          tenantName: true,
          tenantEmail: true,
          tenantPhone: true,
          property: { select: { id: true, name: true } },
        },
      },
      receipt: {
        select: {
          id: true,
          forMonth: true,
          dueDate: true,
          expectedAmount: true,
          status: true,
        },
      },
    },
  });
}

async function getReminderOwned(userId: string, id: string) {
  const row = await prisma.rentReminder.findUnique({
    where: { id },
    include: {
      tenancy: {
        include: { property: { select: { userId: true } } },
      },
      receipt: true,
    },
  });
  if (!row) throw new NotFoundError('Reminder not found');
  if (row.tenancy.property.userId !== userId) throw new ForbiddenError();
  return row;
}

// ── Mutations ───────────────────────────────────────────────────────

export interface UpdateReminderInput {
  subject?: string;
  body?: string;
  smsBody?: string;
  channels?: { email?: boolean; sms?: boolean };
}

export async function updateReminder(
  userId: string,
  id: string,
  patch: UpdateReminderInput,
): Promise<RentReminder> {
  const existing = await getReminderOwned(userId, id);
  if (existing.status !== REMINDER_STATUS.PENDING_APPROVAL) {
    throw new BadRequestError(
      'Only PENDING_APPROVAL reminders can be edited',
    );
  }
  const data: Prisma.RentReminderUpdateInput = {};
  if (patch.subject !== undefined) data.subject = patch.subject;
  if (patch.body !== undefined) data.body = patch.body;
  if (patch.smsBody !== undefined) data.smsBody = patch.smsBody;
  if (patch.channels !== undefined) {
    const cur = (existing.channels ?? {}) as { email?: boolean; sms?: boolean };
    data.channels = {
      email: patch.channels.email ?? cur.email ?? false,
      sms: patch.channels.sms ?? cur.sms ?? false,
    };
  }
  return prisma.rentReminder.update({ where: { id }, data });
}

export async function rejectReminder(userId: string, id: string): Promise<RentReminder> {
  const existing = await getReminderOwned(userId, id);
  if (existing.status !== REMINDER_STATUS.PENDING_APPROVAL) {
    throw new BadRequestError('Only PENDING_APPROVAL reminders can be rejected');
  }
  return prisma.rentReminder.update({
    where: { id },
    data: { status: REMINDER_STATUS.REJECTED },
  });
}

/**
 * Approve + send. Locks the row to APPROVED first, then dispatches each
 * enabled channel. The final row status reflects the worst outcome:
 *  - all enabled channels sent → SENT
 *  - at least one channel failed → FAILED (per-channel error captured)
 *  - no channels enabled → FAILED with reason='no_channels_enabled'
 *
 * `channelOverride` lets the caller force which channels actually fire
 * for this one send without persisting the change to the row's
 * `channels` JSON (so toggling "email only" once doesn't permanently
 * disable SMS for future scans). When omitted, the stored channels
 * are used as-is.
 */
export async function approveAndSendReminder(
  userId: string,
  id: string,
  channelOverride?: { email?: boolean; sms?: boolean },
): Promise<RentReminder> {
  const existing = await getReminderOwned(userId, id);
  if (existing.status !== REMINDER_STATUS.PENDING_APPROVAL) {
    throw new BadRequestError('Only PENDING_APPROVAL reminders can be approved');
  }
  const storedChannels = (existing.channels ?? {}) as { email?: boolean; sms?: boolean };
  const channels: { email?: boolean; sms?: boolean } = channelOverride
    ? {
        email: channelOverride.email ?? storedChannels.email ?? false,
        sms: channelOverride.sms ?? storedChannels.sms ?? false,
      }
    : storedChannels;
  const tenantEmail = existing.tenancy.tenantEmail;
  const tenantPhone = existing.tenancy.tenantPhone;

  await prisma.rentReminder.update({
    where: { id },
    data: { status: REMINDER_STATUS.APPROVED, approvedAt: new Date() },
  });

  let emailStatus: string | null = null;
  let emailError: string | null = null;
  let smsStatus: string | null = null;
  let smsError: string | null = null;
  let anySuccess = false;
  let anyEnabled = false;

  if (channels.email) {
    anyEnabled = true;
    if (!tenantEmail) {
      emailStatus = 'failed';
      emailError = 'tenant_email_missing';
    } else {
      // Two send paths in priority order:
      //   1. Gmail API via the user's existing OAuth connection — zero
      //      password input, just a Google consent screen.
      //   2. SMTP (per-user config / env fallback) — for non-Gmail
      //      providers or users who haven't connected Gmail yet.
      const propertyOwnerId = existing.tenancy.property.userId;
      let res: { sent: boolean; reason?: string };
      const gmailAccount = await getGmailSendAccount(propertyOwnerId);
      if (gmailAccount) {
        res = await sendViaGmailApi({
          userId: propertyOwnerId,
          to: tenantEmail,
          subject: existing.subject,
          html: existing.body,
        });
      } else {
        const config = await getEmailConfigForUser(propertyOwnerId);
        res = await sendEmail({
          to: tenantEmail,
          subject: existing.subject,
          html: existing.body,
          config: config ?? undefined,
        });
      }
      if (res.sent) {
        emailStatus = 'sent';
        anySuccess = true;
      } else {
        emailStatus = 'failed';
        emailError = res.reason ?? 'unknown_send_error';
      }
    }
  } else {
    emailStatus = 'skipped';
  }

  if (channels.sms) {
    anyEnabled = true;
    if (!tenantPhone) {
      smsStatus = 'failed';
      smsError = 'tenant_phone_missing';
    } else {
      const res = await sendSms({ to: tenantPhone, body: existing.smsBody });
      if (res.sent) {
        smsStatus = 'sent';
        anySuccess = true;
      } else {
        smsStatus = 'failed';
        smsError = res.reason;
      }
    }
  } else {
    smsStatus = 'skipped';
  }

  const finalStatus: ReminderStatus = !anyEnabled
    ? REMINDER_STATUS.FAILED
    : anySuccess && !emailError && !smsError
      ? REMINDER_STATUS.SENT
      : anySuccess
        ? REMINDER_STATUS.SENT // partial success — still mark SENT, errors captured per channel
        : REMINDER_STATUS.FAILED;

  return prisma.rentReminder.update({
    where: { id },
    data: {
      status: finalStatus,
      sentAt: new Date(),
      emailStatus,
      emailError,
      smsStatus,
      smsError,
    },
  });
}
