import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { createTransaction } from '../../src/services/holdings/transaction.service.js';
import {
  intradayReport,
  stcgReport,
  ltcgReport,
  schedule112AReport,
  incomeReport,
  unrealisedReport,
  portfolioSummary,
  userIntradayReport,
  userStcgReport,
  userLtcgReport,
  userIncomeReport,
  userUnrealisedReport,
  userSummary,
  historicalValuation,
} from '../../src/services/reports/reports.service.js';
import { computePortfolioXirr } from '../../src/services/analytics/xirr.service.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, seedStockMaster, prisma, type TestScope } from '../helpers/db.js';

/**
 * GOLDEN + CONSISTENCY: a small portfolio whose every report figure was
 * worked out by hand, and the rules that tie the reports to each other.
 *
 * Hand-worked figures (no charges, so cost = qty × price):
 *
 *   Main portfolio, stock GOLD-P (priced at ₹200 today)
 *     BUY  10 @ 100  2022-01-10   lot 1, cost 1,000
 *     BUY  10 @ 110  2024-01-15   lot 2, cost 1,100
 *     SELL 15 @ 150  2024-06-03   FY 2024-25
 *       FIFO: 10 from lot 1 → proceeds 1,500 − cost 1,000 = 500, held > 12m → LTCG
 *              5 from lot 2 → proceeds   750 − cost   550 = 200, held < 12m → STCG
 *     Left: 5 units of lot 2, cost 550, value 5 × 200 = 1,000, unrealised 450
 *   Main portfolio, stock GOLD-Q (priced at ₹52)
 *     BUY 20 @ 50 and SELL 20 @ 52 on 2024-08-05 → intraday gain 40
 *   Main portfolio dividend on GOLD-P, 2024-07-01: ₹250
 *
 *   Second portfolio, stock GOLD-P
 *     BUY  4 @ 120  2024-02-01;  SELL 4 @ 150  2024-09-01 → STCG 120
 *     Dividend 2024-10-01: ₹80
 *
 *   Schedule 112A, FY 2024-25: LTCG 500, allowance ₹1,25,000 → taxable 0.
 *
 *   XIRR, second portfolio (nothing left, so no terminal value):
 *     −480 on 2024-02-01, +600 on 2024-09-01 (213 days), +80 on 2024-10-01 (243 days)
 *     solve −480 + 600/(1+r)^(213/365) + 80/(1+r)^(243/365) = 0 → r = 0.799189
 *     (worked out by plain bisection outside the app's solver)
 *
 *   Historical valuation, main portfolio (month ends; GOLD-P also priced
 *   ₹105 on 2023-12-29 and ₹140 on 2024-03-28; latest price on or before
 *   the snapshot, else cost):
 *     2022-01-31  10 units, cost 1,000, no price yet  → value 1,000
 *     2023-12-31  10 units, cost 1,000, @105         → value 1,050
 *     2024-01-31  20 units, cost 2,100, @105         → value 2,100
 *     2024-03-31  20 units, cost 2,100, @140         → value 2,800
 *     2024-06-30   5 units, cost   550, @140         → value   700
 *     GOLD-Q's same-day buy and sell leave nothing; dividends hold no units.
 */

const FY = '2024-25';
const d = (v: string | Decimal) => new Decimal(v.toString());

