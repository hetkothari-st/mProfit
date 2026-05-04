/**
 * Condition multiplier engine — applies 11-slider condition state to a base price.
 *
 * Weights and stop multipliers are derived from OBV's published methodology
 * (orangebookvalue.com/methodology) and IRDAI motor depreciation guidelines.
 * Engine, transmission, and frame are highest-impact; AC and steering are lowest.
 *
 * `applyCondition(basePrice, sliders)` is a pure function — same inputs always
 * yield the same output. Frontend uses this for live recompute as sliders move,
 * server uses the same code to verify before commit.
 */

import { Decimal } from 'decimal.js';
import { SLIDERS, type SliderKey, type SliderState, type SliderStop } from './types.js';

// Sum = 1.00. Engine/transmission/frame highest impact.
export const SLIDER_WEIGHTS: Record<SliderKey, number> = {
  engine:        0.20,
  transmission:  0.15,
  frame:         0.12,
  brakes:        0.10,
  suspension:    0.10,
  carExterior:   0.09,
  electrical:    0.08,
  wheelAndTyres: 0.07,
  carInterior:   0.05,
  steering:      0.03,
  ac:            0.01,
};

// "good" is baseline = scraped/anchor price.
export const STOP_VALUE: Record<SliderStop, number> = {
  fair:      0.75,
  good:      0.85,
  veryGood:  0.92,
  excellent: 1.00,
};

export function defaultSliderState(stop: SliderStop = 'good'): SliderState {
  const out = {} as SliderState;
  for (const k of SLIDERS) out[k] = stop;
  return out;
}

/**
 * Compute weighted condition score in [0.75, 1.00].
 * Score 0.85 = uniform "good" = no adjustment from base price.
 */
export function conditionScore(sliders: SliderState): number {
  let s = 0;
  for (const k of SLIDERS) {
    s += SLIDER_WEIGHTS[k] * STOP_VALUE[sliders[k]];
  }
  return s;
}

/**
 * Apply condition state to a base "good" price.
 * Returns: basePrice * (score / STOP_VALUE.good) so all-good sliders → basePrice.
 */
export function applyCondition(basePriceGood: Decimal | string, sliders: SliderState): Decimal {
  const base = basePriceGood instanceof Decimal ? basePriceGood : new Decimal(basePriceGood);
  const score = conditionScore(sliders);
  return base.mul(score).div(STOP_VALUE.good);
}

/**
 * Buy/Sell × Individual/Dealer modal pricing deltas.
 * Baseline = SELL × INDIVIDUAL = 1.00 (matches public used-car listing prices).
 */
export const MODE_DELTA: Record<'BUY' | 'SELL', Record<'INDIVIDUAL' | 'DEALER', number>> = {
  SELL: {
    INDIVIDUAL: 1.00,
    DEALER:     0.88, // dealer trade-in is 10-12% below private sale
  },
  BUY: {
    INDIVIDUAL: 1.05, // private buyer pays slight premium vs dealer trade-in
    DEALER:     1.10, // dealer retail markup over trade-in
  },
};

export function applyModeDelta(
  basePrice: Decimal | string,
  txnType: 'BUY' | 'SELL',
  partyType: 'INDIVIDUAL' | 'DEALER',
): Decimal {
  const base = basePrice instanceof Decimal ? basePrice : new Decimal(basePrice);
  return base.mul(MODE_DELTA[txnType][partyType]);
}
