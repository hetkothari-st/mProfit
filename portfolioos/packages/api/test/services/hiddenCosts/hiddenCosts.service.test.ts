/**
 * Hidden Cost X-ray over a real database: every source, the window, the
 * estimate and "cut" totals, and a failing section that leaves the rest.
 * Holdings come from buildAdvisorFacts (tested on its own), stubbed here so
 * prices and staleness don't have to be seeded.
 */
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { Decimal } from 'decimal.js';
import { SPENDING_CONSENT_VERSION } from '@everypaisa/shared';
import { createTestScope, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem, runAsUser } from '../../../src/lib/requestContext.js';
import { giveSpendingConsent } from '../../../src/services/personalInflation/spendingConsent.js';
import type { AdvisorHoldingFact } from '../../../src/services/advisor/types.js';

const facts = vi.hoisted(() => ({ value: null as unknown, fail: false }));
vi.mock('../../../src/services/advisor/advisorFacts.builder.js', () => ({
  buildAdvisorFacts: async () => {
    if (facts.fail) throw new Error('holdings down');
    return facts.value;
  },
}));

const { getHiddenCosts } = await import('../../../src/services/hiddenCosts/hiddenCosts.service.js');

const NOW = new Date('2026-11-06T06:00:00Z');
const CODES = ['TEST-HC-REG', 'TEST-HC-DIR', 'TEST-HC-NOTER', 'TEST-HC-EQ'];
let s: TestScope;
const ids: Record<string, string> = {};

const holding = (key: string, assetClass: string, value: number, fundId: string | null = null): AdvisorHoldingFact => ({
  holdingKey: key, portfolioId: 'pf', assetName: key, assetClass, bucket: 'EQUITY_DOMESTIC', fundId, stockId: null, isin: null,
  quantity: new Decimal(1), currentPrice: new Decimal(value), currentValue: new Decimal(value), totalCost: new Decimal(value),
  unrealisedPnL: new Decimal(0), priceStale: false,
});

beforeAll(async () => {
  s = await createTestScope('hidden-costs');
  await runAsSystem(async () => {
    const master = (code: string, category: 'EQUITY' | 'DEBT', planType: string) =>
      prisma.mutualFundMaster.create({ data: { schemeCode: code, schemeName: code, amcName: 'Test AMC', category, planType, optionType: 'Growth Option' } });
    ids.reg = (await master('TEST-HC-REG', 'EQUITY', 'Regular Plan')).id;
    ids.dir = (await master('TEST-HC-DIR', 'EQUITY', 'Direct Plan')).id;
    ids.noTer = (await master('TEST-HC-NOTER', 'DEBT', 'Direct Plan')).id;
    ids.eq = (await master('TEST-HC-EQ', 'EQUITY', 'Direct Plan')).id;
    await prisma.mfSchemeMeta.create({
      data: { schemeCode: 'TEST-HC-DIR', schemeName: 'TEST-HC-DIR', amcCode: 'TAMC', amcName: 'Test AMC', sebiCategory: 'EQUITY', sebiSubCategory: 'Flexi Cap Fund', planType: 'DIRECT', optionType: 'GROWTH', inceptionDate: new Date('2015-01-01'), sourceHash: 'hc', fetchedAt: NOW },
    });
    await prisma.mfSchemeTer.create({ data: { schemeCode: 'TEST-HC-DIR', effectiveFrom: new Date('2026-10-01'), terPct: '0.50', sourceHash: 'hc', fetchedAt: NOW } });
  });

  await runAsUser(s.userId, async () => {
    const tx = (tradeDate: string, extra: Record<string, unknown>) =>
      prisma.transaction.create({
        data: { portfolioId: s.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY', tradeDate: new Date(tradeDate), assetName: 'Test Co', quantity: '1', price: '1000', grossAmount: '1000', netAmount: '1000', ...extra },
      });
    await tx('2026-05-01', { brokerage: '20', exchangeCharges: '3', sebiCharges: '0.1', otherCharges: '0.9', stt: '100', stampDuty: '15', gst: '4.5' });
    await tx('2025-01-01', { brokerage: '999' }); // more than a year ago: not counted

    // An equity fund sold after five months (exit load likely) and one held two years (none).
    const sell = await prisma.transaction.create({
      data: { portfolioId: s.portfolioId, assetClass: 'MUTUAL_FUND', transactionType: 'SELL', tradeDate: new Date('2026-08-01'), fundId: ids.eq, assetName: 'TEST-HC-EQ', quantity: '100', price: '1500', grossAmount: '150000', netAmount: '150000' },
    });
    const cg = (buyDate: string, sellAmount: string) =>
      prisma.capitalGain.create({
        data: {
          portfolioId: s.portfolioId, sellTransactionId: sell.id, buyTransactionId: sell.id, assetClass: 'MUTUAL_FUND', assetName: 'TEST-HC-EQ',
          buyDate: new Date(buyDate), sellDate: new Date('2026-08-01'), quantity: '1', buyPrice: '1', sellPrice: '1', buyAmount: '1', sellAmount,
          capitalGainType: 'SHORT_TERM', gainLoss: '0', taxableGain: '0', financialYear: '2026-27',
        },
      });
    await cg('2026-03-01', '150000');
    await cg('2024-06-01', '80000');

    await giveSpendingConsent(s.userId, SPENDING_CONSENT_VERSION);
    const spend = (ref: string, narration: string, amount: string, category: string) =>
      prisma.spendTxn.create({
        data: { userId: s.userId, source: 'canonical_event', sourceAdapter: 'test', sourceRef: ref, txnDate: new Date('2026-09-15'), amount, direction: 'DEBIT', mode: 'OTHER', narration, category, categorySrc: 'none' },
      });
    await spend('hc1', 'SMS ALERT CHARGES Q2', '17.70', 'uncategorised');
    await spend('hc2', 'SCHOOL FEE TERM 2', '50000', 'uncategorised');
    await spend('hc3', 'Electricity charges BESCOM', '2400', 'utilities');
  });

  facts.value = {
    holdings: [
      holding('fund:reg', 'MUTUAL_FUND', 500000, ids.reg),
      holding('fund:dir', 'MUTUAL_FUND', 200000, ids.dir),
      holding('fund:noter', 'MUTUAL_FUND', 100000, ids.noTer),
      holding('ulip:1', 'ULIP', 400000),
      holding('pms:1', 'PMS', 1000000),
    ],
    extra: {
      regularPlans: [{ holdingKey: 'fund:reg', portfolioId: 'pf', fundId: ids.reg, schemeName: 'Reg', valueInr: new Decimal(500000), bucket: 'EQUITY_DOMESTIC', regularTerPct: 1.8, directFundId: ids.dir, directSchemeCode: 'TEST-HC-DIR', directName: 'Dir', directTerPct: 0.6 }],
    },
  };
});

afterAll(async () => {
  await s.cleanup();
  await runAsSystem(async () => {
    await prisma.mfSchemeTer.deleteMany({ where: { schemeCode: { in: CODES } } });
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { in: CODES } } });
    await prisma.mutualFundMaster.deleteMany({ where: { schemeCode: { in: CODES } } });
  });
});

