/**
 * RBI 91-day T-bill auction cut-offs, from the Handbook of Statistics on the
 * Indian Economy — pure half (`.parse.ts` / `.v1.ts` split per `CONTEXT.md §14`).
 *
 * Why this exists: FBIL's T-bill curve, the risk-free series the metrics read,
 * begins 2017-08-23. A 3-year Sharpe, Sortino or alpha at any month-end before
 * Aug 2020 therefore had no risk-free rate for part of its window and came out
 * null, so the methodology backtest could not score a month before Aug 2020.
 * RBI's Handbook carries every weekly 91-day auction since 1993, one table per
 * annual edition, and is the only free machine-readable source for 2012–2017
 * that we found.
 *
 * The quantity is the primary-auction cut-off yield, which is exactly what the
 * `TBILL_91D` series name was reserved for (see `riskFree.parse.ts`). It sits
 * a few basis points from FBIL's secondary-market par yield: immaterial to a
 * Sharpe ratio, but a different number, so it is stored under its own name and
 * the metrics layer uses it only for dates before FBIL's first observation.
 *
 * The table (verified identical across the 2013–2018 editions, ids in
 * `rbiTbillHandbook.v1.ts`) has 14 columns per auction row:
 *
 *   0 Date of Auction  1 Date of Issue  2 Notified Amount  3–6 Bids Received
 *   7–9 Bids Accepted  10 Total Issue  11 Cut-off Price (₹)
 *   12 Implicit Yield at Cut-off Price (percent)  13 Amount Outstanding
 *
 * Later editions drop "Amount Outstanding" (12 columns), so the yield is not
 * read at a fixed index: it is the cell immediately after the cut-off price,
 * found as the right-most cell in the T-bill price band.
 */
import { parseRatePct, type RiskFreeParseFailure, type RiskFreeRow } from './riskFree.parse.js';

export const RBI_TBILL_SERIES = 'TBILL_91D' as const;

export interface RbiTbillParseResult {
  series: typeof RBI_TBILL_SERIES;
  rows: RiskFreeRow[];
  failures: RiskFreeParseFailure[];
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const AUCTION_DATE = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/;

/** `DD-Mon-YYYY` → UTC midnight, or null. String surgery, never `new Date(raw)`. */
export function parseHandbookDate(raw: string): Date | null {
  const m = AUCTION_DATE.exec(raw.trim());
  if (!m) return null;
  const mo = MONTHS[m[2]!.toLowerCase()];
  if (mo === undefined) return null;
  const y = Number.parseInt(m[3]!, 10);
  const d = Number.parseInt(m[1]!, 10);
  const dt = new Date(Date.UTC(y, mo, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;
  return dt;
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
};

function cellText(inner: string): string {
  return inner
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A 91-day bill's cut-off price per ₹100 face value. At yields between 1% and
 * 25% it sits between roughly 94 and 99.8, which no other cell in the row can:
 * amounts are in ₹ crore and counts are integers.
 */
function isCutoffPrice(cell: string): boolean {
  if (!/^\d{2}\.\d+$/.test(cell)) return false;
  const whole = Number.parseInt(cell.slice(0, 2), 10);
  return whole >= 90 && whole <= 99;
}

/**
 * Every auction row of the table, oldest first.
 *
 * Rows whose first cell is not an auction date (headers, the fiscal-year
 * dividers like "2016-17", the column-number row, notes) are structure, not
 * data, and are skipped silently. A row that IS an auction but carries no
 * yield — RBI prints "-" when it rejected all bids — is a `missing_rate`
 * failure, never a zero.
 */
export function parseRbiTbillHandbook(html: string): RbiTbillParseResult {
  const result: RbiTbillParseResult = { series: RBI_TBILL_SERIES, rows: [], failures: [] };
  const rowHtml = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const seen = new Map<number, string>();

  rowHtml.forEach((tr, i) => {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map((c) =>
      cellText(c.replace(/^<t[dh][^>]*>/i, '').replace(/<\/t[dh]>$/i, '')),
    );
    const first = cells[0] ?? '';
    if (!AUCTION_DATE.test(first)) return;

    const line = i + 1;
    const raw = cells.join(' | ');
    const date = parseHandbookDate(first);
    if (date === null) {
      result.failures.push({ line, raw, reason: 'bad_date' });
      return;
    }

    // Cut-off price, then the implicit yield right after it. The price is the
    // third-last cell (14 columns, with Amount Outstanding) or the second-last
    // (12 columns, without). Only those two positions are looked at: the
    // notified amount in column 2 is often "90.00" (₹ crore), and on an
    // auction where every bid was rejected it is the only cell left in the
    // price band — scanning further would read the bid count as a yield.
    const priceIdx = [cells.length - 3, cells.length - 2].find(
      (idx) => idx >= 2 && isCutoffPrice(cells[idx]!),
    ) ?? -1;
    const yieldCell = priceIdx < 0 ? '-' : (cells[priceIdx + 1] ?? '');
    const rate = parseRatePct(yieldCell);
    if (!rate.ok) {
      result.failures.push({ line, raw, reason: rate.reason });
      return;
    }

    const key = date.getTime();
    const prior = seen.get(key);
    if (prior !== undefined) {
      if (prior !== rate.value.toString()) result.failures.push({ line, raw, reason: 'duplicate_date' });
      return;
    }
    seen.set(key, rate.value.toString());
    result.rows.push({ date, ratePct: rate.value });
  });

  result.rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  if (result.rows.length === 0 && result.failures.length === 0) {
    result.failures.push({ line: 1, raw: html.slice(0, 200), reason: 'empty_payload' });
  }
  return result;
}
