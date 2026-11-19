import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import {
  checkTradePrice,
  judgePrice,
  toPriceCheckDTO,
  type PriceReference,
} from '../../../src/services/holdings/priceCheck.service.js';

const D = (v: string) => new Decimal(v);

const stockRef: PriceReference = {
  kind: 'CLOSE', value: D('1000'), low: D('985'), high: D('1015'), date: '2026-02-10',
};
const navRef: PriceReference = { kind: 'NAV', value: D('50'), date: '2026-02-10' };

describe('judgePrice', () => {
  it('accepts a price at, near, or inside the day\'s range', () => {
    expect(judgePrice(D('1000'), stockRef).status).toBe('ok');
    expect(judgePrice(D('1012'), stockRef).status).toBe('ok'); // inside the range
    expect(judgePrice(D('1030'), stockRef).status).toBe('ok'); // within the 2% range slack
    expect(judgePrice(D('52'), navRef).status).toBe('ok'); // 4% off a NAV
  });

  it('flags a price far from the day without a recognisable slip as OFF_MARKET', () => {
    const v = judgePrice(D('1400'), stockRef);
    expect(v.status).toBe('warn');
    if (v.status !== 'warn') return;
    expect(v.code).toBe('OFF_MARKET');
    expect(v.hint).toBeNull();
    expect(v.diffPct).toBe('40.00');
  });

  it('recognises decimal-point and paise slips and says so', () => {
    for (const [price, word] of [['100000', '100 times'], ['10000', '10 times'], ['100', 'a tenth'], ['9.8', '1%']] as const) {
      const v = judgePrice(D(price), stockRef);
      expect(v.status, price).toBe('warn');
      if (v.status === 'warn') {
        expect(v.code, price).toBe('LIKELY_UNIT_SLIP');
        expect(v.hint, price).toContain(word);
      }
    }
  });

  it('flags a NAV that is 20% off but allows small allotment-date drift', () => {
    expect(judgePrice(D('60'), navRef).status).toBe('warn');
    expect(judgePrice(D('54.9'), navRef).status).toBe('ok');
  });

  it('refuses to judge nonsense input', () => {
    expect(judgePrice(D('0'), stockRef)).toEqual({ status: 'unknown', reason: 'BAD_INPUT' });
    expect(judgePrice(D('-5'), stockRef)).toEqual({ status: 'unknown', reason: 'BAD_INPUT' });
  });

  it('serialises money and percentages as strings', () => {
    const dto = toPriceCheckDTO(judgePrice(D('1400'), stockRef));
    expect(dto).toMatchObject({ status: 'warn', diffPct: '40.00', reference: { kind: 'CLOSE', value: '1000', low: '985' } });
  });
});

describe('checkTradePrice (DB)', () => {
  const tag = randomUUID().slice(0, 6).toUpperCase();
  const sym = `PCK${tag}`;
  const splitSym = `PSP${tag}`;
  const code = `9${Math.floor(Math.random() * 90000 + 10000)}`;
  const ids = { stock: '', splitStock: '', fund: '' };
  const NOW = new Date('2026-03-01T00:00:00Z');
  const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

  beforeAll(async () => {
    await runAsSystem(async () => {
      const s = await prisma.stockMaster.create({ data: { symbol: sym, exchange: 'NSE', name: 'Price Check Test Ltd' } });
      const sp = await prisma.stockMaster.create({ data: { symbol: splitSym, exchange: 'NSE', name: 'Split Test Ltd' } });
      ids.stock = s.id;
      ids.splitStock = sp.id;
      // Wed 11 Feb 2026 is the last price before the weekend; trades on Sat/Sun look back to it.
      await prisma.stockPrice.createMany({
        data: [
          { stockId: s.id, date: day('2026-02-11'), open: '995', high: '1015', low: '985', close: '1000' },
          { stockId: sp.id, date: day('2026-02-11'), open: '500', high: '510', low: '490', close: '500' },
        ],
      });
      await prisma.corporateAction.create({
        data: { stockId: sp.id, type: 'SPLIT', exDate: day('2026-02-20'), ratio: '2' },
      });
      const f = await prisma.mutualFundMaster.create({
        data: { schemeCode: code, schemeName: 'Price Check Test Fund - Direct - Growth', amcName: 'Test AMC', category: 'EQUITY' },
      });
      ids.fund = f.id;
      await prisma.mFNav.create({ data: { fundId: f.id, date: day('2026-02-11'), nav: '50.0000' } });
    });
  });

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.stockPrice.deleteMany({ where: { stockId: { in: [ids.stock, ids.splitStock] } } });
      await prisma.corporateAction.deleteMany({ where: { stockId: ids.splitStock } });
      await prisma.stockMaster.deleteMany({ where: { id: { in: [ids.stock, ids.splitStock] } } });
      await prisma.mFNav.deleteMany({ where: { fundId: ids.fund } });
      await prisma.mutualFundMaster.deleteMany({ where: { id: ids.fund } });
    });
  });

  const check = (over: Record<string, string>) =>
    runAsSystem(() =>
      checkTradePrice({ assetClass: 'EQUITY', stockSymbol: sym, tradeDate: '2026-02-11', price: '1000', now: NOW, ...over }),
    );

  it('passes a normal price and flags a mistyped one', async () => {
    expect((await check({})).status).toBe('ok');
    const v = await check({ price: '10000' });
    expect(v.status).toBe('warn');
    if (v.status === 'warn') expect(v.code).toBe('LIKELY_UNIT_SLIP');
  });

  it('uses the nearest earlier price when the trade date was a weekend', async () => {
    const v = await check({ tradeDate: '2026-02-14', price: '1000' });
    expect(v.status).toBe('ok');
    if (v.status === 'ok') expect(v.reference.date).toBe('2026-02-11');
  });

  it('does not guess when there is no history that close to the date', async () => {
    expect(await check({ tradeDate: '2026-01-01' })).toEqual({ status: 'unknown', reason: 'NO_PRICE_HISTORY' });
  });

  it('does not judge a stock whose history was adjusted by a later split', async () => {
    expect(await check({ stockSymbol: splitSym, price: '500' })).toEqual({ status: 'unknown', reason: 'ADJUSTED_HISTORY' });
  });

  it('says when it does not know the instrument, the date is in the future, or the asset is not checked', async () => {
    expect(await check({ stockSymbol: `NOPE${tag}` })).toEqual({ status: 'unknown', reason: 'NO_INSTRUMENT' });
    expect(await check({ tradeDate: '2026-12-31' })).toEqual({ status: 'unknown', reason: 'FUTURE_DATE' });
    expect(await check({ assetClass: 'FIXED_DEPOSIT' })).toEqual({ status: 'unknown', reason: 'NOT_CHECKED_ASSET' });
  });

  it('checks a mutual fund price against the NAV', async () => {
    const mf = (price: string) =>
      runAsSystem(() => checkTradePrice({ assetClass: 'MUTUAL_FUND', schemeCode: code, tradeDate: '2026-02-11', price, now: NOW }));
    expect((await mf('50.2')).status).toBe('ok');
    const bad = await mf('500');
    expect(bad.status).toBe('warn');
    if (bad.status === 'warn') {
      expect(bad.reference.kind).toBe('NAV');
      expect(bad.code).toBe('LIKELY_UNIT_SLIP');
    }
  });
});
