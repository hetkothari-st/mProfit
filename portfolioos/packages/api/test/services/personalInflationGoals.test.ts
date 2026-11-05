/**
 * Personal inflation × the rest of the app: expenses picked from loans,
 * insurance and owned homes, and the goal impact / re-plan maths. The CPI
 * summary is a fixed fake here — these tests are about the joins, not CPI.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import type { PersonalInflationSummary } from '@everypaisa/shared';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser } from '../../src/lib/requestContext.js';
import {
  importSourceCandidates,
  listSourceCandidates,
} from '../../src/services/personalInflation/inflationSources.js';
import {
  applySuggestedGoalRates,
  listGoalImpacts,
  suggestRateForGoal,
} from '../../src/services/personalInflation/inflationGoals.js';
import { monthlySipFor } from '../../src/services/personalInflation/personalInflationMath.js';
import { getSummary } from '../../src/services/personalInflation/personalInflation.service.js';

const SUMMARY: PersonalInflationSummary = {
  profile: { stateCode: 20, sector: 'URBAN' },
  asOf: '2026-09',
  official: [
    { divisionCode: '00', latestYoy: '0.045600', longRunRate: '0.050000', yearsUsed: 5, source: 'STATE' },
    { divisionCode: '07', latestYoy: '0.053400', longRunRate: '0.040000', yearsUsed: 5, source: 'STATE' },
    { divisionCode: '10', latestYoy: '0.041000', longRunRate: '0.060000', yearsUsed: 5, source: 'STATE' },
  ],
  items: [],
  personalRate: '0.094000',
  horizons: [1, 3, 5, 10],
  totals: { annualAmount: '0.0000', projections: [] },
  byDivision: [{ divisionCode: '10', annualAmount: '300000.0000', share: '1.000000', rate: '0.150000' }],
  fixedPayments: null,
};

const NOW = new Date('2026-11-04T00:00:00Z');

describe('personal inflation: sources and goals (DB)', () => {
  let a: TestScope;
  let b: TestScope;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    a = await createTestScope('pinfl-src-a');
    b = await createTestScope('pinfl-src-b');
    await runAsUser(a.userId, async () => {
      ids['homeLoan'] = (await prisma.loan.create({
        data: {
          userId: a.userId, lenderName: 'HDFC Bank', loanType: 'HOME', borrowerName: 'Test User',
          principalAmount: '2500000', interestRate: '8.75', tenureMonths: 240, emiAmount: '22000',
          disbursementDate: new Date('2023-04-10'), firstEmiDate: new Date('2023-05-10'),
        },
      })).id;
      ids['closedLoan'] = (await prisma.loan.create({
        data: {
          userId: a.userId, lenderName: 'Old Bank', loanType: 'CAR', borrowerName: 'Test User',
          principalAmount: '500000', interestRate: '9', tenureMonths: 36, emiAmount: '16000',
          disbursementDate: new Date('2019-01-10'), firstEmiDate: new Date('2019-02-10'), status: 'CLOSED',
        },
      })).id;
      ids['health'] = (await prisma.insurancePolicy.create({
        data: {
          userId: a.userId, insurer: 'Niva Bupa', policyNumber: 'H-1', type: 'HEALTH', policyHolder: 'Test User',
          sumAssured: '1000000', premiumAmount: '9000', premiumFrequency: 'HALF_YEARLY', startDate: new Date('2024-01-01'),
        },
      })).id;
      ids['term'] = (await prisma.insurancePolicy.create({
        data: {
          userId: a.userId, insurer: 'HDFC Life', policyNumber: 'T-1', type: 'TERM', policyHolder: 'Test User',
          sumAssured: '10000000', premiumAmount: '2000', premiumFrequency: 'MONTHLY', startDate: new Date('2022-06-01'),
        },
      })).id;
      ids['home'] = (await prisma.ownedProperty.create({
        data: {
          userId: a.userId, name: 'Powai flat', propertyType: 'APARTMENT', status: 'SELF_OCCUPIED',
          monthlyMaintenance: '6500',
        },
      })).id;
      ids['eduGoal'] = (await prisma.goal.create({
        data: {
          userId: a.userId, name: 'College fund', category: 'CHILD_EDUCATION', targetAmount: '2500000',
          expectedReturn: '0.1200', targetDate: new Date('2038-06-01'),
        },
      })).id;
      ids['retireGoal'] = (await prisma.goal.create({
        data: {
          userId: a.userId, name: 'Retirement', category: 'RETIREMENT', targetAmount: '30000000',
          inflationRate: '0.0600', targetDate: new Date('2050-01-01'),
        },
      })).id;
    });
  });

  afterAll(async () => {
    await a.cleanup();
    await b.cleanup();
  });

  it('offers active loans, premiums and maintenance with sensible rates', async () => {
    const c = await runAsUser(a.userId, () => listSourceCandidates(a.userId));
    const byRef = new Map(c.map((x) => [x.sourceRef, x]));
    expect(c).toHaveLength(4); // the closed loan is left out

    const loan = byRef.get(`loan:${ids['homeLoan']}`)!;
    expect(loan).toMatchObject({ divisionCode: '04', amount: '22000.0000', frequency: 'MONTHLY', rateMode: 'CUSTOM', customRate: '0' });

    const health = byRef.get(`insurance:${ids['health']}`)!;
    // Half-yearly 9,000 → 18,000 a year, at the official health rate.
    expect(health).toMatchObject({ divisionCode: '06', amount: '18000.0000', frequency: 'YEARLY', rateMode: 'OFFICIAL' });

    const term = byRef.get(`insurance:${ids['term']}`)!;
    expect(term).toMatchObject({ amount: '2000.0000', frequency: 'MONTHLY', rateMode: 'CUSTOM', customRate: '0' });

    const home = byRef.get(`property:${ids['home']}`)!;
    expect(home).toMatchObject({ divisionCode: '04', amount: '6500.0000', rateMode: 'OFFICIAL' });
    expect(c.every((x) => !x.alreadyAdded)).toBe(true);
  });

  it('imports once, ignores refs it does not own, and marks them added', async () => {
    const refs = [`loan:${ids['homeLoan']}`, `insurance:${ids['health']}`, `loan:${ids['closedLoan']}`, 'loan:not-mine'];
    expect(await runAsUser(a.userId, () => importSourceCandidates(a.userId, refs))).toBe(2);
    expect(await runAsUser(a.userId, () => importSourceCandidates(a.userId, refs))).toBe(0);

    const items = await runAsUser(a.userId, () => prisma.inflationBasketItem.findMany({ where: { userId: a.userId } }));
    expect(items.map((i) => i.sourceRef).sort()).toEqual([`insurance:${ids['health']}`, `loan:${ids['homeLoan']}`].sort());
    expect(items.find((i) => i.sourceRef?.startsWith('loan:'))!.amount.toString()).toBe('22000');

    const c = await runAsUser(a.userId, () => listSourceCandidates(a.userId));
    expect(c.filter((x) => x.alreadyAdded)).toHaveLength(2);
  });

  it('lists the EMI but leaves it out of the rate, shares and totals', async () => {
    const s = await runAsUser(a.userId, () => getSummary(a.userId));
    // Home loan EMI: 22,000 × 12.
    expect(s.fixedPayments).toEqual({ annualAmount: '264000.0000', count: 1 });
    expect(s.items.find((i) => i.sourceRef?.startsWith('loan:'))!.inBasket).toBe(false);
    expect(s.byDivision.map((d) => d.divisionCode)).toEqual(['06']);
    // Only the 18,000 health premium is in the basket.
    expect(s.totals.annualAmount).toBe('18000.0000');
    expect(s.byDivision[0]!.share).toBe('1.000000');
  });

  it("user B sees none of A's sources and cannot import them", async () => {
    expect(await runAsUser(b.userId, () => listSourceCandidates(b.userId))).toEqual([]);
    expect(await runAsUser(b.userId, () => importSourceCandidates(b.userId, [`loan:${ids['homeLoan']}`]))).toBe(0);
  });

  it('suggests the category rate for education, the personal rate otherwise', () => {
    expect(suggestRateForGoal(SUMMARY, 'CHILD_EDUCATION')).toMatchObject({ label: 'your education inflation' });
    expect(suggestRateForGoal(SUMMARY, 'CHILD_EDUCATION')!.rate.toFixed(4)).toBe('0.1500');
    expect(suggestRateForGoal(SUMMARY, 'VEHICLE_PURCHASE')!.rate.toFixed(4)).toBe('0.0400');
    // No health spend in the basket and no official health rate here → nothing to suggest.
    expect(suggestRateForGoal(SUMMARY, 'HEALTHCARE')).toBeNull();
    const withHealth = {
      ...SUMMARY,
      official: [...SUMMARY.official, { divisionCode: '06', latestYoy: '0.041000', longRunRate: '0.070000', yearsUsed: 5, source: 'STATE' as const }],
    };
    expect(suggestRateForGoal(withHealth, 'HEALTHCARE')).toMatchObject({ label: 'official health inflation' });
    expect(suggestRateForGoal(withHealth, 'HEALTHCARE')!.rate.toFixed(4)).toBe('0.0700');
    expect(suggestRateForGoal(SUMMARY, 'RETIREMENT')!.rate.toFixed(4)).toBe('0.0940');
  });

  it('works out what each goal needs at your rate vs official CPI, and the extra SIP', async () => {
    const g = await runAsUser(a.userId, () => listGoalImpacts(a.userId, SUMMARY, NOW));
    const edu = g.find((x) => x.goalId === ids['eduGoal'])!;
    const years = (new Date('2038-06-01').getTime() - NOW.getTime()) / (365.25 * 86_400_000);
    const at = (r: string) => new Decimal(2500000).times(new Decimal(1).plus(r).pow(years));
    const gap = at('0.15').minus(at('0.05'));

    expect(edu.suggestedRate).toBe('0.1500');
    expect(edu.officialRate).toBe('0.0500');
    expect(new Decimal(edu.neededAtSuggested!).minus(at('0.15')).abs().lessThan('0.01')).toBe(true);
    expect(new Decimal(edu.gap!).minus(gap).abs().lessThan('0.01')).toBe(true);
    const sip = monthlySipFor(gap, years, new Decimal('0.12'))!;
    expect(new Decimal(edu.extraMonthlySip!).minus(sip).abs().lessThan('0.01')).toBe(true);
    expect(edu.rateInUse).toBe(false);
  });

  it('re-plan writes the suggested rate to chosen goals only', async () => {
    const n = await runAsUser(a.userId, () => applySuggestedGoalRates(a.userId, SUMMARY, [ids['eduGoal']!]));
    expect(n).toBe(1);
    const rows = await runAsUser(a.userId, () => prisma.goal.findMany({ where: { userId: a.userId }, orderBy: { name: 'asc' } }));
    expect(rows.find((r) => r.id === ids['eduGoal'])!.inflationRate!.toString()).toBe('0.15');
    expect(rows.find((r) => r.id === ids['retireGoal'])!.inflationRate!.toString()).toBe('0.06');

    // B cannot re-plan A's goal.
    expect(await runAsUser(b.userId, () => applySuggestedGoalRates(b.userId, SUMMARY, [ids['retireGoal']!]))).toBe(0);
    const g = await runAsUser(a.userId, () => listGoalImpacts(a.userId, SUMMARY, NOW));
    expect(g.find((x) => x.goalId === ids['eduGoal'])!.rateInUse).toBe(true);
  });
});
