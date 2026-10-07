import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  createContact, listContacts, updateContact, deleteContact, normalizeEmail, normalizePhone,
} from '../../src/services/split/contacts.service.js';

describe('split contacts', () => {
  let me: TestScope;
  beforeAll(async () => { me = await createTestScope('split-contacts'); });
  afterAll(async () => {
    await runAsSystem(() => prisma.splitContact.deleteMany({ where: { ownerUserId: me.userId } }));
    await me.cleanup();
  });

  it('normalises', () => {
    expect(normalizeEmail('  Ravi@Example.COM ')).toBe('ravi@example.com');
    expect(normalizePhone('+91 98765-43210')).toBe('919876543210');
    expect(normalizePhone('9876543210')).toBe('919876543210');
  });

  it('stores email/phone encrypted with a lookup hash, returns plaintext', async () => {
    const c = await me.runAs(() => createContact(me.userId, { name: 'Ravi', email: 'Ravi@x.com', phone: '9876543210', upiId: 'ravi@okhdfc' }));
    expect(c.email).toBe('ravi@x.com');
    expect(c.phone).toBe('919876543210');
    const row = await runAsSystem(() => prisma.splitContact.findUniqueOrThrow({ where: { id: c.id } }));
    expect(row.email).toBeNull();
    expect(row.emailEnc).not.toBeNull();
    expect(row.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.phone).toBeNull();
  });

  it('lists, updates, deletes', async () => {
    const c = await me.runAs(() => createContact(me.userId, { name: 'Sita' }));
    const u = await me.runAs(() => updateContact(me.userId, c.id, { name: 'Sita K', email: 'sita@x.com' }));
    expect(u.name).toBe('Sita K');
    expect(u.email).toBe('sita@x.com');
    const all = await me.runAs(() => listContacts(me.userId));
    expect(all.map((x) => x.name)).toContain('Sita K');
    await me.runAs(() => deleteContact(me.userId, c.id));
    await expect(me.runAs(() => updateContact(me.userId, c.id, { name: 'x' }))).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid email or UPI id', async () => {
    await expect(me.runAs(() => createContact(me.userId, { name: 'X', email: 'nope' }))).rejects.toThrow(/email/i);
    await expect(me.runAs(() => createContact(me.userId, { name: 'X', upiId: 'no-at-sign' }))).rejects.toThrow(/UPI/i);
  });
});
