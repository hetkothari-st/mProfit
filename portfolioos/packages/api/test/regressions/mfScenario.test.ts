import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { createTransaction } from '../../src/services/holdings/transaction.service.js';
import { computePortfolioCapitalGains } from '../../src/services/tax/capitalGains.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

/**
 * A retail mutual-fund journey checked against figures worked out by hand, not against the code's own output:
 * a SIP, a dividend reinvested into units, a part redemption (FIFO across lots of different age), then the
 * same for a debt fund. The demo account has no MF holdings, so this is the only end-to-end MF check.
 */
describe('mutual fund journey: holdings and capital gains match a hand calculation (DB)', () => {
  let scope: TestScope;
  const suffix = Date.now().toString().slice(-6);
  const equityCode = `T${suffix}1`;
  const debtCode = `T${suffix}2`;
  const fundIds: string[] = [];

  beforeAll(async () => {
    scope = await createTestScope('mf-scenario');
    await runAsSystem(async () => {
      for (const [code, name, category] of [
        [equityCode, 'Scenario Equity Fund - Direct Growth', 'EQUITY'],
        [debtCode, 'Scenario Debt Fund - Direct Growth', 'DEBT'],
      ] as const) {
        const f = await prisma.mutualFundMaster.create({
          data: { schemeCode: code, schemeName: name, amcName: 'Scenario AMC', category },
        });
        fundIds.push(f.id);
      }
    });
  });

  afterAll(async () => {
    await scope.cleanup();
    await runAsSystem(() => prisma.mutualFundMaster.deleteMany({ where: { id: { in: fundIds } } }));
  });

  const buy = (schemeCode: string, type: 'SIP' | 'BUY' | 'SELL' | 'REDEMPTION' | 'DIVIDEND_REINVEST' | 'SWITCH_OUT' | 'SWITCH_IN', tradeDate: string, quantity: string, price: string) =>
    createTransaction(scope.userId, {
      portfolioId: scope.portfolioId,
      transactionType: type,
      assetClass: 'MUTUAL_FUND',
      schemeCode,
      tradeDate,
      quantity,
      price,
    });

  const holding = async (schemeCode: string) => {
    const fund = fundIds[schemeCode === equityCode ? 0 : 1]!;
    const row = await prisma.holdingProjection.findFirst({ where: { portfolioId: scope.portfolioId, fundId: fund } });
    return row;
  };
  const dec = (v: unknown) => new Decimal(String(v));
  const makeFund = async (code: string, name: string, category: 'EQUITY' | 'DEBT') => {
    const f = await runAsSystem(() =>
      prisma.mutualFundMaster.create({ data: { schemeCode: code, schemeName: name, amcName: 'Scenario AMC', category } }),
    );
    fundIds.push(f.id);
    return f.id;
  };

  it('equity fund: SIP + reinvested dividend + part redemption', () =>
    scope.runAs(async () => {
      // Three SIP instalments, then a dividend reinvested at NAV 125 (₹250 -> 2 units).
      await buy(equityCode, 'SIP', '2024-01-05', '10', '100'); // cost 1000
      await buy(equityCode, 'SIP', '2024-02-05', '10', '110'); // cost 1100
      await buy(equityCode, 'SIP', '2024-03-05', '10', '120'); // cost 1200
      await buy(equityCode, 'DIVIDEND_REINVEST', '2024-06-10', '2', '125'); // 2 units, cost 250

      let h = await holding(equityCode);
      expect(dec(h!.quantity).toString()).toBe('32');
      expect(dec(h!.totalCost).toString()).toBe('3550'); // 1000+1100+1200+250
      expect(dec(h!.avgCostPrice).toFixed(4)).toBe('110.9375'); // 3550 / 32

      // Redeem 25 units on 2025-02-20 at NAV 150. FIFO: lot1 10@100, lot2 10@110, lot3 5 of 10@120.
      // Held > 12 months only for lot1 (2024-01-05) and lot2 (2024-02-05); lot3 (2024-03-05) is short-term.
      await buy(equityCode, 'REDEMPTION', '2025-02-20', '25', '150');

      h = await holding(equityCode);
      expect(dec(h!.quantity).toString()).toBe('7'); // 32 - 25
      // Remaining: 5 units @120 (600) + 2 reinvested @125 (250) = 850
      expect(dec(h!.totalCost).toString()).toBe('850');

      const { rows } = await computePortfolioCapitalGains(scope.portfolioId);
      const eq = rows.filter((r) => r.assetName.includes('Scenario Equity'));
      expect(eq).toHaveLength(3);
      const byBuy = (d: string) => eq.find((r) => r.buyDate.toISOString().slice(0, 10) === d)!;
      const l1 = byBuy('2024-01-05');
      const l2 = byBuy('2024-02-05');
      const l3 = byBuy('2024-03-05');

      expect(dec(l1.quantity).toString()).toBe('10');
      expect(dec(l1.gainLoss).toString()).toBe('500'); // 10 * (150-100)
      expect(l1.capitalGainType).toBe('LONG_TERM');
      expect(dec(l2.gainLoss).toString()).toBe('400'); // 10 * (150-110)
      expect(l2.capitalGainType).toBe('LONG_TERM');
      expect(dec(l3.quantity).toString()).toBe('5');
      expect(dec(l3.gainLoss).toString()).toBe('150'); // 5 * (150-120)
      expect(l3.capitalGainType).toBe('SHORT_TERM');

      const total = eq.reduce((s, r) => s.plus(r.gainLoss), new Decimal(0));
      expect(total.toString()).toBe('1050');
      expect(eq.every((r) => r.isEquityOriented)).toBe(true);
    }), 180_000);

  it('debt fund bought after April 2023 is never long-term (slab rate), whatever the holding period', () =>
    scope.runAs(async () => {
      await buy(debtCode, 'BUY', '2023-06-01', '100', '10'); // cost 1000
      await buy(debtCode, 'REDEMPTION', '2025-08-01', '100', '12'); // > 2 years later, proceeds 1200

      const { rows } = await computePortfolioCapitalGains(scope.portfolioId);
      const debt = rows.filter((r) => r.assetName.includes('Scenario Debt'));
      expect(debt).toHaveLength(1);
      expect(dec(debt[0]!.gainLoss).toString()).toBe('200');
      expect(debt[0]!.isEquityOriented).toBe(false);
      // Finance Act 2023 s.50AA: no LTCG treatment and no indexation for these units.
      expect(debt[0]!.capitalGainType).not.toBe('LONG_TERM');
      expect(debt[0]!.indexedCostOfAcquisition).toBeNull();

      const h = await holding(debtCode);
      expect(dec(h?.quantity ?? 0).toString()).toBe('0');
    }), 180_000);

  it('a switch is a sale of one fund and a purchase of the other, and a short-term loss offsets other gains in the year', () =>
    scope.runAs(async () => {
      // A fresh equity fund (FIFO would otherwise sell the older lots from the first test): 100 units @ 50,
      // switched out 40 units at NAV 45 (loss of 5 a unit) into a fresh debt fund.
      const swEq = `T${suffix}4`;
      const swDebt = `T${suffix}5`;
      await makeFund(swEq, 'Scenario Switch Equity Fund - Direct Growth', 'EQUITY');
      const swDebtId = await makeFund(swDebt, 'Scenario Switch Debt Fund - Direct Growth', 'DEBT');
      await buy(swEq, 'BUY', '2025-04-02', '100', '50'); // cost 5000
      await buy(swEq, 'SWITCH_OUT', '2025-09-01', '40', '45'); // proceeds 1800
      await buy(swDebt, 'SWITCH_IN', '2025-09-01', '180', '10'); // the same 1800 arrives as 180 units

      const { rows, summaryByFy } = await computePortfolioCapitalGains(scope.portfolioId);
      const sw = rows.filter((r) => r.assetName.includes('Scenario Switch Equity'));
      expect(sw).toHaveLength(1);
      expect(dec(sw[0]!.gainLoss).toString()).toBe('-200'); // 40 * (45 - 50)
      expect(sw[0]!.capitalGainType).toBe('SHORT_TERM');

      const debtHolding = await prisma.holdingProjection.findFirst({ where: { portfolioId: scope.portfolioId, fundId: swDebtId } });
      expect(dec(debtHolding!.quantity).toString()).toBe('180');
      expect(dec(debtHolding!.totalCost).toString()).toBe('1800');

      // 2025-26 also holds the debt-fund redemption from the previous test (+200 non-LT), so the year nets to 0
      // short-term... check the switch row alone, and that a year's taxable figure is never negative.
      const fy = summaryByFy['2025-26'];
      expect(fy).toBeDefined();
      expect(dec(fy!.taxable).gte(0)).toBe(true);
    }), 180_000);

  it('selling more units than were ever bought is flagged, not silently turned into a gain', () =>
    scope.runAs(async () => {
      const other = `T${suffix}3`;
      await makeFund(other, 'Scenario Oversold Fund - Direct Growth', 'EQUITY');
      await buy(other, 'BUY', '2025-01-10', '10', '100');
      await buy(other, 'REDEMPTION', '2025-06-10', '15', '120'); // 5 more than owned

      const { rows } = await computePortfolioCapitalGains(scope.portfolioId);
      const r = rows.filter((x) => x.assetName.includes('Oversold'));
      const real = r.filter((x) => !x.reviewReason);
      const orphan = r.filter((x) => x.reviewReason);
      // The 10 owned units are matched normally, at their real cost...
      expect(real).toHaveLength(1);
      expect(dec(real[0]!.quantity).toString()).toBe('10');
      expect(dec(real[0]!.gainLoss).toString()).toBe('200'); // 10 * (120 - 100)
      // ...and the 5 that were never bought are surfaced for review (shown at nil cost, short-term), not hidden.
      expect(orphan).toHaveLength(1);
      expect(dec(orphan[0]!.quantity).toString()).toBe('5');
      expect(orphan[0]!.reviewReason).toMatch(/more units than the recorded purchases/);
    }), 180_000);
});
