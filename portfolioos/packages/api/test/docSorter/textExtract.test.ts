import { describe, it, expect } from 'vitest';
import { extractText, MIN_TEXT_CHARS } from '../../src/services/docSorter/textExtract.js';
import { makeEncryptedPdf, makeImageOnlyPdf, makeTextPdf, makeTextPng } from './makeFiles.js';

const LONG_TEXT = 'Bank Statement\nAccount Holder: TEST USER\nStatement Period 01/01/2026 to 31/03/2026\nWithdrawal Deposit Balance';

describe('extractText', () => {
  it('reads a text PDF without OCR', async () => {
    const r = await extractText({ buffer: await makeTextPdf(LONG_TEXT), fileName: 'a.pdf', passwords: [] });
    expect(r).toMatchObject({ ok: true, method: 'pdf-text' });
    if (r.ok) expect(r.text).toContain('Account Holder');
  });

  it('OCRs a PNG image', async () => {
    const r = await extractText({ buffer: await makeTextPng('INCOME CERTIFICATE'), fileName: 'a.png', passwords: [] });
    expect(r).toMatchObject({ ok: true, method: 'ocr' });
    if (r.ok) expect(r.text.toUpperCase()).toContain('INCOME');
  }, 120_000);

  it('OCRs an image-only PDF', async () => {
    const r = await extractText({ buffer: await makeImageOnlyPdf('SALARY SLIP'), fileName: 'a.pdf', passwords: [] });
    expect(r).toMatchObject({ ok: true, method: 'ocr' });
    if (r.ok) expect(r.text.toUpperCase()).toContain('SALARY');
  }, 120_000);

  it('reports password for an encrypted PDF, and reads it with the right password', async () => {
    const buffer = await makeEncryptedPdf('secret');
    expect(await extractText({ buffer, fileName: 'a.pdf', passwords: [] })).toEqual({ ok: false, reason: 'password' });
    const ok = await extractText({ buffer, fileName: 'a.pdf', passwords: ['secret'] });
    expect(ok).toMatchObject({ ok: true });
  });

  it('reports unsupported for office files', async () => {
    const r = await extractText({ buffer: Buffer.from('PK\u0003\u0004 not really'), fileName: 'a.docx', passwords: [] });
    expect(r).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('reports unreadable (not a crash) for a corrupt PDF', async () => {
    const r = await extractText({ buffer: Buffer.from('%PDF-1.4 garbage garbage'), fileName: 'a.pdf', passwords: [] });
    expect(r).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('uses 40 characters as the text-layer threshold that triggers OCR', () => {
    expect(MIN_TEXT_CHARS).toBe(40);
  });
});
