import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { maskPan } from '../../src/services/auth.service.js';

/**
 * SEC-10 / SEC-14 / SEC-15 / SEC-30 — PII that left the server in full.
 *
 * /me returned the user's complete PAN on every call. The frontend persisted
 * the whole auth store to localStorage, so that PAN sat on disk in plaintext
 * next to the access and refresh tokens. Loan account numbers shipped in full
 * on every list response while the UI rendered only the last four digits.
 * AuditLog existed with a single unrelated write, so none of it left a trail.
 */

const SRC = join(__dirname, '..', '..', 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('SEC-14: PAN is masked at the API boundary', () => {
  it('masks the identifying prefix and keeps the recognisable tail', () => {
    expect(maskPan('ABCDE1234F')).toBe('XXXXX1234F');
  });

  it('passes through null', () => {
    expect(maskPan(null)).toBeNull();
  });

  it('does not leak a short or malformed value', () => {
    expect(maskPan('AB')).toBe('XXXXX');
  });

  it('is not in the profile payload any more', () => {
    const svc = read('services/auth.service.ts');
    const body = svc.slice(svc.indexOf('export function toAuthUser'));
    const fn = body.slice(0, body.indexOf('\n}'));
    expect(fn).toContain('panMasked');
    expect(fn).not.toMatch(/^\s*pan:\s*user\.pan,/m);
  });
});

describe('SEC-15: sensitive operations write an audit trail', () => {
  const controller = read('controllers/auth.controller.ts');

  it('audits login success and failure', () => {
    expect(controller).toContain("action: 'login'");
    expect(controller).toContain("action: 'login_failed'");
  });

  it('audits logout and password-reset requests', () => {
    expect(controller).toContain("action: 'logout'");
    expect(controller).toContain("action: 'password_reset_requested'");
  });

  it('audits every PAN reveal', () => {
    expect(controller).toContain("action: 'pii_view'");
    expect(controller).toContain('revealPan');
  });

  it('never records the password or the reset token', () => {
    const auditCalls = controller.match(/writeAuditLog\(\{[\s\S]*?\}\)/g) ?? [];
    expect(auditCalls.length).toBeGreaterThan(0);
    for (const call of auditCalls) {
      expect(call).not.toMatch(/\bpassword\b\s*[,:]/);
      expect(call).not.toMatch(/\btoken\b\s*[,:]/);
    }
  });

  it('audit writes never take down the operation being audited', () => {
    const audit = read('lib/audit.ts');
    expect(audit).toContain('catch');
    expect(audit).toContain('audit.write_failed');
  });
});

describe('SEC-30: loan account numbers are masked in list/detail', () => {
  const svc = read('services/loans.service.ts');

  it('masks on both read paths', () => {
    expect(svc).toContain('loans.map(withMaskedAccount)');
    expect(svc).toContain('return withMaskedAccount(loan)');
  });

  it('exposes the full value only through an explicit reveal', () => {
    expect(svc).toContain('export async function revealLoanAccountNumber');
    const controller = read('controllers/loans.controller.ts');
    expect(controller).toContain('revealLoanAccountHandler');
    expect(controller).toContain("action: 'pii_view'");
    // Plaintext PII must not be cached by browsers or proxies.
    expect(controller).toContain("res.set('Cache-Control', 'no-store')");
  });

  it('the reveal route is rate-limited', () => {
    expect(read('routes/loans.routes.ts')).toContain('piiLimiter');
  });
});

describe('SEC-10: the client persists tokens only, not the profile', () => {
  const store = readFileSync(
    join(SRC, '..', '..', '..', 'apps', 'web', 'src', 'stores', 'auth.store.ts'),
    'utf8',
  );

  it('declares a partialize that omits the user object', () => {
    expect(store).toContain('partialize');
    const partialize = store.slice(store.indexOf('partialize'));
    const block = partialize.slice(0, partialize.indexOf('}),') + 3);
    expect(block).toContain('accessToken');
    expect(block).not.toMatch(/\buser:\s*state\.user\b/);
  });
});
