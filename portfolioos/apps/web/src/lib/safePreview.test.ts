import { describe, it, expect } from 'vitest';
import { classifyPreview, isPdfBytes } from './safePreview';

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

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

  it('accepts a PDF header after leading junk, as readers do', () => {
    expect(isPdfBytes(new Uint8Array(enc('\n\n%PDF-1.4')))).toBe(true);
    expect(isPdfBytes(new Uint8Array(enc('not a pdf')))).toBe(false);
  });
});
