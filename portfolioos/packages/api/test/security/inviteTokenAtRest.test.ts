import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { inviteClient } from '../../src/services/ca/caAccess.service.js';
import { inviteTokenHash, openInviteToken, sealLegacyInviteTokens } from '../../src/lib/inviteToken.js';

/**
 * Invitation tokens are bearer credentials. The database keeps a hash to look
 * them up by and a ciphertext to resend the link — never the token itself.
 */
describe('invitation tokens at rest', () => {
  let ca: TestScope;
  const clientIds: string[] = [];

  beforeAll(async () => {
    ca = await createTestScope('invite-at-rest');
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.caAuditLog.deleteMany({ where: { clientId: { in: clientIds } } });
      await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    });
    await ca.cleanup();
  });

  it('a new invitation stores no readable token', async () => {
    const { client, token } = await runAsUser(ca.userId, () =>
      inviteClient(ca.userId, { name: 'Asha', email: 'asha.at-rest@example.com' }),
    );
    clientIds.push(client.id);
    const row = await runAsSystem(() => prisma.client.findUniqueOrThrow({ where: { id: client.id } }));
    expect(row.inviteToken).toBeNull();
    expect(row.inviteTokenHash).toBe(inviteTokenHash(token));
    expect(row.inviteTokenEnc).not.toContain(token);
    expect(openInviteToken(row.inviteTokenEnc, row.inviteToken)).toBe(token);
  });

  it('a token stored the old way is moved out of plaintext without losing the link', async () => {
    const legacy = 'legacy-plaintext-token-0123456789abcdef';
    const row = await runAsSystem(() =>
      prisma.client.create({
        data: {
          advisorId: ca.userId,
          name: 'Legacy',
          kind: 'INVITED',
          status: 'PENDING',
          invitedEmail: 'legacy.at-rest@example.com',
          inviteToken: legacy,
          inviteExpiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    );
    clientIds.push(row.id);

    await runAsSystem(() => sealLegacyInviteTokens());

    const after = await runAsSystem(() => prisma.client.findUniqueOrThrow({ where: { id: row.id } }));
    expect(after.inviteToken).toBeNull();
    expect(after.inviteTokenHash).toBe(inviteTokenHash(legacy));
    expect(openInviteToken(after.inviteTokenEnc, after.inviteToken)).toBe(legacy);
  });
});
