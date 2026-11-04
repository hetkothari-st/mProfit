/**
 * Safe-to-Invest against Postgres: bank-alert credits and debits in, the
 * lean month, stability, fixed costs, buffer, top-up and the user's
 * corrections out — plus the declared-income fallback and RLS isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  getSummary,
  listCredits,
  savePlan,
  setCreditDecision,
  setMonthInflow,
  updatePlan,
} from '../../src/services/safeToInvest/safeToInvest.service.js';
import { percentile } from '../../src/services/safeToInvest/safeToInvestMath.js';

const NOW = new Date('2026-11-04T06:00:00Z');
// 2025-11 … 2026-10; the first month has no bank data at all (a gap).
const MONTHS = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const INCOME_K = [118, 160, 135, 112, 175, 132, 150, 110, 190, 145, 138];

let seq = 0;
async function event(userId: string, eventType: string, date: string, amount: string, counterparty: string, notes = '') {
  seq += 1;
  const ref = `sti-test-${userId}-${seq}`;
  return prisma.canonicalEvent.create({
    data: {
      userId,
      sourceAdapter: 'test.safe-to-invest',
      sourceAdapterVer: '1',
      sourceRef: ref,
      sourceHash: createHash('sha256').update(ref).digest('hex'),
      eventType: eventType as never,
      eventDate: new Date(`${date}T00:00:00Z`),
      amount,
      counterparty,
      parserNotes: notes || null,
      status: 'CONFIRMED',
    },
  });
}

describe('safe to invest (DB)', () => {
  let a: TestScope;
  let b: TestScope;
  let refundId = '';
  let salaryOctId = '';

  beforeAll(async () => {
    a = await createTestScope('sti-a');
    b = await createTestScope('sti-b');
    await runAsSystem(() => prisma.user.update({ where: { id: a.userId }, data: { name: 'Rahul Vikram Sharma' } }));

    await runAsUser(a.userId, async () => {
      for (const [i, m] of MONTHS.entries()) {
        const c = await event(a.userId, 'NEFT_CREDIT', `${m}-05`, String(INCOME_K[i]! * 1000), 'Brightline Media LLP', 'Invoice payment');
        if (m === '2026-10') salaryOctId = c.id;
        // Noise that must not count as income:
        await event(a.userId, 'UPI_CREDIT', `${m}-12`, '50000', 'RAHUL V SHARMA', 'IMPS from own ICICI a/c');
        // Everyday spend, and a SIP debit that is not spend:
        await event(a.userId, 'UPI_DEBIT', `${m}-15`, '30000', 'BIGBASKET', 'groceries');
        await event(a.userId, 'NEFT_DEBIT', `${m}-10`, '10000', 'BSE STAR MF', 'SIP debit');
      }
      refundId = (await event(a.userId, 'UPI_CREDIT', '2026-10-20', '4000', 'AMAZON PAY', 'Refund for order 402')).id;
      // The month in progress.
      await event(a.userId, 'NEFT_CREDIT', '2026-11-03', '160000', 'Brightline Media LLP', 'Invoice payment');

      await prisma.loan.create({
        data: {
          userId: a.userId, lenderName: 'HDFC Bank', loanType: 'HOME', borrowerName: 'Rahul', principalAmount: '4500000',
          interestRate: '8.6', tenureMonths: 240, emiAmount: '39300', disbursementDate: new Date('2022-04-10'), firstEmiDate: new Date('2022-05-10'),
        },
      });
      await prisma.insurancePolicy.create({
        data: {
          userId: a.userId, insurer: 'Niva Bupa', policyNumber: 'STI-H1', type: 'HEALTH', policyHolder: 'Rahul', sumAssured: '1000000',
          premiumAmount: '24000', premiumFrequency: 'ANNUAL', startDate: new Date('2023-02-01'),
        },
      });
      await prisma.inflationBasketItem.create({
        data: { userId: a.userId, name: 'Rent', divisionCode: '04', amount: '25000', frequency: 'MONTHLY', isFixed: true },
      });
      await prisma.inflationBasketItem.create({
        data: { userId: a.userId, name: 'Groceries', divisionCode: '01', amount: '30000', frequency: 'MONTHLY' },
      });
      await prisma.sipPlan.create({ data: { userId: a.userId, amount: '35000', frequency: 'MONTHLY', startDate: new Date('2025-01-01') } });
    });

    await runAsUser(b.userId, () =>
      prisma.income.create({ data: { userId: b.userId, type: 'FREELANCE', sourceName: 'Consulting', monthlyAmount: '100000' } }),
    );
  });

  afterAll(async () => {
    await a.cleanup();
    await b.cleanup();
  });

  it('sizes the SIP on the lean month, net of fixed costs and a spending buffer', async () => {
    const s = await runAsUser(a.userId, () => getSummary(a.userId, NOW));
    const income = INCOME_K.map((k) => new Decimal(k * 1000));
    const lean = percentile(income, 20)!;
    const typical = percentile(income, 50)!;

    expect(s.basis).toBe('BANK');
    expect(s.monthsUsed).toBe(11);
    expect(s.months).toHaveLength(12);
    expect(s.months[0]).toMatchObject({ month: '2025-11', source: 'GAP', inflow: null });
    // Own transfers and the refund are left out; the October refund is seen but not counted.
    expect(s.months[11]).toMatchObject({ month: '2026-10', inflow: '138000.0000', creditCount: 3, includedCount: 1 });
    expect(new Decimal(s.leanInflow!).equals(lean)).toBe(true);
    expect(s.stabilityScore).toBe(Math.round(lean.dividedBy(typical).times(100).toNumber()));

    // Fixed: EMI 39,300 + health 24,000/12 + rent 25,000 (groceries are not fixed).
    expect(s.fixed.total).toBe('66300.0000');
    expect(s.fixed.items.map((i) => i.kind).sort()).toEqual(['expense', 'insurance', 'loan']);
    // Buffer: 30,000 a month of groceries; the SIP debit is not spend; rent comes off it.
    expect(s.buffer).toEqual({ monthly: '5000.0000', source: 'DEBITS' });

    const expected = lean.minus(66300).minus(5000).dividedBy(500).floor().times(500);
    expect(s.safeAmount).toBe(`${expected.toFixed(0)}.0000`);
    expect(s.currentSip).toMatchObject({ monthly: '35000.0000', source: 'PLANS' });

    // November so far: 1,60,000 against the lean month, half of the surplus to top up.
    const surplus = new Decimal(160000).minus(lean);
    expect(new Decimal(s.thisMonth.surplus).equals(surplus)).toBe(true);
    expect(s.thisMonth.topUp).toBe(`${surplus.times('0.5').dividedBy(100).floor().times(100).toFixed(0)}.0000`);
  });

  it('applies the user\'s corrections: a credit, a month total, the buffer, the top-up share', async () => {
    await runAsUser(a.userId, () => setCreditDecision(a.userId, refundId, true));
    let s = await runAsUser(a.userId, () => getSummary(a.userId, NOW));
    expect(s.months[11]!.inflow).toBe('142000.0000');

    const credits = await runAsUser(a.userId, () => listCredits(a.userId, '2026-10', NOW));
    const refund = credits.find((c) => c.id === refundId)!;
    expect(refund).toMatchObject({ autoInclude: false, decision: true, included: true });
    expect(refund.autoReason).toMatch(/refund/i);
    expect(credits.find((c) => c.id === salaryOctId)!.included).toBe(true);

    await runAsUser(a.userId, () => setMonthInflow(a.userId, '2025-11', '90000', NOW));
    await runAsUser(a.userId, () => updatePlan(a.userId, { bufferOverride: '20000', topUpShare: '0.25' }));
    s = await runAsUser(a.userId, () => getSummary(a.userId, NOW));
    expect(s.months[0]).toMatchObject({ source: 'OVERRIDE', inflow: '90000.0000' });
    expect(s.monthsUsed).toBe(12);
    expect(s.buffer).toEqual({ monthly: '20000.0000', source: 'OVERRIDE' });
    expect(s.plan.topUpShare).toBe('0.2500');

    await runAsUser(a.userId, () => savePlan(a.userId, NOW));
    s = await runAsUser(a.userId, () => getSummary(a.userId, NOW));
    expect(s.plan.savedAmount).toBe(s.safeAmount);

    // Clearing restores the automatic figures.
    await runAsUser(a.userId, () => setCreditDecision(a.userId, refundId, null));
    await runAsUser(a.userId, () => setMonthInflow(a.userId, '2025-11', null, NOW));
    s = await runAsUser(a.userId, () => getSummary(a.userId, NOW));
    expect(s.months[0]!.source).toBe('GAP');
    expect(s.months[11]!.inflow).toBe('138000.0000');
  });

  it('falls back to trimmed declared income when bank history is thin', async () => {
    const s = await runAsUser(b.userId, () => getSummary(b.userId, NOW));
    expect(s.basis).toBe('DECLARED');
    expect(s.leanInflow).toBe('80000.0000'); // freelance: 80% of 1,00,000
    expect(s.stabilityScore).toBeNull();
    expect(s.buffer.source).toBe('ESTIMATE');
    expect(s.safeAmount).toBe('56000.0000'); // 80,000 − 0 − 30% buffer (24,000)
  });

  it("keeps each user's data to themselves", async () => {
    await expect(runAsUser(b.userId, () => setCreditDecision(b.userId, refundId, true))).rejects.toThrow(/not found/i);
    const seen = await runAsUser(b.userId, () => prisma.safeToInvestPlan.findMany({}));
    expect(seen).toEqual([]);
    const s = await runAsUser(b.userId, () => getSummary(b.userId, NOW));
    expect(s.months.every((m) => m.source === 'GAP')).toBe(true);
  });

  it('rejects months outside the window', async () => {
    await expect(runAsUser(a.userId, () => setMonthInflow(a.userId, '2024-01', '1000', NOW))).rejects.toThrow(/last twelve months/);
  });
});
