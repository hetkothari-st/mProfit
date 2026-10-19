import type { PageReader, RateReading } from '../types.js';
import { clean, loadPage, mclrReadings, pageTables, percentRange, percents } from './parseUtil.js';

/** "For All Loans* | Policy Repo Rate + 2.50% to 7.95%= 8% to 13.45%" - the effective range is after "=". */
export const hdfcHomeReader: PageReader = {
  id: 'hdfc.home',
  version: '1',
  url: 'https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      for (const cells of table.rows) {
        const cell = cells.find((c) => /policy repo rate/i.test(c) && c.includes('='));
        if (!cell) continue;
        const range = percentRange(cell.slice(cell.lastIndexOf('=') + 1));
        if (range) {
          return [{ sourceId: 'hdfc.home', basis: 'REPO_LINKED', tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null }];
        }
      }
    }
    return [];
  },
};

const CAROUSEL: Record<string, string> = { 'personal loan': 'hdfc.personal', 'car loan': 'hdfc.car' };

/**
 * hdfc.bank.in/interest-rates: the "Popular" carousel ("Car Loan 9.32% Onwards") and the MCLR tab
 * ("Effective Date: October 07, 2026"). The carousel's Home Loan figure (7.90%) disagrees with the
 * home-loan page (8%), so HOME comes only from hdfcHomeReader.
 */
export const hdfcRatesReader: PageReader = {
  id: 'hdfc.rates',
  version: '1',
  url: 'https://www.hdfc.bank.in/interest-rates',
  read(html: string): RateReading[] {
    const $ = loadPage(html);
    const out: RateReading[] = mclrReadings('hdfc.mclr', pageTables($));
    const seen = new Set<string>();
    for (const label of $('.ir-service').toArray()) {
      const sourceId = CAROUSEL[clean($(label).text()).toLowerCase()];
      if (!sourceId || seen.has(sourceId)) continue;
      const rate = percents(clean($(label).closest('a').find('.ir-charges').first().text()))[0];
      if (!rate) continue;
      seen.add(sourceId);
      out.push({ sourceId, basis: 'OTHER', tenor: null, minRatePct: rate, maxRatePct: null, effectiveDate: null });
    }
    return out;
  },
};
