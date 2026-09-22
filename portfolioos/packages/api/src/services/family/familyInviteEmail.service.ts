/**
 * Emailing a family invitation from inside the app.
 *
 * The same rules as the professional invitation (see caInviteEmail.service):
 * the owner writes the subject and a personal note; the link, the expiry, who
 * sent it and "ignore this if you weren't expecting it" are fixed by the
 * template, because the mail leaves our domain. Bounded per invitation and per
 * sender per hour, counted off the audit log.
 */

import type { Request } from 'express';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../notifications/email.service.js';
import { renderInviteShell } from '../notifications/caInviteEmail.template.js';
import { assertOwnerOf } from '../familyScope.service.js';

const MAX_SENDS_PER_INVITE = 5;
const MAX_SENDS_PER_HOUR = 20;
const SUBJECT_MAX = 160;
const MESSAGE_MAX = 4000;
const AUDIT_ACTION = 'family_invite_emailed';

export interface FamilyInviteEmailEdits {
  subject?: string;
  message?: string;
}

export interface FamilyInviteEmailDraft {
  to: string;
  recipientName: string;
  subject: string;
  message: string;
  html: string;
  acceptUrl: string;
  expiresOn: string;
  senderName: string;
  senderEmail: string;
  familyName: string;
  sendsRemaining: number;
  canSend: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function prettyDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function defaultFamilyInviteSubject(senderName: string, familyName: string): string {
  return `${senderName || 'A family member'} invited you to ${familyName} on EveryPaisa`;
}

export function defaultFamilyInviteMessage(
  senderName: string,
  recipientName: string,
  familyName: string,
  relation: string | null,
  /** Whose relation this is: null when it is the sender's own ("my son"). */
  relatedToName: string | null = null,
): string {
  const to = recipientName.trim().split(/\s+/)[0] || 'there';
  const whose = relatedToName ? `${relatedToName}'s` : 'my';
  const as = relation ? ` as ${whose} ${relation.toLowerCase()}` : '';
  return (
    `Hi ${to},\n\n` +
    `I've set up ${familyName} on EveryPaisa, where we keep the family's investments, ` +
    `insurance and property in one place. I've added you${as} — if you accept below, ` +
    `you'll join the family and see what's shared with you.\n\n` +
    `Your own finances stay yours: you decide what the rest of us can see.\n\n` +
    `— ${senderName || 'Family'}`
  );
}

/** The invitation this request is about, or a refusal that names the reason. */
async function loadInvitation(callerId: string, familyId: string, invitationId: string) {
  await assertOwnerOf(callerId, familyId);
  // Privileged: FamilyInvitation's policy shows an owner only the rows they
  // sent. Ownership of this family is proven above and the read is pinned to it.
  const inv = await runAsSystem(() =>
    prisma.familyInvitation.findUnique({
      where: { id: invitationId },
      include: { family: { select: { name: true } } },
    }),
  );
  if (!inv || inv.familyId !== familyId) throw new NotFoundError('Invitation not found.');
  if (inv.acceptedAt) throw new BadRequestError('That invitation has already been accepted.');
  if (inv.expiresAt < new Date()) {
    throw new BadRequestError('That invitation has expired. Send a fresh one.');
  }
  return inv;
}

async function sendCounts(callerId: string, invitationId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return runAsSystem(async () => {
    const [forInvite, forHour] = await Promise.all([
      prisma.auditLog.count({
        where: { userId: callerId, action: AUDIT_ACTION, resource: `FamilyInvitation:${invitationId}` },
      }),
      prisma.auditLog.count({
        where: { userId: callerId, action: AUDIT_ACTION, createdAt: { gte: since } },
      }),
    ]);
    return { forInvite, forHour };
  });
}

export async function buildFamilyInviteEmail(
  callerId: string,
  familyId: string,
  invitationId: string,
  edits: FamilyInviteEmailEdits = {},
): Promise<FamilyInviteEmailDraft> {
  const inv = await loadInvitation(callerId, familyId, invitationId);
  const sender = await prisma.user.findUnique({
    where: { id: callerId },
    select: { name: true, email: true },
  });
  if (!sender) throw new NotFoundError('User not found.');
  const senderName = sender.name || sender.email;
  const recipientName = inv.invitedName || inv.invitedEmail.split('@')[0]!;
  const familyName = inv.family.name;
  // "my son" when the relation is to the sender; "Priya's son" otherwise.
  const relatedTo =
    inv.relatedToId && inv.relatedToId !== callerId
      ? await runAsSystem(() =>
          prisma.user.findUnique({ where: { id: inv.relatedToId! }, select: { name: true } }),
        )
      : null;

  const subject =
    (edits.subject ?? '').trim() || defaultFamilyInviteSubject(senderName, familyName);
  const message =
    (edits.message ?? '').trim() ||
    defaultFamilyInviteMessage(
      senderName,
      recipientName,
      familyName,
      inv.relation,
      relatedTo?.name ?? null,
    );
  if (subject.length > SUBJECT_MAX) {
    throw new BadRequestError(`Subject is too long (max ${SUBJECT_MAX} characters).`);
  }
  if (message.length > MESSAGE_MAX) {
    throw new BadRequestError(`Message is too long (max ${MESSAGE_MAX} characters).`);
  }
  if (/[\r\n]/.test(subject)) throw new BadRequestError('Subject must be a single line.');

  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const acceptUrl = `${base}/families/invitations/${inv.token}/accept`;
  const expiresOn = prettyDate(inv.expiresAt);

  const { html } = renderInviteShell({
    title: 'Family invitation',
    heading: `${senderName} invited you to ${familyName}`,
    preheader: `${senderName} has invited you to join ${familyName} on EveryPaisa. The link expires on ${expiresOn}.`,
    closingHtml: `Sent to ${escapeHtml(inv.invitedEmail)} by ${escapeHtml(senderName)} (${escapeHtml(sender.email)}). If you weren't expecting this, you can ignore it — nothing is shared until you accept.`,
    message,
    acceptUrl,
    expiresOn,
    logoUrl: `${base}/brand/everypaisa-mark.png`,
    buttonLabel: 'Join the family',
  });

  const counts = await sendCounts(callerId, invitationId);
  return {
    to: inv.invitedEmail,
    recipientName,
    subject,
    message,
    html,
    acceptUrl,
    expiresOn,
    senderName,
    senderEmail: sender.email,
    familyName,
    sendsRemaining: Math.max(0, MAX_SENDS_PER_INVITE - counts.forInvite),
    canSend: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
  };
}

export interface SendFamilyInviteEmailResult {
  sent: boolean;
  to: string;
  sendsRemaining: number;
  reason?: string;
}

export async function sendFamilyInviteEmail(
  callerId: string,
  familyId: string,
  invitationId: string,
  edits: FamilyInviteEmailEdits,
  req?: Request,
): Promise<SendFamilyInviteEmailResult> {
  const draft = await buildFamilyInviteEmail(callerId, familyId, invitationId, edits);
  const counts = await sendCounts(callerId, invitationId);
  if (counts.forInvite >= MAX_SENDS_PER_INVITE) {
    throw new BadRequestError(
      `This invitation has already been emailed ${MAX_SENDS_PER_INVITE} times. Copy the link and send it yourself.`,
    );
  }
  if (counts.forHour >= MAX_SENDS_PER_HOUR) {
    throw new BadRequestError('You have sent a lot of invitations in the last hour. Try again shortly.');
  }
  if (!draft.canSend) {
    return {
      sent: false,
      to: draft.to,
      sendsRemaining: draft.sendsRemaining,
      reason: 'Email is not configured on this server. Copy the link and send it yourself.',
    };
  }

  const { text } = renderInviteShell({
    title: 'Family invitation',
    heading: `${draft.senderName} invited you to ${draft.familyName}`,
    preheader: '',
    closingHtml: `Sent to ${draft.to} by ${draft.senderName} (${draft.senderEmail}). If you weren't expecting this, you can ignore it — nothing is shared until you accept.`,
    message: draft.message,
    acceptUrl: draft.acceptUrl,
    expiresOn: draft.expiresOn,
    buttonLabel: 'Join the family',
  });

  const result = await sendEmail({
    to: draft.to,
    subject: draft.subject,
    html: draft.html,
    text,
    // Replies reach the person who invited them, not our mailbox.
    replyTo: draft.senderEmail,
  });
  if (!result.sent) {
    logger.error({ invitationId, reason: result.reason }, '[family] invitation email failed');
    return {
      sent: false,
      to: draft.to,
      sendsRemaining: draft.sendsRemaining,
      reason: 'The email could not be sent just now. Copy the link and send it yourself.',
    };
  }

  await runAsSystem(() =>
    prisma.auditLog.create({
      data: {
        userId: callerId,
        action: AUDIT_ACTION,
        resource: `FamilyInvitation:${invitationId}`,
        ip: req?.ip ?? null,
        userAgent: req?.header('user-agent') ?? null,
        metadata: { to: draft.to, subject: draft.subject },
      },
    }),
  );
  return {
    sent: true,
    to: draft.to,
    sendsRemaining: Math.max(0, MAX_SENDS_PER_INVITE - (counts.forInvite + 1)),
  };
}
