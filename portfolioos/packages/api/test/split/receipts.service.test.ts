import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense, getExpense } from '../../src/services/split/expenses.service.js';
import { putReceipt, getReceipt, deleteReceipt } from '../../src/services/split/receipts.service.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.alloc(4)]);

describe('split receipts', () => {
  let alice: TestScope; let bob: TestScope; let eve: TestScope; let expenseId: string;
  beforeAll(async () => {
    alice = await createTestScope('split-rcpt-a'); bob = await createTestScope('split-rcpt-b'); eve = await createTestScope('split-rcpt-e');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Trip', myDisplayName: 'Alice', contactIds: [cb.id] }));
    const me = g.members.find((m) => m.isMe)!.id;
    expenseId = (await alice.runAs(() => createExpense(alice.userId, { groupId: g.id, description: 'Dinner', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: me, amount: '100' }], shares: g.members.map((m) => ({ memberId: m.id })) }))).id;
  });
  afterAll(async () => { await cleanupSplit([alice.userId, bob.userId]); await alice.cleanup(); await bob.cleanup(); await eve.cleanup(); });

  it('uploader stores, another member reads the same bytes', async () => {
    await alice.runAs(() => putReceipt(alice.userId, expenseId, { buffer: PNG, originalname: 'r.png' }));
    expect((await alice.runAs(() => getExpense(alice.userId, expenseId))).hasReceipt).toBe(true);
    const got = await bob.runAs(() => getReceipt(bob.userId, expenseId));
    expect(got.mime).toBe('image/png');
    expect(got.buffer.equals(PNG)).toBe(true);
  });

  it('rejects non-receipt files', async () => {
    await expect(alice.runAs(() => putReceipt(alice.userId, expenseId, { buffer: Buffer.from('MZ\x90\x00junk'), originalname: 'r.jpg' }))).rejects.toThrow(/JPEG, PNG, WebP or PDF/);
  });

  it('outsider gets 404', async () => {
    await expect(eve.runAs(() => getReceipt(eve.userId, expenseId))).rejects.toThrow(/not found/i);
  });

  it('a member can remove it', async () => {
    await bob.runAs(() => deleteReceipt(bob.userId, expenseId));
    expect((await alice.runAs(() => getExpense(alice.userId, expenseId))).hasReceipt).toBe(false);
    await expect(alice.runAs(() => getReceipt(alice.userId, expenseId))).rejects.toThrow(/no receipt/i);
  });
});
