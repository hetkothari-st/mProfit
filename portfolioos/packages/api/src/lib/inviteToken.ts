import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { decryptSecret, encryptSecret } from './secrets.js';

/**
 * Invitation tokens (family invitations, CA / professional invitations) are
 * bearer credentials: whoever holds one can accept the invitation. So the
 * database never keeps one readable:
 *
 *   - `…Hash`  SHA-256 of the token, the only thing looked up by.
 *   - `…Enc`   the token encrypted under SECRETS_KEY, kept so the sender can
 *              email the same link again. A database copy without the key
 *              gives neither a link nor a way to accept.
 *
 * The old plaintext column survives only for rows written before this; the
 * boot job (sealLegacyInviteTokens) moves those into the two columns above.
 */
export function inviteTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function newInviteToken(bytes: number): { token: string; hash: string; enc: string } {
  const token = crypto.randomBytes(bytes).toString('base64url');
  return { token, hash: inviteTokenHash(token), enc: encryptSecret(token) };
}

/** The token, to rebuild a link: from ciphertext, or a legacy plaintext row. */
export function openInviteToken(enc: string | null | undefined, legacyPlain: string | null | undefined): string | null {
  if (enc) return decryptSecret(enc);
  return legacyPlain ?? null;
}

/**
 * Move invitation tokens written before hashing into the hash + ciphertext
 * columns and clear the plaintext. Lossless (the link can still be resent)
 * and idempotent, so it runs on every start. Run privileged by the caller.
 */
export async function sealLegacyInviteTokens(): Promise<{ clients: number; familyInvitations: number }> {
  const clients = await prisma.client.findMany({
    where: { inviteToken: { not: null } },
    select: { id: true, inviteToken: true },
  });
  for (const c of clients) {
    const token = c.inviteToken!;
    await prisma.client.update({
      where: { id: c.id },
      data: { inviteToken: null, inviteTokenHash: inviteTokenHash(token), inviteTokenEnc: encryptSecret(token) },
    });
  }
  const invitations = await prisma.familyInvitation.findMany({
    where: { token: { not: null } },
    select: { id: true, token: true, acceptedAt: true },
  });
  for (const inv of invitations) {
    const token = inv.token!;
    await prisma.familyInvitation.update({
      where: { id: inv.id },
      // An accepted invitation's link is never sent again; only the hash stays.
      data: { token: null, tokenHash: inviteTokenHash(token), tokenEnc: inv.acceptedAt ? null : encryptSecret(token) },
    });
  }
  return { clients: clients.length, familyInvitations: invitations.length };
}
