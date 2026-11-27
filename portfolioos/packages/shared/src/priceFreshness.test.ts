import { describe, expect, it } from 'vitest';
import { priceFreshness, LIVE_PRICE_MAX_AGE_HOURS } from './priceFreshness.js';

const now = new Date('2026-11-27T10:00:00Z');
const ago = (sec: number) => new Date(now.getTime() - sec * 1000).toISOString();

describe('priceFreshness (launch review B9)', () => {
  it('calls a fresh live quote live', () => {
    expect(priceFreshness(ago(30), now, { source: 'live' })).toMatchObject({ live: true, ageLabel: '30s ago' });
  });

  it('never calls a price live past the limit, and says its age', () => {
    const f = priceFreshness(ago(4241 * 60), now, { source: 'live' });
    expect(f.live).toBe(false);
    expect(f.ageLabel).toBe('2 days ago');
  });

  it('turns stale exactly past the limit', () => {
    const limit = LIVE_PRICE_MAX_AGE_HOURS * 3600;
    expect(priceFreshness(ago(limit), now).live).toBe(true);
    expect(priceFreshness(ago(limit + 1), now).live).toBe(false);
  });

  it('never calls a cached fallback live, however recent', () => {
    expect(priceFreshness(ago(10), now, { source: 'cached' }).live).toBe(false);
  });

  it('says days for prices older than two days', () => {
    expect(priceFreshness(ago(5 * 86400), now).ageLabel).toBe('5 days ago');
  });
});
