import { describe, expect, it } from 'vitest';
import { goldFreshnessLabel } from './GoldSilverTopBar';

// Launch review B9: the Gold page said "Live · updated 4241 min ago".
const now = new Date('2026-11-27T10:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

describe('gold price freshness badge', () => {
  it('says Live for a fresh live quote', () => {
    expect(goldFreshnessLabel(ago(2), 'live', now)).toEqual({ live: true, text: 'Live · updated 2 min ago' });
  });

  it('never says Live for a price days old', () => {
    const label = goldFreshnessLabel(ago(4241), 'live', now);
    expect(label.live).toBe(false);
    expect(label.text).not.toMatch(/Live/);
    expect(label.text).toMatch(/^Last price · 24\/11\/2026 .* \(2 days ago\)$/);
  });

  it('never says Live for the stored fallback price', () => {
    expect(goldFreshnessLabel(ago(1), 'cached', now).live).toBe(false);
  });

  it('says so when there is no price time at all', () => {
    expect(goldFreshnessLabel(new Date(0).toISOString(), 'cached', now).text).toBe('Price not updated yet');
  });
});
