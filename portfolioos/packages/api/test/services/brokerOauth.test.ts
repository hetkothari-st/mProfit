import { describe, it, expect } from 'vitest';
import { generateTotp } from '../../src/services/brokerOauth/angel.oauth.js';
import { buildKiteLoginUrl } from '../../src/services/brokerOauth/kite.oauth.js';
import { buildUpstoxLoginUrl } from '../../src/services/brokerOauth/upstox.oauth.js';

describe('brokerOauth — pure helpers', () => {
  it('generateTotp matches RFC 6238 reference vector', () => {
    // RFC 6238 Appendix B — secret "12345678901234567890" (ASCII), HMAC-SHA1,
    // 30s step, 6 digits. ASCII secret → base32. At T = 59 seconds, code is
    // "287082".
    const ascii = '12345678901234567890';
    // Convert ASCII bytes to base32 (uppercase, RFC 4648, no padding).
    const b32 = asciiToBase32(ascii);
    const code = generateTotp(b32, 59 * 1000);
    expect(code).toBe('287082');
  });

  it('generateTotp throws on bad base32', () => {
    expect(() => generateTotp('not!base32!')).toThrow();
  });

  it('buildKiteLoginUrl puts api_key + state in URL', () => {
    const url = buildKiteLoginUrl('abcd1234', 'state-xyz');
    expect(url).toContain('api_key=abcd1234');
    expect(url).toContain('state=state-xyz');
    expect(url.startsWith('https://kite.zerodha.com/connect/login')).toBe(true);
  });

  it('buildUpstoxLoginUrl includes redirect_uri + state', () => {
    const url = buildUpstoxLoginUrl({
      apiKey: 'CLIENTID',
      redirectUri: 'http://localhost:3001/cb',
      state: 'csrf123',
    });
    const u = new URL(url);
    expect(u.searchParams.get('client_id')).toBe('CLIENTID');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:3001/cb');
    expect(u.searchParams.get('state')).toBe('csrf123');
    expect(u.searchParams.get('response_type')).toBe('authorization_code'.replace('authorization_', ''));
  });
});

function asciiToBase32(s: string): string {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = Buffer.from(s, 'ascii');
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHA[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHA[(value << (5 - bits)) & 0x1f];
  return out;
}
