import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SEC-02 — the password reset secret must never reach the logs.
 *
 * `forgotPassword` used to do `logger.info({ email, token: result.token })`
 * with no pino redaction, which made the application log the only place the
 * reset token ever appeared. PR #91 replaced that flow with an emailed,
 * HMAC-stored 6-digit code and removed the log line. This guards both halves:
 * no reset secret handed to the logger, and a redaction backstop in case one
 * ever is.
 */

const SRC = join(__dirname, '..', '..', 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('SEC-02: reset secrets are never logged', () => {
  for (const file of ['controllers/auth.controller.ts', 'services/auth.service.ts']) {
    it(`${file} passes no token or code to the logger`, () => {
      const calls = read(file).match(/logger\.\w+\([^;]*\);/g) ?? [];
      for (const call of calls) {
        expect(call, call).not.toMatch(/\b(token|code|resetCode)\s*[:,}]/);
      }
    });
  }

  it('configures pino redaction as a backstop', () => {
    const logger = read('lib/logger.ts');
    expect(logger).toContain('redact:');
    for (const path of ['token', 'password', 'req.headers.authorization']) {
      expect(logger, `redact should cover ${path}`).toContain(`'${path}'`);
    }
  });
});
