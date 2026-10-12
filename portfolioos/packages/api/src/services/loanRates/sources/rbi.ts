import type { PageReader, RateReading } from '../types.js';
import { loadPage, pageTables, percents } from './parseUtil.js';

/**
 * RBI home page, "Current Rates" box: `Policy Repo Rate | : 5.50%`. The page gives no change date for the
 * repo rate, so effectiveDate is null and the job records the first day it sees a new value.
 */
export const rbiHomeReader: PageReader = {
  id: 'rbi.home',
  version: '1',
  url: 'https://www.rbi.org.in/',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      for (const cells of table.rows) {
        if (!/^policy repo rate$/i.test(cells[0] ?? '')) continue;
        const rate = percents(cells.slice(1).join(' '))[0];
        if (rate) return [{ sourceId: 'rbi.repo', basis: 'OTHER', tenor: null, minRatePct: rate, maxRatePct: null, effectiveDate: null }];
      }
    }
    return [];
  },
};
