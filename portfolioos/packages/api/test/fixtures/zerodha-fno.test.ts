import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseZerodhaContractNoteText } from '../../src/services/imports/parsers/zerodhaContractNote.parser.js';

describe('Zerodha contract-note parser — F&O', () => {
  it('extracts F&O option rows with strike + expiry', () => {
    const text = readFileSync(
      resolve(__dirname, 'contract_note/zerodha/fno_options_1.txt'),
      'utf8',
    );
    const r = parseZerodhaContractNoteText(text);
    expect(r.transactions.length).toBeGreaterThanOrEqual(2);
    const opt = r.transactions.find((t) => t.assetClass === 'OPTIONS');
    expect(opt).toBeDefined();
    expect(opt!.strikePrice).toBe('24500');
    expect(opt!.optionType).toBe('CALL');
    expect(opt!.expiryDate).toBe('2026-11-13');
    expect(opt!.exchange).toBe('NFO');
  });
});
