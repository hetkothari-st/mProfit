import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { getSettings, updateSettings, upiLink, requestLink, buildUpiUri } from '../../src/services/split/settings.service.js';

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
    await expect(alice.runAs(() => upiLink(alice.userId, g2, memberOf(g2Members, 'Bob'), '10'))).rejects.toThrow(/hasn't shared a UPI ID in this group yet/);
  });

  it('reveals nothing to someone who owes nothing', async () => {
    await expect(alice.runAs(() => upiLink(alice.userId, groupId, b, '10'))).rejects.toThrow(/SPLIT_NOTHING_OWED/);
  });

  it('rejects more than owed, allows a partial amount', async () => {
    await expect(alice.runAs(() => upiLink(alice.userId, groupId, r, '150'))).rejects.toThrow(/more than you owe/);
    const l = await alice.runAs(() => upiLink(alice.userId, groupId, r, '40'));
    expect(l.uri).toContain('am=40.00');
  });

  it('prefers the linked users own UPI over the contact one, but only once they take part in the group', async () => {
    await runAsSystem(() => prisma.splitContact.update({ where: { id: cbId }, data: { upiId: 'bobcontact@okhdfc' } }));
    expect((await alice.runAs(() => upiLink(alice.userId, g2, memberOf(g2Members, 'Bob'), '10'))).payeeVpa).toBe('bobcontact@okhdfc');
    await runAsSystem(() => prisma.splitSettings.upsert({ where: { userId: bob.userId }, create: { userId: bob.userId, upiId: 'bob@oksbi' }, update: { upiId: 'bob@oksbi' } }));
    // Bob has not created anything in g2 yet: his own UPI must stay hidden.
    expect((await alice.runAs(() => upiLink(alice.userId, g2, memberOf(g2Members, 'Bob'), '10'))).payeeVpa).toBe('bobcontact@okhdfc');
    await runAsSystem(() => prisma.splitExpense.updateMany({ where: { groupId: g2 }, data: { createdById: bob.userId } }));
    expect((await alice.runAs(() => upiLink(alice.userId, g2, memberOf(g2Members, 'Bob'), '10'))).payeeVpa).toBe('bob@oksbi');
  });

  it('a linked user who never acted in the group has no UPI revealed even from their settings', async () => {
    const cz = await seedContact(alice.userId, 'Zed', bob.userId);
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Quiet', myDisplayName: 'Alice', contactIds: [cz.id] }));
    const am = g.members.find((m) => m.isMe)!.id; const zm = g.members.find((m) => m.displayName === 'Zed')!.id;
    await runAsSystem(() => prisma.splitExpense.create({ data: {
      groupId: g.id, description: 'Forged', date: new Date('2026-10-02'), amount: '60', currency: 'INR', fxRate: '1', baseAmount: '60',
      splitMode: 'EQUAL', createdById: alice.userId,
      payers: { create: [{ memberId: zm, amount: '60', baseAmount: '60' }] },
      shares: { create: [am, zm].map((m) => ({ memberId: m, amount: '30', baseAmount: '30' })) },
    } }));
    await runAsSystem(() => prisma.splitSettings.upsert({ where: { userId: bob.userId }, create: { userId: bob.userId, upiId: 'bob@oksbi' }, update: { upiId: 'bob@oksbi' } }));
    await expect(alice.runAs(() => upiLink(alice.userId, g.id, zm, '10'))).rejects.toThrow(/SPLIT_NO_UPI: Zed hasn't shared a UPI ID in this group yet/);
  });

  it('empty defaultPortfolioId stores null', async () => {
    const s = await alice.runAs(() => updateSettings(alice.userId, { defaultPortfolioId: '' }));
    expect(s.defaultPortfolioId).toBeNull();
  });

  it('buildUpiUri encodes values', () => {
    expect(buildUpiUri({ vpa: 'a.b@ok', name: 'A & B', amount: '1.50', note: 'x/y' }))
      .toBe('upi://pay?pa=a.b%40ok&pn=A%20%26%20B&am=1.50&cu=INR&tn=x%2Fy');
  });

  describe('requestLink (creditor side)', () => {
    // In group Pune Bob paid 60 for both: Alice owes Bob 30. Bob is owed -> Bob requests from Alice.
    it('uses the callers own VPA and the owed amount', async () => {
      const aliceInPune = g2Members.find((m) => m.displayName === 'Alice')!.id;
      await runAsSystem(() => prisma.splitSettings.upsert({ where: { userId: bob.userId }, create: { userId: bob.userId, upiId: 'bobpay@oksbi' }, update: { upiId: 'bobpay@oksbi' } }));
      // Bob must be a real member of Pune (linked contact) so he can call.
      const l = await bob.runAs(() => requestLink(bob.userId, g2, aliceInPune));
      const url = new URL(l.uri.replace('upi://', 'http://x/'));
      expect(url.searchParams.get('pa')).toBe('bobpay@oksbi');
      expect(url.searchParams.get('am')).toBe('30.00');
      expect(l.payeeVpa).toBe('bobpay@oksbi');
      expect(l.note).toBe('Pune settle-up');
    });
    it('needs the caller to have a UPI ID', async () => {
      await runAsSystem(() => prisma.splitSettings.deleteMany({ where: { userId: bob.userId } }));
      const aliceInPune = g2Members.find((m) => m.displayName === 'Alice')!.id;
      await expect(bob.runAs(() => requestLink(bob.userId, g2, aliceInPune))).rejects.toThrow(/SPLIT_NO_UPI/);
    });
    it('rejects someone who is not owing the caller', async () => {
      const bobInPune = g2Members.find((m) => m.displayName === 'Bob')!.id;
      await expect(alice.runAs(() => requestLink(alice.userId, g2, bobInPune))).rejects.toThrow(/SPLIT_NOTHING_OWED/);
    });
    it('rejects more than owed', async () => {
      await runAsSystem(() => prisma.splitSettings.upsert({ where: { userId: bob.userId }, create: { userId: bob.userId, upiId: 'bobpay@oksbi' }, update: { upiId: 'bobpay@oksbi' } }));
      const aliceInPune = g2Members.find((m) => m.displayName === 'Alice')!.id;
      await expect(bob.runAs(() => requestLink(bob.userId, g2, aliceInPune, '31'))).rejects.toThrow(/more than they owe/);
      expect((await bob.runAs(() => requestLink(bob.userId, g2, aliceInPune, '10'))).uri).toContain('am=10.00');
    });
    it('is not available to non-members', async () => {
      const outsider = await createTestScope('split-set2-o');
      try {
        await expect(outsider.runAs(() => requestLink(outsider.userId, g2, g2Members[0]!.id))).rejects.toThrow(/not found/i);
      } finally { await outsider.cleanup(); }
    });
  });

  describe('non-simplified groups', () => {
    it('upiLink and requestLink follow the pairwise view shown on Balances', async () => {
      const cb = await seedContact(alice.userId, 'Bob', bob.userId);
      const cr = await seedContact(alice.userId, 'Ravi');
      const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Pairs', myDisplayName: 'Alice', contactIds: [cb.id, cr.id] }));
      await runAsSystem(() => prisma.splitGroup.update({ where: { id: g.id }, data: { simplifyDebts: false } }));
      const am = g.members.find((m) => m.isMe)!.id; const bm = g.members.find((m) => m.displayName === 'Bob')!.id; const rm = g.members.find((m) => m.displayName === 'Ravi')!.id;
      const exp = (payer: string, forWho: string) => runAsSystem(() => prisma.splitExpense.create({ data: {
        groupId: g.id, description: 'x', date: new Date('2026-10-03'), amount: '60', currency: 'INR', fxRate: '1', baseAmount: '60',
        splitMode: 'EQUAL', createdById: alice.userId,
        payers: { create: [{ memberId: payer, amount: '60', baseAmount: '60' }] },
        shares: { create: [{ memberId: forWho, amount: '60', baseAmount: '60' }] },
      } }));
      await exp(am, bm); // Bob owes Alice 60
      await exp(bm, rm); // Ravi owes Bob 60 (simplified: Ravi owes Alice 60, Bob nothing)
      await runAsSystem(() => prisma.splitSettings.upsert({ where: { userId: alice.userId }, create: { userId: alice.userId, upiId: 'alicepair@oksbi' }, update: { upiId: 'alicepair@oksbi' } }));
      await runAsSystem(() => prisma.splitSettings.upsert({ where: { userId: bob.userId }, create: { userId: bob.userId, upiId: 'bobpair@oksbi' }, update: { upiId: 'bobpair@oksbi' } }));
      const req = await alice.runAs(() => requestLink(alice.userId, g.id, bm));
      expect(req.amount).toBe('60.0000');
      expect(req.payeeVpa).toBe('alicepair@oksbi');
      const pay = await bob.runAs(() => upiLink(bob.userId, g.id, am));
      expect(pay.amount).toBe('60.0000');
      expect(pay.payeeVpa).toBe('alicepair@oksbi');
      // Ravi owes Bob (pairwise), not Alice.
      await expect(alice.runAs(() => requestLink(alice.userId, g.id, rm))).rejects.toThrow(/SPLIT_NOTHING_OWED/);
    });
  });
});
