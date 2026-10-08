import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { getSettings, updateSettings, upiLink, buildUpiUri } from '../../src/services/split/settings.service.js';

const memberOf = (ms: Array<{ id: string; displayName: string }>, n: string) => ms.find((m) => m.displayName === n)!.id;

describe('split settings + UPI link', () => {
  let alice: TestScope; let bob: TestScope;
  let g2: string; let g2Members: Array<{ id: string; displayName: string }> = []; let cbId: string; let groupId: string; let a: string; let b: string; let r: string;
  beforeAll(async () => {
    alice = await createTestScope('split-set2-a'); bob = await createTestScope('split-set2-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const cr = await seedContact(alice.userId, 'Ravi');
    await runAsSystem(() => prisma.splitContact.update({ where: { id: cr.id }, data: { upiId: 'ravi@okicici' } }));
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Goa', myDisplayName: 'Alice', contactIds: [cb.id, cr.id] }));
    groupId = g.id; cbId = cb.id;
    const gg = await alice.runAs(() => createGroup(alice.userId, { name: 'Pune', myDisplayName: 'Alice', contactIds: [cb.id] }));
    g2 = gg.id; g2Members = gg.members;
    const a2 = gg.members.find((m) => m.isMe)!.id; const b2 = gg.members.find((m) => m.displayName === 'Bob')!.id;
    // Bob paid 60 for both -> Alice owes Bob 30
    await runAsSystem(() => prisma.splitExpense.create({ data: {
      groupId: g2, description: 'Lunch', date: new Date('2026-10-02'), amount: '60', currency: 'INR', fxRate: '1', baseAmount: '60',
      splitMode: 'EQUAL', createdById: alice.userId,
      payers: { create: [{ memberId: b2, amount: '60', baseAmount: '60' }] },
      shares: { create: [a2, b2].map((m) => ({ memberId: m, amount: '30', baseAmount: '30' })) },
    } }));
    a = g.members.find((m) => m.isMe)!.id; b = g.members.find((m) => m.displayName === 'Bob')!.id; r = g.members.find((m) => m.displayName === 'Ravi')!.id;
    // Ravi paid 300 for everyone → Alice owes Ravi 100, Bob owes Ravi 100
    await runAsSystem(() => prisma.splitExpense.create({ data: {
      groupId, description: 'Cab', date: new Date('2026-10-01'), amount: '300', currency: 'INR', fxRate: '1', baseAmount: '300',
      splitMode: 'EQUAL', createdById: alice.userId,
      payers: { create: [{ memberId: r, amount: '300', baseAmount: '300' }] },
      shares: { create: [a, b, r].map((m) => ({ memberId: m, amount: '100', baseAmount: '100' })) },
    } }));
  });
  afterAll(async () => { await cleanupSplit([alice.userId, bob.userId]); await runAsSystem(() => prisma.splitSettings.deleteMany({ where: { userId: { in: [alice.userId, bob.userId] } } })); await alice.cleanup(); await bob.cleanup(); });

  it('defaults then updates', async () => {
    expect(await alice.runAs(() => getSettings(alice.userId))).toEqual({ upiId: null, homeCurrency: 'INR', defaultPortfolioId: null, emailOnActivity: true, weeklyDigest: false });
    const s = await alice.runAs(() => updateSettings(alice.userId, { upiId: 'alice@oksbi', weeklyDigest: true, defaultPortfolioId: alice.portfolioId }));
    expect(s).toMatchObject({ upiId: 'alice@oksbi', weeklyDigest: true, defaultPortfolioId: alice.portfolioId });
  });

  it('rejects bad VPA, bad currency and someone else\'s portfolio', async () => {
    await expect(alice.runAs(() => updateSettings(alice.userId, { upiId: 'nope' }))).rejects.toThrow(/UPI/);
    await expect(alice.runAs(() => updateSettings(alice.userId, { homeCurrency: 'rupee' }))).rejects.toThrow(/currency/i);
    await expect(alice.runAs(() => updateSettings(alice.userId, { defaultPortfolioId: bob.portfolioId }))).rejects.toThrow(/portfolio/i);
  });

  it('builds a pay link to a placeholder with a contact UPI, amount from balances', async () => {
    const l = await alice.runAs(() => upiLink(alice.userId, groupId, r));
    expect(l.payeeVpa).toBe('ravi@okicici');
    expect(l.amount).toBe('100.0000');
    expect(l.uri).toBe('upi://pay?pa=ravi%40okicici&pn=Ravi&am=100.00&cu=INR&tn=Goa%20settle-up');
  });

  it('no UPI on file -> 404 with a plain reason', async () => {
    await expect(alice.runAs(() => upiLink(alice.userId, g2, memberOf(g2Members, 'Bob'), '10'))).rejects.toThrow(/hasn't added a UPI ID/);
  });

  it('reveals nothing to someone who owes nothing', async () => {
    await expect(alice.runAs(() => upiLink(alice.userId, groupId, b, '10'))).rejects.toThrow(/SPLIT_NOTHING_OWED/);
  });

  it('rejects more than owed, allows a partial amount', async () => {
    await expect(alice.runAs(() => upiLink(alice.userId, groupId, r, '150'))).rejects.toThrow(/more than you owe/);
    const l = await alice.runAs(() => upiLink(alice.userId, groupId, r, '40'));
    expect(l.uri).toContain('am=40.00');
  });

  it('prefers the linked users own UPI over the contact one', async () => {
    await runAsSystem(() => prisma.splitContact.update({ where: { id: cbId }, data: { upiId: 'bobcontact@okhdfc' } }));
    expect((await alice.runAs(() => upiLink(alice.userId, g2, memberOf(g2Members, 'Bob'), '10'))).payeeVpa).toBe('bobcontact@okhdfc');
    await runAsSystem(() => prisma.splitSettings.upsert({ where: { userId: bob.userId }, create: { userId: bob.userId, upiId: 'bob@oksbi' }, update: { upiId: 'bob@oksbi' } }));
    expect((await alice.runAs(() => upiLink(alice.userId, g2, memberOf(g2Members, 'Bob'), '10'))).payeeVpa).toBe('bob@oksbi');
  });

  it('empty defaultPortfolioId stores null', async () => {
    const s = await alice.runAs(() => updateSettings(alice.userId, { defaultPortfolioId: '' }));
    expect(s.defaultPortfolioId).toBeNull();
  });

  it('buildUpiUri encodes values', () => {
    expect(buildUpiUri({ vpa: 'a.b@ok', name: 'A & B', amount: '1.50', note: 'x/y' }))
      .toBe('upi://pay?pa=a.b%40ok&pn=A%20%26%20B&am=1.50&cu=INR&tn=x%2Fy');
  });
});
