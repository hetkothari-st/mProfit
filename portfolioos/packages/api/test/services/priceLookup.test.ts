import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createPriceLookup, priceAt, type PriceMeta } from '../../src/services/holdings/holdingsAsOf.service.js';

/** The bulk lookup must give exactly what one-at-a-time `priceAt` gives, including the gaps. */
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

describe('createPriceLookup', () => {
  it('matches priceAt for stocks and funds, before the first price, in gaps, and for unknown ids', async () => {
    const tag = Date.now().toString(36);
    const { stock, fund } = await runAsSystem(async () => {
      const stock = await prisma.stockMaster.create({ data: { symbol: `PL${tag}`, name: 'PL', exchange: 'NSE' } });
      const fund = await prisma.mutualFundMaster.create({
        data: { schemeCode: `PL${tag}`, schemeName: `PL fund ${tag}`, amcName: 'PL', category: 'EQUITY' } as never,
      });
      await prisma.stockPrice.createMany({
        data: [
          { stockId: stock.id, date: new Date('2024-01-10'), open: '1', high: '1', low: '1', close: '110' },
          { stockId: stock.id, date: new Date('2024-03-28'), open: '1', high: '1', low: '1', close: '130' },
        ],
      });
      await prisma.mFNav.createMany({
        data: [
          { fundId: fund.id, date: new Date('2024-02-15'), nav: '20.5' },
          { fundId: fund.id, date: new Date('2024-04-20'), nav: '22.25' },
        ],
      });
      return { stock, fund };
    });
    cleanup.push(() => runAsSystem(() => prisma.stockMaster.delete({ where: { id: stock.id } })));
    cleanup.push(() => runAsSystem(() => prisma.mutualFundMaster.delete({ where: { id: fund.id } })));

    const metas: PriceMeta[] = [
      { assetClass: 'EQUITY', stockId: stock.id, fundId: null, isin: null },
      { assetClass: 'MUTUAL_FUND', stockId: null, fundId: fund.id, isin: null },
      { assetClass: 'EQUITY', stockId: 'no-such-stock', fundId: null, isin: null },
      { assetClass: 'FIXED_DEPOSIT', stockId: null, fundId: null, isin: null },
    ];
    // End-of-month instants, like the valuation uses.
    const dates = ['2024-01-05', '2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31'].map(
      (d) => new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000 - 1),
    );
    const lookup = await runAsSystem(() => createPriceLookup(metas, dates));
    for (const m of metas) {
      for (const d of dates) {
        const want = await runAsSystem(() => priceAt(m, d));
        const got = await runAsSystem(() => lookup(m, d));
        expect(got === null ? null : got.toString(), `${m.stockId ?? m.fundId} ${d.toISOString()}`).toBe(
          want === null ? null : want.toString(),
        );
      }
    }
  });
});
