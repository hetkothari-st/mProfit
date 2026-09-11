/**
 * Gold karats and silver grades, and the per-gram price at each.
 *
 * The live feed quotes 24K gold and 999 silver per gram. Other purities scale
 * from those exactly the way holdings are valued on the Gold & Silver page —
 * gold by karat / 24, silver by its grade — so the price the top bar shows
 * for 22K is the price a 22K holding is valued at.
 */
import { Decimal } from '@everypaisa/shared';

export type Metal = 'GOLD' | 'SILVER';

export interface Purity {
  /** Stored/selected value: karat for gold ("22"), grade for silver ("925"). */
  value: string;
  /** Short label for the picker. */
  label: string;
  /** BIS hallmark fineness (parts per thousand). */
  fineness: string;
  /** Multiplier on the base (24K / 999) price. */
  factor: Decimal;
}

const karat = (k: number, fineness: string): Purity => ({
  value: String(k),
  label: `${k}K`,
  fineness,
  factor: new Decimal(k).div(24),
});

export const GOLD_KARATS: Purity[] = [
  karat(24, '999'),
  karat(22, '916'),
  karat(18, '750'),
  karat(14, '585'),
];

export const SILVER_PURITIES: Purity[] = [
  { value: '999', label: '999 Fine', fineness: '999', factor: new Decimal(1) },
  { value: '925', label: '925 Sterling', fineness: '925', factor: new Decimal('0.925') },
  { value: '800', label: '800', fineness: '800', factor: new Decimal('0.8') },
];

export function puritiesFor(metal: Metal): Purity[] {
  return metal === 'GOLD' ? GOLD_KARATS : SILVER_PURITIES;
}

/** Price per gram at `purity`, to 2 decimals; null without a base price or for an unknown purity. */
export function pricePerGram(
  metal: Metal,
  base: string | null | undefined,
  purity: string,
): string | null {
  const p = puritiesFor(metal).find((x) => x.value === purity);
  if (!base || !p) return null;
  return new Decimal(base).times(p.factor).toFixed(2);
}
