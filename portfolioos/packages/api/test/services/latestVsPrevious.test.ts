import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { latestVsPrevious } from '../../src/services/portfolio.service.js';

/**
 * `getPortfolioSummary`'s "Today's change" used to only look at stocks
 * (`StockPrice`), silently ignoring MF/crypto/gold-silver holdings even
 * though the dashboard's own tooltip promises "equities, MF, crypto, gold".
 * `latestVsPrevious` is the shared latest-vs-prior-close reducer now used
 * for all four feeds — these tests pin its contract in isolation.
 */
function d(v: string): Prisma.Decimal {
  return new Prisma.Decimal(v);
}

describe('latestVsPrevious', () => {
  it('pairs the latest price with the one immediately before it, per key', () => {
    // Rows must arrive [key asc, date desc] — the same ordering every
    // caller (stockPrice/mFNav/cryptoPrice/commodityPrice) queries with.
    const rows = [
      { key: 'A', date: '2026-01-03', price: d('110') },
      { key: 'A', date: '2026-01-02', price: d('100') },
      { key: 'A', date: '2026-01-01', price: d('90') },
    ];
    const byKey = latestVsPrevious(rows, (r) => r.key, (r) => r.price);
    const a = byKey.get('A')!;
    expect(a.latestClose.toString()).toBe('110');
    expect(a.prevClose?.toString()).toBe('100');
  });

  it('returns prevClose: null when only one price point exists for a key', () => {
    const rows = [{ key: 'B', date: '2026-01-03', price: d('50') }];
    const byKey = latestVsPrevious(rows, (r) => r.key, (r) => r.price);
    expect(byKey.get('B')!.prevClose).toBeNull();
  });

  it('keeps keys independent — one key having 1 row does not affect another with 2+', () => {
    const rows = [
      { key: 'ONE_ROW', date: '2026-01-03', price: d('5') },
      { key: 'TWO_ROWS', date: '2026-01-03', price: d('20') },
      { key: 'TWO_ROWS', date: '2026-01-02', price: d('18') },
    ];
    const byKey = latestVsPrevious(rows, (r) => r.key, (r) => r.price);
    expect(byKey.get('ONE_ROW')!.prevClose).toBeNull();
    expect(byKey.get('TWO_ROWS')!.prevClose?.toString()).toBe('18');
  });
});
