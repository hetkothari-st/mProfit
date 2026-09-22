/**
 * Sending a client their invitation, from inside the app.
 *
 * Until now the invite produced a link and the advisor mailed it themselves.
 * That works and looks like nothing: a bare URL from a personal address, which
 * is exactly the shape of the phishing the recipient is supposed to be wary
 * of. Sending it ourselves means the message says who we are, what is being
 * asked for, and how to refuse — in a form the recipient can recognise.
 *
 * Two rules make that safe to offer.
 *
 * First, the advisor writes the MESSAGE, not the email. Subject and a personal
 * note are theirs; the link, the expiry, the attribution and the "ignore this
 * if you weren't expecting it" line are rendered by the template and cannot be
 * edited away. This leaves our SMTP domain, so composing the whole thing would
 * be composing anything, from us, to anyone.
 *
 * Second, it is bounded. One invitation can be mailed a handful of times, and
 * one advisor a modest number per hour, counted off the audit trail that was
 * already being written. Neither limit inconveniences a real CA inviting real
 * clients; both stop the endpoint being a mailer.
 */

import type { Request } from 'express';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../notifications/email.service.js';
import {
  renderCaInviteEmail,
  defaultInviteMessage,
  defaultInviteSubject,
} from '../notifications/caInviteEmail.template.js';
import { recordCaAudit } from './caAudit.service.js';

/** How many times one invitation may be mailed, counting the first. */
const MAX_SENDS_PER_INVITE = 5;
/** How many invitation emails one advisor may send in an hour, across clients. */
const MAX_SENDS_PER_HOUR = 20;

const SUBJECT_MAX = 160;
const MESSAGE_MAX = 4000;

export interface InviteEmailEdits {
  subject?: string;
  message?: string;
}

export interface InviteEmailDraft {
  to: string;
  recipientName: string;
  subject: string;
  /** The editable note, plain text. */
  message: string;
  /** Exactly what would be sent, with the edits applied. */
  html: string;
  acceptUrl: string;
  expiresOn: string;
  advisorName: string;
  advisorEmail: string;
  /** How many more times this invitation may be mailed. */
  sendsRemaining: number;
  /**
   * False when the server has no SMTP configured, so the UI can say "copy the
   * link instead" rather than offering a button that quietly does nothing.
   */
  canSend: boolean;
}

function prettyDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * The invitation this request is about, or a refusal that says which of the
 * several reasons applies — an advisor staring at a dead button deserves to
 * know whether it is the wrong client, an accepted invite or an expired one.
 */
async function loadInvitation(callerId: string, clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.advisorId !== callerId) {
    throw new ForbiddenError('That client is not yours.');
  }
  if (client.kind !== 'INVITED') {
    throw new BadRequestError(
      'This is a record you keep yourself — there is nobody to invite. Invite them properly if they should have their own login.',
    );
  }
  if (client.acceptedAt) {
    throw new BadRequestError('That invitation has already been accepted.');
  }
  if (client.status === 'REVOKED') {
    throw new BadRequestError('That invitation was withdrawn. Send a fresh one.');
  }
  if (!client.inviteToken || !client.invitedEmail) {
    throw new NotFoundError('That invitation no longer has a link to send.');
  }
  if (client.inviteExpiresAt && client.inviteExpiresAt < new Date()) {
    throw new BadRequestError('That invitation has expired. Send a fresh one.');
  }
  return client;
}

/** The advisor's own name and address. Their own row, so no privilege needed. */
async function loadAdvisor(callerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: callerId },
    select: { name: true, email: true },
  });
  if (!user) throw new NotFoundError('User not found.');
  return { name: user.name || user.email, email: user.email };
}

/**
 * How many invitation emails have already gone out — for this invitation, and
 * for this advisor in the last hour.
 *
 * Counted off `CaAuditLog`, which was already recording every send, rather
 * than a counter column that could disagree with the trail the client reads.
 * The read is privileged because the audit policy scopes rows to the actor or
 * the subject and this is a count of the caller's own actions either way.
 */
async function sendCounts(callerId: string, clientId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return runAsSystem(async () => {
    const [forInvite, forHour] = await Promise.all([
      prisma.caAuditLog.count({
        where: { clientId, actorUserId: callerId, action: 'INVITATION_EMAILED' },
      }),
      prisma.caAuditLog.count({
        where: { actorUserId: callerId, action: 'INVITATION_EMAILED', createdAt: { gte: since } },
      }),
    ]);
    return { forInvite, forHour };
  });
}

