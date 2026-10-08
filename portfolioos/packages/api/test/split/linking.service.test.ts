import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { cleanupSplit } from '../helpers/splitFixtures.js';
import { createContact } from '../../src/services/split/contacts.service.js';
import { createGroup, getGroup } from '../../src/services/split/groups.service.js';
import { linkContactsForUser, sendInvite } from '../../src/services/split/linking.service.js';

const sent = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/notifications/email.service.js', () => ({ sendEmail: sent }));

describe('split linking + invites', () => {
  let alice: TestScope; let newcomer: { id: string; email: string } | null = null;
  const email = `split-link-${randomUUID().slice(0, 8)}@test.local`;
  beforeAll(async () => { alice = await createTestScope('split-link-a'); sent.mockResolvedValue({ sent: true, messageId: 'm1' }); });
  afterAll(async () => {
    await cleanupSplit([alice.userId]);
    if (newcomer) await runAsSystem(() => prisma.user.delete({ where: { id: newcomer!.id } }));
    await runAsSystem(() => prisma.auditLog.deleteMany({ where: { userId: alice.userId } }));
    await alice.cleanup();
  });

  it('placeholder becomes a real member after the person signs up with a verified email', async () => {
    const c = await alice.runAs(() => createContact(alice.userId, { name: 'Neha', email }));
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Trip', myDisplayName: 'Alice', contactIds: [c.id] }));
    expect(g.members.find((m) => m.displayName === 'Neha')!.userId).toBeNull();
    const u = await runAsSystem(() => prisma.user.create({ data: { email, passwordHash: 'x', name: 'Neha S' } }));
    newcomer = { id: u.id, email };
    const r = await linkContactsForUser(newcomer);
    expect(r).toEqual({ contacts: 1, members: 1 });
    const seen = await runAsSystem(() => prisma.splitMember.findFirst({ where: { groupId: g.id, userId: u.id } }));
    expect(seen).not.toBeNull();
    const asNeha = await (await createTestScopeFor(u.id)).runAs(() => getGroup(u.id, g.id));
    expect(asNeha.name).toBe('Trip');
  });

  it('a contact added for an existing user links immediately', async () => {
    const c = await alice.runAs(() => createContact(alice.userId, { name: 'Neha again', email: email.toUpperCase() }));
    expect(c.linkedUserId).toBe(newcomer!.id);
  });

  it('invites once a day, refuses linked contacts', async () => {
    const c = await alice.runAs(() => createContact(alice.userId, { name: 'Kabir', email: `kabir-${randomUUID().slice(0, 6)}@test.local` }));
    expect(await alice.runAs(() => sendInvite(alice.userId, c.id))).toEqual({ sent: true });
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0]![0].html).toContain('/register?email=');
    await expect(alice.runAs(() => sendInvite(alice.userId, c.id))).rejects.toThrow(/Already invited today/);
    const linked = await alice.runAs(() => createContact(alice.userId, { name: 'N3', email }));
    await expect(alice.runAs(() => sendInvite(alice.userId, linked.id))).rejects.toThrow(/already on EveryPaisa/);
  });
});

async function createTestScopeFor(userId: string) {
  const { runAsUser } = await import('../../src/lib/requestContext.js');
  return { runAs: <T>(fn: () => Promise<T>) => runAsUser(userId, fn) };
}
