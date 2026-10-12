import { RATE_LOAN_TYPES, type RateLoanType, type RateSourceMode } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { readerById } from './sources/index.js';
import type { SourceLoanType } from './types.js';

/**
 * The source list (spec s5.1), seeded from the discovery of 12/10/2026. Code is the source of truth: every
 * run upserts these rows, so a URL or mode change ships as a code change, never as a database edit, and no
 * URL ever comes from a request.
 */
export interface SourceDef {
  id: string;
  lender: string;
  loanType: SourceLoanType;
  url: string;
  mode: RateSourceMode;
  adapter: string | null;
  adapterVer: string | null;
}

interface LenderDef {
  key: string;
  name: string;
  /** Where a person checks this lender's rates by hand (MANUAL sources). */
  url: string;
  loanTypes: readonly RateLoanType[];
  mclr: boolean;
}

const LENDERS: readonly LenderDef[] = [
  { key: 'sbi', name: 'SBI', url: 'https://sbi.bank.in/web/interest-rates/interest-rates', loanTypes: RATE_LOAN_TYPES, mclr: true },
  { key: 'hdfc', name: 'HDFC Bank', url: 'https://www.hdfc.bank.in/interest-rates', loanTypes: RATE_LOAN_TYPES, mclr: true },
  { key: 'icici', name: 'ICICI Bank', url: 'https://www.icici.bank.in/interest-rate', loanTypes: RATE_LOAN_TYPES, mclr: true },
  { key: 'axis', name: 'Axis Bank', url: 'https://www.axis.bank.in/interest-rates-and-charges', loanTypes: RATE_LOAN_TYPES, mclr: true },
  { key: 'kotak', name: 'Kotak', url: 'https://www.kotak.bank.in/en/rates.html', loanTypes: RATE_LOAN_TYPES, mclr: true },
  { key: 'pnb', name: 'PNB', url: 'https://pnb.bank.in/interst-rate-on-advances-linked-to-mclr.html', loanTypes: RATE_LOAN_TYPES, mclr: true },
  {
    key: 'bob',
    name: 'Bank of Baroda',
    url: 'https://bankofbaroda.bank.in/interest-rate-and-service-charges/retail-loans-interest-rates',
    loanTypes: RATE_LOAN_TYPES,
    mclr: true,
  },
  {
    key: 'canara',
    name: 'Canara Bank',
    url: 'https://www.canarabank.bank.in/pages/rates-of-interest-for-retail-lending-schemes-linked-to-rllr',
    loanTypes: RATE_LOAN_TYPES,
    mclr: true,
  },
  {
    key: 'union',
    name: 'Union Bank',
    url: 'https://www.unionbankofindia.bank.in/en/common/interest-rates-loans-and-advances',
    loanTypes: RATE_LOAN_TYPES,
    mclr: true,
  },
  // LIC HFL offers home loans only among our loan types and publishes no MCLR (its LHPLR is a PLR, not an offer).
  { key: 'lic', name: 'LIC Housing Finance', url: 'https://www.lichousing.com/housing-loan/home-loan', loanTypes: ['HOME'], mclr: false },
];

/** MANUAL sources for which discovery found a more specific page than the lender's index. */
const MANUAL_URLS: Readonly<Record<string, string>> = {
  'sbi.lap': 'https://sbi.bank.in/web/interest-rates/interest-rates/loan-schemes-interest-rates/loans-against-property',
  'kotak.mclr': 'https://www.kotak.bank.in/en/rates/mclr-rate.html',
  'canara.mclr': 'https://www.canarabank.bank.in/pages/loans-interest-rates',
  'bob.business': 'https://bankofbaroda.bank.in/interest-rate-and-service-charges/msme-loans-interest-rates',
};

/** Every AUTO source and the page reader that feeds it. Everything else is MANUAL (plan ruling 2). */
export const AUTO_SOURCES: Readonly<Record<string, string>> = {
  'rbi.repo': 'rbi.home',
  'sbi.home': 'sbi.rates',
  'sbi.personal': 'sbi.rates',
  'sbi.education': 'sbi.rates',
  'sbi.car': 'sbi.rates',
  'sbi.gold': 'sbi.rates',
  'sbi.las': 'sbi.rates',
  'sbi.mclr': 'sbi.rates',
  'hdfc.home': 'hdfc.home',
  'hdfc.personal': 'hdfc.rates',
  'hdfc.car': 'hdfc.rates',
  'hdfc.mclr': 'hdfc.rates',
  'icici.home': 'icici.home',
  'icici.personal': 'icici.personal',
  'icici.mclr': 'icici.rates',
  'axis.home': 'axis.home',
  'axis.mclr': 'axis.mclr',
  'kotak.home': 'kotak.rates',
  'kotak.personal': 'kotak.rates',
  'kotak.business': 'kotak.rates',
  'kotak.lap': 'kotak.rates',
  'kotak.las': 'kotak.rates',
  'kotak.education': 'kotak.rates',
  'pnb.mclr': 'pnb.mclr',
  'bob.mclr': 'bob.retail',
  'union.mclr': 'union.rates',
  'canara.home': 'canara.range',
  'canara.car': 'canara.range',
  'canara.lap': 'canara.range',
  'lic.home': 'lic.home',
};

export const REPO_SOURCE_ID = 'rbi.repo';

function define(id: string, lender: string, loanType: SourceLoanType, manualUrl: string): SourceDef {
  const readerId = AUTO_SOURCES[id];
  if (readerId === undefined) return { id, lender, loanType, url: manualUrl, mode: 'MANUAL', adapter: null, adapterVer: null };
  const reader = readerById(readerId);
  if (!reader) throw new Error(`AUTO loan-rate source ${id} names unknown reader ${readerId}`);
  return { id, lender, loanType, url: reader.url, mode: 'AUTO', adapter: reader.id, adapterVer: reader.version };
}

export function buildSourceList(): SourceDef[] {
  const out: SourceDef[] = [define(REPO_SOURCE_ID, 'RBI', 'REPO', 'https://www.rbi.org.in/')];
  for (const lender of LENDERS) {
    const types: SourceLoanType[] = [...lender.loanTypes, ...(lender.mclr ? (['MCLR'] as const) : [])];
    for (const loanType of types) {
      const id = `${lender.key}.${loanType.toLowerCase()}`;
      out.push(define(id, lender.name, loanType, MANUAL_URLS[id] ?? lender.url));
    }
  }
  return out;
}

export const LOAN_RATE_SOURCES: readonly SourceDef[] = buildSourceList();

let ensured: Promise<void> | null = null;

/**
 * Upsert every source row from code. Idempotent; memoised per process so request handlers can call it
 * freely. `force` re-runs it (the job does, so a deploy that changes a URL takes effect on the next run).
 */
export function ensureLoanRateSources(force = false): Promise<void> {
  if (ensured === null || force) {
    ensured = (async () => {
      for (const source of LOAN_RATE_SOURCES) {
        const { id, ...fields } = source;
        await prisma.loanRateSource.upsert({ where: { id }, create: source, update: fields });
      }
    })();
    // A failed upsert must not be remembered as done; the next caller retries.
    ensured.catch(() => {
      ensured = null;
    });
  }
  return ensured;
}
