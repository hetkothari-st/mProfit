import type { FirmSeat, FirmSeatStatus } from '@prisma/client';
import type { Request } from 'express';
import { inviteTokenHash, newInviteToken } from '../../lib/inviteToken.js';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { recordCaAudit } from './caAudit.service.js';

/**
 * Seats in a CA's firm.
 *
 * The CA invites a staff member by email; they accept from their own account
 * (their own login and two-factor sign-in). The CA then assigns them clients.
 * A staff member works on an assigned client under that client's own grant —
 * its window, portfolios and edit rights — and nothing else: no billing, no
 * inviting clients, no closing engagements, no seats. Access follows from the
 * database rule app_is_active_ca_for → app_acts_for_client (migration
 * 20261127200000_ca_firm_seats); this service only creates and ends seats.
 *
 * The account holder is told by name who on the firm's staff can open their
 * books, and every assignment change lands in their activity trail.
 */

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface SeatView {
  id: string;
  name: string;
  invitedEmail: string;
  status: FirmSeatStatus;
  inviteExpiresAt: string | null;
  acceptedAt: string | null;
  clientIds: string[];
}

function toView(s: FirmSeat & { clients: Array<{ clientId: string }> }): SeatView {
  return {
    id: s.id,
    name: s.name,
    invitedEmail: s.invitedEmail,
    status: s.status,
    inviteExpiresAt: s.inviteExpiresAt?.toISOString() ?? null,
    acceptedAt: s.acceptedAt?.toISOString() ?? null,
    clientIds: s.clients.map((c) => c.clientId),
  };
}

/** The firm's seats, for the CA. Empty for anyone else (RLS). */
export async function listSeats(ownerId: string): Promise<SeatView[]> {
  const rows = await prisma.firmSeat.findMany({
    where: { firmOwnerId: ownerId },
    include: { clients: { select: { clientId: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toView);
}

export async function inviteStaff(
  ownerId: string,
  input: { name: unknown; email: unknown },
): Promise<{ seat: SeatView; token: string }> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!name || name.length > 80) throw new BadRequestError('A name (up to 80 characters) is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestError('A valid email address is required.');

  const me = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  if (me?.email.toLowerCase() === email) throw new BadRequestError('That is your own address.');
  const open = await prisma.firmSeat.findFirst({
    where: { firmOwnerId: ownerId, invitedEmail: email, status: { in: ['PENDING', 'ACTIVE'] } },
  });
  if (open) {
    throw new BadRequestError(
      open.status === 'ACTIVE' ? `${email} already has a seat.` : `${email} is already invited. Remove that invitation first.`,
    );
  }

  const { token, hash } = newInviteToken(32);
  const seat = await prisma.firmSeat.create({
    data: {
      firmOwnerId: ownerId,
      name,
      invitedEmail: email,
      inviteTokenHash: hash,
      inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    include: { clients: { select: { clientId: true } } },
  });
  return { seat: toView(seat), token };
}

/** Who is inviting, before the invitee signs in. Nothing else about the firm. */
export async function peekStaffInvitation(token: string) {
  const seat = await runAsSystem(() =>
    prisma.firmSeat.findUnique({
      where: { inviteTokenHash: inviteTokenHash(token) },
      select: { invitedEmail: true, inviteExpiresAt: true, status: true, firmOwner: { select: { name: true, email: true } } },
    }),
  );
  if (!seat || seat.status !== 'PENDING' || !seat.inviteExpiresAt || seat.inviteExpiresAt < new Date()) {
    throw new NotFoundError('This invitation is no longer valid. Ask for a new one.');
  }
  return {
    firm: seat.firmOwner.name || seat.firmOwner.email,
    invitedEmail: seat.invitedEmail,
    expiresAt: seat.inviteExpiresAt,
  };
}

/** The invitee accepts, signed in as the address it was sent to. Single use. */
export async function acceptStaffInvitation(callerId: string, callerEmail: string, token: string): Promise<void> {
  // Privileged read: the invitee is not yet party to the seat row.
  const seat = await runAsSystem(() =>
    prisma.firmSeat.findUnique({ where: { inviteTokenHash: inviteTokenHash(token) } }),
  );
  if (!seat || seat.status !== 'PENDING' || !seat.inviteExpiresAt || seat.inviteExpiresAt < new Date()) {
    throw new NotFoundError('This invitation is no longer valid. Ask for a new one.');
  }
  if (seat.invitedEmail !== callerEmail.trim().toLowerCase()) {
    throw new ForbiddenError(`This invitation was sent to ${seat.invitedEmail}. Sign in with that address to accept it.`);
  }
  if (seat.firmOwnerId === callerId) throw new BadRequestError('You cannot take a seat in your own firm.');
  await runAsSystem(() =>
    prisma.firmSeat.update({
      where: { id: seat.id },
      data: { staffUserId: callerId, status: 'ACTIVE', acceptedAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null },
    }),
  );
}

async function ownSeat(ownerId: string, seatId: string) {
  const seat = await prisma.firmSeat.findUnique({ where: { id: seatId } });
  if (!seat || seat.firmOwnerId !== ownerId) throw new NotFoundError('Seat not found.');
  return seat;
}

/** Give a staff member one of the firm's clients. The client is told. */
export async function assignClient(ownerId: string, seatId: string, clientId: string, req?: Request): Promise<void> {
  const seat = await ownSeat(ownerId, seatId);
  if (seat.status !== 'ACTIVE') throw new BadRequestError('Only a seat that has been accepted can be given clients.');
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, advisorId: true, userId: true, status: true },
  });
  if (!client || client.advisorId !== ownerId) throw new ForbiddenError('That client is not yours.');
  if (client.status !== 'ACTIVE' || !client.userId) throw new BadRequestError('Only an active client can be assigned.');

  await runInTransaction(async (tx) => {
    const existing = await tx.firmSeatClient.findUnique({ where: { seatId_clientId: { seatId, clientId } } });
    if (existing) return;
    await tx.firmSeatClient.create({ data: { seatId, clientId } });
    await recordCaAudit(
      tx,
      { actorUserId: ownerId, subjectUserId: client.userId!, clientId, req },
      {
        action: 'STAFF_ASSIGNED',
        resourceType: 'FirmSeat',
        resourceId: seatId,
        summary: `Your CA gave ${seat.name}, of their staff, access to your books under the same limits you set.`,
      },
    );
  });
}

export async function unassignClient(ownerId: string, seatId: string, clientId: string, req?: Request): Promise<void> {
  const seat = await ownSeat(ownerId, seatId);
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { userId: true, advisorId: true } });
  if (!client || client.advisorId !== ownerId) throw new ForbiddenError('That client is not yours.');
  await runInTransaction(async (tx) => {
    const { count } = await tx.firmSeatClient.deleteMany({ where: { seatId, clientId } });
    if (count === 0) return;
    await recordCaAudit(
      tx,
      { actorUserId: ownerId, subjectUserId: client.userId ?? ownerId, clientId, req },
      {
        action: 'STAFF_UNASSIGNED',
        resourceType: 'FirmSeat',
        resourceId: seatId,
        summary: `Your CA removed ${seat.name}'s access to your books.`,
      },
    );
  });
}

