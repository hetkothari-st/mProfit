import type { PageReader, RateReading } from '../types.js';
import { loadPage, mclrReadings, minMax, pageTables, percentRange, percents } from './parseUtil.js';

/**
 * Home-loan rate tables by credit score and by loan slab: header row `<Credit Score|Loan Slab> | Salaried |
 * Self - Employed`. The later "Salaried or Self - Employed (PSL)" table is not labelled as a home-loan
 * table (probably LAP) and is deliberately excluded.
 */
export const iciciHomeReader: PageReader = {
  id: 'icici.home',
  version: '1',
  url: 'https://www.icici.bank.in/personal-banking/loans/home-loan/interest-rates',
  read(html: string): RateReading[] {
    const rates: string[] = [];
    for (const table of pageTables(loadPage(html))) {
      const [head, ...body] = table.rows;
      if (!head || !/^(credit score|loan slab)$/i.test(head[0] ?? '') || head[1] !== 'Salaried') continue;
      for (const cells of body) rates.push(...percents(cells.slice(1).join(' ')));
    }
    const range = minMax(rates);
    return range
      ? [{ sourceId: 'icici.home', basis: 'REPO_LINKED', tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null }]
      : [];
  },
};

/** "Personal Loan interest rates | Between 9.99% and 16.50% per annum" (1-year MCLR + spread). */
export const iciciPersonalReader: PageReader = {
  id: 'icici.personal',
  version: '1',
  url: 'https://www.icici.bank.in/personal-banking/loans/personal-loan/personal-loan-interest-rates',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      for (const cells of table.rows) {
        if (!/^personal loan interest rates$/i.test(cells[0] ?? '')) continue;
        const range = percentRange(cells.slice(1).join(' '));
        if (range) {
          return [{ sourceId: 'icici.personal', basis: 'MCLR', tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null }];
        }
      }
    }
    return [];
  },
};

/** icici.bank.in/interest-rate: "MCLR effective September 22, 2026 | Tenures | I-MCLR". */
export const iciciRatesReader: PageReader = {
  id: 'icici.rates',
  version: '1',
  url: 'https://www.icici.bank.in/interest-rate',
  read(html: string): RateReading[] {
    return mclrReadings('icici.mclr', pageTables(loadPage(html)));
  },
};
