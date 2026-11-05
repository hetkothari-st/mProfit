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
import { listSpending, syncSpending, SPEND_SOURCES } from '../../src/services/spending/spendingSync.js';
import type { NormalisedTxn, SpendSource } from '../../src/services/spending/spendTypes.js';

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
  });

  it('a re-run with nothing new writes nothing', async () => {
    const r = await runAsUser(a.userId, () => syncSpending(a.userId));
    expect(r).toEqual({ created: 0, updated: 0, removed: 0, duplicates: 0 });
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
});
