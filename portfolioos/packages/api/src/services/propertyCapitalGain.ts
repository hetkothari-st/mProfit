/**
 * Property capital-gain computation for SOLD `OwnedProperty` rows.
 *
 * Property is "land or building" under section 112; it is long-term when
 * held for MORE than 24 months. The rate depends on the sale date:
 *   - Sold before 23-Jul-2024: indexed cost @ 20% (the only regime then).
 *   - Sold on/after 23-Jul-2024, bought before it: a resident may choose
 *     indexed @ 20% or non-indexed @ 12.5% (Finance (No. 2) Act 2024).
 *   - Bought on/after 23-Jul-2024: non-indexed @ 12.5% only.
 *
 * Short-term gains are taxed at slab rate; we report a 30% top-bracket
 * estimate as a "max likely tax" hint.
 *
 * All money math via `decimal.js` per §3.2 / §5.1 task 2. The compute
 * runs server-side; the client only renders the response.
 */

import { Decimal } from 'decimal.js';
import {
  CII_BY_FY,
  PROPERTY_INDEXATION_CHOICE_CUTOFF,
  financialYearFromDate,
  serializeMoney,
  type PropertyCapitalGainDTO,
} from '@everypaisa/shared';

const LTCG_MONTHS_THRESHOLD = 24;

const RATE_INDEXED = new Decimal('0.20');     // 20% with indexation
const RATE_NON_INDEXED = new Decimal('0.125'); // 12.5% without indexation
const RATE_STCG_ESTIMATE = new Decimal('0.30'); // slab rate top-bracket hint

export interface PropertyForCgInput {
  id: string;
  purchaseDate: Date | null;
  purchasePrice: { toString(): string } | null;
  stampDuty: { toString(): string } | null;
  registrationFee: { toString(): string } | null;
  brokerage: { toString(): string } | null;
  otherCosts: { toString(): string } | null;
  ownershipPercent: { toString(): string } | null;
  saleDate: Date | null;
  salePrice: { toString(): string } | null;
  saleBrokerage: { toString(): string } | null;
}

function nz(d: { toString(): string } | null): Decimal {
  if (d === null || d === undefined) return new Decimal(0);
  return new Decimal(d.toString());
}

/** Same calendar day `months` later, clamped to month end. */
function addMonthsUTC(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

function monthsBetween(a: Date, b: Date): number {
  const years = b.getUTCFullYear() - a.getUTCFullYear();
  const months = b.getUTCMonth() - a.getUTCMonth();
  const dayAdjust = b.getUTCDate() < a.getUTCDate() ? -1 : 0;
  return years * 12 + months + dayAdjust;
}

function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computePropertyCapitalGain(
  property: PropertyForCgInput,
): PropertyCapitalGainDTO | null {
  if (!property.saleDate || !property.salePrice || !property.purchaseDate) {
    return null;
  }

  const totalCost = nz(property.purchasePrice)
    .plus(nz(property.stampDuty))
    .plus(nz(property.registrationFee))
    .plus(nz(property.brokerage))
    .plus(nz(property.otherCosts));

  const salePrice = new Decimal(property.salePrice.toString());
  const saleBrokerage = nz(property.saleBrokerage);
  const netSaleProceeds = salePrice.minus(saleBrokerage);

  const holdingMonths = monthsBetween(property.purchaseDate, property.saleDate);
  // Sec 2(42A): long-term only if held for more than 24 months.
  const isLongTerm =
    property.saleDate.getTime() > addMonthsUTC(property.purchaseDate, LTCG_MONTHS_THRESHOLD).getTime();

  // Owner's share factor — gains belong to the owner pro-rata.
  const ownershipPctRaw = property.ownershipPercent
    ? new Decimal(property.ownershipPercent.toString())
    : new Decimal(100);
  const ownershipShare = ownershipPctRaw.dividedBy(100);

  const nonIndexedGain = netSaleProceeds.minus(totalCost).times(ownershipShare);
  const nonIndexedGainPositive = Decimal.max(nonIndexedGain, 0);

  // Tax estimate — non-indexed regime
  const taxRateNonIndexed = isLongTerm ? RATE_NON_INDEXED : RATE_STCG_ESTIMATE;
  const estimatedTaxNonIndexed = nonIndexedGainPositive
    .times(taxRateNonIndexed)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);

  // Indexation only applies for LTCG
  let buyFY: string | null = null;
  let sellFY: string | null = null;
  let ciiBuyYear: number | null = null;
  let ciiSellYear: number | null = null;
  let indexedCost: Decimal | null = null;
  let indexedGain: Decimal | null = null;
  let estimatedTaxIndexed: Decimal | null = null;

  if (isLongTerm) {
    buyFY = financialYearFromDate(property.purchaseDate);
    sellFY = financialYearFromDate(property.saleDate);
    ciiBuyYear = CII_BY_FY[buyFY] ?? null;
    ciiSellYear = CII_BY_FY[sellFY] ?? null;

    if (ciiBuyYear !== null && ciiSellYear !== null && ciiBuyYear > 0) {
      indexedCost = totalCost
        .times(ciiSellYear)
        .dividedBy(ciiBuyYear)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
      indexedGain = netSaleProceeds.minus(indexedCost).times(ownershipShare);
      const indexedGainPositive = Decimal.max(indexedGain, 0);
      estimatedTaxIndexed = indexedGainPositive
        .times(RATE_INDEXED)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    }
  }

  const purchaseIso = dateToIso(property.purchaseDate);
  const saleIso = dateToIso(property.saleDate);
  const boughtBeforeCutoff = purchaseIso < PROPERTY_INDEXATION_CHOICE_CUTOFF;
  const soldBeforeCutoff = saleIso < PROPERTY_INDEXATION_CHOICE_CUTOFF;
  const regime: PropertyCapitalGainDTO['regime'] = !isLongTerm
    ? 'SHORT_TERM'
    : soldBeforeCutoff
      ? 'INDEXED_20'
      : boughtBeforeCutoff
        ? 'CHOICE'
        : 'NON_INDEXED_12_5';
  // The indexed figure is needed but a CII value is missing (sale FY not yet
  // notified, or a purchase before FY 2001-02, which indexes from the
  // 1-Apr-2001 fair market value instead).
  const ciiUnavailable = (regime === 'INDEXED_20' || regime === 'CHOICE') && indexedGain === null;
  const hasIndexationChoice = regime === 'CHOICE' && indexedGain !== null;

  return {
    propertyId: property.id,
    saleDate: dateToIso(property.saleDate),
    salePrice: serializeMoney(salePrice),
    saleBrokerage: serializeMoney(saleBrokerage),
    netSaleProceeds: serializeMoney(netSaleProceeds),
    totalCostBasis: serializeMoney(totalCost),
    holdingMonths,
    isLongTerm,
    ownershipShare: ownershipShare.toFixed(4),
    nonIndexedGain: serializeMoney(nonIndexedGain),
    estimatedTaxNonIndexed: serializeMoney(estimatedTaxNonIndexed),
    ciiBuyYear,
    ciiSellYear,
    buyFY,
    sellFY,
    indexedCost: indexedCost ? serializeMoney(indexedCost) : null,
    indexedGain: indexedGain ? serializeMoney(indexedGain) : null,
    estimatedTaxIndexed: estimatedTaxIndexed
      ? serializeMoney(estimatedTaxIndexed)
      : null,
    hasIndexationChoice,
    regime,
    ciiUnavailable,
  };
}
