import { describe, it, expect } from 'vitest';
import { buildSortedName, uniqueName, safeExt } from '../../src/services/documents/docSorter/naming.js';

const up = new Date('2026-10-14T10:00:00Z');

describe('naming', () => {
  it('uses the type label and the document date', () => {
    expect(buildSortedName('BANK_STATEMENT', '2026-03-31', up, '.pdf')).toBe('Bank Statement_2026-03-31.pdf');
  });
  it('falls back to the upload date', () => {
    expect(buildSortedName('ITR', null, up, '.pdf')).toBe('ITR_2026-10-14.pdf');
  });
  it('appends -2, -3 on collision', () => {
    const taken = new Set(['Bank Statement_2026-03-31.pdf', 'Bank Statement_2026-03-31-2.pdf']);
    expect(uniqueName('Bank Statement_2026-03-31.pdf', taken)).toBe('Bank Statement_2026-03-31-3.pdf');
  });
  it('checks collisions case-insensitively', () => {
    expect(uniqueName('ITR_2026-10-14.pdf', new Set(['itr_2026-10-14.pdf']))).toBe('ITR_2026-10-14-2.pdf');
  });
  it('keeps only known-safe extensions', () => {
    expect(safeExt('a/b/Scan.PDF')).toBe('.pdf');
    expect(safeExt('weird.p%df')).toBe('');
    expect(safeExt('../../x.jpeg')).toBe('.jpeg');
  });
});
