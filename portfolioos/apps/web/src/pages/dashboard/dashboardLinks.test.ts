import { describe, it, expect } from 'vitest';
import { allocationSliceSidebarKey, topHoldingsViewAllHref } from './dashboardLinks';
import { ASSET_CLASS_ITEMS } from '@/components/layout/navItems';

const SIDEBAR_KEYS = ASSET_CLASS_ITEMS.map((i) => i.to);

describe('allocationSliceSidebarKey', () => {
  it('ties the vehicles slice to the Vehicles sidebar entry, not Others', () => {
    expect(allocationSliceSidebarKey({ key: 'VEHICLE', category: 'VEHICLE' })).toBe('/vehicles');
  });

  it('ties the rental-property slice to the Rental sidebar entry, not Real Estate', () => {
    expect(allocationSliceSidebarKey({ key: 'REAL_ESTATE', category: 'REAL_ESTATE' })).toBe('/rental');
  });

  it('keeps a REAL_ESTATE asset-class holding under Real Estate', () => {
    expect(allocationSliceSidebarKey({ key: 'REAL_ESTATE', category: 'FINANCIAL' })).toBe('/real-estate');
  });

  it('maps ordinary asset classes as before', () => {
    expect(allocationSliceSidebarKey({ key: 'EQUITY', category: 'FINANCIAL' })).toBe('/stocks');
    expect(allocationSliceSidebarKey({ key: 'MUTUAL_FUND', category: 'FINANCIAL' })).toBe('/mutual-funds');
  });

  it('only ever returns a key that is a real sidebar entry', () => {
    for (const key of ['/vehicles', '/rental']) expect(SIDEBAR_KEYS).toContain(key);
  });
});

describe('topHoldingsViewAllHref', () => {
  it('never links to the non-existent /holdings page', () => {
    expect(topHoldingsViewAllHref('ALL')).not.toBe('/holdings');
    expect(topHoldingsViewAllHref('p1')).not.toBe('/holdings');
  });

  it('opens the portfolio list for all portfolios, the portfolio page for one', () => {
    expect(topHoldingsViewAllHref('ALL')).toBe('/portfolios');
    expect(topHoldingsViewAllHref('p1')).toBe('/portfolios/p1');
  });
});
