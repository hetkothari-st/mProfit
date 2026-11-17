/**
 * Financial simulator — pure Decimal math.
 *
 * Inputs: hospital bill, room rent/day, duration, extracted policy conditions.
 * Outputs: insurer-payable, co-payment, deductible, room-rent deductions
 *   (ONLY if policy confirms proportionate deductions apply), other
 *   non-payables, user contribution.
 *
 * Rules:
 *  - Room-rent deductions are NEVER assumed. They are computed only when
 *    `proportionateDeductionApplies` is explicitly confirmed.
 *  - Partial estimates are labelled as such; `missingInputs` names exactly
 *    which inputs are missing.
 *  - All amounts are Decimal strings throughout.
 */

import { Decimal, serializeMoney } from '@everypaisa/shared';
import type { Money } from '@everypaisa/shared';
import type { FinancialSimulatorInput, FinancialSimulatorOutput } from '@everypaisa/shared';
import type { PolicyExtraction } from './extractionSchema.js';

/** Coerce a money string to Decimal, returning zero on failure. */
function toD(v: string | null | undefined): Decimal {
  if (!v) return new Decimal('0');
  try { return new Decimal(v); } catch { return new Decimal('0'); }
}

function str(d: Decimal): Money {
  return serializeMoney(d.toDecimalPlaces(2));
}

/** Extract co-payment percentage from the extraction. Returns null if unknown. */
function getEffectiveCopayPct(
  input: FinancialSimulatorInput,
  extraction: PolicyExtraction,
): { pct: Decimal; known: boolean } {
  if (input.copaymentPctOverride !== null) {
    return { pct: toD(input.copaymentPctOverride), known: true };
  }
  const field = extraction.copaymentPct;
  if (field.status !== 'NOT_FOUND' && field.value !== null) {
    return { pct: toD(field.value), known: true };
  }
  return { pct: new Decimal('0'), known: false };
}

/**
 * Compute the out-of-pocket breakdown for a hypothetical hospital bill.
 *
 * Returns a partial estimate when inputs are missing, and names the missing
 * fields so the user can supply them for a complete calculation.
 */
export function simulateFinancialOutcome(
  input: FinancialSimulatorInput,
  extraction: PolicyExtraction,
): FinancialSimulatorOutput {
  const totalBill = toD(input.totalBillInr);
  const missingInputs: string[] = [];

  if (totalBill.isZero()) {
    return {
      insurerPayableInr: str(new Decimal('0')),
      copaymentInr: str(new Decimal('0')),
      deductibleInr: str(new Decimal('0')),
      roomRentDeductionInr: str(new Decimal('0')),
      otherNonPayableInr: str(new Decimal('0')),
      userContributionInr: str(new Decimal('0')),
      isPartialEstimate: true,
      missingInputs: ['totalBillInr'],
    };
  }

  // --- Co-payment ---
  const { pct: copayPct, known: copayKnown } = getEffectiveCopayPct(input, extraction);
  if (!copayKnown) missingInputs.push('copaymentPct (from policy)');
  const copayAmount = totalBill.mul(copayPct).div('100');

  // --- Deductible ---
  const deductibleField = extraction.deductibleInr;
  let deductible = new Decimal('0');
  if (deductibleField.status !== 'NOT_FOUND' && deductibleField.value !== null) {
    deductible = toD(deductibleField.value);
  }

  // --- Room rent deduction (proportionate) ---
  // ONLY compute if explicitly confirmed in policy
  let roomRentDeduction = new Decimal('0');
  const proportionateField = extraction.proportionateDeductionApplies;
  const proportionateConfirmed =
    proportionateField.status !== 'NOT_FOUND' && proportionateField.value === true;

  if (proportionateConfirmed && input.roomRentPerDayInr !== null && input.durationDays !== null) {
    const roomRentOverride = input.roomRentLimitOverride;
    const limitField = extraction.roomRentLimitInr;
    const limitInr =
      roomRentOverride !== null
        ? toD(roomRentOverride)
        : limitField.status !== 'NOT_FOUND' && limitField.value !== null
        ? toD(limitField.value)
        : null;

    if (limitInr !== null) {
      const actualRoom = toD(input.roomRentPerDayInr);
      const days = new Decimal(input.durationDays);

      if (actualRoom.gt(limitInr)) {
        // Proportionate factor = limitInr / actualRoom
        // Applied to associated charges (approximate: total bill - room cost)
        const totalRoomCost = actualRoom.mul(days);
        const allowedRoomCost = limitInr.mul(days);
        const excessRoomCost = totalRoomCost.minus(allowedRoomCost);

        // Proportionate deduction on associated charges
        const associatedCharges = Decimal.max(totalBill.minus(totalRoomCost), new Decimal('0'));
        const proportionateFactor = limitInr.div(actualRoom);
        const allowedAssociated = associatedCharges.mul(proportionateFactor);
        const associatedDeduction = associatedCharges.minus(allowedAssociated);

        roomRentDeduction = excessRoomCost.plus(associatedDeduction);
      }
    } else {
      missingInputs.push('roomRentLimitInr (from policy)');
    }
  } else if (proportionateConfirmed) {
    if (input.roomRentPerDayInr === null) missingInputs.push('roomRentPerDayInr');
    if (input.durationDays === null) missingInputs.push('durationDays');
  }

  // --- Other non-payables ---
  // Never invented: which bill items are non-payable (consumables, registration
  // etc.) depends on the actual itemised bill and the policy's list of
  // non-payable items. We do not estimate it, so it is zero here.
  const otherNonPayable = new Decimal('0');

  // --- Net bill after deductions ---
  const totalDeductions = copayAmount.plus(deductible).plus(roomRentDeduction).plus(otherNonPayable);
  const insurerPayable = Decimal.max(totalBill.minus(totalDeductions), new Decimal('0'));
  const userContribution = totalBill.minus(insurerPayable);

  const isPartialEstimate = missingInputs.length > 0;

  return {
    insurerPayableInr: str(insurerPayable),
    copaymentInr: str(copayAmount),
    deductibleInr: str(deductible),
    roomRentDeductionInr: str(roomRentDeduction),
    otherNonPayableInr: str(otherNonPayable),
    userContributionInr: str(userContribution),
    isPartialEstimate,
    missingInputs,
  };
}
