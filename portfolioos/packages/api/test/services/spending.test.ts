/**
 * Spending store against Postgres: approved bank-alert events in, normalised
 * SpendTxn rows out; re-runs write nothing; rejected events drop out; own
 * transfers are labelled; a statement source replaces the matching alert;
 * one user never sees another's rows.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { listSpending, syncSpending as syncWithAi, SPEND_SOURCES } from '../../src/services/spending/spendingSync.js';
import { listUncategorisedPayees, setPayeeCategory } from '../../src/services/spending/spendCategorisation.js';
import type { PayeeTagger } from '../../src/services/spending/aiPayeeTagger.js';
import type { NormalisedTxn, SpendSource } from '../../src/services/spending/spendTypes.js';

// No real AI calls in tests: a fake tagger that knows one payee and records what it was asked.
const asked: string[][] = [];
const fakeTagger: PayeeTagger = async (_userId, payees) => {
  asked.push(payees.map((p) => p.key));
  return new Map(payees.filter((p) => p.key === 'sharma general store').map((p) => [p.key, 'groceries' as const]));
};
const syncSpending = (userId: string, sources = SPEND_SOURCES) => syncWithAi(userId, sources, { tagger: fakeTagger });

let seq = 0;
async function event(userId: string, eventType: string, date: string, amount: string, counterparty: string, opts: { status?: string; notes?: string; last4?: string } = {}) {
  seq += 1;
  const ref = `spend-test-${userId}-${seq}`;
  return prisma.canonicalEvent.create({
    data: {
      userId,
      sourceAdapter: 'gmail.llm.v1',
      sourceAdapterVer: '1',
      sourceRef: ref,
      sourceHash: createHash('sha256').update(ref).digest('hex'),
      eventType: eventType as never,
      eventDate: new Date(`${date}T00:00:00Z`),
      amount,
      counterparty,
      parserNotes: opts.notes ?? null,
      accountLast4: opts.last4 ?? '4321',
      status: (opts.status ?? 'CONFIRMED') as never,
    },
  });
}

describe('spending store (DB)', () => {
  let a: TestScope;
  let b: TestScope;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    a = await createTestScope('spend-a');
    b = await createTestScope('spend-b');
    await runAsSystem(() => prisma.user.update({ where: { id: a.userId }, data: { name: 'Rahul Vikram Sharma' } }));
    await runAsUser(a.userId, async () => {
      ids['grocery'] = (await event(a.userId, 'UPI_DEBIT', '2026-10-03', '2450.50', 'BIGBASKET')).id;
      ids['salary'] = (await event(a.userId, 'NEFT_CREDIT', '2026-10-01', '150000', 'Brightline Media LLP', { notes: 'IMPS salary credit' })).id;
      ids['self'] = (await event(a.userId, 'UPI_DEBIT', '2026-10-04', '20000', 'RAHUL V SHARMA')).id;
      ids['card'] = (await event(a.userId, 'CARD_PURCHASE', '2026-10-06', '899', 'AMAZON', { last4: 'xx9876' })).id;
      ids['pending'] = (await event(a.userId, 'UPI_DEBIT', '2026-10-07', '300', 'SWIGGY', { status: 'PENDING_REVIEW' })).id;
      // Not a spend type at all.
      await event(a.userId, 'DIVIDEND', '2026-10-08', '120', 'INFOSYS');
    });
    await runAsUser(b.userId, () => event(b.userId, 'UPI_DEBIT', '2026-10-03', '700', 'ZOMATO'));
  });

  afterAll(async () => {
    await a.cleanup();
    await b.cleanup();
  });

  it('builds normalised rows from approved bank events only', async () => {
    const r = await runAsUser(a.userId, () => syncSpending(a.userId));
    expect(r).toMatchObject({ created: 4, updated: 0, removed: 0 });

    const rows = await runAsUser(a.userId, () => prisma.spendTxn.findMany({ where: { userId: a.userId } }));
    const by = new Map(rows.map((x) => [x.sourceRef, x]));
    expect(by.has(ids['pending']!)).toBe(false);
    expect(by.get(ids['grocery']!)).toMatchObject({
      source: 'canonical_event', direction: 'DEBIT', mode: 'UPI', accountKey: '4321', counterparty: 'BIGBASKET', excludeReason: null,
    });
    expect(by.get(ids['grocery']!)!.amount.toString()).toBe('2450.5');
    expect(by.get(ids['salary']!)).toMatchObject({ direction: 'CREDIT', mode: 'IMPS' });
    expect(by.get(ids['card']!)).toMatchObject({ mode: 'CARD', accountKey: '9876' });
    // A payment to the user's own name is a transfer, not spending.
    expect(by.get(ids['self']!)!.excludeReason).toBe('self_transfer');
    // Categories: merchant list, rule (credit = income), self transfer, marketplace.
    expect(by.get(ids['grocery']!)).toMatchObject({ category: 'groceries', categorySrc: 'dictionary', eventType: 'UPI_DEBIT' });
    expect(by.get(ids['salary']!)).toMatchObject({ category: 'income', categorySrc: 'rule' });
    expect(by.get(ids['self']!)).toMatchObject({ category: 'self_transfer', categorySrc: 'rule' });
    expect(by.get(ids['card']!)).toMatchObject({ category: 'other_consumption', categorySrc: 'dictionary' });
  });

  it('a re-run with nothing new writes nothing', async () => {
    const r = await runAsUser(a.userId, () => syncSpending(a.userId));
    expect(r).toMatchObject({ created: 0, updated: 0, removed: 0, duplicates: 0, categorised: 0 });
  });

  it('follows approvals, edits and rejections in review', async () => {
    await runAsUser(a.userId, async () => {
      await prisma.canonicalEvent.update({ where: { id: ids['pending']! }, data: { status: 'CONFIRMED' } });
      await prisma.canonicalEvent.update({ where: { id: ids['grocery']! }, data: { amount: '2500' } });
      await prisma.canonicalEvent.update({ where: { id: ids['card']! }, data: { status: 'REJECTED' } });
    });
    const r = await runAsUser(a.userId, () => syncSpending(a.userId));
    expect(r).toMatchObject({ created: 1, updated: 1, removed: 1 });
    const rows = await runAsUser(a.userId, () => listSpending(a.userId, new Date('2026-10-01'), new Date('2026-11-01')));
    expect(rows.map((x) => x.counterparty)).toEqual(['Brightline Media LLP', 'BIGBASKET', 'RAHUL V SHARMA', 'SWIGGY']);
    expect(rows.find((x) => x.counterparty === 'BIGBASKET')!.amount.equals(new Decimal(2500))).toBe(true);
  });

  it('a statement line for the same payment replaces the alert, and undoes cleanly', async () => {
    const statementLine: NormalisedTxn = {
      source: 'statement', sourceAdapter: 'test.statement', sourceRef: 'stmt-1', accountKey: '4321',
      txnDate: new Date('2026-10-04T00:00:00Z'), amount: new Decimal('2500'), direction: 'DEBIT', mode: 'UPI',
      narration: 'UPI/BIGBASKET/groceries', counterparty: 'BIGBASKET', currency: 'INR',
    };
    let lines = [statementLine];
    const statement: SpendSource = { kind: 'statement', fetch: async () => lines };
    const sources = [...SPEND_SOURCES, statement];

    const r = await runAsUser(a.userId, () => syncSpending(a.userId, sources));
    expect(r).toMatchObject({ created: 1, duplicates: 1 });
    let rows = await runAsUser(a.userId, () => listSpending(a.userId, new Date('2026-10-01'), new Date('2026-11-01')));
    const big = rows.filter((x) => x.counterparty === 'BIGBASKET');
    expect(big).toHaveLength(1);
    expect(big[0]!.source).toBe('statement');

    // The statement goes away → the alert counts again.
    lines = [];
    await runAsUser(a.userId, () => syncSpending(a.userId, sources));
    rows = await runAsUser(a.userId, () => listSpending(a.userId, new Date('2026-10-01'), new Date('2026-11-01')));
    expect(rows.filter((x) => x.counterparty === 'BIGBASKET').map((x) => x.source)).toEqual(['canonical_event']);
  });

  it("keeps each user's rows to themselves", async () => {
    await runAsUser(b.userId, () => syncSpending(b.userId));
    const seenByB = await runAsUser(b.userId, () => prisma.spendTxn.findMany({}));
    expect(seenByB.map((x) => x.counterparty)).toEqual(['ZOMATO']);
    const seenByA = await runAsUser(a.userId, () => prisma.spendTxn.findMany({}));
    expect(seenByA.some((x) => x.userId === b.userId)).toBe(false);
  });

  it('asks the AI about unknown payees once, biggest spend first, and the user can re-tag', async () => {
    await runAsUser(a.userId, async () => {
      await event(a.userId, 'UPI_DEBIT', '2026-10-10', '900', 'SHARMA GENERAL STORE');
      await event(a.userId, 'UPI_DEBIT', '2026-10-11', '4000', 'RAMESH KUMAR');
      await event(a.userId, 'UPI_DEBIT', '2026-10-12', '1500', 'RAMESH KUMAR');
    });
    asked.length = 0;
    await runAsUser(a.userId, () => syncSpending(a.userId));
    expect(asked).toEqual([['ramesh kumar', 'sharma general store']]);

    let rows = await runAsUser(a.userId, () => prisma.spendTxn.findMany({ where: { userId: a.userId } }));
    expect(rows.find((x) => x.counterparty === 'SHARMA GENERAL STORE')).toMatchObject({ category: 'groceries', categorySrc: 'model' });
    expect(rows.filter((x) => x.counterparty === 'RAMESH KUMAR').every((x) => x.category === 'uncategorised')).toBe(true);

    // The AI is not asked again about a payee it already answered.
    asked.length = 0;
    await runAsUser(a.userId, () => syncSpending(a.userId));
    expect(asked).toEqual([['ramesh kumar']]);

    // The top unsorted payees, then the user's tag sorts every payment to them.
    const top = await runAsUser(a.userId, () => listUncategorisedPayees(a.userId, 5, new Date('2026-11-05')));
    expect(top[0]).toEqual({ payeeKey: 'ramesh kumar', label: 'RAMESH KUMAR', count: 2, total: '5500.00' });
    expect(await runAsUser(a.userId, () => setPayeeCategory(a.userId, 'ramesh kumar', 'domestic_help'))).toBe(2);
    expect(await runAsUser(a.userId, () => setPayeeCategory(a.userId, 'sharma general store', 'household'))).toBe(1);
    rows = await runAsUser(a.userId, () => prisma.spendTxn.findMany({ where: { userId: a.userId } }));
    expect(rows.find((x) => x.counterparty === 'SHARMA GENERAL STORE')).toMatchObject({ category: 'household', categorySrc: 'user' });

    // A later sync keeps the user's tags.
    await runAsUser(a.userId, () => syncSpending(a.userId));
    rows = await runAsUser(a.userId, () => prisma.spendTxn.findMany({ where: { userId: a.userId, counterparty: 'RAMESH KUMAR' } }));
    expect(rows.every((x) => x.category === 'domestic_help' && x.categorySrc === 'user')).toBe(true);

    // Clearing the tag sends the payee back to the unsorted list.
    await runAsUser(a.userId, () => setPayeeCategory(a.userId, 'ramesh kumar', null));
    const again = await runAsUser(a.userId, () => listUncategorisedPayees(a.userId, 5, new Date('2026-11-05')));
    expect(again.map((p) => p.payeeKey)).toContain('ramesh kumar');
    await expect(runAsUser(a.userId, () => setPayeeCategory(a.userId, 'x', 'not_a_category'))).rejects.toThrow(/Unknown category/);
  });

  it("one user's payee tags never touch another's", async () => {
    const tagsSeenByB = await runAsUser(b.userId, () => prisma.spendPayeeTag.findMany({}));
    expect(tagsSeenByB).toEqual([]);
  });

  it('finds recurring rent, totals each month, and matches the typed rent to it', async () => {
    const c = await createTestScope('spend-c');
    try {
      await runAsUser(c.userId, async () => {
        for (let m = 1; m <= 12; m++) {
          const mm = String(m).padStart(2, '0');
          await event(c.userId, 'NEFT_DEBIT', `2026-${mm}-05`, m <= 6 ? '24000' : '26000', 'Mr Kulkarni', { notes: 'House rent' });
          await event(c.userId, 'UPI_DEBIT', `2026-${mm}-12`, '3000', 'BIGBASKET');
        }
        await event(c.userId, 'UPI_DEBIT', '2026-08-20', '60000', 'BIGBASKET'); // a one-off stock-up
        await prisma.inflationBasketItem.create({
          data: { userId: c.userId, name: 'Rent', divisionCode: '04', amount: '26000', frequency: 'MONTHLY' },
        });
        await prisma.inflationBasketItem.create({
          data: { userId: c.userId, name: 'Cook', divisionCode: '05', amount: '6000', frequency: 'MONTHLY' },
        });
      });
      const r = await runAsUser(c.userId, () => syncSpending(c.userId));
      expect(r.analysis).toMatchObject({ series: 2, oneOffs: 1, months: 12, matchedItems: 1 });

      const series = await runAsUser(c.userId, () => prisma.spendRecurringSeries.findMany({ where: { userId: c.userId }, orderBy: { category: 'asc' } }));
      expect(series.map((s) => [s.category, s.cadence, s.isFixed, s.latestAmount.toString()])).toEqual([
        ['groceries', 'MONTHLY', true, '3000'],
        ['rent', 'MONTHLY', true, '26000'],
      ]);

      const aug = await runAsUser(c.userId, () => prisma.spendMonthlyCategory.findMany({ where: { userId: c.userId, month: '2026-08' }, orderBy: { category: 'asc' } }));
      expect(aug.map((t) => [t.category, t.amount.toString(), t.oneOffAmount.toString()])).toEqual([
        ['groceries', '3000', '60000'],
        ['rent', '26000', '0'],
      ]);

      const items = await runAsUser(c.userId, () => prisma.inflationBasketItem.findMany({ where: { userId: c.userId }, orderBy: { name: 'asc' } }));
      const rentSeries = series.find((s) => s.category === 'rent')!;
      expect(items.map((i) => [i.name, i.matchedSeriesId])).toEqual([['Cook', null], ['Rent', rentSeries.id]]);
      // The typed item itself is untouched.
      expect(items.find((i) => i.name === 'Rent')!.amount.toString()).toBe('26000');

      // A re-run keeps the same series rows.
      await runAsUser(c.userId, () => syncSpending(c.userId));
      const again = await runAsUser(c.userId, () => prisma.spendRecurringSeries.findMany({ where: { userId: c.userId } }));
      expect(again.map((s) => s.id).sort()).toEqual(series.map((s) => s.id).sort());
    } finally {
      await c.cleanup();
    }
  });
});
