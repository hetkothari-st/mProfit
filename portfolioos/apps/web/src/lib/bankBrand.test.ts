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
    // HDFC's mark is a "HDFC BANK" wordmark — recorded wide, not squared.
    expect(brand?.aspect).toBeGreaterThan(2);
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

  // A pure red clears white-text contrast while still very bright, so it
  // came out near fire-engine red (#e1131b for Kotak) and glared beside the
  // navy and burgundy tiles.
  it('deepens a vivid red to the same weight as other tiles', () => {
    const [, s, l] = hsl(tileSurface('#ec1c24', null).via); // Kotak
    expect(l).toBeLessThanOrEqual(0.34);
    expect(s).toBeLessThanOrEqual(0.75);
  });

  it('leaves already-deep brand colours as they were', () => {
    expect(tileSurface('#004c8f', null).via).toBe('#0b4b84'); // HDFC
    expect(tileSurface('#97144d', null).via).toBe('#97144d'); // Axis
  });
});

function hsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [0, s, l];
}

describe('brandAccent', () => {
  it.each(['#004c8f', '#fff200', '#9d1d27', '#0473ea'])(
    'stays readable on both themes for %s',
    (color) => {
      expect(contrastRatio(brandAccent(color, true), '#0a0a0a')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(brandAccent(color, false), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('tones a vivid red down on the dark theme', () => {
    const accent = brandAccent('#ec1c24', true); // Kotak
    expect(hsl(accent)[1]).toBeLessThanOrEqual(0.75);
    expect(contrastRatio(accent, '#0a0a0a')).toBeGreaterThanOrEqual(4.5);
  });
});
