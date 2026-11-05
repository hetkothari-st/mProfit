/**
 * Act on it, Task 6: a move seen in the user's data confirms the advice, and
 * once the horizon passes the result is priced against doing nothing — or
 * against acting, for skipped advice. Missing prices leave it pending.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem, runAsUser } from '../../../src/lib/requestContext.js';
import { confirmFromData } from '../../../src/services/actOnIt/confirm.js';
import { measureDue } from '../../../src/services/actOnIt/measure.js';

const DAY = 86_400_000;
const T0 = new Date('2025-06-02T06:00:00Z');
const LIQ = 'TEST-AOI-LIQ';
const scopes: TestScope[] = [];
let liquidFundId = '';

afterAll(async () => {
  for (const s of scopes) {
    await runAsSystem(async () => {
      await prisma.transaction.deleteMany({ where: { portfolioId: s.portfolioId } });
      await prisma.advisorRecommendation.deleteMany({ where: { userId: s.userId } });
      await prisma.advisorRun.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  }
  await runAsSystem(async () => {
    await prisma.mFNav.deleteMany({ where: { fund: { schemeCode: LIQ } } });
    await prisma.mutualFundMaster.deleteMany({ where: { schemeCode: LIQ } });
  });
});

async function setup(label: string, withNavs = true) {
  const s = await createTestScope(label);
  scopes.push(s);
  if (!liquidFundId) {
    liquidFundId = await runAsSystem(async () => {
      const f = await prisma.mutualFundMaster.create({ data: { schemeCode: LIQ, schemeName: 'Test Liquid Fund', amcName: 'Test AMC', category: 'DEBT', subCategory: 'Liquid Fund', planType: 'Direct Plan', optionType: 'Growth Option' } });
      return f.id;
    });
  }
  if (withNavs) {
    await runAsSystem(async () => {
      const have = await prisma.mFNav.count({ where: { fundId: liquidFundId } });
      if (have === 0) {
        // 100 on the day of the advice (and the purchase), 106.5 a year later.
        await prisma.mFNav.createMany({
          data: [
            { fundId: liquidFundId, date: new Date('2025-06-02'), nav: '100' },
            { fundId: liquidFundId, date: new Date('2025-06-05'), nav: '100' },
            { fundId: liquidFundId, date: new Date('2026-06-02'), nav: '106.5' },
            { fundId: liquidFundId, date: new Date('2026-06-05'), nav: '106.5' },
          ],
        });
      }
    });
  }
  const rec = await runAsUser(s.userId, async () => {
    const run = await prisma.advisorRun.create({ data: { userId: s.userId, engineVersion: 'test', ruleVersionsSnapshot: {}, status: 'COMPLETED' } });
    return prisma.advisorRecommendation.create({
      data: {
        userId: s.userId, generationRunId: run.id, ruleId: 'IDLE_CASH_PARKING', ruleVersion: 1, category: 'IDLE_CASH_PARKING', priority: 22,
        action: [], rationale: 'r', inputsSnapshot: {}, dedupeKey: 'IDLE_CASH_PARKING:bank', headline: 'h', createdAt: T0, status: 'ACCEPTED', acceptedAt: T0,
        promise: { gainInr: '6300.00', riskBand: 'LOW', costInr: '0.00', liquidity: '1 working day', confidence: 'HIGH' },
        measurement: { method: 'NAV_VS_CASH', horizonDays: 365, baseline: { amountInr: '180000.00', savingsRatePct: 3, referenceFundId: liquidFundId, fundKind: 'LIQUID' } },
      },
    });
  });
  return { s, rec };
}

describe('confirm and measure (DB)', () => {
  it('a liquid-fund purchase confirms the advice; a year on it is worth ₹6,300 more than the bank', async () => {
    const { s, rec } = await setup('aoi-measure-acted');
    await runAsUser(s.userId, () => prisma.transaction.create({
      data: { portfolioId: s.portfolioId, assetClass: 'MUTUAL_FUND', transactionType: 'BUY', tradeDate: new Date('2025-06-05'), fundId: liquidFundId, assetName: 'Test Liquid Fund', quantity: '1800', price: '100', grossAmount: '180000', netAmount: '180000' },
    }));
    expect(await runAsUser(s.userId, () => confirmFromData(s.userId, new Date(T0.getTime() + 10 * DAY)))).toBe(1);
    const c = await runAsUser(s.userId, () => prisma.advisorRecommendation.findUniqueOrThrow({ where: { id: rec.id } }));
    expect(c).toMatchObject({ status: 'DONE', confirmedBy: 'DATA' });
    expect(c.confirmedAt?.toISOString().slice(0, 10)).toBe('2025-06-05');

    // Not due yet: nothing measured.
    expect(await runAsUser(s.userId, () => measureDue(s.userId, new Date(T0.getTime() + 200 * DAY)))).toBe(0);
    expect(await runAsUser(s.userId, () => measureDue(s.userId, new Date('2026-06-10T00:00:00Z')))).toBe(1);
    const m = await runAsUser(s.userId, () => prisma.advisorRecommendation.findUniqueOrThrow({ where: { id: rec.id } }));
    expect(m.outcomeStatus).toBe('MEASURED');
    expect(m.outcomeInr!.toString()).toBe('6300');
  });

  it('skipped advice is priced as missed, using the reference fund', async () => {
    const { s, rec } = await setup('aoi-measure-skipped');
    await runAsUser(s.userId, () => prisma.advisorRecommendation.update({ where: { id: rec.id }, data: { status: 'DISMISSED' } }));
    expect(await runAsUser(s.userId, () => confirmFromData(s.userId, new Date(T0.getTime() + 10 * DAY)))).toBe(0);
    await runAsUser(s.userId, () => measureDue(s.userId, new Date('2026-06-10T00:00:00Z')));
    const m = await runAsUser(s.userId, () => prisma.advisorRecommendation.findUniqueOrThrow({ where: { id: rec.id } }));
    expect(m.outcomeStatus).toBe('MEASURED');
    expect(m.outcomeInr!.toString()).toBe('-6300');
  });

  it('without prices for the window it stays pending; a user-only claim is never priced', async () => {
    const { s, rec } = await setup('aoi-measure-pending');
    await runAsUser(s.userId, () => prisma.advisorRecommendation.update({ where: { id: rec.id }, data: { status: 'EXPIRED', createdAt: new Date('2024-01-02T00:00:00Z') } }));
    await runAsUser(s.userId, () => measureDue(s.userId, new Date('2025-02-10T00:00:00Z')));
    expect((await runAsUser(s.userId, () => prisma.advisorRecommendation.findUniqueOrThrow({ where: { id: rec.id } }))).outcomeStatus).toBe('PENDING');

    await runAsUser(s.userId, () => prisma.advisorRecommendation.update({ where: { id: rec.id }, data: { status: 'DONE', confirmedBy: 'USER', confirmedAt: T0 } }));
    await runAsUser(s.userId, () => measureDue(s.userId, new Date('2026-06-10T00:00:00Z')));
    const u = await runAsUser(s.userId, () => prisma.advisorRecommendation.findUniqueOrThrow({ where: { id: rec.id } }));
    expect(u).toMatchObject({ outcomeStatus: 'NOT_MEASURED', outcomeInr: null });
  });

  it('a purchase in a non-liquid fund does not confirm idle-cash advice', async () => {
    const { s } = await setup('aoi-measure-wrongfund');
    const other = await runAsSystem(() => prisma.mutualFundMaster.findFirst({ where: { subCategory: { notIn: ['Liquid Fund', 'Overnight Fund'] } }, select: { id: true } }));
    if (!other) return; // no reference funds loaded locally
    await runAsUser(s.userId, () => prisma.transaction.create({
      data: { portfolioId: s.portfolioId, assetClass: 'MUTUAL_FUND', transactionType: 'BUY', tradeDate: new Date('2025-06-05'), fundId: other.id, assetName: 'Other', quantity: '1', price: '180000', grossAmount: '180000', netAmount: '180000' },
    }));
    expect(await runAsUser(s.userId, () => confirmFromData(s.userId, new Date(T0.getTime() + 10 * DAY)))).toBe(0);
  });
});
