import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { REDACT_PATHS } from './logger.js';

function capture(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  const log = pino(
    { redact: { paths: REDACT_PATHS, censor: '[redacted]' } },
    { write: (l: string) => void lines.push(l) },
  );
  log.info(obj, 'probe');
  return lines.join('');
}

describe('log redaction', () => {
  it('scrubs identifiers that are encrypted at rest, top level and one level down', () => {
    const out = capture({
      accountNumber: '50100123456789',
      loan: { accountNumber: '998877665544', lenderName: 'HDFC' },
      policy: { policyNumber: 'POL12345678' },
      vehicle: { registrationNo: 'MH47BT5950', engineNo: 'ENG998877' },
      phone: '9876543210',
    });
    for (const v of ['50100123456789', '998877665544', 'POL12345678', 'MH47BT5950', 'ENG998877', '9876543210']) {
      expect(out).not.toContain(v);
    }
    expect(out).toContain('HDFC');
  });

  it('scrubs OAuth tokens in Google snake_case and raw email bodies', () => {
    const out = capture({
      tokens: { access_token: 'ya29.secret', refresh_token: '1//refresh' },
      emailBody: 'Your PAN ABCDE1234F',
    });
    expect(out).not.toContain('ya29.secret');
    expect(out).not.toContain('1//refresh');
    expect(out).not.toContain('ABCDE1234F');
  });
});
