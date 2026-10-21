import { Decimal } from '../decimal.js';
import type { WillAssetItem, WillPayload, WillPerson, WillRelationship } from './schema.js';

const ZERO = new Decimal(0);
export const ADULT_AGE = 18;
export const CHILD_RELATIONSHIPS: readonly WillRelationship[] = ['SON', 'DAUGHTER'];

export interface WillEstateTotals {
  assets: Decimal;
  liabilities: Decimal;
  net: Decimal;
  /** Insurance and similar paid straight to a nominee: shown, never counted. */
  nomineeOnly: Decimal;
}

export function itemShareValue(item: Pick<WillAssetItem, 'value' | 'ownership'>): Decimal {
  return new Decimal(item.value).times(item.ownership.sharePct).dividedBy(100);
}

export function willEstateTotals(items: readonly WillAssetItem[]): WillEstateTotals {
  let assets = ZERO;
  let liabilities = ZERO;
  let nomineeOnly = ZERO;
  for (const it of items) {
    if (it.review === 'EXCLUDED') continue;
    const v = itemShareValue(it);
    if (it.ownership.type === 'NOMINEE_ONLY') {
      nomineeOnly = nomineeOnly.plus(v);
    } else if (it.side === 'ASSET') {
      assets = assets.plus(v);
    } else {
      liabilities = liabilities.plus(v);
    }
  }
  return { assets, liabilities, net: assets.minus(liabilities), nomineeOnly };
}

export function toAmount2(x: Decimal | string | number): string {
  return new Decimal(x).toFixed(2, Decimal.ROUND_HALF_EVEN);
}

export function sumPercents(values: readonly string[]): Decimal {
  return values.reduce((s, v) => s.plus(v), ZERO);
}

function ymd(iso: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError('Expected a YYYY-MM-DD date');
  return [Number.parseInt(m[1]!, 10), Number.parseInt(m[2]!, 10), Number.parseInt(m[3]!, 10)];
}

/** Completed years on `today` (both YYYY-MM-DD). A 29 Feb birthday counts from 1 Mar in other years. */
export function ageOn(dob: string, today: string): number {
  const [by, bm, bd] = ymd(dob);
  const [ty, tm, td] = ymd(today);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export function isMinorOn(dob: string | null, today: string): boolean | null {
  return dob ? ageOn(dob, today) < ADULT_AGE : null;
}

export function willMinorChildren(p: WillPayload, today: string): WillPerson[] {
  return p.people.filter(
    (x) => x.partyType === 'INDIVIDUAL' && CHILD_RELATIONSHIPS.includes(x.relationship) && isMinorOn(x.dob, today) === true,
  );
}

export function willBeneficiaryIds(p: WillPayload): string[] {
  const ids = new Set<string>();
  for (const r of p.allocation.residuary) ids.add(r.personId);
  for (const g of p.allocation.specificGifts) ids.add(g.personId);
  for (const g of p.allocation.fixedGifts) ids.add(g.personId);
  return [...ids];
}

export function removeWillPerson(p: WillPayload, personId: string): WillPayload {
  const keep = (id: string | null) => (id === personId ? null : id);
  return {
    ...p,
    people: p.people
      .filter((x) => x.id !== personId)
      .map((x) => (x.contingentId === personId ? { ...x, contingentId: null } : x)),
    roles: {
      executorId: keep(p.roles.executorId),
      altExecutorId: keep(p.roles.altExecutorId),
      guardianId: keep(p.roles.guardianId),
      altGuardianId: keep(p.roles.altGuardianId),
    },
    allocation: {
      ...p.allocation,
      residuary: p.allocation.residuary.filter((r) => r.personId !== personId),
      specificGifts: p.allocation.specificGifts.filter((g) => g.personId !== personId),
      fixedGifts: p.allocation.fixedGifts.filter((g) => g.personId !== personId),
    },
  };
}

export function removeWillItem(p: WillPayload, sourceKey: string): WillPayload {
  return {
    ...p,
    estate: { ...p.estate, items: p.estate.items.filter((i) => i.sourceKey !== sourceKey) },
    allocation: { ...p.allocation, specificGifts: p.allocation.specificGifts.filter((g) => g.itemId !== sourceKey) },
  };
}