describe('golden report figures and cross-report consistency', () => {
  let scope: TestScope;
  let secondPortfolioId: string;

  beforeAll(async () => {
    scope = await createTestScope('report-golden');
    const p = (await seedStockMaster(scope, { name: 'Golden P' })).symbol;
    const q = (await seedStockMaster(scope, { name: 'Golden Q' })).symbol;
    await runAsSystem(async () => {
      for (const [symbol, close] of [[p, '200'], [q, '52']] as const) {
        const stock = await prisma.stockMaster.findUniqueOrThrow({ where: { symbol } });
        await prisma.stockPrice.create({
          data: { stockId: stock.id, date: new Date(new Date().toISOString().slice(0, 10)), open: close, high: close, low: close, close },
        });
      }
      // Two past closes for GOLD-P, for the historical valuation.
      const gp = await prisma.stockMaster.findUniqueOrThrow({ where: { symbol: p } });
      for (const [date, close] of [['2023-12-29', '105'], ['2024-03-28', '140']] as const) {
        await prisma.stockPrice.create({
          data: { stockId: gp.id, date: new Date(date), open: close, high: close, low: close, close },
        });
      }
    });

    await scope.runAs(async () => {
      const second = await prisma.portfolio.create({
        data: { userId: scope.userId, name: 'Golden second', currency: 'INR', type: 'INVESTMENT' },
      });
      secondPortfolioId = second.id;

      const trade = (portfolioId: string, symbol: string, type: 'BUY' | 'SELL', date: string, qty: string, price: string) =>
        createTransaction(scope.userId, {
          portfolioId,
          transactionType: type,
          assetClass: 'EQUITY',
          stockSymbol: symbol,
          exchange: 'NSE',
          tradeDate: date,
          quantity: qty,
          price,
        });
      await trade(scope.portfolioId, p, 'BUY', '2022-01-10', '10', '100');
      await trade(scope.portfolioId, p, 'BUY', '2024-01-15', '10', '110');
      await trade(scope.portfolioId, p, 'SELL', '2024-06-03', '15', '150');
      await trade(scope.portfolioId, q, 'BUY', '2024-08-05', '20', '50');
      await trade(scope.portfolioId, q, 'SELL', '2024-08-05', '20', '52');
      await trade(secondPortfolioId, p, 'BUY', '2024-02-01', '4', '120');
      await trade(secondPortfolioId, p, 'SELL', '2024-09-01', '4', '150');

      for (const [portfolioId, date, amount] of [
        [scope.portfolioId, '2024-07-01', '250'],
        [secondPortfolioId, '2024-10-01', '80'],
      ] as const) {
        await prisma.transaction.create({
          data: {
            portfolioId,
            assetClass: 'EQUITY',
            transactionType: 'DIVIDEND_PAYOUT',
            assetName: 'Golden P',
            assetKey: 'name:golden-p-dividend',
            tradeDate: new Date(date),
            quantity: '0',
            price: '0',
            grossAmount: amount,
            netAmount: amount,
          },
        });
      }
    });
  }, 180_000);

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.capitalGain.deleteMany({ where: { portfolioId: secondPortfolioId } });
      await prisma.holdingProjection.deleteMany({ where: { portfolioId: secondPortfolioId } });
      await prisma.transaction.deleteMany({ where: { portfolioId: secondPortfolioId } });
      await prisma.portfolio.delete({ where: { id: secondPortfolioId } });
    });
    await scope.cleanup();
  });

  it('each report matches the hand-worked figures', () =>
    scope.runAs(async () => {
      const pf = scope.portfolioId;
      expect(d((await ltcgReport(pf, FY)).totalGain).equals(500)).toBe(true);
      expect(d((await stcgReport(pf, FY)).totalGain).equals(200)).toBe(true);
      expect(d((await intradayReport(pf, FY)).totalGain).equals(40)).toBe(true);

      const s112 = await schedule112AReport(pf, FY);
      expect(d(s112.totalGain).equals(500)).toBe(true);
      expect(d(s112.exemptionLimit).equals(125000)).toBe(true);
      expect(d(s112.taxable).equals(0)).toBe(true);

      const income = await incomeReport(pf, FY);
      expect(d(income.dividend).equals(250)).toBe(true);

      const u = await unrealisedReport(pf);
      expect(u.count).toBe(1);
      expect(d(u.totalCost).equals(550)).toBe(true);
      expect(d(u.totalValue).equals(1000)).toBe(true);
      expect(d(u.unrealisedPnL).equals(450)).toBe(true);
    }), 120_000);

  it('the gain reports add up to the summary, and rows add up to totals', () =>
    scope.runAs(async () => {
      const pf = scope.portfolioId;
      const reports = [await intradayReport(pf, FY), await stcgReport(pf, FY), await ltcgReport(pf, FY)];
      for (const r of reports) {
        const rowSum = r.rows.reduce((s, row) => s.plus(row.gainLoss), new Decimal(0));
        expect(rowSum.equals(d(r.totalGain))).toBe(true);
        expect(r.count).toBe(r.rows.length);
      }
      const summary = await portfolioSummary(pf);
      const fy = summary.capitalGainsByFy[FY]!;
      expect(d(fy.intraday).equals(d(reports[0]!.totalGain))).toBe(true);
      expect(d(fy.stcg).equals(d(reports[1]!.totalGain))).toBe(true);
      expect(d(fy.ltcg).equals(d(reports[2]!.totalGain))).toBe(true);

      const u = await unrealisedReport(pf);
      expect(d(summary.unrealised.totalCost).equals(d(u.totalCost))).toBe(true);
      expect(d(summary.unrealised.totalValue).equals(d(u.totalValue))).toBe(true);
      const holdingCost = u.rows.reduce((s, r) => s.plus(r.totalCost), new Decimal(0));
      expect(holdingCost.equals(d(u.totalCost))).toBe(true);
    }), 120_000);

  it('"All portfolios" equals the sum of each portfolio', () =>
    scope.runAs(async () => {
      const ids = [scope.portfolioId, secondPortfolioId];
      const sumOf = async (f: (id: string) => Promise<{ totalGain: string }>) => {
        let s = new Decimal(0);
        for (const id of ids) s = s.plus((await f(id)).totalGain);
        return s;
      };
      expect(d((await userStcgReport(scope.userId, FY)).totalGain).equals(await sumOf((id) => stcgReport(id, FY)))).toBe(true);
      expect(d((await userStcgReport(scope.userId, FY)).totalGain).equals(320)).toBe(true);
      expect(d((await userLtcgReport(scope.userId, FY)).totalGain).equals(await sumOf((id) => ltcgReport(id, FY)))).toBe(true);
      expect(d((await userIntradayReport(scope.userId, FY)).totalGain).equals(await sumOf((id) => intradayReport(id, FY)))).toBe(true);

      let dividends = new Decimal(0);
      for (const id of ids) dividends = dividends.plus((await incomeReport(id, FY)).dividend);
      expect(d((await userIncomeReport(scope.userId, FY)).dividend).equals(dividends)).toBe(true);
      expect(dividends.equals(330)).toBe(true);

      let cost = new Decimal(0);
      for (const id of ids) cost = cost.plus((await unrealisedReport(id)).totalCost);
      expect(d((await userUnrealisedReport(scope.userId)).totalCost).equals(cost)).toBe(true);

      const all = await userSummary(scope.userId);
      expect(all.counts.transactions).toBe(9);
    }), 120_000);

  it('XIRR matches the hand-solved rate, and the flows behind it add up', () =>
    scope.runAs(async () => {
      const r = await computePortfolioXirr(secondPortfolioId);
      expect(r.xirr).not.toBeNull();
      expect(Math.abs(r.xirr! - 0.799189)).toBeLessThan(0.000001);
      expect(d(r.totalInvested).equals(480)).toBe(true);
      expect(d(r.totalReceived).equals(680)).toBe(true);
      expect(d(r.terminalValue).equals(0)).toBe(true);
    }), 120_000);

  it('historical valuation matches the hand-worked month ends', () =>
    scope.runAs(async () => {
      const { points } = await historicalValuation(scope.portfolioId);
      const at = (day: string) => {
        const pt = points.find((x) => x.date.toISOString().slice(0, 10) === day);
        if (!pt) throw new Error(`no snapshot for ${day}`);
        return [pt.holdings, d(pt.cost).toNumber(), d(pt.value).toNumber()];
      };
      expect(at('2022-01-31')).toEqual([1, 1000, 1000]);
      expect(at('2023-12-31')).toEqual([1, 1000, 1050]);
      expect(at('2024-01-31')).toEqual([1, 2100, 2100]);
      expect(at('2024-03-31')).toEqual([1, 2100, 2800]);
      expect(at('2024-06-30')).toEqual([1, 550, 700]);
      // The latest snapshot uses today's price: it agrees with the live holdings report.
      const last = points[points.length - 1]!;
      const u = await unrealisedReport(scope.portfolioId);
      expect(d(last.cost).equals(d(u.totalCost))).toBe(true);
      expect(d(last.value).equals(d(u.totalValue))).toBe(true);
    }), 120_000);
});
