import { describe, it, expect } from 'vitest';
import { classifyPreview, isPdfBytes } from './safePreview';

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const bytes = (s: string) => Array.from(new TextEncoder().encode(s));

describe('classifyPreview', () => {
  it('renders a real PDF as a PDF, whatever the sender declared', () => {
    const p = classifyPreview(enc('%PDF-1.7\n...'), 'text/html', 'note.html');
    expect(p.mode).toBe('pdf');
    expect(p.blob?.type).toBe('application/pdf');
  });

  it('puts HTML in the sandbox, never as a PDF or plain iframe', () => {
    const p = classifyPreview(enc('<script>steal()</script>'), 'application/pdf', 'contract-note.pdf');
    // Claims to be a PDF, is not: no PDF magic and not text-typed by name.
    expect(p.mode).toBe('none');
    const h = classifyPreview(enc('<script>steal()</script>'), 'text/html', 'contract-note.html');
    expect(h.mode).toBe('sandboxed');
    expect(h.blob?.type).toBe('text/html');
  });

  it('never yields an SVG or XHTML blob type', () => {
    const p = classifyPreview(enc('<svg onload="x()"/>'), 'image/svg+xml', 'logo.svg');
    expect(p.mode).toBe('none');
    const x = classifyPreview(enc('<html/>'), 'application/xhtml+xml', 'a.htm');
    expect(x.mode).toBe('sandboxed');
    expect(x.blob?.type).toBe('text/html');
  });

  it('download-only for spreadsheets and unknown bytes', () => {
    expect(classifyPreview(enc('PK\u0003\u0004'), 'application/vnd.ms-excel', 'trades.xlsx').mode).toBe('none');
  });

  it('shows real JPEG, PNG, GIF, WEBP and BMP images, typed from the bytes', () => {
    const cases: Array<[number[], string]> = [
      [[0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'image/jpeg'],
      [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0], 'image/png'],
      [[...bytes('GIF89a'), 1, 0], 'image/gif'],
      [[...bytes('RIFF'), 0, 0, 0, 0, ...bytes('WEBPVP8 ')], 'image/webp'],
      [[...bytes('BM'), 0x36, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 0x28, ...new Array(39).fill(0)], 'image/bmp'],
    ];
    for (const [b, type] of cases) {
      // The sender's declared type and name are ignored either way.
      const p = classifyPreview(new Uint8Array(b).buffer, 'application/octet-stream', 'scan');
      expect(p.mode, type).toBe('image');
      expect(p.blob?.type, type).toBe(type);
    }
  });

  it('does not show a file as an image just because it is named or typed as one', () => {
    expect(classifyPreview(enc('<script>steal()</script>'), 'image/jpeg', 'receipt.jpg').mode).toBe('none');
    expect(classifyPreview(enc('<svg onload="x()"/>'), 'image/png', 'receipt.png').mode).toBe('none');
    expect(classifyPreview(enc('BMW invoice for service'), 'image/bmp', 'bmw.bmp').mode).toBe('none');
  });

  it('accepts a PDF header after leading junk, as readers do', () => {
    expect(isPdfBytes(new Uint8Array(enc('\n\n%PDF-1.4')))).toBe(true);
    expect(isPdfBytes(new Uint8Array(enc('not a pdf')))).toBe(false);
  });
});
