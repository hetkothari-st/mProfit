/**
 * What goes into the Tally ZIP, in order: the masters, then one transactions
 * file per financial year, then a plain-words guide. Tally imports masters
 * and transactions as separate files, and a transactions file only imports
 * cleanly once the ledgers it names exist — hence the numbering.
 *
 * A book that breaks any Tally rule (tallyValidate.ts) produces no import
 * files at all: handing over a file that Tally will partly reject is the
 * failure this export exists to prevent.
 */
import type { TallyBook } from './tallyBook.js';
import { renderMastersXml, renderVouchersXml } from './tallyXml.js';
import { validateTallyBook } from './tallyValidate.js';

export interface ZipEntry {
  name: string;
  content: string;
}

export class TallyExportBlockedError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `The Tally export was stopped because Tally would reject part of it ` +
        `(${problems.length} problem${problems.length === 1 ? '' : 's'}): ${problems.slice(0, 5).join(' ')}`,
    );
    this.name = 'TallyExportBlockedError';
  }
}

export const TALLY_README_NAME = 'README - How to import into Tally.txt';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2023-04-01" → "1-Apr-2023", the way Tally shows dates. */
function tallyDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-') as [string, string, string];
  return `${Number.parseInt(d, 10)}-${MONTHS[Number.parseInt(m, 10) - 1]}-${y}`;
}

function readme(book: TallyBook, importFiles: string[], opts: TallyZipOptions): string {
  const vouchers = book.years.flatMap((y) => y.vouchers);
  const byType = new Map<string, number>();
  for (const v of vouchers) byType.set(v.type, (byType.get(v.type) ?? 0) + 1);
  const typeSummary = [...byType].map(([type, n]) => `${n} ${type}`).join(', ') || 'none';

  return [
    'EveryPaisa - your books, ready to import into Tally',
    `Generated: ${(opts.generatedAt ?? new Date()).toISOString()}`,
    '',
    'BEFORE YOU IMPORT',
    '1. In TallyPrime, create a new company (or open an empty one) with:',
    `   Books beginning from: ${tallyDisplayDate(book.booksBeginning)}`,
    '   Every voucher in these files is dated on or after that day. Tally will not',
    '   import a voucher dated before the books begin.',
    '2. Import the files in this order, one at a time:',
    ...importFiles.map((f, i) => `   ${f}    (${i === 0 ? 'Alt+O Import > Masters' : 'Alt+O Import > Transactions'})`),
    '   Import each file once. Importing a transactions file twice records every',
    '   voucher twice.',
    '',
    'WHAT IS IN THE FILES',
    `- ${book.groups.length} groups and ${book.ledgers.length} ledgers: one ledger for each bank account, loan,`,
    '  credit card and holding, each under the Tally group it belongs to.',
    `- ${vouchers.length} vouchers across ${book.years.length} financial year${book.years.length === 1 ? '' : 's'} (${typeSummary}).`,
    '- Unallocated Funds (under Suspense A/c): money whose bank account the app does',
    '  not record - most trades, EMIs, rent and premiums. Move it to the right bank',
    '  ledger in Tally as you reconcile each bank statement.',
    '- Unclassified Receipts / Unclassified Payments (under Suspense A/c): bank',
    '  movements the app has not put into a category.',
    "- Owner's Capital: the other side of the opening bank balances, so the opening",
    '  trial balance agrees. Each bank ledger opens at the balance that makes Tally',
    '  close on the balance the app shows today.',
    ...(opts.extraFiles && opts.extraFiles.length > 0
      ? ['- Holdings (Excel): quantity and value of every holding at each year end:', ...opts.extraFiles.map((f) => `    ${f}`)]
      : []),
    '',
    'NOTES',
    ...(book.issues.length > 0 ? book.issues.map((i) => `- ${i.message}`) : ['- None.']),
    '',
  ].join('\r\n');
}

export interface TallyZipOptions {
  generatedAt?: Date;
  /** Other files the ZIP will carry (e.g. holdings), named in the guide. */
  extraFiles?: string[];
}

export function tallyZipEntries(book: TallyBook, opts: TallyZipOptions = {}): ZipEntry[] {
  const problems = validateTallyBook(book);
  if (problems.length > 0) throw new TallyExportBlockedError(problems);

  const entries: ZipEntry[] = [{ name: '1 - Masters.xml', content: renderMastersXml(book) }];
  book.years.forEach((y, i) => {
    entries.push({ name: `${i + 2} - Transactions FY${y.fy}.xml`, content: renderVouchersXml(y.vouchers) });
  });
  entries.push({ name: TALLY_README_NAME, content: readme(book, entries.map((e) => e.name), opts) });
  return entries;
}
