import { describe, it, expect } from 'vitest';
import { sanitiseNextPath } from './useNextPath';

/**
 * `?next=` on a login page is the classic open-redirect: the domain is ours,
 * the login is real, and the victim lands somewhere else with their guard
 * down. Only internal paths are honoured, and the cases below are the ones
 * that actually get tried.
 */

describe('the post-login destination', () => {
  it('accepts an ordinary internal path', () => {
    expect(sanitiseNextPath('/professional-invitations/abc123')).toBe(
      '/professional-invitations/abc123',
    );
    expect(sanitiseNextPath('/dashboard?tab=holdings')).toBe('/dashboard?tab=holdings');
  });

  it('refuses anything that leaves the site', () => {
    expect(sanitiseNextPath('https://evil.test/phish')).toBeNull();
    expect(sanitiseNextPath('//evil.test/phish')).toBeNull();
    // Browsers read a backslash here as a slash, so `/\evil.test` is
    // protocol-relative too.
    expect(sanitiseNextPath('/\\evil.test')).toBeNull();
    expect(sanitiseNextPath('javascript:alert(1)')).toBeNull();
  });

  it('treats absent or empty as no destination', () => {
    expect(sanitiseNextPath(null)).toBeNull();
    expect(sanitiseNextPath(undefined)).toBeNull();
    expect(sanitiseNextPath('')).toBeNull();
  });
});
