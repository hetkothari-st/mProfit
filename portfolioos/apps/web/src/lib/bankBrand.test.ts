import { describe, it, expect } from 'vitest';
import { BANK_BRAND_ASSETS } from '@/data/bankBrands.generated';
import { INDIAN_BANKS, bankSlug } from '@/data/indianBanks';
import { bankBrandFor, brandAccent, contrastRatio, resolveBank, tileSurface } from './bankBrand';

describe('resolveBank', () => {
  it.each([
    ['HDFC Bank', 'HDFC Bank'],
    ['hdfc bank fd - 2025', 'HDFC Bank'],
    ['HDFC', 'HDFC Bank'],
    ['SBI', 'State Bank of India'],
    ['State Bank of India', 'State Bank of India'],
    ['Central Bank of India', 'Central Bank of India'],
    ['Bank of India', 'Bank of India'],
    ['Indian Overseas Bank', 'Indian Overseas Bank'],
    ['Indian Bank', 'Indian Bank'],
    ['J&K Bank', 'Jammu & Kashmir Bank'],
    ['Kotak FD', 'Kotak Mahindra Bank'],
    ['Axis', 'Axis Bank'],
    ['ICICI Bank Ltd.', 'ICICI Bank'],
    ['PNB', 'Punjab National Bank'],
    ['Yes Bank', 'Yes Bank'],
  ])('%j → %s', (input, name) => {
    expect(resolveBank(input)?.name).toBe(name);
  });

  // Generic words must not claim a bank: "Yes" alone, a state name, "Union".
  it.each(['', 'Yes', 'Union', 'My Local Co-op', 'Karnataka Gramin Bank'])(
    '%j matches nothing',
    (input) => {
      expect(resolveBank(input)).toBeUndefined();
    },
  );
});

describe('bankBrandFor', () => {
  it('attaches the committed logo and measured colour', () => {
    const brand = bankBrandFor('HDFC Bank');
    expect(brand?.name).toBe('HDFC Bank');
    expect(brand?.logo).toMatch(/^\/banks\/hdfc-bank\.(png|svg)$/);
    expect(brand?.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns null for a bank it does not know', () => {
    expect(bankBrandFor('Nowhere Co-op Bank')).toBeNull();
  });

  it('only ships assets for banks in the list', () => {
    const slugs = new Set(INDIAN_BANKS.map((b) => bankSlug(b.name)));
    for (const key of Object.keys(BANK_BRAND_ASSETS)) expect(slugs.has(key)).toBe(true);
  });
});

describe('tileSurface', () => {
  // Brand colours from the manifest range from navy to lemon yellow; the tile
  // carries white text, so every stop of its gradient must stay readable.
  it.each(['#004c8f', '#fff200', '#e7e514', '#eb691f', '#60a7d7', '#0000fd', '#fec040'])(
    'keeps white text readable on %s',
    (color) => {
      const s = tileSurface(color, null);
      for (const stop of [s.from, s.via, s.to]) {
        expect(contrastRatio('#ffffff', stop)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('builds from the darker second colour when the main one is too light', () => {
    expect(tileSurface('#e7e514', '#01824b').base).toBe('#01824b'); // KVB: yellow + green
    expect(tileSurface('#004c8f', '#ed232a').base).toBe('#004c8f'); // HDFC keeps its navy
  });
});

describe('brandAccent', () => {
  it.each(['#004c8f', '#fff200', '#9d1d27', '#0473ea'])(
    'stays readable on both themes for %s',
    (color) => {
      expect(contrastRatio(brandAccent(color, true), '#0a0a0a')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(brandAccent(color, false), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    },
  );
});
