/**
 * Tally's verdict on an XML import.
 *
 * TallyPrime answers an import request with a <RESPONSE> carrying counts —
 * CREATED, ALTERED, COMBINED, IGNORED, ERRORS (Case Study I,
 * help.tallysolutions.com) — plus a LINEERROR per entry it rejected, and an
 * EXCEPTIONS count when it imported something into its Exceptions report.
 * An import is clean only when Tally recognised the request and reported no
 * errors, no exceptions and no line errors.
 */

export interface TallyImportResult {
  created: number;
  altered: number;
  combined: number;
  ignored: number;
  errors: number;
  exceptions: number;
  lineErrors: string[];
  ok: boolean;
}

function count(xml: string, tag: string): number | null {
  const m = new RegExp(`<${tag}>\\s*(-?\\d+)\\s*</${tag}>`, 'i').exec(xml);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 10)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function parseTallyImportResponse(xml: string): TallyImportResult {
  const created = count(xml, 'CREATED');
  const altered = count(xml, 'ALTERED');
  const lineErrors = [...xml.matchAll(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/gi)].map((m) => unescapeXml(m[1]!.trim()));
  const result = {
    created: created ?? 0,
    altered: altered ?? 0,
    combined: count(xml, 'COMBINED') ?? 0,
    ignored: count(xml, 'IGNORED') ?? 0,
    errors: count(xml, 'ERRORS') ?? 0,
    exceptions: count(xml, 'EXCEPTIONS') ?? 0,
    lineErrors,
  };
  // A reply with no counts at all is not an import response (a wrong port, a
  // login page, a different request type) — never read that as success.
  const recognised = created !== null || altered !== null;
  return { ...result, ok: recognised && result.errors === 0 && result.exceptions === 0 && lineErrors.length === 0 };
}
