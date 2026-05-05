/**
 * Real-estate math helpers used by both the API and the web client.
 * Money math via decimal.js — never JS Number — per §3.2.
 */

import { Decimal } from '../decimal.js';
import type { OwnedPropertyDTO } from '../types/realEstate.js';

/**
 * Sum the cost-basis components for an owned property: purchase price +
 * stamp duty + registration fee + brokerage + other one-time acquisition
 * costs. Returns a Decimal so callers can chain further arithmetic without
 * losing precision.
 */
export function totalCostBasisOf(p: OwnedPropertyDTO): Decimal {
  return new Decimal(p.purchasePrice ?? 0)
    .plus(p.stampDuty ?? 0)
    .plus(p.registrationFee ?? 0)
    .plus(p.brokerage ?? 0)
    .plus(p.otherCosts ?? 0);
}
