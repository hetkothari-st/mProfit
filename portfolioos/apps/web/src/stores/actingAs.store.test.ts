import { describe, it, expect } from 'vitest';
import { isAccountRoute } from './actingAs.store';

/** The client's copy of the server's account-route list (managedProfile.service). */
describe('account routes never carry X-Act-As', () => {
  it('includes Succession, which the server refuses while acting', () => {
    expect(isAccountRoute('/api/legacy')).toBe(true);
    expect(isAccountRoute('/api/legacy/overview')).toBe(true);
  });

  it('does not swallow the nominee-side legacy routes', () => {
    expect(isAccountRoute('/api/legacy-view/x')).toBe(false);
    expect(isAccountRoute('/api/legacy-public/x')).toBe(false);
  });

  it('leaves data routes to run as the managed profile', () => {
    expect(isAccountRoute('/api/portfolios')).toBe(false);
  });
});
