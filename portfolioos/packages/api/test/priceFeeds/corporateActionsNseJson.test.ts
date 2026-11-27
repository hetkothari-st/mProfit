import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cookieHeaderFrom,
  parseBseCorpActionsJson,
  parseNseCorpActionsJson,
  storeCorporateActions,
} from '../../src/priceFeeds/corporateActions.service.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, seedStockMaster, prisma, type TestScope } from '../helpers/db.js';

/**
 * The corporate-actions sync now reads NSE's JSON API (the archive CSV is
 * gone). The fixture is a trimmed REAL response captured 2026-11-27 — see
 * test/fixtures/corporateActions/README.md.
 */
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/corporateActions/nse-api-2025-06.json', import.meta.url)), 'utf8'),
) as unknown;

describe('NSE corporate-actions JSON (real response)', () => {
  it('reads Bajaj Finance’s June 2025 split and bonus with their ratios', () => {
    const { rows, parseFailures } = parseNseCorpActionsJson(fixture);
    expect(parseFailures).toBe(0);
    const baj = rows.filter((r) => r.symbol === 'BAJFINANCE' && r.exDate.toISOString().startsWith('2025-06-16'));
    const byType = Object.fromEntries(baj.map((r) => [r.type, r.ratio?.toString()]));
    expect(byType).toEqual({ SPLIT: '2', BONUS: '4' });
  });

  it('reads every split in the sample with a ratio', () => {
    const { rows } = parseNseCorpActionsJson(fixture);
    const splits = rows.filter((r) => r.type === 'SPLIT');
    expect(splits.length).toBeGreaterThan(1);
    expect(splits.every((r) => r.ratio !== null && r.ratio.greaterThan(1))).toBe(true);
  });

  it('keeps each row’s ISIN for matching', () => {
    expect(parseNseCorpActionsJson(fixture).isinBySymbol.get('BAJFINANCE')).toBe('INE296A01016');
  });

  it('builds a Cookie header from the homepage’s set-cookie lines', () => {
    expect(cookieHeaderFrom(['nsit=abc; Path=/; HttpOnly', 'bm_sv=xyz; Domain=.nseindia.com'])).toBe('nsit=abc; bm_sv=xyz');
    expect(cookieHeaderFrom(undefined)).toBe('');
  });
});

describe('BSE fallback parser (UNVERIFIED shape)', () => {
  it('reads the listing fields BSE’s website uses, and counts what it cannot read', () => {
    const out = parseBseCorpActionsJson({
      Table: [
        { short_name: 'TESTX', Purpose: 'Bonus issue 1:1', Ex_date: '16 Jun 2025' },
        { short_name: 'TESTY', Purpose: '', Ex_date: '' },
      ],
    });
    expect(out.rows.map((r) => [r.symbol, r.type, r.ratio?.toString()])).toEqual([['TESTX', 'BONUS', '1']]);
    expect(out.parseFailures).toBe(1);
  });
});

describe('storing corporate actions', () => {
  let scope: TestScope;
  afterEach(async () => {
    await runAsSystem(() => prisma.corporateAction.deleteMany({ where: { stockId: { in: scope.stockMasterIds } } }));
    await scope.cleanup();
  });

  it('matches by ISIN, and fills in a ratio an earlier run stored as missing', async () => {
    scope = await createTestScope('ca-store');
    await seedStockMaster(scope, { symbol: 'CASTORE', isin: 'INE000T00011' });
    const stockId = scope.stockMasterIds[0]!;
    await runAsSystem(async () => {
      // What the old parser left behind: a split with no ratio.
      await prisma.corporateAction.create({ data: { stockId, type: 'SPLIT', exDate: new Date('2025-06-16'), ratio: null } });
      const { rows, isinBySymbol } = parseNseCorpActionsJson([
        { symbol: 'RENAMED', isin: 'INE000T00011', series: 'EQ', exDate: '16-Jun-2025', subject: 'Face Value Split (Sub-Division) - From Rs 2/- Per Share To Re 1/- Per Share' },
        { symbol: 'RENAMED', isin: 'INE000T00011', series: 'EQ', exDate: '16-Jun-2025', subject: 'Bonus 4:1' },
      ]);
      const r = await storeCorporateActions(rows, 'nse', isinBySymbol);
      expect(r).toEqual({ inserted: 1, repaired: 1, skipped: 0 });
      const stored = await prisma.corporateAction.findMany({ where: { stockId }, orderBy: { type: 'asc' } });
      expect(stored.map((c) => [c.type, c.ratio?.toString()])).toEqual([
        ['BONUS', '4'],
        ['SPLIT', '2'],
      ]);
    });
  });
});
