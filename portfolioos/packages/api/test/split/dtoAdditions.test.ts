import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { createSettlement } from '../../src/services/split/settlements.service.js';
import { listActivity, listFriends } from '../../src/services/split/ledger.service.js';
import { toBase } from '../../src/services/split/allocate.js';

describe('split DTO additions for the web UI', () => {
  let alice: TestScope;
  let bob: TestScope;
  let groupId: string;
  let a: string;
  let b: string;
  let bobContactId: string;
  let raviContactId: string;

  beforeAll(async () => {
    alice = await createTestScope('split-dto-a');
    bob = await createTestScope('split-dto-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const cr = await seedContact(alice.userId, 'Ravi');
    bobContactId = cb.id;
    raviContactId = cr.id;
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Goa', myDisplayName: 'Alice', contactIds: [cb.id, cr.id] }));
    groupId = g.id;
    a = g.members.find((m) => m.isMe)!.id;
    b = g.members.find((m) => m.displayName === 'Bob')!.id;
  });
  afterAll(async () => {
    await cleanupSplit([alice.userId, bob.userId]);
    await alice.cleanup();
    await bob.cleanup();
  });

  it('expense and settlement carry createdAt / createdById', async () => {
    const e = await alice.runAs(() => createExpense(alice.userId, {
      groupId, description: 'Hotel', date: '2026-10-01', amount: '90', currency: 'INR', splitMode: 'EQUAL',
      payers: [{ memberId: a, amount: '90' }], shares: [{ memberId: a }, { memberId: b }],
    }));
    expect(e.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const s = await bob.runAs(() => createSettlement(bob.userId, { groupId, fromMemberId: b, toMemberId: a, amount: '10', method: 'CASH', date: '2026-10-02' }));
    expect(s.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.createdById).toBe(bob.userId);
  });

  it('activity rows carry group name and actor display name', async () => {
    const act = await alice.runAs(() => listActivity(alice.userId, {}));
    const settled = act.find((x) => x.kind === 'SETTLED')!;
    expect(settled.groupName).toBe('Goa');
    expect(settled.actorName).toBe('Bob');
    const created = act.find((x) => x.kind === 'GROUP_CREATED')!;
    expect(created.actorName).toBe('Alice');
  });

  it('friends carry the caller contact id', async () => {
    const f = await alice.runAs(() => listFriends(alice.userId));
    expect(f.find((x) => x.key === `u:${bob.userId}`)?.contactId).toBe(bobContactId);
    expect(f.find((x) => x.key === `c:${raviContactId}`)?.contactId).toBe(raviContactId);
  });

  it('toBase rejects absurd conversions', () => {
    expect(() => toBase(new Decimal('999999999999'), new Decimal('9999999999'))).toThrow(/too large/);
  });
});
