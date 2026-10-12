/**
 * Dev only: fill the live-loan-rate tables from the saved real pages, without touching the network, so the
 * Live rates tab and Settings - Loan rates can be looked at locally. Refuses any non-local database.
 *
 *   cd portfolioos/packages/api
 *   DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split \
 *   DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split \
 *   npx tsx scripts/seed-loan-rates-from-fixtures.ts
 */
import { readFileSync } from 'node:fs';
import { runLoanRates } from '../src/jobs/loanRatesJob.js';
import { prisma } from '../src/lib/prisma.js';
import { PAGE_READERS } from '../src/services/loanRates/sources/index.js';

const FIRST_CAPTURE: Record<string, string> = {
  'rbi.home': 'rbi-home.html',
  'sbi.rates': 'sbi-mclr.html',
  'hdfc.home': 'hdfc-HOME.html',
  'hdfc.rates': 'hdfc-rates.html',
  'icici.home': 'icici-HOME.html',
  'icici.personal': 'icici-PERSONAL.html',
  'icici.rates': 'icici-rates.html',
  'axis.home': 'axis-HOME.html',
  'axis.mclr': 'axis-MCLR.html',
  'kotak.rates': 'kotak-rates.html',
  'pnb.mclr': 'pnb-MCLR.html',
  'bob.retail': 'bob-retail.html',
  'union.rates': 'union-loans.html',
  'canara.range': 'canara-RANGE.html',
  'lic.home': 'lic-HOME.html',
};

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
  console.error('Refusing to run: DATABASE_URL must point at a local database');
  process.exit(2);
}

const dir = new URL('../test/fixtures/loanRates/', import.meta.url);
const pages = new Map(PAGE_READERS.map((r) => [r.url, readFileSync(new URL(FIRST_CAPTURE[r.id]!, dir), 'utf8')]));
const result = await runLoanRates({
  opsUserId: null,
  fetchHtml: async (url) => {
    const page = pages.get(url);
    if (page === undefined) throw new Error(`no saved capture for ${url}`);
    return page;
  },
});
if (result === null) {
  console.error('A rates run is already in progress; try again shortly');
  process.exitCode = 1;
} else {
  for (const p of result.pages) console.log(`${p.readerId}: ${p.status} (+${p.active} active, ${p.suspect} suspect, ${p.unchanged} unchanged)`);
}
await prisma.$disconnect();
