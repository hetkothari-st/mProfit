import { describe, it, expect } from 'vitest';
import { fromLocationPath } from './loginRedirect';

describe('fromLocationPath', () => {
  it('keeps the query string and hash of the page that sent the user to login', () => {
    expect(fromLocationPath({ from: { pathname: '/emi', search: '?v=1&tab=compare&s=abc', hash: '#top' } })).toBe('/emi?v=1&tab=compare&s=abc#top');
  });
  it('works without search or hash', () => {
    expect(fromLocationPath({ from: { pathname: '/emi' } })).toBe('/emi');
  });
  it('returns null without a usable internal path', () => {
    expect(fromLocationPath(null)).toBeNull();
    expect(fromLocationPath({})).toBeNull();
    expect(fromLocationPath({ from: { pathname: '//evil.example' } })).toBeNull();
  });
});
