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
  inviteProfessional,
  acceptProfessionalInvitation,
  peekProfessionalInvitation,
  cancelProfessionalInvitation,
  listMyProfessionalGrants,
  getGrantForSubject,
  updateGrantScope,
  reinstateGrant,
  CA_SCOPE_CATEGORIES,
} from '../services/ca/caAccess.service.js';
import { AssetClass } from '@prisma/client';
import {
  buildInviteEmail,
  sendInviteEmail,
} from '../services/ca/caInviteEmail.service.js';

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

// ─── The client's controls over a grant ──────────────────────────────

const ASSET_CLASSES = Object.values(AssetClass) as [AssetClass, ...AssetClass[]];

/**
 * `null` and "absent" mean different things here, so the schema keeps them
 * apart: a field left out is untouched, and an explicit `null` widens that
 * dimension back to everything. Collapsing the two would make "give them
 * access to all portfolios again" unexpressible.
 */
const grantScopeSchema = z.object({
  // Any subset. Absent means untouched, which is what lets the Advanced panel
  // send one switch without restating the other three.
  edit: z
    .object({
      books: z.boolean().optional(),
      transactions: z.boolean().optional(),
      imports: z.boolean().optional(),
      fmv: z.boolean().optional(),
    })
    .optional(),
  portfolioIds: z.array(z.string().min(1)).max(200).nullable().optional(),
  assetClasses: z.array(z.enum(ASSET_CLASSES)).nullable().optional(),
  categories: z.array(z.enum(CA_SCOPE_CATEGORIES)).nullable().optional(),
  accessFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  accessUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** One grant in full, for the client's manage-access panel. */
export async function getMyGrantHandler(req: Request, res: Response) {
  ok(res, await getGrantForSubject(req.user!.id, req.params.clientId!));
}

export async function updateMyGrantScopeHandler(req: Request, res: Response) {
  const patch = grantScopeSchema.parse(req.body);
  await updateGrantScope(req.user!.id, req.params.clientId!, patch, req);
  ok(res, await getGrantForSubject(req.user!.id, req.params.clientId!));
}

export async function reinstateGrantHandler(req: Request, res: Response) {
  await reinstateGrant(req.user!.id, req.params.clientId!, req);
  noContent(res);
}

// ─── Emailing an invitation ───────────────────────────────────────────
//
// Preview and send take the SAME body and run through the same builder, so
// what the advisor approved on screen is what leaves the server. A preview
// produced by a second code path is a preview that can lie.

const inviteEmailSchema = z.object({
  subject: z.string().max(200).optional(),
  message: z.string().max(5000).optional(),
});

/** The draft, rendered with whatever edits were sent (none on first open). */
export async function previewInviteEmailHandler(req: Request, res: Response) {
  const edits = inviteEmailSchema.parse(req.body ?? {});
  ok(res, await buildInviteEmail(req.user!.id, req.params.clientId!, edits));
}

export async function sendInviteEmailHandler(req: Request, res: Response) {
  const edits = inviteEmailSchema.parse(req.body ?? {});
  ok(res, await sendInviteEmail(req.user!.id, req.params.clientId!, edits, req));
}

// ─── The ordinary direction: a client brings in their professional ───

const inviteProfessionalSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
});

export async function inviteProfessionalHandler(req: Request, res: Response) {
  const input = inviteProfessionalSchema.parse(req.body);
  const { client, token } = await inviteProfessional(req.user!.id, input, req);
  created(res, { client, token });
}

export async function listMyGrantsHandler(req: Request, res: Response) {
  ok(res, await listMyProfessionalGrants(req.user!.id));
}

export async function cancelProfessionalInvitationHandler(req: Request, res: Response) {
  await cancelProfessionalInvitation(req.user!.id, req.params.clientId!, req);
  noContent(res);
}

/**
 * Unauthenticated on purpose: a professional who has never used the product
 * needs to see who is asking before deciding whether to create an account.
 * The token is the credential, and the reply carries a name and nothing else.
 */
export async function peekProfessionalInvitationHandler(req: Request, res: Response) {
  ok(res, await peekProfessionalInvitation(req.params.token!));
}

export async function acceptProfessionalInvitationHandler(req: Request, res: Response) {
  const client = await acceptProfessionalInvitation(
    req.user!.id,
    req.user!.email,
    req.params.token!,
    req,
  );
  ok(res, client);
}
