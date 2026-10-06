import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SEC-02 — the password reset secret must never reach production logs.
 *
 * `forgotPassword` used to do `logger.info({ email, token: result.token })`
 * with no pino redaction, which made the application log the only place the
 * reset token ever appeared. PR #91 replaced that flow with an emailed,
 * HMAC-stored 6-digit code.
 *
 * PR #91 does deliberately log the code when an email fails to send outside
 * production, so a developer without SMTP can still finish the flow. That is
 * fine only while it stays behind the non-production guard; this test fails
 * if a reset secret is logged anywhere that guard does not cover.
 */

const SRC = join(__dirname, '..', '..', 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** logger calls that carry a token or code, with the ~6 lines preceding each. */
function secretLogCalls(src: string): Array<{ call: string; context: string }> {
  const lines = src.split('\n');
  const out: Array<{ call: string; context: string }> = [];
  lines.forEach((line, i) => {
    if (/logger\.\w+\(/.test(line) && /\b(token|code|resetCode)\s*[:,}]/.test(line)) {
      out.push({ call: line.trim(), context: lines.slice(Math.max(0, i - 6), i).join('\n') });
    }
  });
  return out;
}

describe('SEC-02: reset secrets never reach production logs', () => {
  for (const file of ['controllers/auth.controller.ts', 'services/auth.service.ts']) {
    it(`${file}: any logged token/code is inside a non-production guard`, () => {
      for (const { call, context } of secretLogCalls(read(file))) {
        expect(context, `unguarded secret log: ${call}`).toMatch(
          /NODE_ENV\s*!==\s*'production'/,
        );
      }
    });
  }

  it('the controller never logs a reset secret at all', () => {
    expect(secretLogCalls(read('controllers/auth.controller.ts'))).toEqual([]);
  });

  it('configures pino redaction as a backstop', () => {
    const logger = read('lib/logger.ts');
    expect(logger).toContain('redact:');
    for (const path of ['token', 'password', 'req.headers.authorization']) {
      expect(logger, `redact should cover ${path}`).toContain(`'${path}'`);
    }
  });
});
