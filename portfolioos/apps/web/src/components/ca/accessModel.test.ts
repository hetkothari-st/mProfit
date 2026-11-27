import { describe, it, expect } from 'vitest';
import { describeBefore, inviteLinkStatus } from './accessModel';

describe('inviteLinkStatus (CA workspace review)', () => {
  const now = new Date('2026-11-27T10:00:00Z');

  it('says a past expiry has expired, not "expires"', () => {
    const s = inviteLinkStatus('2026-10-06T00:00:00Z', now);
    expect(s?.expired).toBe(true);
    expect(s?.text).toMatch(/^Link expired /);
  });

  it('keeps "Link expires" for a link still open', () => {
    const s = inviteLinkStatus('2026-12-05T00:00:00Z', now);
    expect(s?.expired).toBe(false);
    expect(s?.text).toMatch(/^Link expires /);
  });

  it('says nothing without a date', () => {
    expect(inviteLinkStatus(null, now)).toBeNull();
  });
});

describe('describeBefore', () => {
  it('reads a new-style phrase as written', () => {
    expect(describeBefore('all portfolios, view only, no end date')).toBe('all portfolios, view only, no end date');
  });

  it('puts old scope flags into words instead of column names', () => {
    const text = describeBefore({
      scopeAllCategories: true,
      scopeAllPortfolios: true,
      scopeAllAssetClasses: false,
      accessFrom: null,
      accessUntil: null,
    });
    expect(text).not.toMatch(/scopeAll|true|false/);
    expect(text).toContain('all portfolios');
    expect(text).toContain('chosen asset classes');
    expect(text).toContain('all categories');
    expect(text).toContain('no end date');
  });

  it('still shows other corrections field by field', () => {
    expect(describeBefore({ quantity: '10', price: '1500' })).toBe('quantity 10, price 1500');
  });
});
