import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  inviteProfessional,
  inviteClient,
  acceptProfessionalInvitation,
  updateGrantScope,
  listCaActivity,
  listMyAccessActivity,
} from '../../src/services/ca/caAccess.service.js';

/**
 * CA workspace review: the Account Access page is the account holder's record
 * of who reached THEIR books. Someone who is also a CA saw their own practice
 * work there (clients they invited, client records they keep), and a change
 * from view-only to "keep the books" showed only the unchanged scope flags as
 * the previous state, under raw column names.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope & { email: string }> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  const user = await runAsSystem(() =>
    prisma.user.findUniqueOrThrow({ where: { id: scope.userId }, select: { email: true } }),
  );
  return { ...scope, email: user.email };
}

function forget(clientId: string) {
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.caAuditLog.deleteMany({ where: { clientId } });
      await prisma.client.deleteMany({ where: { id: clientId } });
    });
  });
}

describe('Account Access activity', () => {
  it('shows what happened to my own books, not my work as somebody else’s CA', async () => {
    const asha = await person('aaa-holder');
    const ramesh = await person('aaa-pro');
    const priya = await person('aaa-her-client');

    // Asha lets Ramesh into her books…
    const mine = await runAsUser(asha.userId, () =>
      inviteProfessional(asha.userId, { name: 'Ramesh CA', email: ramesh.email }),
    );
    forget(mine.client.id);
    // …and, as a CA herself, invites her own client Priya.
    const practice = await runAsUser(asha.userId, () =>
      inviteClient(asha.userId, { name: 'Priya', email: priya.email }),
    );
    forget(practice.client.id);

    const myAccess = await runAsUser(asha.userId, () => listMyAccessActivity(asha.userId));
    expect(myAccess.map((e) => e.clientId)).toContain(mine.client.id);
    expect(myAccess.map((e) => e.clientId)).not.toContain(practice.client.id);

    // The practice trail still has it.
    const practiceTrail = await runAsUser(asha.userId, () => listCaActivity(asha.userId));
    expect(practiceTrail.map((e) => e.clientId)).toContain(practice.client.id);
  });

  it('records the access level a scope change replaced, in words', async () => {
    const asha = await person('aaa-scope-holder');
    const ramesh = await person('aaa-scope-pro');
    const { client, token } = await runAsUser(asha.userId, () =>
      inviteProfessional(asha.userId, { name: 'Ramesh CA', email: ramesh.email }),
    );
    forget(client.id);
    await runAsUser(ramesh.userId, () => acceptProfessionalInvitation(ramesh.userId, ramesh.email, token));

    await runAsUser(asha.userId, () => updateGrantScope(asha.userId, client.id, { edit: { books: true } }));

    const change = (await runAsUser(asha.userId, () => listMyAccessActivity(asha.userId))).find(
      (e) => e.action === 'GRANT_SCOPE_CHANGED',
    )!;
    const before = (change.metadata as { before?: unknown }).before;
    expect(typeof before).toBe('string');
    expect(before).toContain('view only');
    expect(before).not.toMatch(/scopeAll|canEdit/);
  });
});
