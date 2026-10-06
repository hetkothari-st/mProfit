import { describe, it, expect } from 'vitest';
import type { AssetClass } from '@everypaisa/shared';
import {
  SCHEMES, SCHEME_ORDER, PO_ASSET_CLASSES, assetClassToScheme, schemeForAssetClass,
  type PoFamily,
} from './poSchemes';

const FAMILIES: PoFamily[] = ['LUMPSUM', 'RECURRING', 'PAYOUT', 'SAVINGS'];

describe('poSchemes config', () => {
  it('has all 8 schemes in order', () => {
    expect(SCHEME_ORDER).toHaveLength(8);
    expect(new Set(SCHEME_ORDER).size).toBe(8);
  });

  it('every scheme maps to exactly one valid family with a positive periodsPerYear', () => {
    for (const s of SCHEME_ORDER) {
      const cfg = SCHEMES[s];
      expect(FAMILIES).toContain(cfg.family);
      expect(cfg.periodsPerYear).toBeGreaterThan(0);
      expect(typeof cfg.payout).toBe('boolean');
    }
  });

  it('payout flag is set exactly for PAYOUT-family schemes', () => {
    for (const s of SCHEME_ORDER) {
      expect(SCHEMES[s].payout).toBe(SCHEMES[s].family === 'PAYOUT');
    }
  });

  it('family assignments match the spec', () => {
    expect(SCHEMES.NSC.family).toBe('LUMPSUM');
    expect(SCHEMES.KVP.family).toBe('LUMPSUM');
    expect(SCHEMES.POST_OFFICE_TD.family).toBe('LUMPSUM');
    expect(SCHEMES.POST_OFFICE_RD.family).toBe('RECURRING');
    expect(SCHEMES.SSY.family).toBe('RECURRING');
    expect(SCHEMES.POST_OFFICE_MIS.family).toBe('PAYOUT');
    expect(SCHEMES.SCSS.family).toBe('PAYOUT');
    expect(SCHEMES.POST_OFFICE_SAVINGS.family).toBe('SAVINGS');
  });

  it('assetClassToScheme round-trips every PO asset class', () => {
    for (const s of SCHEME_ORDER) {
      const ac = SCHEMES[s].assetClass;
      expect(assetClassToScheme(ac)).toBe(s);
    }
  });

  it('PO_ASSET_CLASSES lists all 8 in order', () => {
    expect(PO_ASSET_CLASSES).toHaveLength(8);
    expect(PO_ASSET_CLASSES[0]).toBe('NSC');
  });

  it('assetClassToScheme throws for a non-PO class; schemeForAssetClass returns undefined', () => {
    expect(() => assetClassToScheme('EQUITY' as AssetClass)).toThrow();
    expect(schemeForAssetClass('EQUITY' as AssetClass)).toBeUndefined();
  });
});
