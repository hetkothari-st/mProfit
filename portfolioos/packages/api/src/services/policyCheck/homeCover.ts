/**
 * Home cover check. Pure; money is Decimal end to end.
 *
 * Two sums matter on a home policy:
 *  - the building: it should match what it would cost to REBUILD, which is
 *    construction cost only, never the market price of the property (land is
 *    not insured and is usually most of that price);
 *  - the contents: what everything inside would cost to replace.
 *
 * Both numbers about the user's home come from the user; we never look them up
 * or guess them. Most policies have an average (under-insurance) clause, which
 * cuts a part-claim in the same proportion as the shortfall, so being
 * under-insured costs more than the missing sum on every claim.
 */

import { Decimal, formatINR, serializeMoney } from '@everypaisa/shared';
import type { HomeCoverInput, HomeCoverOutput, Money } from '@everypaisa/shared';
import type { HomeExtraction } from './homeExtractionSchema.js';

type F<T> = { value: T | null; status: string } | undefined;
const val = <T>(f: F<T>): T | null => (f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined ? f.value : null);

function dec(v: string | number | null | undefined): Decimal | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    const x = new Decimal(v);
    return x.isFinite() && x.gte(0) ? x : null;
  } catch {
    return null;
  }
}

const fmt = (d: Decimal): Money => serializeMoney(d.toDecimalPlaces(0));
const pct = (d: Decimal): string => d.toDecimalPlaces(2).toFixed(2);
const inr = (d: Decimal): string => formatINR(fmt(d), { fractionDigits: 0 });

/** The size of the worked example, so the effect of a shortfall is easy to read. */
export const EXAMPLE_LOSS_INR = 1_000_000;

interface Part {
  name: string;
  sumInsured: Decimal;
  trueValue: Decimal;
  coveredPct: Decimal;
}

export function calculateHomeCover(input: HomeCoverInput, x: HomeExtraction): HomeCoverOutput {
  const missing: string[] = [];
  const assumptions: string[] = [];

  const structureSi = dec(val<string>(x.sumInsuredStructureInr));
  const contentsSi = dec(val<string>(x.sumInsuredContentsInr));
  const area = input.builtUpAreaSqft !== null && Number.isFinite(input.builtUpAreaSqft) && input.builtUpAreaSqft > 0 ? new Decimal(input.builtUpAreaSqft) : null;
  const perSqft = dec(input.rebuildCostPerSqftInr);
  const contentsValue = dec(input.contentsReplacementValueInr);

  const rebuild = area && perSqft && !perSqft.isZero() ? area.mul(perSqft) : null;

  const avgRaw = val<boolean>(x.averageClause);
  const averageClause: HomeCoverOutput['averageClause'] = avgRaw === true ? 'APPLIES' : avgRaw === false ? 'DOES_NOT_APPLY' : 'UNKNOWN';

  const out: HomeCoverOutput = {
    structureSumInsuredInr: structureSi ? fmt(structureSi) : null,
    rebuildCostInr: rebuild ? fmt(rebuild) : null,
    structureShortfallInr: null,
    structureCoveredPct: null,
    contentsSumInsuredInr: contentsSi ? fmt(contentsSi) : null,
    contentsReplacementValueInr: contentsValue && !contentsValue.isZero() ? fmt(contentsValue) : null,
    contentsShortfallInr: null,
    contentsCoveredPct: null,
    averageClause,
    exampleLossInr: null,
    exampleClaimInr: null,
    summary: '',
    assumptions,
    missingInputs: missing,
  };

  const parts: Part[] = [];
  if (rebuild) {
    if (structureSi) {
      out.structureShortfallInr = fmt(rebuild.minus(structureSi));
      const c = structureSi.div(rebuild).mul(100);
      out.structureCoveredPct = pct(c);
      parts.push({ name: 'building', sumInsured: structureSi, trueValue: rebuild, coveredPct: c });
    } else {
      missing.push('building sum insured (not found in the documents)');
    }
  } else {
    missing.push('built-up area and rebuild cost per square foot');
  }
  if (contentsValue && !contentsValue.isZero()) {
    if (contentsSi) {
      out.contentsShortfallInr = fmt(contentsValue.minus(contentsSi));
      const c = contentsSi.div(contentsValue).mul(100);
      out.contentsCoveredPct = pct(c);
      parts.push({ name: 'contents', sumInsured: contentsSi, trueValue: contentsValue, coveredPct: c });
    } else {
      missing.push('contents sum insured (not found in the documents)');
    }
  } else {
    missing.push('what your belongings would cost to replace');
  }

  // Worked example on the least-covered item that is under-insured.
  const under = parts.filter((p) => p.coveredPct.lt(100)).sort((a, b) => a.coveredPct.comparedTo(b.coveredPct))[0];
  if (under && averageClause !== 'DOES_NOT_APPLY') {
    const loss = new Decimal(EXAMPLE_LOSS_INR);
    const cut = loss.mul(under.coveredPct).div(100);
    out.exampleLossInr = fmt(loss);
    out.exampleClaimInr = fmt(Decimal.min(cut, under.sumInsured));
  }

  out.summary = summarise(out, parts, under ?? null);

  assumptions.push(
    'The rebuild cost is built-up area × the cost per square foot you entered. Use construction cost only: the land is not insured and is left out.',
    'A rough figure. A licensed valuer gives a better one, and the cost per square foot varies by city and finish.',
    averageClause === 'DOES_NOT_APPLY'
      ? 'This policy says it has no average clause, but a claim is still capped at the sum insured.'
      : 'Most policies have an average (under-insurance) clause: a part-claim is cut in the same proportion as the shortfall' +
        (averageClause === 'UNKNOWN' ? '. This policy’s wording on it was not found, so the example assumes it applies.' : '.'),
    'A comparison to start a conversation with the insurer, not financial advice.',
  );
  return out;
}

function summarise(o: HomeCoverOutput, parts: Part[], under: Part | null): string {
  if (parts.length === 0) {
    return 'Enter your built-up area and rebuild cost per square foot, and what your belongings would cost to replace, to compare them with the sums insured on your policy.';
  }
  const lines: string[] = [];
  for (const p of parts) {
    if (p.coveredPct.lt(90)) {
      lines.push(
        `Your ${p.name} is insured for about ${pct(p.coveredPct)}% of its cost (${inr(p.sumInsured)} against ${inr(p.trueValue)}), a shortfall of ${inr(p.trueValue.minus(p.sumInsured))}.`,
      );
    } else if (p.coveredPct.gt(110)) {
      lines.push(`Your ${p.name} is insured for about ${pct(p.coveredPct)}% of its cost. You pay premium on the extra, and the insurer pays the actual loss, not the sum insured.`);
    } else {
      lines.push(`Your ${p.name} sum insured is within about 10% of its cost, which is a reasonable match.`);
    }
  }
  if (under && o.exampleClaimInr !== null && o.exampleLossInr !== null) {
    lines.push(
      `With a proportional cut, a ${inr(new Decimal(o.exampleLossInr))} loss on your ${under.name} would be paid about ${inr(new Decimal(o.exampleClaimInr))}.`,
    );
  } else if (under && o.averageClause === 'DOES_NOT_APPLY') {
    lines.push('Your policy says it has no average clause, so a part-claim is not cut in proportion, but no claim can exceed the sum insured.');
  }
  return lines.join(' ');
}
