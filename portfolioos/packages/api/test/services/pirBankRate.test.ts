/**
 * The personal inflation rate from bank spending, end to end against
 * Postgres: bank events → spending store → analysis → getSummary. No AI calls
 * (tagger off). CPI is not loaded here, so only own-price rates are numbers;
 * the CPI side is covered by the pure engine tests.
 */

import { describe, it, expect, afterAll, vi } from 'vitest';

// The nightly job uses the real AI tagger: never let a test reach the model.
vi.mock('../../src/services/spending/aiPayeeTagger.js', () => ({ aiPayeeTagger: async () => new Map() }));
import { createHash } from 'node:crypto';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { syncSpending, SPEND_SOURCES } from '../../src/services/spending/spendingSync.js';
import { getSummary } from '../../src/services/personalInflation/personalInflation.service.js';
import { answerStepChange, giveSpendingConsent, withdrawSpendingConsent } from '../../src/services/personalInflation/spendingConsent.js';
import { runSpendingSync } from '../../src/jobs/spendingJob.js';
import { SPENDING_CONSENT_VERSION } from '@everypaisa/shared';

const NOW = new Date('2026-11-05T06:00:00Z');
const scopes: TestScope[] = [];

let seq = 0;
async function event(userId: string, eventType: string, date: string, amount: string, counterparty: string, notes: string | null = null) {
  seq += 1;
  const ref = `pir-test-${userId}-${seq}`;
  await prisma.canonicalEvent.create({
    data: {
      userId, sourceAdapter: 'gmail.llm.v1', sourceAdapterVer: '1', sourceRef: ref,
      sourceHash: createHash('sha256').update(ref).digest('hex'),
      eventType: eventType as never, eventDate: new Date(`${date}T00:00:00Z`), amount, counterparty,
      parserNotes: notes, accountLast4: '4321', status: 'CONFIRMED' as never,
    },
  });
}

/** Month `i` months before November 2026, as 'YYYY-MM'. */
const monthBack = (i: number) => new Date(Date.UTC(2026, 10 - i, 1)).toISOString().slice(0, 7);

async function user(label: string, consent = true) {
  const s = await createTestScope(label);
  scopes.push(s);
  if (consent) await runAsUser(s.userId, () => giveSpendingConsent(s.userId, SPENDING_CONSENT_VERSION));
  return s.userId;
}

afterAll(async () => {
  for (const s of scopes) await s.cleanup();
});

