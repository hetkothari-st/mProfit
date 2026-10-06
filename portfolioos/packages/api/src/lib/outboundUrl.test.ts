import { describe, it, expect } from 'vitest';
import { isAllowedOutboundUrl } from './outboundUrl.js';

const OO = ['http://onlyoffice.railway.internal:80', 'https://docs.example.com'];

describe('isAllowedOutboundUrl', () => {
  it('allows files on the configured OnlyOffice origins', () => {
    expect(isAllowedOutboundUrl('http://onlyoffice.railway.internal/cache/files/x.docx', OO)).toBe(true);
    expect(isAllowedOutboundUrl('https://docs.example.com/cache/files/out.pdf?md5=1', OO)).toBe(true);
  });

  it('refuses internal and look-alike hosts', () => {
    for (const u of [
      'http://169.254.169.254/latest/meta-data/',
      'http://postgres.railway.internal:5432/',
      'http://localhost:3001/api/auth/me',
      'https://docs.example.com.evil.com/x',
      'https://evil.com/?https://docs.example.com',
      'http://docs.example.com/x', // scheme differs from the allowed https origin
    ]) {
      expect(isAllowedOutboundUrl(u, OO)).toBe(false);
    }
  });

  it('refuses other schemes, credentials and junk', () => {
    expect(isAllowedOutboundUrl('file:///etc/passwd', OO)).toBe(false);
    expect(isAllowedOutboundUrl('https://user:pw@docs.example.com/x', OO)).toBe(false);
    expect(isAllowedOutboundUrl('not a url', OO)).toBe(false);
  });
});
