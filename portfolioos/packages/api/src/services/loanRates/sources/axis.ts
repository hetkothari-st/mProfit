import type { PageReader, RateReading } from '../types.js';
import { loadPage, mclrReadings, minMax, pageTables, percents } from './parseUtil.js';

/** Home-loan table: `Cibil Score | REPO + Spread | Effective Rate of Interest`; the range is the last column. */
export const axisHomeReader: PageReader = {
  id: 'axis.home',
  version: '1',
  url: 'https://www.axis.bank.in/loans/home-loan/interest-rates-charges',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      const headAt = table.rows.findIndex((r) => r.some((c) => /^effective rate of interest$/i.test(c)));
      if (headAt < 0) continue;
      const col = table.rows[headAt]!.findIndex((c) => /^effective rate of interest$/i.test(c));
      const rates = table.rows.slice(headAt + 1).flatMap((r) => percents(r[col] ?? ''));
      const range = minMax(rates);
      if (range) {
        return [{ sourceId: 'axis.home', basis: 'REPO_LINKED', tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null }];
      }
    }
    return [];
  },
};

/** axis.bank.in/mclr-rates: "(MCLR) w.e.f 18th Sept 2026 | Tenor | MCLR %". */
export const axisMclrReader: PageReader = {
  id: 'axis.mclr',
  version: '1',
  url: 'https://www.axis.bank.in/mclr-rates',
  read(html: string): RateReading[] {
    return mclrReadings('axis.mclr', pageTables(loadPage(html)));
  },
};
