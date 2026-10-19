/**
 * Did an AI-read figure actually come from the document?
 *
 * Several ingestion paths ask a language model to read a document (an email,
 * a bank statement, a CAS the regex parser could not read) and return
 * amounts, quantities, prices and dates. A model can misread a figure or
 * invent one that looks right, and nothing downstream could tell: the number
 * went into the user's transactions and from there into every report.
 *
 * The rule here is simple and deterministic: every figure the model returns
 * must appear in the document text it was given. Not "be plausible" — appear.
 * A figure that does not is not imported; it goes to review with the reason.
 * The check is deliberately literal: it can reject a correct figure the
 * document only implies (sending it to a human), but it cannot accept an
 * invented one.
 */

import { Decimal } from 'decimal.js';

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** A document's text, pre-indexed for the checks below. */
export interface SourceIndex {
  numbers: Decimal[];
  dates: Set<string>;
  upper: string;
}

export function indexSource(text: string): SourceIndex {
  const numbers: Decimal[] = [];
  // 1,23,456.78 · 123456.78 · 1000 · -500.00 · (500.00). Commas are grouping.
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    // Digits with optional ".digits" once the grouping commas are gone, so
    // always a valid Decimal.
    numbers.push(new Decimal(m[0].replace(/,/g, '')));
  }

  const dates = new Set<string>();
  const add = (y: string, m: string | undefined, d: string) => {
    if (!m) return;
    const yyyy = y.length === 2 ? `20${y}` : y;
    dates.add(`${yyyy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
  };
  // 2024-03-31
  for (const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) add(m[1]!, m[2]!, m[3]!);
  // 31-03-2024 · 31/03/2024 · 31.03.2024 · 31/03/24 (Indian day-first)
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g)) add(m[3]!, m[2]!, m[1]!);
  // 31-Mar-2024 · 31 Mar 2024 · 31-March-24
  for (const m of text.matchAll(/\b(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/,]+(\d{4}|\d{2})\b/g)) {
    add(m[3]!, MONTHS[m[2]!.toLowerCase().slice(0, 3)], m[1]!);
  }
  // Mar 31, 2024 · March 31 2024
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    add(m[3]!, MONTHS[m[1]!.toLowerCase().slice(0, 3)], m[2]!);
  }
  return { numbers, dates, upper: text.toUpperCase() };
}

/**
 * True when `value` is printed in the document, allowing the document to
 * show it rounded (the model may return 1234.567 for a printed 1234.57, never
 * the other way round with a different value).
 */
export function figureAppears(value: Decimal.Value, src: SourceIndex): boolean {
  let v: Decimal;
  try {
    v = new Decimal(value).abs();
  } catch {
    return false;
  }
  for (const n of src.numbers) {
    if (n.equals(v)) return true;
    const places = n.decimalPlaces();
    if (v.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).equals(n) && places >= 2) return true;
  }
  return false;
}

/** Values too generic to prove anything (a quantity of 1, a unit price of 1). */
function trivial(v: Decimal): boolean {
  return v.isZero() || v.equals(1);
}

export interface ExtractedFigures {
  amount?: Decimal.Value | null;
  quantity?: Decimal.Value | null;
  price?: Decimal.Value | null;
  isin?: string | null;
  /** YYYY-MM-DD */
  date?: string | null;
  /** Buy/sell-like events, where quantity × price should make the amount. */
  isTrade?: boolean;
}

/** Tolerance for quantity × price vs amount: charges and rounding. */
const TRADE_TOLERANCE = new Decimal('0.02');

/**
 * Every problem with `fig` against the document; empty when it checks out.
 * Each message names the figure, so the review screen can say what was wrong.
 */
export function verifyFigures(fig: ExtractedFigures, src: SourceIndex): string[] {
  const problems: string[] = [];
  const dec = (v: Decimal.Value | null | undefined): Decimal | null => {
    if (v === null || v === undefined || v === '') return null;
    try {
      return new Decimal(v);
    } catch {
      return null;
    }
  };
  const amount = dec(fig.amount);
  const quantity = dec(fig.quantity);
  const price = dec(fig.price);

  if (amount && !trivial(amount) && !figureAppears(amount, src)) {
    problems.push(`amount ${amount.toString()} does not appear in the document`);
  }

  if (quantity && price && !trivial(quantity) && !trivial(price)) {
    // Both given: each must appear, or at least their product (some
    // statements print only the total and the rate).
    const total = quantity.times(price);
    const qOk = figureAppears(quantity, src);
    const pOk = figureAppears(price, src);
    if (!(qOk && pOk) && !figureAppears(total, src)) {
      if (!qOk) problems.push(`quantity ${quantity.toString()} does not appear in the document`);
      if (!pOk) problems.push(`price ${price.toString()} does not appear in the document`);
    }
  } else {
    for (const [name, v] of [['quantity', quantity], ['price', price]] as const) {
      if (v && !trivial(v) && !figureAppears(v, src)) {
        problems.push(`${name} ${v.toString()} does not appear in the document`);
      }
    }
  }

  if (fig.isTrade && amount && quantity && price && !trivial(quantity) && !trivial(price)) {
    const product = quantity.times(price);
    const diff = product.minus(amount).abs();
    if (diff.greaterThan(1) && diff.greaterThan(amount.abs().times(TRADE_TOLERANCE))) {
      problems.push(
        `quantity × price (${product.toFixed(2)}) does not match the amount ${amount.toString()}`,
      );
    }
  }

  if (fig.isin && !src.upper.includes(fig.isin.toUpperCase())) {
    problems.push(`ISIN ${fig.isin} does not appear in the document`);
  }

  // Only checkable when the document has recognisable dates at all.
  if (fig.date && src.dates.size > 0 && !src.dates.has(fig.date)) {
    problems.push(`date ${fig.date} does not appear in the document`);
  }

  return problems;
}
