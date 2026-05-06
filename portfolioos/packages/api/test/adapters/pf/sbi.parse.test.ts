import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizePassbookPdf } from '../../../src/adapters/pf/shared/pdfPassbookParser.js';
import { parseSbiPpfPassbook } from '../../../src/adapters/pf/ppf/sbi.v1.parse.js';

const here = fileURLToPath(new URL('.', import.meta.url));

describe('parseSbiPpfPassbook', () => {
  it('parses synthetic SBI PPF statement', async () => {
    const buf = await readFile(resolve(here, '../../fixtures/pf/sbi/passbook-acct-12345678901.pdf'));
    const tokens = await tokenizePassbookPdf(buf);
    const result = parseSbiPpfPassbook({ userId: 'u', accountIdentifier: '12345678901', tokens });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.eventDate))).toBe(true);
    expect(result.events).toMatchSnapshot();
  });

  it('returns ok:false on empty tokens', () => {
    const result = parseSbiPpfPassbook({
      userId: 'u',
      accountIdentifier: '0',
      tokens: { pageCount: 0, rawText: '', lines: [] },
    });
    expect(result.ok).toBe(false);
  });
});
