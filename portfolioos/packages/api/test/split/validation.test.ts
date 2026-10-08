import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { createSettlement } from '../../src/services/split/settlements.service.js';
import { parseIsoDate, parseMoney2dp, parseCcy } from '../../src/services/split/validate.js';

describe('split input validation', () => {
  let alice: TestScope;
  let groupId: string;
  let a: string;
  let b: string;

  beforeAll(async () => {
    alice = await createTestScope('split-val-a');
    const cb = await seedContact(alice.userId, 'Bob');
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'V', myDisplayName: 'Alice', contactIds: [cb.id] }));
    groupId = g.id;
    a = g.members.find((m) => m.isMe)!.id;
    b = g.members.find((m) => !m.isMe)!.id;
  });
  afterAll(async () => {
    await cleanupSplit([alice.userId]);
    await alice.cleanup();
  });

  const exp = (over: Record<string, unknown> = {}) => ({
    groupId, description: 'x', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EXACT' as const,
    payers: [{ memberId: a, amount: '100' }], shares: [{ memberId: a, value: '100' }, { memberId: b, value: '0' }],
    ...over,
  });
  const settle = (over: Record<string, unknown> = {}) => ({
    groupId, fromMemberId: b, toMemberId: a, amount: '10', method: 'CASH' as const, date: '2026-10-01', ...over,
  });

  it('EXACT with a zero share creates the expense with one share', async () => {
    const e = await alice.runAs(() => createExpense(alice.userId, exp()));
    expect(e.shares).toHaveLength(1);
    expect(e.shares[0]!.amount).toBe('100.0000');
  });

  it('rejects calendar-invalid dates', async () => {
    await expect(alice.runAs(() => createExpense(alice.userId, exp({ date: '2026-02-31' })))).rejects.toMatchObject({ statusCode: 400 });
    await expect(alice.runAs(() => createSettlement(alice.userId, settle({ date: '2026-02-31' })))).rejects.toMatchObject({ statusCode: 400 });
    await expect(alice.runAs(() => createSettlement(alice.userId, settle({ date: '2026-13-01' })))).rejects.toMatchObject({ statusCode: 400, message: 'Invalid date' });
  });

  it('rejects amounts that do not fit the column', async () => {
    await expect(alice.runAs(() => createExpense(alice.userId, exp({ amount: '1000000000000', payers: [{ memberId: a, amount: '1000000000000' }], shares: [{ memberId: a, value: '1000000000000' }] })))).rejects.toMatchObject({ statusCode: 400 });
    await expect(alice.runAs(() => createSettlement(alice.userId, settle({ amount: '1000000000000' })))).rejects.toMatchObject({ statusCode: 400 });
  });

  it('helpers', () => {
    expect(parseIsoDate('2026-02-28').toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(() => parseIsoDate('2026-02-30')).toThrow('Invalid date');
    expect(parseMoney2dp('12.5', 'amount').toFixed(2)).toBe('12.50');
    expect(() => parseMoney2dp('0', 'amount')).toThrow(/SPLIT_BAD_INPUT: amount/);
    expect(parseCcy('inr')).toBe('INR');
    expect(() => parseCcy('RUPEE')).toThrow('Invalid currency code');
  });
});
