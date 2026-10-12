// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { markOnboardingFinished, markOnboardingStarted } from '@/lib/onboardingProgress';
import { fromLocationPath, postLoginPath } from './loginRedirect';

afterEach(() => localStorage.clear());

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

describe('postLoginPath', () => {
  const from = { from: { pathname: '/emi', search: '?v=1&tab=compare', hash: '#x' } };
  it('unfinished onboarding wins over the from path', () => {
    markOnboardingStarted('u1');
    expect(postLoginPath({ nextPath: null, userId: 'u1', state: from })).toBe('/onboarding');
  });
  it('finished onboarding returns to the full from path', () => {
    markOnboardingStarted('u2');
    markOnboardingFinished('u2');
    expect(postLoginPath({ nextPath: null, userId: 'u2', state: from })).toBe('/emi?v=1&tab=compare#x');
  });
  it('no from path -> /dashboard', () => {
    expect(postLoginPath({ nextPath: null, userId: 'u3', state: null })).toBe('/dashboard');
  });
  it('a protocol-relative from path is not used', () => {
    expect(postLoginPath({ nextPath: null, userId: 'u3', state: { from: { pathname: '//evil.example' } } })).toBe('/dashboard');
  });
  it('an explicit ?next= outranks everything', () => {
    markOnboardingStarted('u4');
    expect(postLoginPath({ nextPath: '/invite/abc', userId: 'u4', state: from })).toBe('/invite/abc');
  });
});
