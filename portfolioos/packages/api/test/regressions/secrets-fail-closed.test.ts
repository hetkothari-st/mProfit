import { describe, it, expect } from 'vitest';
import {
  collectProductionSecretProblems,
  PLACEHOLDER_ONLYOFFICE_SECRET,
} from '../../src/config/env.js';

/**
 * SEC-03 / SEC-04 / SEC-09 — secrets that used to fail OPEN.
 *
 * Each of these silently degraded to an insecure-but-working state when the
 * variable was missing:
 *
 *   SECRETS_KEY              → lib/secrets.ts fell back to a key hardcoded in
 *                              this repo, which encrypts every broker
 *                              credential, OAuth token and mailbox password.
 *   ONLYOFFICE_JWT_SECRET    → kept a committed placeholder, making document
 *                              download tokens forgeable for any userId.
 *   FINFACTOR_WEBHOOK_SECRET → webhook HMAC verification returned true,
 *                              leaving an unauthenticated write endpoint open.
 *
 * Production must now refuse to boot in each case.
 */

const GOOD = {
  NODE_ENV: 'production',
  SECRETS_KEY: 'x'.repeat(32),
  ONLYOFFICE_JWT_SECRET: 'a-real-onlyoffice-secret',
  FINFACTOR_WEBHOOK_SECRET: 'a-real-webhook-secret',
};

describe('SEC-03/04/09: production secret configuration fails closed', () => {
  it('accepts a fully configured production environment', () => {
    expect(collectProductionSecretProblems(GOOD)).toEqual([]);
  });

  it('rejects production with SECRETS_KEY unset', () => {
    const problems = collectProductionSecretProblems({ ...GOOD, SECRETS_KEY: undefined });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('SECRETS_KEY');
  });

  it('rejects production still using the committed OnlyOffice placeholder', () => {
    const problems = collectProductionSecretProblems({
      ...GOOD,
      ONLYOFFICE_JWT_SECRET: PLACEHOLDER_ONLYOFFICE_SECRET,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ONLYOFFICE_JWT_SECRET');
  });

  it('rejects production with FINFACTOR_WEBHOOK_SECRET unset', () => {
    const problems = collectProductionSecretProblems({
      ...GOOD,
      FINFACTOR_WEBHOOK_SECRET: undefined,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('FINFACTOR_WEBHOOK_SECRET');
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const problems = collectProductionSecretProblems({
      NODE_ENV: 'production',
      SECRETS_KEY: undefined,
      ONLYOFFICE_JWT_SECRET: PLACEHOLDER_ONLYOFFICE_SECRET,
      FINFACTOR_WEBHOOK_SECRET: undefined,
    });
    expect(problems).toHaveLength(3);
  });

  it('leaves development and test environments alone', () => {
    for (const NODE_ENV of ['development', 'test']) {
      const problems = collectProductionSecretProblems({
        NODE_ENV,
        SECRETS_KEY: undefined,
        ONLYOFFICE_JWT_SECRET: PLACEHOLDER_ONLYOFFICE_SECRET,
        FINFACTOR_WEBHOOK_SECRET: undefined,
      });
      expect(problems, `${NODE_ENV} should not be gated`).toEqual([]);
    }
  });
});