/** Trim and bound the advisor's edits, or fall back to the defaults. */
function applyEdits(
  edits: InviteEmailEdits,
  advisorName: string,
  recipientName: string,
): { subject: string; message: string } {
  const subject = (edits.subject ?? '').trim() || defaultInviteSubject(advisorName);
  const message = (edits.message ?? '').trim() || defaultInviteMessage(advisorName, recipientName);

  if (subject.length > SUBJECT_MAX) {
    throw new BadRequestError(`Subject is too long (max ${SUBJECT_MAX} characters).`);
  }
  if (message.length > MESSAGE_MAX) {
    throw new BadRequestError(`Message is too long (max ${MESSAGE_MAX} characters).`);
  }
  // A subject with a newline in it can inject a second header in some mail
  // paths. Nothing legitimate needs one.
  if (/[\r\n]/.test(subject)) {
    throw new BadRequestError('Subject must be a single line.');
  }
  return { subject, message };
}

/**
 * What the advisor is about to send, rendered exactly as it will go out.
 *
 * Preview and send run through the same builder on purpose: a preview produced
 * by a second code path is a preview that can lie.
 */
export async function buildInviteEmail(
  callerId: string,
  clientId: string,
  edits: InviteEmailEdits = {},
): Promise<InviteEmailDraft> {
  const client = await loadInvitation(callerId, clientId);
  const advisor = await loadAdvisor(callerId);
  const { subject, message } = applyEdits(edits, advisor.name, client.name);

  const acceptUrl = `${env.FRONTEND_URL.replace(/\/$/, '')}/ca/invitations/${client.inviteToken}/accept`;
  const expiresOn = prettyDate(client.inviteExpiresAt ?? new Date());

  const { html } = renderCaInviteEmail({
    recipientName: client.name,
    advisorName: advisor.name,
    advisorEmail: advisor.email,
    message,
    acceptUrl,
    expiresOn,
  });

  const counts = await sendCounts(callerId, clientId);

  return {
    to: client.invitedEmail!,
    recipientName: client.name,
    subject,
    message,
    html,
    acceptUrl,
    expiresOn,
    advisorName: advisor.name,
    advisorEmail: advisor.email,
    sendsRemaining: Math.max(0, MAX_SENDS_PER_INVITE - counts.forInvite),
    canSend: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
  };
}

export interface SendInviteEmailResult {
  sent: boolean;
  to: string;
  sendsRemaining: number;
  /** Present when the send did not happen, in words the advisor can act on. */
  reason?: string;
}

/**
 * Send it, and record that it went.
 *
 * The audit entry is written in the same transaction as nothing else, which is
 * deliberate: the email has already left by then and a rollback could not
 * recall it, so the trail is written after the fact rather than pretending the
 * two are atomic. What it must not do is claim a send that failed — hence the
 * result check before the entry.
 */
export async function sendInviteEmail(
  callerId: string,
  clientId: string,
  edits: InviteEmailEdits,
  req?: Request,
): Promise<SendInviteEmailResult> {
  const draft = await buildInviteEmail(callerId, clientId, edits);
  const counts = await sendCounts(callerId, clientId);

  if (counts.forInvite >= MAX_SENDS_PER_INVITE) {
    throw new BadRequestError(
      `This invitation has already been emailed ${MAX_SENDS_PER_INVITE} times. Copy the link and send it yourself, or start a fresh invitation.`,
    );
  }
  if (counts.forHour >= MAX_SENDS_PER_HOUR) {
    throw new BadRequestError(
      'You have sent a lot of invitations in the last hour. Try again shortly.',
    );
  }
  if (!draft.canSend) {
    return {
      sent: false,
      to: draft.to,
      sendsRemaining: draft.sendsRemaining,
      reason: 'Email is not configured on this server. Copy the link and send it yourself.',
    };
  }

  const { text } = renderCaInviteEmail({
    recipientName: draft.recipientName,
    advisorName: draft.advisorName,
    advisorEmail: draft.advisorEmail,
    message: draft.message,
    acceptUrl: draft.acceptUrl,
    expiresOn: draft.expiresOn,
  });

  const result = await sendEmail({
    to: draft.to,
    subject: draft.subject,
    html: draft.html,
    text,
    // Replies go to the advisor, not into our mailbox: the recipient's first
    // instinct on an unexpected access request is to ask the person who sent
    // it, and that should reach them.
    replyTo: draft.advisorEmail,
  });

  if (!result.sent) {
    logger.error({ clientId, reason: result.reason }, '[ca] invitation email failed');
    return {
      sent: false,
      to: draft.to,
      sendsRemaining: draft.sendsRemaining,
      reason: 'The email could not be sent just now. Copy the link and send it yourself.',
    };
  }

  await runInTransaction((tx) =>
    recordCaAudit(
      tx,
      { actorUserId: callerId, subjectUserId: callerId, clientId, req },
      {
        action: 'INVITATION_EMAILED',
        resourceType: 'Client',
        resourceId: clientId,
        summary: `Invitation emailed to ${draft.to}.`,
        after: { subject: draft.subject },
      },
    ),
  );

  return {
    sent: true,
    to: draft.to,
    sendsRemaining: Math.max(0, MAX_SENDS_PER_INVITE - (counts.forInvite + 1)),
  };
}
