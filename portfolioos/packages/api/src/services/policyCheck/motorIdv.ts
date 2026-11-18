/**
 * Motor IDV check. Pure; money is Decimal end to end.
 *
 * The Insured Declared Value (IDV) is what the insurer pays on a total loss or
 * theft, so an IDV well below what the vehicle would sell for means a shortfall
 * on exactly the claims that hurt most. The market value is whatever the user
 * types; we never look one up or guess one.
 *
 * The depreciation schedule is IRDAI's long-standing one for IDV of vehicles
 * up to five years old (20% for 1 to 2 years, 30% for 2-3, 40% for 3-4 and 50%
 * for 4-5). It is applied to completed years only, so the exact month of
 * purchase can move a vehicle into the next band: an estimate, labelled as one.
 */

import { Decimal, serializeMoney } from '@everypaisa/shared';
import type { Money, MotorIdvInput, MotorIdvOutput } from '@everypaisa/shared';
import type { MotorExtraction } from './motorExtractionSchema.js';

type F<T> = { value: T | null; status: string } | undefined;
const val = <T>(f: F<T>): T | null => (f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined ? f.value : null);

function dec(v: string | null | undefined): Decimal | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    const x = new Decimal(v);
    return x.isFinite() && x.gte(0) ? x : null;
  } catch {
    return null;
  }
}

const fmt = (d: Decimal): Money => serializeMoney(d.toDecimalPlaces(0));

/** Depreciation percent by completed years of age (IRDAI schedule). Beyond 5 years the insurer and owner agree a value. */
const SCHEDULE_PCT: Record<number, number> = { 1: 20, 2: 30, 3: 40, 4: 50 };

/** Whole years from manufacture to the policy start (or `asOf` if the start is unknown). */
export function vehicleAgeYears(x: MotorExtraction, asOfIso: string): number | null {
  const made = val<number>(x.manufacturingYear);
  if (made === null) return null;
  const start = val<string>(x.policyStartDate);
  const ref = start && /^\d{4}-\d{2}-\d{2}/.test(start) ? Number(start.slice(0, 4)) : Number(asOfIso.slice(0, 4));
  const age = ref - made;
  return age >= 0 ? age : null;
}

export function calculateMotorIdv(input: MotorIdvInput, x: MotorExtraction, asOfIso: string): MotorIdvOutput {
  const missing: string[] = [];
  const assumptions: string[] = [];

  const idv = dec(val<string>(x.idvInr));
  if (idv === null) missing.push('IDV (not found in the documents; a third-party-only policy has none)');
  const market = dec(input.currentMarketValueInr);
  if (market === null || market.isZero()) missing.push('what the vehicle would sell for today');
  const price = dec(input.exShowroomPriceInr);
  const age = vehicleAgeYears(x, asOfIso);

  const out: MotorIdvOutput = {
    idvInr: idv ? fmt(idv) : null,
    marketValueInr: market && !market.isZero() ? fmt(market) : null,
    gapInr: null,
    gapPct: null,
    vehicleAgeYears: age,
    scheduleIdvInr: null,
    summary: '',
    assumptions,
    missingInputs: missing,
  };

  if (idv && market && !market.isZero()) {
    const gap = market.minus(idv);
    out.gapInr = fmt(gap);
    out.gapPct = gap.div(market).mul(100).toDecimalPlaces(2).toFixed(2);
  }

  if (price && !price.isZero() && age !== null) {
    const pct = SCHEDULE_PCT[age];
    if (pct !== undefined) {
      out.scheduleIdvInr = fmt(price.mul(100 - pct).div(100));
      assumptions.push(
        `IRDAI depreciation schedule for a vehicle of ${age} completed year${age === 1 ? '' : 's'}: ${pct}% off the ex-showroom price. The exact month of purchase can shift the band.`,
      );
    } else if (age === 0) {
      missing.push('vehicle is under a year old: the schedule depends on the exact month, so no estimate is shown');
    } else {
      assumptions.push('After 5 years the insurer and owner agree the IDV, so the schedule does not apply.');
    }
  } else if (price && age === null) {
    missing.push('year of manufacture (not found in the documents)');
  }

  out.summary = summarise(out);
  assumptions.push(
    'A total-loss or theft claim is paid on the IDV, usually less salvage. Smaller repair claims depend on the cover and add-ons, not the IDV.',
    'A comparison to start a conversation with the insurer, not financial advice.',
  );
  return out;
}

function summarise(o: MotorIdvOutput): string {
  if (o.gapPct === null) return 'Enter what the vehicle would sell for today to compare it with the IDV on your policy.';
  const g = Number(o.gapPct);
  if (g > 10) {
    return `Your IDV is about ${o.gapPct}% below what the vehicle would sell for. A total-loss or theft claim could leave you short by roughly that amount. Ask the insurer whether a higher IDV is possible and what it costs.`;
  }
  if (g < -10) {
    return `Your IDV is about ${Math.abs(g).toFixed(2)}% above what the vehicle would sell for. You pay premium on the extra amount, and a claim may be settled closer to the market value.`;
  }
  return 'Your IDV is within about 10% of what the vehicle would sell for, which is a reasonable match.';
}
