/**
 * CA workspace — grants, and the client's own view of them.
 *
 * Every handler that acts for a client resolves the grant through
 * `getCaScope` first. The client id arrives in the URL, so anyone can ask for
 * anyone; the service decides, in one place, whether they may.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../lib/response.js';
import { BadRequestError } from '../lib/errors.js';
import {
  createManagedClient,
  inviteClient,
  acceptInvitation,
  revokeGrant,
  listClients,
  listMyProfessionals,
  listCaActivity,
  getCaScope,
} from '../services/ca/caAccess.service.js';

const managedClientSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  pan: z.string().max(10).optional(),
  phone: z.string().max(20).optional(),
  category: z.string().max(100).optional(),
  // Required, not optional. See the note in createManagedClient: an optional
  // lawful basis is one nobody ever fills in.
  consentBasis: z.enum([
    'ENGAGEMENT_LETTER',
    'WRITTEN_CONSENT',
    'EXISTING_CLIENT_RELATIONSHIP',
    'OTHER',
  ]),
  consentNote: z.string().max(500).optional(),
});

const inviteSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
});

export async function listClientsHandler(req: Request, res: Response) {
  ok(res, await listClients(req.user!.id));
}

export async function createManagedClientHandler(req: Request, res: Response) {
  const parsed = managedClientSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]!.message);
  created(res, await createManagedClient(req.user!.id, parsed.data, req));
}

export async function inviteClientHandler(req: Request, res: Response) {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]!.message);
  const { client, token } = await inviteClient(req.user!.id, parsed.data, req);
  // The token is returned so the caller can render/send the invitation link.
  // Email delivery is deliberately not wired here — see the route comment.
  created(res, { client, token });
}

export async function acceptInvitationHandler(req: Request, res: Response) {
  const token = (req.params.token ?? '').trim();
  if (!token) throw new BadRequestError('Invitation token required.');
  ok(res, await acceptInvitation(req.user!.id, req.user!.email, token));
}

export async function revokeGrantHandler(req: Request, res: Response) {
  await revokeGrant(req.user!.id, req.params.clientId!, req);
  noContent(res);
}

/** The client's side: who currently has access to their books. */
export async function listMyProfessionalsHandler(req: Request, res: Response) {
  ok(res, await listMyProfessionals(req.user!.id));
}

/**
 * Activity. With `?clientId=` a CA sees what they did for that client; without
 * it a client sees everything done to their own books. The RLS policy already
 * restricts rows to the caller's own side of each entry.
 */
export async function listCaActivityHandler(req: Request, res: Response) {
  const clientId = (req.query.clientId as string | undefined)?.trim();
  if (clientId) {
    // Confirms the caller actually holds this grant before echoing its trail.
    await getCaScope(req.user!.id, clientId);
  }
  ok(res, await listCaActivity(req.user!.id, { clientId }));
}
