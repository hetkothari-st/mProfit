import { describe, it, expect } from 'vitest';
import { matchInsurerRow } from '../../src/services/policyCheck/insurerMetrics.service.js';
import { chunkPages } from '../../src/services/policyCheck/extract.service.js';
import { detectMimeFromMagicBytes } from '../../src/controllers/policyHealthCheck.controller.js';
import { PAGE_BREAK } from '../../src/services/policyCheck/textExtraction.service.js';

const rows = [
  { insurerName: 'HDFC Ergo General Insurance' },
  { insurerName: 'HDFC Life Insurance' },
  { insurerName: 'Star Health and Allied Insurance' },
  { insurerName: 'Niva Bupa Health Insurance' },
];

describe('matchInsurerRow', () => {
  it('matches by distinguishing words, ignoring generic ones', () => {
    expect(matchInsurerRow(rows, 'HDFC Ergo Health Insurance')?.insurerName).toBe('HDFC Ergo General Insurance');
    expect(matchInsurerRow(rows, 'Star Health Insurance')?.insurerName).toBe('Star Health and Allied Insurance');
  });
  it('never resolves HDFC Life to HDFC Ergo', () => {
    expect(matchInsurerRow(rows, 'HDFC Life')?.insurerName).toBe('HDFC Life Insurance');
  });
  it('returns null when ambiguous or unknown', () => {
    expect(matchInsurerRow(rows, 'HDFC')).toBeNull();
    expect(matchInsurerRow(rows, 'Max Bupa')).toBeNull();
    expect(matchInsurerRow(rows, '')).toBeNull();
  });
});

describe('chunkPages', () => {
  it('keeps exact page numbers across chunks', () => {
    const pages = Array.from({ length: 12 }, (_, i) => `text ${i + 1}`);
    const chunks = chunkPages([{ id: 'd1', extractedText: pages.join(PAGE_BREAK) + PAGE_BREAK, pageCount: 12 }]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ startPage: 1, endPage: 10 });
    expect(chunks[1]).toMatchObject({ startPage: 11, endPage: 12 });
    expect(chunks[1]!.text).toContain('=== PAGE 11 ===\ntext 11');
  });
});

describe('detectMimeFromMagicBytes', () => {
  const pad = (b: number[]) => Buffer.from([...b, ...new Array(16).fill(0)]);
  it('detects real types from bytes', () => {
    expect(detectMimeFromMagicBytes(Buffer.from('%PDF-1.7 xxxxxxxx'))).toBe('application/pdf');
    expect(detectMimeFromMagicBytes(pad([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
    expect(detectMimeFromMagicBytes(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });
  it('rejects executables / text regardless of claimed mimetype', () => {
    expect(detectMimeFromMagicBytes(Buffer.from('MZ\x90\x00 not a pdf at all'))).toBeNull();
    expect(detectMimeFromMagicBytes(Buffer.from('<html>hello world</html>'))).toBeNull();
  });
});

describe('matchInsurerRow segment words', () => {
  const r = [{ insurerName: 'Reliance General Insurance Co. Ltd.' }, { insurerName: 'Reliance Health Insurance Ltd.' }];
  it('keeps general/health when it disambiguates, drops it when it does not', () => {
    expect(matchInsurerRow(r, 'Reliance General')?.insurerName).toBe('Reliance General Insurance Co. Ltd.');
    expect(matchInsurerRow(r, 'Reliance Health')?.insurerName).toBe('Reliance Health Insurance Ltd.');
    expect(matchInsurerRow(r, 'Reliance')).toBeNull();
    const h = [{ insurerName: 'HDFC ERGO General Insurance Co. Ltd.' }];
    expect(matchInsurerRow(h, 'HDFC Ergo Health Insurance')?.insurerName).toBe('HDFC ERGO General Insurance Co. Ltd.');
  });
});