/** End a seat (or withdraw an unaccepted invitation). Access stops at once. */
export async function revokeSeat(ownerId: string, seatId: string, req?: Request): Promise<void> {
  const seat = await ownSeat(ownerId, seatId);
  if (seat.status === 'REVOKED') return;
  const assigned = await prisma.firmSeatClient.findMany({
    where: { seatId },
    select: { clientId: true, client: { select: { userId: true } } },
  });
  await runInTransaction(async (tx) => {
    await tx.firmSeat.update({
      where: { id: seatId },
      data: { status: 'REVOKED', revokedAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null },
    });
    await tx.firmSeatClient.deleteMany({ where: { seatId } });
    for (const a of assigned) {
      await recordCaAudit(
        tx,
        { actorUserId: ownerId, subjectUserId: a.client.userId ?? ownerId, clientId: a.clientId, req },
        {
          action: 'STAFF_UNASSIGNED',
          resourceType: 'FirmSeat',
          resourceId: seatId,
          summary: `Your CA removed ${seat.name}'s access to your books.`,
        },
      );
    }
  });
}

/** The firms a staff member sits in, for their own view. */
export async function mySeats(staffUserId: string) {
  const rows = await prisma.firmSeat.findMany({
    where: { staffUserId, status: 'ACTIVE' },
    select: { id: true, firmOwnerId: true, firmOwner: { select: { name: true, email: true } }, clients: { select: { clientId: true } } },
  });
  return rows.map((r) => ({ seatId: r.id, firm: r.firmOwner.name || r.firmOwner.email, clientCount: r.clients.length }));
}
