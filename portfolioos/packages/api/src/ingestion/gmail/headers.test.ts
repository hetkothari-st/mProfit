import { describe, expect, it } from 'vitest';
import { parseFromHeader } from './headers.js';

describe('parseFromHeader', () => {
  it('parses quoted display name with angled address', () => {
    const p = parseFromHeader('"HDFC Bank" <alerts@hdfcbank.net>');
    expect(p).toEqual({ address: 'alerts@hdfcbank.net', displayName: 'HDFC Bank' });
  });

  it('parses unquoted display name with angled address', () => {
    const p = parseFromHeader('HDFC Bank Alerts <alerts@hdfcbank.net>');
    expect(p).toEqual({ address: 'alerts@hdfcbank.net', displayName: 'HDFC Bank Alerts' });
  });

  it('parses a bare address', () => {
    const p = parseFromHeader('alerts@hdfcbank.net');
    expect(p).toEqual({ address: 'alerts@hdfcbank.net', displayName: null });
  });

  it('lowercases the address (Gmail treats it as case-insensitive)', () => {
    const p = parseFromHeader('"HDFC" <Alerts@HdfcBank.NET>');
    expect(p.address).toBe('alerts@hdfcbank.net');
  });

  it('returns null address for garbage input', () => {
    expect(parseFromHeader('')).toEqual({ address: null, displayName: null });
    expect(parseFromHeader(null)).toEqual({ address: null, displayName: null });
    expect(parseFromHeader(undefined)).toEqual({ address: null, displayName: null });
    expect(parseFromHeader('not an email')).toEqual({ address: null, displayName: null });
  });

  it('handles odd whitespace and trailing content', () => {
    const p = parseFromHeader('   "Kotak"    <alerts@kotak.com>   ');
    expect(p.address).toBe('alerts@kotak.com');
    expect(p.displayName).toBe('Kotak');
  });

  it('returns null displayName when only angle brackets are present', () => {
    const p = parseFromHeader('<alerts@hdfcbank.net>');
    expect(p).toEqual({ address: 'alerts@hdfcbank.net', displayName: null });
  });
});
