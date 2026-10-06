import { describe, it, expect } from 'vitest';
import { makeOriginCheck } from './corsOrigins.js';

describe('CORS origin check', () => {
  const allowed = makeOriginCheck('https://portfolio-os.up.railway.app, http://localhost:3000');

  it('allows the configured frontends', () => {
    expect(allowed('https://portfolio-os.up.railway.app')).toBe(true);
    expect(allowed('http://localhost:3000')).toBe(true);
  });

  it('refuses any other Railway-hosted site', () => {
    expect(allowed('https://attacker.up.railway.app')).toBe(false);
    expect(allowed('https://portfolio-os.up.railway.app.evil.com')).toBe(false);
  });

  it('allows the browser extension scheme only in its exact shape', () => {
    expect(allowed(`chrome-extension://${'a'.repeat(32)}`)).toBe(true);
    expect(allowed('chrome-extension://short')).toBe(false);
  });
});
