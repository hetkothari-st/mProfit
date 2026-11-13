import type { PageReader, RateReading } from '../types.js';
import { latestDate, loadPage, pageTables, percentRange } from './parseUtil.js';

const ROWS: { label: RegExp; sourceId: string }[] = [
  { label: /^housing loan$/i, sourceId: 'canara.home' },
  { label: /^canara vehicle$/i, sourceId: 'canara.car' },
  { label: /^canara mortgage$/i, sourceId: 'canara.lap' },
];

/**
 * "Interest Rate Range of Contracted loans w.e.f. 12.12.2025": ranges actually charged on loans sanctioned,
 * not an offer sheet, so the basis is OTHER and the reading says so in its note.
 */
export const canaraRangeReader: PageReader = {
  id: 'canara.range',
  version: '1',
  url: 'https://www.canarabank.bank.in/pages/interest-rate-range-on-loans',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      const head = table.rows.find((r) => r.some((c) => /interest rate range of contracted loans/i.test(c)));
      if (!head) continue;
      const effectiveDate = latestDate(head.join(' '));
      const out: RateReading[] = [];
      for (const cells of table.rows) {
        const row = ROWS.find((r) => cells.some((c) => r.label.test(c)));
        const range = row ? percentRange(cells.join(' | ')) : null;
        if (row && range) {
          out.push({
            sourceId: row.sourceId, basis: 'OTHER', tenor: null, minRatePct: range.min, maxRatePct: range.max,
            effectiveDate, note: 'Range of contracted loans',
          });
        }
      }
      return out;
    }
    return [];
  },
};
