/**
 * Capital-gains tax for one financial year from capital-gain rows — the one
 * place tax reports get section totals, set-off, the 112A exemption and rates
 * from, so the Tax page, the downloads and the assistant agree.
 *
 * Nothing year-specific lives here. Rates, the 112A exemption and the dates
 * they change on come from the shared rules table
 * (`@everypaisa/shared` capitalGainsTaxRules), applied per row by its transfer
 * date; the slab rate is the user's own when on file.
 *
 *  - 112A exemption: applied once to the FY's 112A gains, to the higher-rate
 *    part first (lowest tax, which the law permits).
 *  - Set-off within the year (sec 70): a short-term loss can reduce any capital
 *    gain; a long-term loss only long-term gains; losses go to the highest-rate
 *    gains first, sec 112 before 112A (a 112A gain may still fall within the
 *    exemption). Speculative (intraday) results stay within speculation, and
 *    virtual-digital-asset losses offset nothing.
 *  - 112A gains use `taxableGain`, which carries sec 55(2)(ac) grandfathering.
 */
import { Decimal } from 'decimal.js';
import {
  capitalGainsRulesFor,
  listedEquityLtcgExemptionFor,
  SLAB_RATE_ESTIMATE_PCT,
} from '@everypaisa/shared';
import type { CapitalGainRow } from './capitalGains.service.js';
import { prisma } from '../lib/prisma.js';

const ZERO = new Decimal(0);

type Section = 's111A' | 's112A' | 's112' | 'stcgSlab';

interface Bucket {
  section: Section;
  term: 'short' | 'long';
  ratePct: number;
  net: Decimal;
}

const LISTED_SECURITY_CLASSES = new Set(['BOND', 'GOVT_BOND', 'CORPORATE_BOND', 'GOLD_BOND']);

function bucketFor(r: CapitalGainRow, slabPct: number): Omit<Bucket, 'net'> {
  const rates = capitalGainsRulesFor(r.sellDate).ratesPct;
  if (r.capitalGainType === 'SHORT_TERM') {
    return r.isEquityOriented
      ? { section: 's111A', term: 'short', ratePct: rates.stcgListedEquity }
      : { section: 'stcgSlab', term: 'short', ratePct: slabPct };
  }
  if (r.isEquityOriented) return { section: 's112A', term: 'long', ratePct: rates.ltcgListedEquity };
  if (r.indexedCostOfAcquisition) return { section: 's112', term: 'long', ratePct: rates.ltcgIndexed };
  if (LISTED_SECURITY_CLASSES.has(r.assetClass)) {
    return { section: 's112', term: 'long', ratePct: rates.ltcgListedWithoutIndexation };
  }
  return { section: 's112', term: 'long', ratePct: rates.ltcgWithoutIndexation };
}

interface SectionTotal {
  /** Net of the section's rows before set-off (taxable-gain basis). */
  gain: Decimal;
  /** After set-off (and, for 112A, after the exemption). */
  taxable: Decimal;
  tax: Decimal;
}

export interface CapitalGainsTax {
  financialYear: string;
  slabPct: number;
  /** True when slab-rate figures use the stand-in rate because no slab is on file. */
  slabIsEstimate: boolean;
  s111A: SectionTotal;
  s112A: SectionTotal & { afterSetOff: Decimal; exemption: Decimal };
  /** `rawGain` is before indexation; `gain` is after it. */
  s112: SectionTotal & { rawGain: Decimal };
  stcgOther: SectionTotal;
  intraday: SectionTotal;
  vda: SectionTotal;
  carryForward: { shortTermLoss: Decimal; longTermLoss: Decimal; speculativeLoss: Decimal };
  totalTax: Decimal;
}

/**
 * The user's income-tax slab from their latest risk-profile answers, or the
 * stand-in rate (flagged as an estimate) when none is recorded.
 */
