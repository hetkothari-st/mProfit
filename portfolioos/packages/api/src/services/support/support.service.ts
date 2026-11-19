import type { Prisma, SupportStatus as DbStatus, SupportTopic as DbTopic } from '@prisma/client';
import {
  SUPPORT_MAX_PER_HOUR,
  type AdminSupportTicketDTO,
  type CreateSupportTicketRequest,
  type SupportTicketDTO,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { NotFoundError, TooManyRequestsError } from '../../lib/errors.js';
import { sendEmail } from '../notifications/email.service.js';
import { buildSupportEmail } from './supportEmail.template.js';

const HOUR_MS = 3_600_000;

type Row = Prisma.SupportTicketGetPayload<Record<string, never>>;

/** The ticket as its owner sees it: never the team's private note. */
export function toTicketDTO(t: Row): SupportTicketDTO {
  return {
    id: t.id,
    topic: t.topic,
    subject: t.subject,
    message: t.message,
    status: t.status,
    pagePath: t.pagePath,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
  };
}

/** Only a path: no query string or fragment (those can carry ids or tokens), and bounded in length. */
export function cleanPagePath(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const path = raw.split(/[?#]/)[0]!.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path.slice(0, 120);
}

export async function createTicket(
  userId: string,
  input: CreateSupportTicketRequest,
  now: Date = new Date(),
): Promise<SupportTicketDTO> {
  const recent = await prisma.supportTicket.count({
    where: { userId, createdAt: { gte: new Date(now.getTime() - HOUR_MS) } },
  });
  if (recent >= SUPPORT_MAX_PER_HOUR) {
    throw new TooManyRequestsError(
      'You have sent several requests in the last hour. Please wait a little, or add to a request you already sent by replying to our email.',
    );
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId,
      topic: input.topic as DbTopic,
      subject: input.subject.trim(),
      message: input.message.trim(),
      pagePath: cleanPagePath(input.pagePath),
    },
  });

  // Tell the team. Best effort: the request is already saved and visible to the team in Settings, so a
  // mail failure must not make the user think nothing was sent.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  let delivered = false;
  if (user) {
    try {
      const mail = buildSupportEmail({
        ticketId: ticket.id,
        topic: input.topic,
        subject: ticket.subject,
        message: ticket.message,
        pagePath: ticket.pagePath,
        from: user,
      });
      const res = await sendEmail({ to: env.SUPPORT_EMAIL, replyTo: user.email, ...mail });
      delivered = res.sent === true;
    } catch (err) {
      logger.error({ err, ticketId: ticket.id }, '[support] notification email failed');
    }
  }
  if (delivered) {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { emailDelivered: true } });
  }
  return toTicketDTO(ticket);
}

export async function listMyTickets(userId: string): Promise<SupportTicketDTO[]> {
  const rows = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(toTicketDTO);
}

// ─── Team (ADMIN) ───────────────────────────────────────────────────────────────

export async function adminListTickets(filter: { status?: DbStatus } = {}): Promise<AdminSupportTicketDTO[]> {
  const rows = await runAsSystem(() =>
    prisma.supportTicket.findMany({
      where: filter.status ? { status: filter.status } : {},
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  );
  return rows.map((r) => ({
    ...toTicketDTO(r),
    user: r.user,
    adminNote: r.adminNote,
    emailDelivered: r.emailDelivered,
  }));
}

export async function adminUpdateTicket(
  id: string,
  patch: { status?: DbStatus; adminNote?: string | null },
): Promise<AdminSupportTicketDTO> {
  const updated = await runAsSystem(async () => {
    const existing = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundError('Support request not found');
    return prisma.supportTicket.update({
      where: { id },
      data: {
        ...(patch.status ? { status: patch.status, resolvedAt: patch.status === 'RESOLVED' ? new Date() : null } : {}),
        ...(patch.adminNote !== undefined ? { adminNote: patch.adminNote === null ? null : patch.adminNote.trim() || null } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  });
  return {
    ...toTicketDTO(updated),
    user: updated.user,
    adminNote: updated.adminNote,
    emailDelivered: updated.emailDelivered,
  };
}
