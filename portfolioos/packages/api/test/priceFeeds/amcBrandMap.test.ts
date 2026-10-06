import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { AMC_BRANDS, BRAND_TO_AMC, isMappedAmc } from '../../src/priceFeeds/amcBrandMap.js';
import { amcKey, normaliseSchemeNameForTest } from '../../src/priceFeeds/terJoin.js';

/**
 * The map is committed rather than derived at runtime, which buys
 * reproducibility and costs upkeep: a new fund house has to be added by hand.
 *
 * This is the test that makes that cost visible on the night it is incurred,
 * instead of as an unexplained drop in TER coverage weeks later. When it
 * fails, run `pnpm --filter @everypaisa/api amc-brands:generate` and READ THE
 * DIFF — a shortened brand on an EXISTING AMC is the interesting case, not
 * the new row.
 */

describe('AMC brand map', () => {
  it('covers every AMC in MutualFundMaster', async () => {
    const rows = await runAsSystem(() =>
      prisma.mutualFundMaster.findMany({
        where: { isActive: true },
        select: { amcName: true },
        distinct: ['amcName'],
      }),
    );

    // An empty master means the AMFI sync has not run here. That is not this
    // test passing — it is this test having nothing to say — so it says so.
    if (rows.length === 0) {
      expect.hasAssertions();
      expect(Object.keys(AMC_BRANDS).length).toBeGreaterThan(0);
      return;
    }

    const missing = [...new Set(rows.map((r) => r.amcName))]
      .filter((name) => !isMappedAmc(amcKey(name)))
      .sort();

    expect(
      missing,
      missing.length === 0
        ? ''
        : `${missing.length} AMC(s) are in MutualFundMaster but not in amcBrandMap.ts:\n` +
            `  ${missing.join('\n  ')}\n` +
            'Their schemes will be recorded as ter_unmapped_amc and get no TER.\n' +
            'Run: pnpm --filter @everypaisa/api amc-brands:generate — then read the diff.',
    ).toEqual([]);
  });

  it('holds at least one brand for every AMC it lists', () => {
    for (const [key, brands] of Object.entries(AMC_BRANDS)) {
      expect(brands.length, `${key} has no brands`).toBeGreaterThan(0);
      for (const brand of brands) expect(brand.trim()).not.toBe('');
    }
  });

  // A brand claimed by two AMCs is the exact collision the AMC check exists
  // for, so it must not silently resolve to one of them.
  it('drops a brand two AMCs both claim rather than picking one', () => {
    const claims = new Map<string, string[]>();
    for (const [amc, brands] of Object.entries(AMC_BRANDS)) {
      for (const brand of brands) claims.set(brand, [...(claims.get(brand) ?? []), amc]);
    }
    for (const [brand, amcs] of claims) {
      if (amcs.length > 1) expect(BRAND_TO_AMC.has(brand)).toBe(false);
      else expect(BRAND_TO_AMC.get(brand)).toBe(amcs[0]);
    }
  });

  // Keys are amcKey() output, so a key with a trailing "mutual fund" or an
  // upper-case letter would never match anything at runtime.
  it('is keyed by amcKey output, not by the registered name', () => {
    for (const key of Object.keys(AMC_BRANDS)) {
      expect(amcKey(key), `${key} is not in amcKey form`).toBe(key);
    }
  });

  // The brands are matched against normalised scheme names, so a brand that
  // does not survive normalisation can never match.
  it('holds brands in normalised form', () => {
    for (const brands of Object.values(AMC_BRANDS)) {
      for (const brand of brands) {
        expect(normaliseSchemeNameForTest(brand), `${brand} is not normalised`).toBe(brand);
      }
    }
  });

  it('includes the AMCs whose registered name is not their brand', () => {
    // The three that broke a registered-name-only join. If any of these ever
    // drops out of the map, TER coverage falls by a fund house and this says
    // which one.
    expect(BRAND_TO_AMC.get('kotak')).toBe('kotak mahindra');
    expect(BRAND_TO_AMC.get('trustmf')).toBe('trust');
    expect(BRAND_TO_AMC.get('parag parikh')).toBe('ppfas');
  });
});
