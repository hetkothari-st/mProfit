import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../lib/response.js';
import {
  acceptStaffInvitation,
  assignClient,
  inviteStaff,
  listSeats,
  mySeats,
  peekStaffInvitation,
  revokeSeat,
  unassignClient,
} from '../services/ca/caFirmSeats.service.js';

export async function listSeatsHandler(req: Request, res: Response): Promise<void> {
  ok(res, await listSeats(req.user!.id));
}

export async function inviteStaffHandler(req: Request, res: Response): Promise<void> {
  const body = z.object({ name: z.string().max(80), email: z.string().max(200) }).parse(req.body);
  created(res, await inviteStaff(req.user!.id, body));
}

export async function assignClientHandler(req: Request, res: Response): Promise<void> {
  const { clientId } = z.object({ clientId: z.string() }).parse(req.body);
  await assignClient(req.user!.id, String(req.params.id), clientId, req);
  noContent(res);
}

export async function unassignClientHandler(req: Request, res: Response): Promise<void> {
  await unassignClient(req.user!.id, String(req.params.id), String(req.params.clientId), req);
  noContent(res);
}

export async function revokeSeatHandler(req: Request, res: Response): Promise<void> {
  await revokeSeat(req.user!.id, String(req.params.id), req);
  noContent(res);
}

/** Who is inviting, for the accept page. */
export async function peekStaffInvitationHandler(req: Request, res: Response): Promise<void> {
  ok(res, await peekStaffInvitation(String(req.params.token)));
}

export async function acceptStaffInvitationHandler(req: Request, res: Response): Promise<void> {
  const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
  await acceptStaffInvitation(req.user!.id, req.user!.email, token);
  noContent(res);
}

export async function mySeatsHandler(req: Request, res: Response): Promise<void> {
  ok(res, await mySeats(req.user!.id));
}
