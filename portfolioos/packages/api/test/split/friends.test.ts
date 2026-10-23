import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { listFriends } from '../../src/services/split/ledger.service.js';

describe('friends list', () => {
  let alice: TestScope;
  beforeAll(async () => { alice = await createTestScope('split-fr-a'); });
  afterAll(async () => {
    await cleanupSplit([alice.userId]);
    await alice.cleanup();
  });

  it('one row per placeholder contact across groups, with summed net', async () => {
    const ravi = await seedContact(alice.userId, 'Ravi');
    for (const [name, amount] of [['G1', '100'], ['G2', '60']] as const) {
      const g = await alice.runAs(() => createGroup(alice.userId, { name, myDisplayName: 'Alice', contactIds: [ravi.id] }));
      const a = g.members.find((m) => m.isMe)!.id;
      const r = g.members.find((m) => !m.isMe)!.id;
      await alice.runAs(() => createExpense(alice.userId, {
        groupId: g.id, description: 'x', date: '2026-10-01', amount, currency: 'INR', splitMode: 'EQUAL',
        payers: [{ memberId: a, amount }], shares: [{ memberId: a }, { memberId: r }],
      }));
    }
    const friends = await alice.runAs(() => listFriends(alice.userId));
    const rows = friends.filter((f) => f.displayName === 'Ravi');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.groups).toHaveLength(2);
    expect(rows[0]!.net).toBe('80.0000');
    expect(rows[0]!.key).toBe(`c:${ravi.id}`);
  });

  it('says which group is left out of the total when it has no exchange rate', async () => {
    const meera = await seedContact(alice.userId, 'Meera');
    const inr = await alice.runAs(() => createGroup(alice.userId, { name: 'Home', myDisplayName: 'Alice', contactIds: [meera.id] }));
    // QQQ is a well-formed code nothing will ever quote, so no rate exists.
    const odd = await alice.runAs(() => createGroup(alice.userId, { name: 'Odd trip', baseCurrency: 'QQQ', myDisplayName: 'Alice', contactIds: [meera.id] }));
    for (const [g, currency, amount] of [[inr, 'INR', '100'], [odd, 'QQQ', '40']] as const) {
      const a = g.members.find((m) => m.isMe)!.id;
      const r = g.members.find((m) => !m.isMe)!.id;
      await alice.runAs(() => createExpense(alice.userId, {
        groupId: g.id, description: 'x', date: '2026-10-01', amount, currency, splitMode: 'EQUAL',
        payers: [{ memberId: a, amount }], shares: [{ memberId: a }, { memberId: r }],
      }));
    }
    const row = (await alice.runAs(() => listFriends(alice.userId))).find((f) => f.displayName === 'Meera')!;
    // The INR group alone: the QQQ balance cannot be converted…
    expect(row.net).toBe('50.0000');
    // …and the row says so, instead of presenting 50 as the whole story.
    expect(row.missingRates).toEqual([{ groupId: odd.id, groupName: 'Odd trip', currency: 'QQQ', net: '20.0000' }]);
  });
});
