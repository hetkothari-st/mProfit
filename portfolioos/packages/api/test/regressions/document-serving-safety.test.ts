import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FileKind } from '../../src/lib/decryptIfNeeded.js';
import {
  storedMimeFor,
  isInlineSafeMime,
  downloadHeaders,
} from '../../src/lib/documentMime.js';

/**
 * SEC-01 — stored XSS in the document vault.
 *
 * Upload persisted `req.file.mimetype` (client-chosen) and download echoed it
 * back as Content-Type, while the magic-byte probe's verdict was discarded.
 * HTML bytes named `statement.pdf` and declared `text/html` therefore came
 * back as a scriptable response; rendered from a blob URL in an unsandboxed
 * iframe that executes on the SPA origin, where both auth tokens live in
 * localStorage.
 */

const ALL_KINDS: FileKind[] = [
  'pdf',
  'xlsx_ooxml',
  'xlsx_encrypted',
  'xls',
  'csv',
  'image',
  'office_doc',
  'other',
  'junk',
];

const SCRIPTABLE = [
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/javascript',
  'text/javascript',
];

describe('SEC-01: stored document MIME comes from bytes, not the client', () => {
  it('never produces a scriptable type for any detected kind', () => {
    for (const kind of ALL_KINDS) {
      for (const claimed of [...SCRIPTABLE, null, 'application/pdf']) {
        const stored = storedMimeFor(kind, claimed);
        expect(SCRIPTABLE, `kind=${kind} claimed=${claimed}`).not.toContain(stored);
      }
    }
  });

  it('ignores a spoofed text/html even when the bytes sniffed as textual', () => {
    // The exact shape of the attack: HTML body, accepted as the textual
    // 'csv' kind, uploaded with Content-Type: text/html.
    expect(storedMimeFor('csv', 'text/html')).toBe('text/plain');
  });

  it('keeps a specific safe type the sniffer reported', () => {
    expect(storedMimeFor('image', 'image/jpeg')).toBe('image/jpeg');
    expect(storedMimeFor('pdf', 'application/pdf')).toBe('application/pdf');
  });

  it('does not treat SVG as inline-safe', () => {
    // An SVG is an XML document that can carry script — an image by
    // extension, an XSS vector when rendered inline.
    expect(isInlineSafeMime('image/svg+xml')).toBe(false);
  });

  it('forces a download for anything not inline-safe, and always sets nosniff', () => {
    const office = downloadHeaders('application/octet-stream', 'x.docx');
    expect(office['Content-Disposition']).toMatch(/^attachment;/);
    expect(office['X-Content-Type-Options']).toBe('nosniff');

    const pdf = downloadHeaders('application/pdf', 'x.pdf');
    expect(pdf['Content-Disposition']).toMatch(/^inline;/);
    expect(pdf['X-Content-Type-Options']).toBe('nosniff');
  });

  it('encodes the filename rather than interpolating it into the header raw', () => {
    const headers = downloadHeaders('application/pdf', 'a"b\r\nX-Injected: 1.pdf');
    expect(headers['Content-Disposition']).not.toContain('\r');
    expect(headers['Content-Disposition']).not.toContain('\n');
  });

  it('no longer reads req.file.mimetype in the upload path', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'src', 'controllers', 'document.controller.ts'),
      'utf8',
    );
    // Strip comments first — the fix is documented in prose right where the
    // old expression used to be, and that mention is not a usage.
    const code = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toContain('req.file.mimetype');
    expect(code).toContain('storedMimeFor(probe.kind, probe.mime)');
  });
});
