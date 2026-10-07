/**
 * Split allocation. Everything is allocated in whole paise (2 dp): each part
 * gets floor(total × weight / Σweight) and the leftover paise go one at a
 * time to parts in ascending id order, so totals are exact and the result
 * does not depend on input order.
 */
import { Decimal } from 'decimal.js';
import { BadRequestError } from '../../lib/errors.js';

export interface Weighted { id: string; weight: Decimal }
export interface ShareInput { memberId: string; value?: string }
export type SplitMode = 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES';

const PAISA = new Decimal('0.01');
const HUNDRED = new Decimal(100);

function bad(code: string, detail: string): never {
  throw new BadRequestError(`${code}: ${detail}`);
}

function parseNonNegative(raw: string | undefined, label: string): Decimal {
  if (raw === undefined || !/^\d+(\.\d+)?$/.test(raw.trim())) bad('SPLIT_BAD_INPUT', `${label} must be a non-negative number`);
  return new Decimal(raw.trim());
}

function assertMoney(amount: Decimal, label: string): void {
  if (amount.lte(0) || amount.decimalPlaces() > 2) bad('SPLIT_BAD_INPUT', `${label} must be > 0 with at most 2 decimals`);
}

export function allocate(total: Decimal, parts: Weighted[]): Map<string, Decimal> {
  const live = parts.filter((p) => p.weight.gt(0));
  if (live.length === 0) bad('SPLIT_NO_PARTICIPANTS', 'nobody to allocate to');
  const totalWeight = live.reduce((a, p) => a.plus(p.weight), new Decimal(0));
  const sorted = [...live].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const out = new Map<string, Decimal>();
  let given = new Decimal(0);
  for (const p of sorted) {
    const v = total.mul(p.weight).div(totalWeight).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    out.set(p.id, v);
    given = given.plus(v);
  }
  let leftover = total.minus(given).div(PAISA).toNumber(); // integer count of paise, < parts.length
  for (let i = 0; leftover > 0; i = (i + 1) % sorted.length, leftover--) {
    const id = sorted[i]!.id;
    out.set(id, out.get(id)!.plus(PAISA));
  }
  return out;
}

export function computeShares(mode: SplitMode, amount: Decimal, inputs: ShareInput[]): Map<string, Decimal> {
  assertMoney(amount, 'amount');
  if (inputs.length === 0) bad('SPLIT_NO_PARTICIPANTS', 'no participants');
  const ids = new Set(inputs.map((i) => i.memberId));
  if (ids.size !== inputs.length) bad('SPLIT_BAD_INPUT', 'a member appears twice');

  switch (mode) {
    case 'EQUAL':
      return allocate(amount, inputs.map((i) => ({ id: i.memberId, weight: new Decimal(1) })));
    case 'SHARES':
      return allocate(amount, inputs.map((i) => ({ id: i.memberId, weight: parseNonNegative(i.value, 'share') })));
    case 'PERCENT': {
      const pct = inputs.map((i) => ({ id: i.memberId, weight: parseNonNegative(i.value, 'percent') }));
      const total = pct.reduce((a, p) => a.plus(p.weight), new Decimal(0));
      if (!total.eq(HUNDRED)) bad('SPLIT_PERCENT_NOT_100', `percentages add to ${total.toString()}`);
      return allocate(amount, pct);
    }
    case 'EXACT': {
      const out = new Map<string, Decimal>();
      let total = new Decimal(0);
      for (const i of inputs) {
        const v = parseNonNegative(i.value, 'exact amount');
        if (v.decimalPlaces() > 2) bad('SPLIT_BAD_INPUT', 'exact amount has more than 2 decimals');
        if (v.gt(0)) out.set(i.memberId, v); // zero shares drop out, like SHARES/PERCENT
        total = total.plus(v);
      }
      if (!total.eq(amount)) bad('SPLIT_SUM_MISMATCH', `shares add to ${total.toFixed(2)}, expense is ${amount.toFixed(2)}`);
      return out;
    }
  }
}

export function toBase(amount: Decimal, fxRate: Decimal): Decimal {
  return amount.mul(fxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

/** Spread a base-currency total over members in proportion to their expense-currency amounts. */
export function allocateBase(baseTotal: Decimal, byMember: Map<string, Decimal>): Map<string, Decimal> {
  return allocate(baseTotal, [...byMember].map(([id, weight]) => ({ id, weight })));
}
