/** Strict input parsing shared by the split services (dates, money, currency). */
import { Decimal } from 'decimal.js';
import { BadRequestError } from '../../lib/errors.js';

const DAY_MS = 86_400_000;
// Decimal(18,4) holds < 1e14; stay far enough below for FX-product headroom.
const MAX_MONEY = new Decimal('1e12');

/** YYYY-MM-DD that is a real calendar day and not more than a day in the future. */
export function parseIsoDate(input: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new BadRequestError('Invalid date');
  const d = new Date(`${input}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input || d.getTime() > Date.now() + DAY_MS) {
    throw new BadRequestError('Invalid date');
  }
  return d;
}

/** Positive money with at most 2 decimals, below 1e12. */
export function parseMoney2dp(raw: string, label: string): Decimal {
  if (typeof raw !== 'string' || !/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new BadRequestError(`SPLIT_BAD_INPUT: ${label} must be > 0 with at most 2 decimals`);
  }
  const v = new Decimal(raw);
  if (v.lte(0)) throw new BadRequestError(`SPLIT_BAD_INPUT: ${label} must be > 0 with at most 2 decimals`);
  if (v.gte(MAX_MONEY)) throw new BadRequestError(`SPLIT_BAD_INPUT: ${label} is too large`);
  return v;
}

export function parseCcy(raw: string): string {
  const c = String(raw).toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new BadRequestError('Invalid currency code');
  return c;
}
