/**
 * The rule registry.
 *
 * This array is the whole extension point: adding rule #7 means writing one
 * file that exports an `AdvisorRule` and appending it here. The engine sorts
 * and persists whatever comes back; it never knows what any individual rule
 * does. The justification-invariant suite iterates this same array, so a new
 * rule inherits the guarantees (rationale carries every rupee figure, a named
 * product always has provenance, priority stays a positive integer) without
 * anyone remembering to wire up a test.
 *
 * Order here is documentation, not behaviour — drafts are ranked by
 * `priority`, which is why the list reads in priority-band order.
 */

import type { AdvisorRule } from '../types.js';
import { taxLossHarvestRule } from './taxLossHarvest.rule.js';
import { concentrationTrimRule } from './concentrationTrim.rule.js';
import { rebalanceDriftRule } from './rebalanceDrift.rule.js';
import { cashDeploymentRule } from './cashDeployment.rule.js';
import { goalShortfallSipRule } from './goalShortfallSip.rule.js';
import { riskProfileReviewRule } from './riskProfileReview.rule.js';
import { advanceTaxRule } from './advanceTax.rule.js';
import { ltcgBookingRule } from './ltcgBooking.rule.js';
import { fdMaturityRule } from './fdMaturity.rule.js';
import { emergencyFundRule } from './emergencyFund.rule.js';
import { stoppedSipRule } from './stoppedSip.rule.js';
import { idleCashParkingRule } from './idleCashParking.rule.js';
import { loanRefinanceRule } from './loanRefinance.rule.js';
import { fundUnderperformingRule } from './fundUnderperforming.rule.js';
import { regularToDirectRule } from './regularToDirect.rule.js';
import { healthCoverRule } from './healthCover.rule.js';

export const ADVISOR_RULES: AdvisorRule[] = [
  taxLossHarvestRule, // 1-10   deadline-driven
  concentrationTrimRule, // 11-30  material
  rebalanceDriftRule, // 11-30  material
  cashDeploymentRule, // 31-60  optimisation
  goalShortfallSipRule, // 31-60  optimisation
  riskProfileReviewRule, // 31-60  optimisation
  // Act on it types (docs/superpowers/specs/2026-11-06-act-on-it-design.md §7)
  advanceTaxRule,
  ltcgBookingRule,
  fdMaturityRule,
  emergencyFundRule,
  stoppedSipRule,
  idleCashParkingRule,
  loanRefinanceRule,
  fundUnderperformingRule,
  regularToDirectRule,
  healthCoverRule,
];

export {
  taxLossHarvestRule,
  concentrationTrimRule,
  rebalanceDriftRule,
  cashDeploymentRule,
  goalShortfallSipRule,
  riskProfileReviewRule,
  advanceTaxRule,
  ltcgBookingRule,
  fdMaturityRule,
  emergencyFundRule,
  stoppedSipRule,
  idleCashParkingRule,
  loanRefinanceRule,
  fundUnderperformingRule,
  regularToDirectRule,
  healthCoverRule,
};
