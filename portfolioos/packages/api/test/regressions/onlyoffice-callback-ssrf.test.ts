import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAllowedDocServerUrl } from '../../src/controllers/document.controller.js';

/**
 * SEC-08 — the OnlyOffice save callback was a server-side request forgery
 * primitive.
 *
 * With ONLYOFFICE_JWT_ENABLED=true the handler verified an inner body JWT
 * only when a `token` field happened to be present, and a verification
 * failure merely logged a warning before continuing with the raw body. The
 * outer ?token= proves nothing an attacker lacks — every user legitimately
 * holds one for their own document — so a hand-written body could name any
 * `url` and this server would fetch it from inside the deployment network and
 * store the response.
 */

const CONTROLLER = readFileSync(
  join(__dirname, '..', '..', 'src', 'controllers', 'document.controller.ts'),
  'utf8',
);

describe('SEC-08: OnlyOffice callback rejects forged bodies', () => {
  it('rejects a missing inner body token instead of falling through', () => {
    expect(CONTROLLER).toContain('missing body token');
  });

  it('rejects an invalid inner body token instead of only logging', () => {
    // The catch block must return, not fall through to the raw body.
    const catchBlock = CONTROLLER.slice(
      CONTROLLER.indexOf('[oo] body token verification failed'),
    ).slice(0, 300);
    expect(catchBlock).toContain('401');
  });
});

describe('SEC-08: save URL is pinned to the configured DocumentServer', () => {
  // Defaults from config/env.ts in the test environment.
  const allowedHost = 'http://localhost:8083';

  it('allows the configured DocumentServer host', () => {
    expect(isAllowedDocServerUrl(`${allowedHost}/cache/files/x/output.docx`)).toBe(true);
  });

  it('blocks cloud metadata endpoints', () => {
    expect(isAllowedDocServerUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedDocServerUrl('http://metadata.google.internal/computeMetadata/v1/')).toBe(
      false,
    );
  });

  it('blocks other internal hosts and ports', () => {
    expect(isAllowedDocServerUrl('http://localhost:5432/')).toBe(false);
    expect(isAllowedDocServerUrl('http://127.0.0.1:6379/')).toBe(false);
    expect(isAllowedDocServerUrl('http://postgres:5432/')).toBe(false);
  });

  it('blocks non-http schemes', () => {
    expect(isAllowedDocServerUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedDocServerUrl('gopher://localhost:8083/')).toBe(false);
  });

  it('blocks a malformed URL rather than throwing', () => {
    expect(isAllowedDocServerUrl('not a url')).toBe(false);
    expect(isAllowedDocServerUrl('')).toBe(false);
  });

  it('is not fooled by the allowed host appearing elsewhere in the URL', () => {
    expect(isAllowedDocServerUrl('http://evil.example/?x=http://localhost:8083')).toBe(false);
    expect(isAllowedDocServerUrl('http://localhost:8083.evil.example/')).toBe(false);
  });
});
