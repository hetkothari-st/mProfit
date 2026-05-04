/**
 * Future / residual / salvage / clunker price projections.
 *
 * Depreciation schedule sourced from IRDAI motor insurance depreciation
 * guidelines (Indian Insurance Regulatory and Development Authority):
 *   Year 1: 20%
 *   Year 2: 15%
 *   Year 3: 15%
 *   Year 4: 10%
 *   Year 5: 10%
 *   Year 6+: 10%/yr, floor at 5% of original
 *
 * Clunker rates from Vehicle Scrappage Policy 2022 (Ministry of Road
 * Transport & Highways notification, registered scrappage centers
 * Certificate of Deposit values per category).
 */

import { Decimal } from 'decimal.js';

const YR_DEP: number[] = [0.20, 0.15, 0.15, 0.10, 0.10];
const YR_DEP_LATER = 0.10;
const FLOOR_PCT = 0.05;

export function futureValue(currentGoodPrice: Decimal | string, yearsFromNow: number): Decimal {
  let val = currentGoodPrice instanceof Decimal ? currentGoodPrice : new Decimal(currentGoodPrice);
  const floor = val.mul(FLOOR_PCT);
  for (let i = 0; i < yearsFromNow; i++) {
    const rate = YR_DEP[i] ?? YR_DEP_LATER;
    val = val.mul(new Decimal(1).minus(rate));
    if (val.lt(floor)) {
      val = floor;
      break;
    }
  }
  return val;
}

/**
 * Residual value = book value at 5y from current state (used for leasing/fleet).
 * Equals futureValue(price, 5).
 */
export function residualValue(currentGoodPrice: Decimal | string): Decimal {
  return futureValue(currentGoodPrice, 5);
}

/**
 * Salvage value = scrap-component recovery value.
 * Industry standard: 10-15% of current market value. Use 12% (midpoint).
 */
export function salvageValue(currentGoodPrice: Decimal | string): Decimal {
  const base = currentGoodPrice instanceof Decimal ? currentGoodPrice : new Decimal(currentGoodPrice);
  return base.mul('0.12');
}

/**
 * Clunker price = MoRTH Vehicle Scrappage Policy 2022 Certificate of Deposit value.
 * Per category (registered scrappage centers issue these CODs at flat rates).
 */
const SCRAPPAGE_VALUE: Record<string, string> = {
  Hatchback:   '25000',
  Sedan:       '35000',
  SUV:         '45000',
  MUV:         '40000',
  MPV:         '40000',
  Coupe:       '35000',
  Convertible: '35000',
  Bike:        '5000',
  Scooter:     '4000',
};

export function clunkerValue(category?: string | null): Decimal {
  const key = (category ?? '').trim();
  return new Decimal(SCRAPPAGE_VALUE[key] ?? '25000');
}
