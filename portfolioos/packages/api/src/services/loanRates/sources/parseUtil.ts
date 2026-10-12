import { load, type CheerioAPI } from 'cheerio';
import { Decimal } from 'decimal.js';
import type { MclrTenor, RateReading } from '../types.js';

/** Load a page as inert markup; scripts are dropped, never run. */
export function loadPage(html: string): CheerioAPI {
  const $ = load(html);
  $('script, style, noscript, svg, iframe').remove();
  return $;
}

export function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** '8' -> '8.00', '8.125' -> '8.125'. Throws on anything that is not a plain decimal. */
export function normPct(raw: string): string {
  const d = new Decimal(raw);
  return d.decimalPlaces() < 2 ? d.toFixed(2) : d.toString();
}

const NUM = String.raw`(\d{1,2}(?:\.\d{1,3})?)`;

/** Every "N%" / "N %" figure in the text, in order. */
export function percents(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(`${NUM}\\s*%`, 'g'))) out.push(normPct(m[1]!));
  return out;
}

/** "8% to 13.45%", "7.70% - 12.00%", "8.75% – 9.65%", "7.40 % to 10.25 %", "Between 9.99% and 16.50%". */
export function percentRange(text: string): { min: string; max: string } | null {
  const m = new RegExp(`${NUM}\\s*%?\\s*(?:-|\\u2013|\\u2014|to|and)\\s*${NUM}\\s*%`, 'i').exec(text);
  if (!m) return null;
  return { min: normPct(m[1]!), max: normPct(m[2]!) };
}

/** Lowest and highest of a list of decimal strings. */
export function minMax(values: string[]): { min: string; max: string } | null {
  if (values.length === 0) return null;
  let lo = new Decimal(values[0]!);
  let hi = lo;
  for (const v of values.slice(1)) {
    const d = new Decimal(v);
    if (d.lessThan(lo)) lo = d;
    if (d.greaterThan(hi)) hi = d;
  }
  return { min: normPct(lo.toString()), max: normPct(hi.toString()) };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Every date in the text as 'YYYY-MM-DD', in order. Understands the forms the lender pages use:
 * 01.10.2026, 01-10-2026, 01/07/2026 (day first), "15th Sept 2026", "18th September 2026",
 * "September 22, 2026".
 */
export function datesIn(text: string): string[] {
  const found: { at: number; iso: string }[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g)) {
    const v = iso(Number(m[3]), Number(m[2]), Number(m[1]));
    if (v) found.push({ at: m.index!, iso: v });
  }
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/g)) {
    const mon = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    const v = mon ? iso(Number(m[3]), mon, Number(m[1])) : null;
    if (v) found.push({ at: m.index!, iso: v });
  }
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})/g)) {
    const mon = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    const v = mon ? iso(Number(m[3]), mon, Number(m[2])) : null;
    if (v) found.push({ at: m.index!, iso: v });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.iso);
}

/** The latest date in the text, or null. ISO strings sort chronologically. */
export function latestDate(text: string): string | null {
  const all = datesIn(text);
  return all.length === 0 ? null : all.reduce((a, b) => (b > a ? b : a));
}

/** One <table> as cell text, plus the page text just before it (where pages put "w.e.f." lines). */
export interface PageTable {
  rows: string[][];
  before: string;
}

export function pageTables($: CheerioAPI, contextChars = 300): PageTable[] {
  const body = clean($('body').text());
  return $('table')
    .toArray()
    .map((t) => {
      const rows = $(t)
        .find('tr')
        .toArray()
        .map((tr) => $(tr).find('th, td').toArray().map((c) => clean($(c).text())));
      const own = clean($(t).text());
      const at = own === '' ? -1 : body.indexOf(own);
      return { rows, before: at < 0 ? '' : body.slice(Math.max(0, at - contextChars), at) };
    });
}

export function tableText(t: PageTable): string {
  return t.rows.map((r) => r.join(' ')).join(' ');
}

export function tenorOf(label: string): MclrTenor | null {
  const s = label.toLowerCase().replace(/mclr/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^over ?night/.test(s)) return 'ON';
  if (/^(one|1) months?$/.test(s)) return '1M';
  if (/^(three|3) months?$/.test(s)) return '3M';
  if (/^(six|6) months?$/.test(s)) return '6M';
  if (/^(one|1) years?$/.test(s)) return '1Y';
  return null;
}

/** Plain rate cell: "8.70", "8.45%", "8.00 %". */
export function cellRate(text: string): string | null {
  const m = /^(\d{1,2}(?:\.\d{1,3})?)\s*%?$/.exec(clean(text));
  return m ? normPct(m[1]!) : null;
}

export interface MclrRow {
  tenor: MclrTenor;
  ratePct: string;
}

/**
 * The first MCLR table that lists at least four of overnight..1-year MCLR including 1-year. Each row's tenor
 * is the first cell that names one; its rate is the LAST cell that is a plain rate (pages show
 * "existing | revised"). The as-of date is the latest date in the table or the text just before it.
 */
export function findMclr(tables: PageTable[]): { rows: MclrRow[]; effectiveDate: string | null } | null {
  for (const t of tables) {
    // Deposit tables also have "1 Month" rows; an MCLR table names itself or is introduced as one.
    if (!/mclr/i.test(`${t.before.slice(-150)} ${tableText(t)}`)) continue;
    const rows: MclrRow[] = [];
    for (const cells of t.rows) {
      const tenor = cells.map(tenorOf).find((x) => x !== null) ?? null;
      if (!tenor || rows.some((r) => r.tenor === tenor)) continue;
      const rate = [...cells].reverse().map(cellRate).find((r) => r !== null) ?? null;
      if (rate) rows.push({ tenor, ratePct: rate });
    }
    if (rows.length >= 4 && rows.some((r) => r.tenor === '1Y')) {
      return { rows, effectiveDate: latestDate(`${t.before.slice(-200)} ${tableText(t)}`) };
    }
  }
  return null;
}

/** MCLR readings for one lender's MCLR source from the page's MCLR table; [] when the page has none. */
export function mclrReadings(sourceId: string, tables: PageTable[]): RateReading[] {
  const m = findMclr(tables);
  if (!m) return [];
  return m.rows.map((r) => ({
    sourceId,
    basis: 'MCLR' as const,
    tenor: r.tenor,
    minRatePct: r.ratePct,
    maxRatePct: null,
    effectiveDate: m.effectiveDate,
  }));
}
