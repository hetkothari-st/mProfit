import { load } from 'cheerio';
import type { PageReader, RateReading } from '../types.js';
import { cellRate, clean, minMax } from './parseUtil.js';

/**
 * The HTML chunks a Next.js page streams in `self.__next_f.push([1, "<html...>"])` script calls. Each call's
 * argument is a JSON array, so JSON.parse does the unescaping; nothing is executed.
 */
export function nextFlightChunks(html: string): string[] {
  const $ = load(html);
  const out: string[] = [];
  for (const script of $('script').toArray()) {
    const text = $(script).text().trim();
    if (!text.startsWith('self.__next_f.push(')) continue;
    try {
      const args: unknown = JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')));
      if (Array.isArray(args)) out.push(...args.filter((a): a is string => typeof a === 'string'));
    } catch (err) {
      // One malformed chunk must not hide the others; the reader returns [] if the rate table is missing.
      if (!(err instanceof SyntaxError)) throw err;
    }
  }
  return out;
}

/**
 * LIC Housing Finance home loans: two `table.roi_table` (salaried, self-employed) of CIBIL band x loan slab,
 * last column the rate ("7.15%", one cell is "10.30" with no % sign). Range = lowest..highest across both.
 * The rates are linked to LIC HFL's own LHPLR, so the basis is OTHER.
 */
export const licHomeReader: PageReader = {
  id: 'lic.home',
  version: '1',
  url: 'https://www.lichousing.com/housing-loan/home-loan',
  read(html: string): RateReading[] {
    const rates: string[] = [];
    for (const chunk of nextFlightChunks(html)) {
      if (!chunk.includes('roi_table')) continue;
      const $ = load(chunk);
      for (const table of $('table.roi_table').toArray()) {
        for (const tr of $(table).find('tbody tr').toArray()) {
          const cells = $(tr).find('td').toArray();
          const last = cells[cells.length - 1];
          const rate = last ? cellRate(clean($(last).text())) : null;
          if (rate) rates.push(rate);
        }
      }
    }
    const range = minMax(rates);
    return range
      ? [{ sourceId: 'lic.home', basis: 'OTHER', tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null }]
      : [];
  },
};
