import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { cleanupSplit } from '../helpers/splitFixtures.js';
import { createContact } from '../../src/services/split/contacts.service.js';
import { createGroup, getGroup } from '../../src/services/split/groups.service.js';
import { linkContactsForUser, linkContactToExistingUser, sendInvite } from '../../src/services/split/linking.service.js';

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

  it('invite copy has no expiry sentence', async () => {
    sent.mockClear();
    const c = await alice.runAs(() => createContact(alice.userId, { name: 'Copy', email: `copy-${randomUUID().slice(0, 6)}@test.local` }));
    await alice.runAs(() => sendInvite(alice.userId, c.id));
    const mail = sent.mock.calls[0]![0];
    expect(mail.html).not.toMatch(/expires on/i);
    expect(mail.text).not.toMatch(/expires on/i);
  });

  it('a failed send does not count against the daily invite limit', async () => {
    const c = await alice.runAs(() => createContact(alice.userId, { name: 'Retry', email: `retry-${randomUUID().slice(0, 6)}@test.local` }));
    sent.mockResolvedValueOnce({ sent: false });
    expect(await alice.runAs(() => sendInvite(alice.userId, c.id))).toEqual({ sent: false });
    expect(await alice.runAs(() => sendInvite(alice.userId, c.id))).toEqual({ sent: true });
    await expect(alice.runAs(() => sendInvite(alice.userId, c.id))).rejects.toThrow(/Already invited today/);
  });

  it('caps invite emails at 20 a day per user', async () => {
    const dan = await createTestScope('split-link-cap');
    try {
      const c = await dan.runAs(() => createContact(dan.userId, { name: 'Capped', email: `cap-${randomUUID().slice(0, 6)}@test.local` }));
      await runAsSystem(() => prisma.auditLog.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ userId: dan.userId, action: 'split_invite', resource: `SplitContact:seed${i}`, metadata: { sent: true } })) }));
      sent.mockClear();
      await expect(dan.runAs(() => sendInvite(dan.userId, c.id))).rejects.toThrow(/Daily invite limit reached/);
      expect(sent).not.toHaveBeenCalled();
    } finally {
      await cleanupSplit([dan.userId]);
      await runAsSystem(() => prisma.auditLog.deleteMany({ where: { userId: dan.userId } }));
      await dan.cleanup();
    }
  });

  it('failed sends do not hide an earlier real send from the per-contact throttle', async () => {
    const c = await alice.runAs(() => createContact(alice.userId, { name: 'Hidden', email: `hid-${randomUUID().slice(0, 6)}@test.local` }));
    expect(await alice.runAs(() => sendInvite(alice.userId, c.id))).toEqual({ sent: true });
    await runAsSystem(() => prisma.auditLog.createMany({ data: Array.from({ length: 6 }, () => ({ userId: alice.userId, action: 'split_invite', resource: `SplitContact:${c.id}`, metadata: { sent: false } })) }));
    await expect(alice.runAs(() => sendInvite(alice.userId, c.id))).rejects.toThrow(/Already invited today/);
  });

  it('a placeholder in a group the person already left stays unlinked without erroring', async () => {
    const bobEmail = `bob-${randomUUID().slice(0, 8)}@test.local`;
    const bob = await runAsSystem(() => prisma.user.create({ data: { email: bobEmail, passwordHash: 'x', name: 'Bob' } }));
    try {
      const c1 = await alice.runAs(() => createContact(alice.userId, { name: 'Bob', email: bobEmail }));
      const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Left', myDisplayName: 'Alice', contactIds: [c1.id] }));
      await runAsSystem(() => prisma.splitMember.updateMany({ where: { groupId: g.id, userId: bob.id }, data: { leftAt: new Date() } }));
      const c2 = await alice.runAs(() => createContact(alice.userId, { name: 'Bob 2', email: bobEmail }));
      await runAsSystem(async () => {
        await prisma.splitContact.update({ where: { id: c2.id }, data: { linkedUserId: null } });
        await prisma.splitMember.create({ data: { groupId: g.id, contactId: c2.id, displayName: 'Bob 2' } });
      });
      await expect(linkContactToExistingUser(c2.id)).resolves.toBe(true);
      const after = await runAsSystem(() => prisma.splitContact.findUnique({ where: { id: c2.id } }));
      expect(after!.linkedUserId).toBe(bob.id);
      const ph = await runAsSystem(() => prisma.splitMember.findFirst({ where: { groupId: g.id, contactId: c2.id } }));
      expect(ph!.userId).toBeNull();
    } finally {
      await runAsSystem(async () => { await prisma.splitContact.deleteMany({ where: { ownerUserId: alice.userId, name: { startsWith: 'Bob' } } }); });
      await cleanupSplit([alice.userId]);
      await runAsSystem(() => prisma.user.delete({ where: { id: bob.id } }));
    }
  });

  it('re-running on an already-linked contact links a previously missed placeholder', async () => {
    const eml = `carl-${randomUUID().slice(0, 8)}@test.local`;
    const carl = await runAsSystem(() => prisma.user.create({ data: { email: eml, passwordHash: 'x', name: 'Carl' } }));
    try {
      const c = await alice.runAs(() => createContact(alice.userId, { name: 'Carl', email: eml }));
      expect(c.linkedUserId).toBe(carl.id);
      const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Missed', myDisplayName: 'Alice' }));
      await runAsSystem(() => prisma.splitMember.create({ data: { groupId: g.id, contactId: c.id, displayName: 'Carl' } }));
      expect(await linkContactToExistingUser(c.id)).toBe(false);
      const m = await runAsSystem(() => prisma.splitMember.findFirst({ where: { groupId: g.id, contactId: c.id } }));
      expect(m!.userId).toBe(carl.id);
    } finally {
      await cleanupSplit([alice.userId]);
      await runAsSystem(() => prisma.user.delete({ where: { id: carl.id } }));
    }
  });
});

async function createTestScopeFor(userId: string) {
  const { runAsUser } = await import('../../src/lib/requestContext.js');
  return { runAs: <T>(fn: () => Promise<T>) => runAsUser(userId, fn) };
}