export async function slabRateForUser(userId: string): Promise<{ slabPct: number; isEstimate: boolean }> {
  const latest = await prisma.riskProfileAssessment.findFirst({
    where: { userId, taxSlabPct: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { taxSlabPct: true },
  });
  if (latest?.taxSlabPct != null) {
    return { slabPct: new Decimal(latest.taxSlabPct.toString()).toNumber(), isEstimate: false };
  }
  return { slabPct: SLAB_RATE_ESTIMATE_PCT, isEstimate: true };
}

export function computeCapitalGainsTax(
  rows: CapitalGainRow[],
  financialYear: string,
  slab: { slabPct: number; isEstimate: boolean } = { slabPct: SLAB_RATE_ESTIMATE_PCT, isEstimate: true },
): CapitalGainsTax {
  const { slabPct } = slab;
  const inFy = rows.filter((r) => r.financialYear === financialYear);
  const buckets = new Map<string, Bucket>();
  const gross: Record<Section, Decimal> = { s111A: ZERO, s112A: ZERO, s112: ZERO, stcgSlab: ZERO };
  let s112Raw = ZERO;
  let intraday = ZERO;
  let vdaGain = ZERO;
  let vdaTaxable = ZERO;
  let vdaTax = ZERO;

  for (const r of inFy) {
    if (r.capitalGainType === 'INTRADAY') {
      intraday = intraday.plus(r.taxableGain);
      continue;
    }
    if (r.assetClass === 'CRYPTOCURRENCY') {
      vdaGain = vdaGain.plus(r.gainLoss);
      if (r.taxableGain.greaterThan(0)) {
        vdaTaxable = vdaTaxable.plus(r.taxableGain);
        vdaTax = vdaTax.plus(
          r.taxableGain.times(capitalGainsRulesFor(r.sellDate).ratesPct.virtualDigitalAsset).dividedBy(100),
        );
      }
      continue;
    }
    const b = bucketFor(r, slabPct);
    const key = `${b.section}:${b.ratePct}`;
    const bucket = buckets.get(key) ?? { ...b, net: ZERO };
    bucket.net = bucket.net.plus(r.taxableGain);
    buckets.set(key, bucket);
    gross[b.section] = gross[b.section].plus(r.taxableGain);
    if (b.section === 's112') s112Raw = s112Raw.plus(r.gainLoss);
  }

  // Pool losses, then set them off against the highest-rate gains.
  let stLoss = ZERO;
  let ltLoss = ZERO;
  for (const b of buckets.values()) {
    if (b.net.isNegative()) {
      if (b.term === 'short') stLoss = stLoss.plus(b.net.negated());
      else ltLoss = ltLoss.plus(b.net.negated());
      b.net = ZERO;
    }
  }
  const byRateDesc = (a: Bucket, b: Bucket) => b.ratePct - a.ratePct;
  const positive = [...buckets.values()].filter((b) => b.net.greaterThan(0));
  const shortGains = positive.filter((b) => b.term === 'short').sort(byRateDesc);
  const longGains = [
    ...positive.filter((b) => b.section === 's112').sort(byRateDesc),
    ...positive.filter((b) => b.section === 's112A').sort(byRateDesc),
  ];
  const apply = (loss: Decimal, targets: Bucket[]): Decimal => {
    let left = loss;
    for (const t of targets) {
      if (left.lessThanOrEqualTo(0)) break;
      const used = Decimal.min(left, t.net);
      t.net = t.net.minus(used);
      left = left.minus(used);
    }
    return left;
  };
  stLoss = apply(stLoss, [...shortGains, ...longGains]);
  ltLoss = apply(ltLoss, longGains);

  // 112A exemption for this FY, higher-rate part first.
  const s112ABuckets = [...buckets.values()].filter((b) => b.section === 's112A').sort(byRateDesc);
  const s112AAfterSetOff = s112ABuckets.reduce((s, b) => s.plus(b.net), ZERO);
  const exemption = new Decimal(listedEquityLtcgExemptionFor(financialYear));
  let exemptionLeft = exemption;
  for (const b of s112ABuckets) {
    const used = Decimal.min(exemptionLeft, b.net);
    b.net = b.net.minus(used);
    exemptionLeft = exemptionLeft.minus(used);
  }

  const totals = (section: Section): SectionTotal => {
    let taxable = ZERO;
    let tax = ZERO;
    for (const b of buckets.values()) {
      if (b.section !== section) continue;
      taxable = taxable.plus(b.net);
      tax = tax.plus(b.net.times(b.ratePct).dividedBy(100));
    }
    return { gain: gross[section], taxable, tax };
  };

  const s111A = totals('s111A');
  const s112ATotals = totals('s112A');
  const s112Totals = totals('s112');
  const stcgOther = totals('stcgSlab');
  const intradayTaxable = Decimal.max(intraday, 0);
  const intradayTotals: SectionTotal = {
    gain: intraday,
    taxable: intradayTaxable,
    tax: intradayTaxable.times(slabPct).dividedBy(100),
  };

  return {
    financialYear,
    slabPct,
    slabIsEstimate: slab.isEstimate,
    s111A,
    s112A: {
      ...s112ATotals,
      afterSetOff: s112AAfterSetOff,
      exemption: Decimal.min(exemption, s112AAfterSetOff),
    },
    s112: { ...s112Totals, rawGain: s112Raw },
    stcgOther,
    intraday: intradayTotals,
    vda: { gain: vdaGain, taxable: vdaTaxable, tax: vdaTax },
    carryForward: {
      shortTermLoss: stLoss,
      longTermLoss: ltLoss,
      speculativeLoss: intraday.isNegative() ? intraday.negated() : ZERO,
    },
    totalTax: s111A.tax
      .plus(s112ATotals.tax)
      .plus(s112Totals.tax)
      .plus(stcgOther.tax)
      .plus(intradayTotals.tax)
      .plus(vdaTax),
  };
}