describe('hidden cost x-ray (DB)', () => {
  it('finds every source for the year, largest first, and totals them', async () => {
    facts.fail = false;
    const v = await runAsUser(s.userId, () => getHiddenCosts(s.userId, NOW));
    expect(v.sources.map((x) => [x.key, x.amountInr, x.basis])).toEqual([
      ['PMS_FEES', '20000.00', 'ESTIMATE'],
      ['ULIP_CHARGES', '9000.00', 'ESTIMATE'],
      ['REGULAR_COMMISSION', '6000.00', 'DATA'], // 5,00,000 × (1.8% − 0.6%)
      ['FUND_RUNNING_COST', '4000.00', 'DATA'], // 5,00,000 × 0.6% + 2,00,000 × 0.5%
      ['EXIT_LOADS', '1500.00', 'ESTIMATE'], // 1% of the ₹1,50,000 sold within a year
      ['TRADE_TAXES', '119.50', 'DATA'],
      ['TRADING_CHARGES', '24.00', 'DATA'],
      ['BANK_CARD_CHARGES', '17.70', 'DATA'], // the school fee and the electricity bill are not charges
    ]);
    expect(v.totalInr).toBe('40661.20');
    expect(v.estimatedInr).toBe('30500.00');
    expect(v.cuttableInr).toBe('6017.70');
    expect(v.fundsWithoutTer).toBe(1);
    expect(v.compound).toEqual({ years: 20, ratePct: 12, valueInr: expect.any(String) });
    expect(v.sources.find((x) => x.key === 'TRADE_TAXES')).toMatchObject({ unavoidable: true, cuttable: false });
    expect(v.sources.find((x) => x.key === 'REGULAR_COMMISSION')?.detail).toBe('1 fund · switchable to Direct');
    expect(v.unavailable).toEqual([]);
  });

  it('a section that fails is reported and the others still show', async () => {
    facts.fail = true;
    const v = await runAsUser(s.userId, () => getHiddenCosts(s.userId, NOW));
    expect(v.unavailable).toEqual(['holdings']);
    expect(v.sources.map((x) => x.key)).toEqual(['EXIT_LOADS', 'TRADE_TAXES', 'TRADING_CHARGES', 'BANK_CARD_CHARGES']);
    facts.fail = false;
  });

  it('bank charges are not read without spending consent', async () => {
    const other = await createTestScope('hidden-costs-noconsent');
    try {
      await runAsUser(other.userId, () =>
        prisma.spendTxn.create({
          data: { userId: other.userId, source: 'canonical_event', sourceAdapter: 'test', sourceRef: 'nc1', txnDate: new Date('2026-09-15'), amount: '500', direction: 'DEBIT', mode: 'OTHER', narration: 'LATE PAYMENT FEE', category: 'uncategorised', categorySrc: 'none' },
        }),
      );
      facts.value = { holdings: [], extra: { regularPlans: [] } };
      const v = await runAsUser(other.userId, () => getHiddenCosts(other.userId, NOW));
      expect(v.sources).toEqual([]);
      expect(v.totalInr).toBe('0.00');
    } finally {
      await other.cleanup();
    }
  });
});
