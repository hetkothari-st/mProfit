import { describe, it, expect, vi } from 'vitest';
import { apiSandbox, API_SANDBOX_CSP } from './apiSandbox.js';

function run(url: string) {
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
  const next = vi.fn();
  apiSandbox({ originalUrl: url } as never, res as never, next);
  expect(next).toHaveBeenCalled();
  return headers['Content-Security-Policy'];
}

describe('apiSandbox', () => {
  it('sandboxes stored-file and JSON responses', () => {
    expect(run('/api/gmail/discovered-docs/abc/raw')).toBe(API_SANDBOX_CSP);
    expect(run('/api/documents/abc/download')).toBe(API_SANDBOX_CSP);
  });

  it('leaves the broker OAuth callback page able to run its script', () => {
    expect(run('/api/fo/brokers/kite/callback?code=x')).toBeUndefined();
    expect(run('/api/fo/brokers/kite/callback')).toBeUndefined();
  });

  it('does not exempt look-alike paths', () => {
    expect(run('/api/fo/brokers/kite/callbackx')).toBe(API_SANDBOX_CSP);
  });
});
