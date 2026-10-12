import { readFileSync } from 'node:fs';

export const fixture = (name: string) => readFileSync(new URL(`../fixtures/loanRates/${name}`, import.meta.url), 'utf8');

/** Every real capture that carries each reader's content (ruling 3 in the plan header). */
export const READER_FIXTURES: Record<string, string[]> = {
  'rbi.home': ['rbi-home.html'],
  'sbi.rates': ['sbi-mclr.html', 'sbi-eblr.html', 'sbi-rates-index.html', 'sbi-LAP.html'],
  'hdfc.home': ['hdfc-HOME.html', 'hdfc-HOME2.html'],
  'hdfc.rates': ['hdfc-rates.html'],
  'icici.home': ['icici-HOME.html'],
  'icici.personal': ['icici-PERSONAL.html'],
  'icici.rates': ['icici-rates.html'],
  'axis.home': ['axis-HOME.html'],
  'axis.mclr': ['axis-MCLR.html'],
  'kotak.rates': ['kotak-rates.html', 'kotak-MCLR.html'],
  'pnb.mclr': ['pnb-MCLR.html'],
  'bob.retail': ['bob-retail.html'],
  'union.rates': ['union-loans.html'],
  'canara.range': ['canara-RANGE.html'],
  'lic.home': ['lic-HOME.html'],
};
