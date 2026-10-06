import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';

import { verifyUploadedFile } from '../../src/lib/uploadSecurity.js';
import { buildImportUploadDir } from '../../src/middleware/upload.js';

const FIXTURES_ROOT = join(__dirname, '..', 'fixtures');

let tmpDir: string | null = null;
function tempFile(name: string, data: Buffer | string): string {
  tmpDir = tmpDir ?? mkdtempSync(join(tmpdir(), 'upload-security-test-'));
  const p = join(tmpDir, name);
  writeFileSync(p, data);
  return p;
}

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe('verifyUploadedFile', () => {
  it('accepts a real fixture CSV claiming .csv', async () => {
    const fixture = join(FIXTURES_ROOT, 'csv', '01_zerodha_equity_simple.csv');
    const result = await verifyUploadedFile(fixture, '.csv');
    expect(result.ok).toBe(true);
    expect(result.detectedKind).toBe('csv');
  });

  it('accepts a real fixture PDF claiming .pdf', async () => {
    const fixture = join(FIXTURES_ROOT, 'pf', 'hdfc', 'passbook-acct-12345678901234.pdf');
    const result = await verifyUploadedFile(fixture, '.pdf');
    expect(result.ok).toBe(true);
    expect(result.detectedKind).toBe('pdf');
  });

  it('accepts a real XLSX workbook claiming .xlsx', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['Symbol', 'Quantity'], ['RELIANCE', 10]]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const path = tempFile('real.xlsx', buf);

    const result = await verifyUploadedFile(path, '.xlsx');
    expect(result.ok).toBe(true);
    expect(result.detectedKind).toBe('xlsx_ooxml');
  });

  it('rejects a plain-text file renamed to .pdf', async () => {
    const path = tempFile('fake.pdf', 'this is just plain text, not a real PDF at all');
    const result = await verifyUploadedFile(path, '.pdf');
    expect(result.ok).toBe(false);
    expect(result.detectedKind).not.toBe('pdf');
    expect(result.detail).toMatch(/does not match/i);
  });

  it('rejects a Windows PE executable renamed to .csv', async () => {
    // 'MZ' magic bytes + padding — enough for the junk-detector to fire.
    const buf = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62, 0)]);
    const path = tempFile('malware.csv', buf);
    const result = await verifyUploadedFile(path, '.csv');
    expect(result.ok).toBe(false);
  });

  it('rejects a real XLSX workbook renamed to claim .csv', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['a', 'b']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const path = tempFile('disguised.csv', buf);

    const result = await verifyUploadedFile(path, '.csv');
    expect(result.ok).toBe(false);
    // sniff() is only told the claimed extension (.csv), so a zip-based
    // file it can't attribute to .xlsx/.docx/etc falls back to generic
    // 'junk' — still correctly rejected either way.
    expect(result.detectedKind).toBe('junk');
  });

  it('rejects a real PDF renamed to claim .xlsx', async () => {
    const fixture = join(FIXTURES_ROOT, 'pf', 'hdfc', 'passbook-acct-12345678901234.pdf');
    const buf = readFileSync(fixture);
    const path = tempFile('disguised.xlsx', buf);

    const result = await verifyUploadedFile(path, '.xlsx');
    expect(result.ok).toBe(false);
    expect(result.detectedKind).toBe('pdf');
  });
});

describe('buildImportUploadDir', () => {
  it('nests the storage path under the user id', () => {
    const dir = buildImportUploadDir('cus3r1d0123456789');
    expect(dir).toContain(join('imports', 'cus3r1d0123456789'));
    expect(dir).toMatch(/\d{4}-\d{2}$/);
  });

  it('rejects a userId that is not a safe path segment', () => {
    expect(() => buildImportUploadDir('../../etc/passwd')).toThrow();
  });
});
