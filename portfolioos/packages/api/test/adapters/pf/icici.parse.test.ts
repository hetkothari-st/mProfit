import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizePassbookPdf } from '../../../src/adapters/pf/shared/pdfPassbookParser.js';
import { parseIciciPpfPassbook } from '../../../src/adapters/pf/ppf/icici.v1.parse.js';

const here = fileURLToPath(new URL('.', import.meta.url));

describe('parseIciciPpfPassbook', () => {
  it('parses synthetic ICICI PPF statement', async () => {
    const buf = await readFile(resolve(here, '../../fixtures/pf/icici/passbook-acct-123456789012.pdf'));
    const tokens = await tokenizePassbookPdf(buf);
    const result = parseIciciPpfPassbook({ userId: 'u', accountIdentifier: '123456789012', tokens });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.eventDate))).toBe(true);
    expect(result.events).toMatchSnapshot();
  });

  it('returns ok:false on empty tokens', () => {
    const result = parseIciciPpfPassbook({
      userId: 'u',
      accountIdentifier: '0',
      tokens: { pageCount: 0, rawText: '', lines: [] },
    });
    expect(result.ok).toBe(false);
  });
});
