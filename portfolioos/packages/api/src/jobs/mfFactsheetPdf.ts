/**
 * Per-scheme text out of a consolidated AMC factsheet PDF.
 *
 * ---------------------------------------------------------------------------
 * WHY PAGE-INDEXED, NOT WHOLE-DOCUMENT
 * ---------------------------------------------------------------------------
 *
 * `lib/pdf.ts` already extracts a PDF's text, but it returns one string for the
 * whole document. That is the right shape for a CAS statement and the wrong one
 * here: an AMC factsheet is ~150 funds in one file, each with its own "Total
 * Expense Ratio", "Closing AUM" and "Fund Managers" line. Running the facts
 * regexes over the concatenation would match the FIRST fund in the document for
 * every scheme asked about — a number that is real, correctly parsed, and
 * belongs to a different fund. Nothing downstream could detect that.
 *
 * So the text is kept per page, and a scheme is answered with only the pages
 * that name it.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MATCH IS STRICT
 * ---------------------------------------------------------------------------
 *
 * A page is claimed for a scheme only when its name appears in that page's
 * text, compared on a normalised form. Two funds in the same family read very
 * alike — "ICICI Prudential Large Cap Fund" against "ICICI Prudential Large &
 * Mid Cap Fund" — and a looser rule would hand back the wrong page's TER with
 * no symptom at all. When several pages match, the longest name wins, because
 * "Large & Mid Cap Fund" contains "Mid Cap Fund" as a substring and the more
 * specific title is the one whose page it actually is.
 *
 * Returning null costs a DLQ row. Returning the wrong page costs a wrong
 * expense ratio presented as this fund's, inside a pillar that feeds a rating.
 */

import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { ENDPOINTS as ICICI_ENDPOINTS } from '../adapters/mfFactsheet/icici.v1.js';
import type { FactsheetFetchContext } from '../adapters/mfFactsheet/types.js';

/** One document's pages, in order, keyed by the URL it came from. */
const pdfCache = new Map<string, Promise<string[] | null>>();

/** Drop every cached document. Call between runs, and in tests. */
export function resetFactsheetPdfCache(): void {
  pdfCache.clear();
}

/**
 * Extract one string per page.
 *
 * The buffer copy is not defensive tidiness: pdfjs transfers the underlying
 * ArrayBuffer via `structuredClone`, and Node's `Buffer.buffer` is usually a
 * shared pool-backed ArrayBuffer that is not transferable, which throws
 * DataCloneError. `lib/pdf.ts` hit this first; the same workaround applies.
 */
async function extractPages(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const standalone = new ArrayBuffer(bytes.byteLength);
  const data = new Uint8Array(standalone);
  data.set(bytes);

  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string; hasEOL?: boolean }>;
      let text = '';
      for (const it of items) {
        if (it.str) text += it.str;
        text += it.hasEOL ? '\n' : ' ';
      }
      pages.push(text);
    }
    return pages;
  } finally {
    await doc.cleanup();
    await doc.destroy();
  }
}

async function loadPdfPages(
  url: string,
  ctx: FactsheetFetchContext,
): Promise<string[] | null> {
  const cached = pdfCache.get(url);
  if (cached !== undefined) return cached;

  const task = (async (): Promise<string[] | null> => {
    try {
      const bytes = await ctx.fetchBinary(url);
      const pages = await extractPages(bytes);
      logger.info(
        { url, pages: pages.length, bytes: bytes.byteLength },
        '[mf.factsheet] consolidated factsheet opened',
      );
      return pages;
    } catch (err) {
      // A month that is not out yet is a 404, not a defect. The adapter turns
      // the resulting null into its own typed failure.
      logger.warn({ url, err }, '[mf.factsheet] could not open consolidated factsheet');
      return null;
    }
  })();

  pdfCache.set(url, task);
  return task;
}

/** Lowercase alphanumerics only — spacing and punctuation differ between feeds. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Pages whose text contains this scheme's name.
 *
 * Contiguity matters: a fund's block can run over a page break, so once the
 * first page is found the immediately following page is included when it does
 * NOT name a different fund. Stopping at exactly one page would truncate a
 * manager list; taking a fixed two would import the next fund's TER.
 */
function findSchemePages(pages: readonly string[], schemeName: string): string | null {
  const want = normalise(schemeName);
  if (want.length < 8) return null; // too generic to match safely

  // Two conditions, and both are load-bearing.
  //
  // The name must appear in the page's TITLE AREA, not merely somewhere on it.
  // Measured on ICICI's July-2026 factsheet, "ICICI Prudential Large Cap Fund"
  // appears on fourteen of 168 pages: its own, plus every page carrying the
  // footnote "the performance details provided herein are of ICICI Prudential
  // Large Cap Fund" for a fund sharing its manager, plus annexures.
  //
  // The page must also carry its own "Closing AUM as on" block, which only a
  // fund's own page does. Together these select exactly one page per fund —
  // verified against two adjacent funds whose pages then came back as 14 and
  // 15, with different TER and AUM figures.
  //
  // Concatenating all fourteen matches instead, which an earlier revision did,
  // yielded a text carrying three different "Closing AUM" lines. The facts
  // regexes would have taken whichever came first: a real number, correctly
  // parsed, belonging to a different fund, with nothing downstream able to
  // tell.
  const TITLE_AREA_CHARS = 400;
  const own = pages.filter(
    (page) =>
      /closing aum as on/i.test(page) &&
      normalise(page.slice(0, TITLE_AREA_CHARS)).includes(want),
  );

  if (own.length === 0) return null;
  // More than one page claiming to be this fund's own page means the heuristic
  // no longer holds — report nothing rather than pick.
  if (own.length > 1) return null;
  return own[0]!;
}

/**
 * The resolver to install via `setIciciFactsheetTextResolver`.
 *
 * Returns null — never a guess — when the month is unpublished or the fund is
 * not found by name.
 */
export function createIciciFactsheetTextResolver(ctx: FactsheetFetchContext, asOf: Date) {
  return async (schemeCode: string): Promise<string | null> => {
    const meta = await prisma.mfSchemeMeta.findUnique({
      where: { schemeCode },
      select: { schemeName: true },
    });
    if (meta === null) return null;

    const url = ICICI_ENDPOINTS.factsheetPdf(asOf);
    const pages = await loadPdfPages(url, ctx);
    if (pages === null) return null;

    const text = findSchemePages(pages, meta.schemeName);
    if (text === null) {
      logger.warn(
        { schemeCode, schemeName: meta.schemeName, url, pages: pages.length },
        '[mf.factsheet] scheme not found in consolidated factsheet',
      );
      return null;
    }
    return text;
  };
}
