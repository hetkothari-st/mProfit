/**
 * "Export to Tally": everything, one ZIP.
 *
 *   1 - Masters.xml                       groups and ledgers, opening balances
 *   2 - Transactions FY2023-24.xml        one file per financial year, in order
 *   …
 *   Holdings at end of FY2023-24.xlsx     quantity and value at each year end
 *   README - How to import into Tally.txt the books-beginning date and steps
 *
 * Throws TallyExportBlockedError (tallyPackage.ts) when the book would break a
 * Tally rule — no partial, "mostly importable" file is ever handed over.
 */
import { financialYearRange } from '@everypaisa/shared';
import { streamExcel } from '../export.service.js';
import { buildHoldingsStatement } from '../reportBuilder/statement/holdings.js';
import { renderToBuffer } from '../reports/renderToBuffer.js';
import { buildTallyBook, type TallyBook } from './tallyBook.js';
import { loadTallySources } from './tallySources.js';
import { tallyZipEntries, type ZipEntry } from './tallyPackage.js';

/** Build the book for a user: database → sources → Tally book. */
export async function buildUserTallyBook(userId: string): Promise<TallyBook> {
  const { sources, issues } = await loadTallySources(userId);
  const book = buildTallyBook(sources);
  return { ...book, issues: [...issues, ...book.issues] };
}

function holdingsFileName(fy: string): string {
  return `Holdings at end of FY${fy}.xlsx`;
}

export interface TallyZipResult {
  zip: Buffer;
  book: TallyBook;
  files: string[];
}

export async function buildTallyZip(userId: string): Promise<TallyZipResult> {
  const book = await buildUserTallyBook(userId);
  const holdingsFiles = book.years.map((y) => holdingsFileName(y.fy));
  const entries: ZipEntry[] = tallyZipEntries(book, { extraFiles: holdingsFiles });

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const e of entries) zip.file(e.name, e.content);

  const today = new Date();
  for (const y of book.years) {
    const yearEnd = new Date(financialYearRange(y.fy).to);
    const asOf = yearEnd < today ? yearEnd : today;
    const payload = await buildHoldingsStatement({ userId, portfolioIds: [], asOf });
    zip.file(holdingsFileName(y.fy), await renderToBuffer((sink) => streamExcel(sink, payload)));
  }

  return {
    zip: await zip.generateAsync({ type: 'nodebuffer' }),
    book,
    files: [...entries.map((e) => e.name), ...holdingsFiles],
  };
}
