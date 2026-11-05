/**
 * Safe to Invest read from the spending store once the user agreed to the
 * spending notice (PR 8): same credits and spending Personal Inflation uses,
 * duplicates counted once, fixed payments the bank shows taken out of the
 * buffer month by month. Without consent nothing changes.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { SPENDING_CONSENT_VERSION } from '@everypaisa/shared';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser } from '../../src/lib/requestContext.js';
import { getSummary, listCredits } from '../../src/services/safeToInvest/safeToInvest.service.js';
import { syncSpending, SPEND_SOURCES } from '../../src/services/spending/spendingSync.js';
import { giveSpendingConsent } from '../../src/services/personalInflation/spendingConsent.js';
import type { NormalisedTxn, SpendSource } from '../../src/services/spending/spendTypes.js';

const NOW = new Date('2026-11-04T06:00:00Z');
const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const scopes: TestScope[] = [];
afterAll(async () => {
  for (const s of scopes) await s.cleanup();
});

let seq = 0;
async function event(userId: string, eventType: string, date: string, amount: string, counterparty: string, notes: string | null = null) {
  seq += 1;
  const ref = `sti-store-${userId}-${seq}`;
  return prisma.canonicalEvent.create({
    data: {
      userId, sourceAdapter: 'test.sti-store', sourceAdapterVer: '1', sourceRef: ref,
      sourceHash: createHash('sha256').update(ref).digest('hex'), eventType: eventType as never,
      eventDate: new Date(`${date}T00:00:00Z`), amount, counterparty, parserNotes: notes, accountLast4: '4321', status: 'CONFIRMED',
    },
  });
}

describe('safe to invest from the spending store (DB)', () => {
  it('agrees with the spending store, and stays as before without consent', async () => {
    const s = await createTestScope('sti-store');
    scopes.push(s);
    const uid = s.userId;
    let octSalary = '';
    let refund = '';
    await runAsUser(uid, async () => {
      for (const m of MONTHS) {
        const sal = await event(uid, 'NEFT_CREDIT', `${m}-01`, '100000', 'Brightline Media LLP', 'salary credit');
        if (m === '2026-10') octSalary = sal.id;
        await event(uid, 'NEFT_DEBIT', `${m}-05`, '25000', 'Mr Kulkarni', 'House rent');
        await event(uid, 'UPI_DEBIT', `${m}-12`, '5000', 'BIGBASKET');
      }
      refund = (await event(uid, 'UPI_CREDIT', '2026-09-20', '1200', 'MYNTRA', 'refund')).id;
      // Rent is typed in as a fixed cost and also paid by bank; the cook is paid in cash.
      await prisma.inflationBasketItem.create({ data: { userId: uid, name: 'Rent', divisionCode: '04', amount: '25000', frequency: 'MONTHLY', isFixed: true } });
      await prisma.inflationBasketItem.create({ data: { userId: uid, name: 'Cook', divisionCode: '05', amount: '8000', frequency: 'MONTHLY', isFixed: true } });
    });

    // Without consent: the alert-based figures, unchanged. The buffer takes all
    // fixed expenses (33,000) off a 30,000 spending month, so it is zero.
    const before = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(before).toMatchObject({ dataSource: 'ALERTS', leanInflow: '100000.0000' });
    expect(before.buffer).toEqual({ monthly: '0.0000', source: 'DEBITS' });

    // A bank statement line for the October salary, already seen as an alert.
    const statement: SpendSource = {
      kind: 'statement',
      async fetch(): Promise<NormalisedTxn[]> {
        return [{
          source: 'statement', sourceAdapter: 'test.statement', sourceRef: 'stmt-oct-salary', accountKey: '4321',
          txnDate: new Date('2026-10-01T00:00:00Z'), amount: new Decimal(100000),
          direction: 'CREDIT', mode: 'NEFT', narration: 'NEFT salary credit', counterparty: 'Brightline Media LLP',
          currency: 'INR', eventType: null,
        }];
      },
    };
    await runAsUser(uid, async () => {
      await giveSpendingConsent(uid, SPENDING_CONSENT_VERSION);
      await syncSpending(uid, [...SPEND_SOURCES, statement], { tagger: null });
    });

    const after = await runAsUser(uid, () => getSummary(uid, NOW));
    expect(after.dataSource).toBe('SPENDING');
    // October's salary arrives twice (alert + statement) but counts once.
    expect(after.months.find((m) => m.month === '2026-10')!.inflow).toBe('100000.0000');
    expect(after.leanInflow).toBe('100000.0000');
    // Buffer: groceries only. The bank rent is the typed fixed rent, taken out
    // month by month; the cash cook is not in the bank, so nothing is taken for it.
    expect(after.buffer).toEqual({ monthly: '5000.0000', source: 'DEBITS' });
    // Fixed costs are unchanged: 25,000 + 8,000.
    expect(after.fixed.total).toBe('33000.0000');

    const sep = await runAsUser(uid, () => listCredits(uid, '2026-09', NOW));
    expect(sep.find((c) => c.id === refund)).toMatchObject({ included: false, autoReason: 'Looks like a refund or reversal' });
    const oct = await runAsUser(uid, () => listCredits(uid, '2026-10', NOW));
    // The alert copy shows as already counted (through the statement line), so the drill-down adds up to the month too.
    expect(oct.find((c) => c.id === octSalary)).toMatchObject({
      included: false, autoReason: 'The same payment is already counted from another source',
    });
  });
});
