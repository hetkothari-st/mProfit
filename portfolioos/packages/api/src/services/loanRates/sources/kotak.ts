import type { RateLoanType, PageReader, RateBasis, RateReading } from '../types.js';
import { loadPage, minMax, pageTables, percentRange } from './parseUtil.js';

/** Product rows of the loans table on kotak.bank.in/en/rates.html, matched on the first cell. */
const PRODUCTS: { label: RegExp; loanType: RateLoanType; basis: RateBasis }[] = [
  { label: /^housing finance/i, loanType: 'HOME', basis: 'REPO_LINKED' },
  { label: /^business loan$/i, loanType: 'BUSINESS', basis: 'FIXED' },
  { label: /^personal loan$/i, loanType: 'PERSONAL', basis: 'FIXED' },
  { label: /^loan against property/i, loanType: 'LAP', basis: 'REPO_LINKED' },
  { label: /^loan against securities$/i, loanType: 'LAS', basis: 'REPO_LINKED' },
  { label: /^educational loan$/i, loanType: 'EDUCATION', basis: 'FIXED' },
];

/**
 * A product row carries its range ("Personal Loan | Salaried individuals | 10.25% - 30% | Fixed Rate"), except
 * housing, whose ranges are on the following "For Salaried individuals" / "For Self Employed" rows. The
 * housing row also quotes "Repo Rate 5.25%", which is stale (RBI repo is 5.50%) and is not read.
 */
export const kotakRatesReader: PageReader = {
  id: 'kotak.rates',
  version: '1',
  url: 'https://www.kotak.bank.in/en/rates.html',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      if (!table.rows.some((r) => /^housing finance/i.test(r[0] ?? ''))) continue;
      const found = new Map<RateLoanType, { basis: RateBasis; rates: string[] }>();
      let current: (typeof PRODUCTS)[number] | null = null;
      for (const cells of table.rows) {
        const first = cells[0] ?? '';
        const product = PRODUCTS.find((p) => p.label.test(first));
        if (product) current = product;
        else if (!/^for /i.test(first)) current = null;
        if (!current) continue;
        const range = percentRange(cells.slice(1).join(' | '));
        if (!range) continue;
        const entry = found.get(current.loanType) ?? { basis: current.basis, rates: [] };
        entry.rates.push(range.min, range.max);
        found.set(current.loanType, entry);
      }
      const out: RateReading[] = [];
      for (const [loanType, { basis, rates }] of found) {
        const range = minMax(rates)!;
        out.push({ sourceId: `kotak.${loanType.toLowerCase()}`, basis, tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null });
      }
      return out;
    }
    return [];
  },
};
