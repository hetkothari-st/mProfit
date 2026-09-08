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
import { ENDPOINTS as NIPPON_ENDPOINTS } from '../adapters/mfFactsheet/nippon.v1.js';
import { ENDPOINTS as KOTAK_ENDPOINTS } from '../adapters/mfFactsheet/kotak.v1.js';
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
function findSchemePages(
  pages: readonly string[],
  schemeName: string,
  ownPageRe: RegExp,
): string | null {
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
  // The name in the page's TITLE AREA is the primary signal, and on most AMCs
  // it is already unique: measured on the July-2026 files, "Kotak Gilt Fund"
  // heads exactly one of Kotak's 191 pages while appearing on eleven, and the
  // other ten are footnotes and annexures.
  //
  // The marker is only a TIE-BREAKER, applied when the title test leaves more
  // than one candidate. Requiring it outright was wrong: it is per-AMC wording,
  // and demanding ICICI's "Closing AUM as on" of every AMC rejected Kotak's
  // correct single page for not using the phrase, and Nippon's pages for not
  // labelling AUM at all — two funds silently unreadable because of a string
  // that was never about them.
  const TITLE_AREA_CHARS = 400;
  const titled = pages.filter((page) =>
    normalise(page.slice(0, TITLE_AREA_CHARS)).includes(want),
  );
  if (titled.length === 1) return titled[0]!;
  if (titled.length === 0) return null;

  const narrowed = titled.filter((page) => ownPageRe.test(page));
  // Still ambiguous means the heuristic does not hold for this document.
  // Reporting nothing costs a DLQ row; picking would attribute another fund's
  // expense ratio to this one, inside a pillar that feeds a rating.
  if (narrowed.length !== 1) return null;
  return narrowed[0]!;
}

/**
 * A factsheet-text resolver for any AMC that publishes one consolidated PDF.
 *
 * The shape is identical across AMCs — build a monthly URL, extract per page,
 * claim the fund's own page — so the only per-AMC input is the URL builder.
 * `findSchemePages`' two conditions hold generally: a consolidated factsheet
 * gives each fund a page headed by its name, and repeats that name in footnotes
 * and annexures elsewhere.
 */
export function createFactsheetTextResolver(
  ctx: FactsheetFetchContext,
  urlFor: (asOf: Date) => string,
  asOf: Date,
  /**
   * What marks a page as a fund's OWN page rather than one that merely mentions
   * it. Per-AMC because the wording is: ICICI writes "Closing AUM as on", Kotak
   * and Nippon write their own variants. The default matches any AUM label,
   * which is enough when combined with the title-area name test — the name
   * appears in footnotes and annexures, but a fund's AUM figure only appears on
   * its own page.
   */
  ownPageRe: RegExp = /AUM/i,
) {
  return async (schemeCode: string): Promise<string | null> => {
    const meta = await prisma.mfSchemeMeta.findUnique({
      where: { schemeCode },
      select: { schemeName: true },
    });
    if (meta === null) return null;

    const url = urlFor(asOf);
    const pages = await loadPdfPages(url, ctx);
    if (pages === null) return null;

    const text = findSchemePages(pages, meta.schemeName, ownPageRe);
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

/** ICICI Pru's consolidated factsheet — one fund per page, 168 of them. */
export function createIciciFactsheetTextResolver(ctx: FactsheetFetchContext, asOf: Date) {
  return createFactsheetTextResolver(ctx, ICICI_ENDPOINTS.factsheetPdf, asOf, /closing aum as on/i);
}

/**
 * Nippon (167 pages) and Kotak (191 pages) both publish a constructible
 * consolidated PDF that downloads and extracts cleanly, and neither uses SBI's
 * multi-fund column layout. They are still NOT wired, because the page-claiming
 * heuristic that works on ICICI does not transfer:
 *
 *   - Nippon's title-area test matched three pages for one fund and the
 *     tie-break chose a summary page — 10,209 characters containing no expense
 *     ratio, no AUM and no as-of date. A page was found; it was the wrong one.
 *   - Kotak's own page carries no AUM label at all, so nothing narrows a
 *     multi-candidate match.
 *
 * Each needs its own page marker, as-of pattern and TER pattern read off its
 * real document, the way ICICI's were. The extractor and the URL builders are
 * ready; what is missing is per-AMC calibration, and guessing at it would
 * attribute one fund's expense ratio to another inside a pillar that feeds a
 * rating.
 */
export function createNipponFactsheetTextResolver(ctx: FactsheetFetchContext, asOf: Date) {
  return createFactsheetTextResolver(ctx, NIPPON_ENDPOINTS.factsheetPdf, asOf);
}

export function createKotakFactsheetTextResolver(ctx: FactsheetFetchContext, asOf: Date) {
  return createFactsheetTextResolver(ctx, KOTAK_ENDPOINTS.factsheetPdf, asOf);
}

/**
 * SBI's consolidated factsheet URL. Verified 2026-09-08: july and june return
 * 200, ~10 MB.
 *
 * NOT WIRED, and text-per-page extraction cannot read it. SBI lays a page out
 * as a TABLE OF SEVERAL FUNDS IN COLUMNS:
 *
 *     Month end AUM        55,417.22    5,810.72
 *     Monthly Avg. AUM     55,222.03    5,790.26
 *
 * Two funds, side by side, on one line of extracted text. Nothing in a
 * flattened page string says which column belongs to which fund, so a facts
 * regex would take the first number it met and attribute another fund's AUM and
 * TER to this one — the exact failure the page-indexing above exists to
 * prevent, reintroduced one level down.
 *
 * Reading it needs column-aware extraction: pdfjs gives each text item an x
 * position in `transform`, so the columns can be recovered by clustering on x
 * and mapping each to the fund named in its header. That is a different
 * extractor, not a different URL, which is why this export exists without a
 * resolver beside it.
 */
export const SBI_FACTSHEET_PDF = (asOf: Date): string => {
  const month = asOf.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toLowerCase();
  return (
    'https://www.sbimf.com/docs/default-source/scheme-factsheets/' +
    `all-sbimf-schemes-factsheet-${month}-${asOf.getUTCFullYear()}.pdf`
  );
};
