import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizePassbookPdf } from '../../../src/adapters/pf/shared/pdfPassbookParser.js';
import { parseEpfoPassbook } from '../../../src/adapters/pf/epf/epfo.v1.parse.js';

const here = fileURLToPath(new URL('.', import.meta.url));

describe('parseEpfoPassbook', () => {
  it('parses the synthetic fixture into canonical events', async () => {
    const buf = await readFile(
      resolve(here, '../../fixtures/pf/epfo/passbook-uan-100123456789.pdf'),
    );
    const tokens = await tokenizePassbookPdf(buf);
    const result = parseEpfoPassbook({ userId: 'fixture-user', memberId: 'DLCPM00123450000012345', tokens });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every((e) => typeof e.amount === 'string')).toBe(true);
    expect(result.events.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.eventDate))).toBe(true);
    // snapshot for regression detection
    expect(result.events).toMatchSnapshot();
  });

  it('returns ok:false on empty tokens', () => {
    const result = parseEpfoPassbook({
      userId: 'u',
      memberId: 'MEMBER1',
      tokens: { pageCount: 0, rawText: '', lines: [] },
    });
    expect(result.ok).toBe(false);
  });
});