describe('personal inflation from bank spending (DB)', () => {
  it('two years of rent and salary: the rate comes from the bank, and the typed rent is set aside', async () => {
    const uid = await user('pir-ready');
    await runAsUser(uid, async () => {
      for (let i = 24; i >= 1; i--) {
        const m = monthBack(i);
        await event(uid, 'NEFT_DEBIT', `${m}-05`, i > 12 ? '24000' : '26000', 'Mr Kulkarni', 'House rent');
        await event(uid, 'UPI_DEBIT', `${m}-12`, '3000', 'BIGBASKET');
        await event(uid, 'NEFT_CREDIT', `${m}-01`, '150000', 'Brightline Media LLP', 'salary credit');
      }
      await prisma.inflationBasketItem.create({ data: { userId: uid, name: 'Rent', divisionCode: '04', amount: '26000', frequency: 'MONTHLY' } });
      await prisma.inflationBasketItem.create({
        data: { userId: uid, name: 'Cook', divisionCode: '05', amount: '6000', frequency: 'MONTHLY', rateMode: 'CUSTOM', customRate: '0.07' },
      });
    });
    await runAsUser(uid, () => syncSpending(uid, SPEND_SOURCES, { tagger: null }));

    const s = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(s.rateBasis).toBe('bank');
    expect(s.bank).toMatchObject({ state: 'ready', monthsOfHistory: 12, confidence: '1.0000', cardBillsCounted: false });

    const rent = s.bank!.categories.find((c) => c.category === 'rent')!;
    expect(rent).toMatchObject({ method: 'own_price', ownRate: '0.083333', annualAmount: '312000.0000' });

    // The typed rent matches the landlord payments, so the bank counts it; the cook is cash, so it stays.
    const items = Object.fromEntries(s.items.map((i) => [i.name, i]));
    expect(items['Rent']).toMatchObject({ coveredByBank: true, amount: '26000.0000' });
    expect(items['Cook']).toMatchObject({ coveredByBank: false });

    // Basket: bank rent 312,000 + bank groceries 36,000 + cook 72,000.
    expect(s.totals.annualAmount).toBe('420000.0000');
    // The grocer is a fixed 3,000 a month in both years too, so its own price change is 0%.
    expect(s.bank!.categories.find((c) => c.category === 'groceries')).toMatchObject({ method: 'own_price', ownRate: '0.000000' });
    const expected = (312000 * (2000 / 24000) + 36000 * 0 + 72000 * 0.07) / 420000;
    expect(Number(s.personalRate)).toBeCloseTo(expected, 6);

    // Counting the rent anyway brings it back (and the bank rent stays too: the user's choice).
    await runAsUser(uid, () => prisma.inflationBasketItem.updateMany({ where: { userId: uid, name: 'Rent' }, data: { countAnyway: true } }));
    const again = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(again.items.find((i) => i.name === 'Rent')).toMatchObject({ coveredByBank: false, countAnyway: true });
    expect(again.totals.annualAmount).toBe('732000.0000');
  });

  it('a 40% jump in a fixed payment asks, uses CPI, and the answer is kept', async () => {
    const uid = await user('pir-step');
    await runAsUser(uid, async () => {
      for (let i = 24; i >= 1; i--) {
        const m = monthBack(i);
        await event(uid, 'NEFT_DEBIT', `${m}-05`, i > 12 ? '20000' : '28000', 'Mr Kulkarni', 'House rent');
        await event(uid, 'NEFT_CREDIT', `${m}-01`, '150000', 'Brightline Media LLP', 'salary credit');
      }
    });
    await runAsUser(uid, () => syncSpending(uid, SPEND_SOURCES, { tagger: null }));

    const s = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(s.bank!.stepChanges).toEqual([expect.objectContaining({ category: 'rent', rate: '0.400000' })]);
    expect(s.bank!.categories[0]).toMatchObject({ category: 'rent', method: 'cpi', ownRate: null });

    await runAsUser(uid, () => answerStepChange(uid, s.bank!.stepChanges[0]!.seriesId, true));
    // A re-sync keeps the answer.
    await runAsUser(uid, () => syncSpending(uid, SPEND_SOURCES, { tagger: null }));
    const after = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(after.bank!.stepChanges).toEqual([]);
    expect(after.bank!.categories[0]).toMatchObject({ method: 'own_price', ownRate: '0.400000' });
  });

  it('five months of data keeps the rate from what the user typed (decision 6)', async () => {
    const uid = await user('pir-low');
    await runAsUser(uid, async () => {
      for (let i = 5; i >= 1; i--) await event(uid, 'UPI_DEBIT', `${monthBack(i)}-12`, '3000', 'BIGBASKET');
      await prisma.inflationBasketItem.create({
        data: { userId: uid, name: 'Groceries', divisionCode: '01', amount: '3000', frequency: 'MONTHLY', rateMode: 'CUSTOM', customRate: '0.08' },
      });
    });
    await runAsUser(uid, () => syncSpending(uid, SPEND_SOURCES, { tagger: null }));

    const s = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(s.rateBasis).toBe('manual');
    expect(s.bank).toMatchObject({ state: 'low_confidence', monthsOfHistory: 5 });
    expect(s.personalRate).toBe('0.080000');
    expect(s.totals.annualAmount).toBe('36000.0000');
  });

  it('with nothing typed, low confidence is the "building" state with no rate', async () => {
    const uid = await user('pir-building');
    await runAsUser(uid, async () => {
      for (let i = 5; i >= 1; i--) await event(uid, 'UPI_DEBIT', `${monthBack(i)}-12`, '3000', 'BIGBASKET');
    });
    await runAsUser(uid, () => syncSpending(uid, SPEND_SOURCES, { tagger: null }));
    const s = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(s.bank!.state).toBe('building');
    expect(s.personalRate).toBeNull();
  });

  it('without consent nothing is read, and the user is asked; withdrawing deletes what was derived', async () => {
    const uid = await user('pir-consent', false);
    await runAsUser(uid, async () => {
      for (let i = 13; i >= 1; i--) {
        await event(uid, 'UPI_DEBIT', `${monthBack(i)}-12`, '3000', 'BIGBASKET');
        await event(uid, 'NEFT_CREDIT', `${monthBack(i)}-01`, '150000', 'Brightline Media LLP', 'salary credit');
      }
    });
    // The nightly job passes over a user who has not agreed.
    await runSpendingSync();
    expect(await runAsUser(uid, () => prisma.spendTxn.count({ where: { userId: uid } }))).toBe(0);
    const before = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(before.spendingConsent).toMatchObject({ given: false, askNow: true });
    expect(before.bank).toBeNull();

    await runAsUser(uid, () => giveSpendingConsent(uid, SPENDING_CONSENT_VERSION));
    await expect(runAsUser(uid, () => giveSpendingConsent(uid, 'old'))).rejects.toThrow(/current version/);
    await runSpendingSync();
    const after = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(after.spendingConsent).toMatchObject({ given: true, askNow: false });
    expect(after.bank!.state).toBe('ready');
    const audit = await runAsSystem(() => prisma.auditLog.findMany({ where: { userId: uid, action: 'consent.spending_analysis' } }));
    expect(audit).toHaveLength(1);

    const removed = await runAsUser(uid, () => withdrawSpendingConsent(uid));
    expect(removed).toBeGreaterThan(0);
    const counts = await runAsUser(uid, () => Promise.all([
      prisma.spendTxn.count({ where: { userId: uid } }),
      prisma.spendRecurringSeries.count({ where: { userId: uid } }),
      prisma.spendMonthlyCategory.count({ where: { userId: uid } }),
    ]));
    expect(counts).toEqual([0, 0, 0]);
    // The bank alerts themselves stay.
    expect(await runAsUser(uid, () => prisma.canonicalEvent.count({ where: { userId: uid } }))).toBe(26);
    expect((await runAsUser(uid, () => getSummary(uid, NOW))).spendingConsent.given).toBe(false);
  });

  it('a step-change answer of "moved" keeps CPI and stops asking', async () => {
    const uid = await user('pir-moved');
    await runAsUser(uid, async () => {
      for (let i = 24; i >= 1; i--) await event(uid, 'NEFT_DEBIT', `${monthBack(i)}-05`, i > 12 ? '20000' : '28000', 'Mr Kulkarni', 'House rent');
    });
    await runAsUser(uid, () => syncSpending(uid, SPEND_SOURCES, { tagger: null }));
    const s = await runAsUser(uid, () => getSummary(uid, NOW));
    await runAsUser(uid, () => answerStepChange(uid, s.bank!.stepChanges[0]!.seriesId, false));
    const after = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(after.bank!.stepChanges).toEqual([]);
    expect(after.bank!.categories[0]).toMatchObject({ method: 'cpi' });
    // Another user's series cannot be answered.
    const other = await user('pir-moved-other');
    await expect(runAsUser(other, () => answerStepChange(other, s.bank!.stepChanges[0]!.seriesId, true))).rejects.toThrow(/not found/i);
  });

  it('no bank spending: the page is exactly as before', async () => {
    const uid = await user('pir-none');
    const s = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(s).toMatchObject({ rateBasis: 'manual', bank: null, personalRate: null });
  });
});
