import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tokenizePassbookPdf } from '../../../src/adapters/pf/shared/pdfPassbookParser.js';

describe('tokenizePassbookPdf', () => {
  it('extracts non-empty page count and lines from a real passbook', async () => {
    const path = resolve(__dirname, '../../fixtures/pf/epfo/passbook-uan-100123456789.pdf');
    const buf = await readFile(path);
    const out = await tokenizePassbookPdf(buf);
    expect(out.pageCount).toBeGreaterThan(0);
    expect(out.lines.length).toBeGreaterThan(5);
    expect(out.lines.every((l) => typeof l === 'string')).toBe(true);
    // sanity: at least one line should mention "EMPLOYER SHARE"
    expect(out.lines.some((l) => /EMPLOYER\s+SHARE/i.test(l))).toBe(true);
  });

  it('rejects an empty buffer', async () => {
    await expect(tokenizePassbookPdf(Buffer.alloc(0))).rejects.toThrow();
  });
});
