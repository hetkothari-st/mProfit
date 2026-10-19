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
import { isLocalDatabaseUrl } from './localDbGuard.js';

// The guard runs before anything that can open a database connection is loaded (dynamic imports below).
for (const name of ['DATABASE_URL', 'DIRECT_URL'] as const) {
  const value = process.env[name];
  if (name === 'DIRECT_URL' && value === undefined) continue;
  if (!isLocalDatabaseUrl(value ?? '')) {
    console.error(`Refusing to run: ${name} must point at localhost, 127.0.0.1 or ::1 (host/hostaddr parameters included)`);
    process.exit(2);
  }
}

class MissingCaptureError extends Error {
  constructor(readerId: string) {
    super(`No saved capture listed for reader ${readerId} - add it to FIRST_CAPTURE`);
    this.name = 'MissingCaptureError';
  }
}

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

const { PAGE_READERS } = await import('../src/services/loans/loanRates/sources/index.js');
const { runLoanRates } = await import('../src/jobs/loanRatesJob.js');
const { prisma } = await import('../src/lib/prisma.js');

const dir = new URL('../test/fixtures/loanRates/', import.meta.url);
const pages = new Map(
  PAGE_READERS.map((r) => {
    const name = FIRST_CAPTURE[r.id];
    if (name === undefined) throw new MissingCaptureError(r.id);
    return [r.url, readFileSync(new URL(name, dir), 'utf8')] as const;
  }),
);
try {
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
} finally {
  await prisma.$disconnect();
}
