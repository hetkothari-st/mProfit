/**
 * TAX_LOSS_HARVEST — realise a paper loss before the financial year closes so
 * it can be set off against gains.
 *
 * This is the only deadline-driven category in the engine: on 1 April the
 * chance is gone for a whole year, which is why it sits in the 1-10 priority
 * band above everything else.
 *
 * The whole position is sold, not a slice. A partial sale realises a partial
 * loss, and the set-off is the entire point — a half-harvested position is a
 * taxable event that only did half a job. MAX_SINGLE_TRADE_PCT is deliberately
 * NOT applied for the same reason.
 */

import { Decimal } from 'decimal.js';
import { formatINR } from '@portfolioos/shared';
import { bucketForAssetClass } from '../assetBuckets.js';
import { CATEGORY_BASE_PRIORITY, MIN_HARVEST_LOSS_INR } from '../constants.js';
import { unitsFor } from '../allocationMath.js';
import type {
  AdvisorFacts,
  AdvisorHarvestCandidateFact,
  AdvisorRule,
  RecommendationDraft,
  TradeAction,
} from '../types.js';

const ZERO = new Decimal(0);
const BASE_PRIORITY = CATEGORY_BASE_PRIORITY.TAX_HARVEST;

const money = (d: Decimal): string => d.abs().toFixed(2);
const inr = (d: Decimal): string => formatINR(money(d));

/** Bigger rupee impact sorts first inside the category's band (0 = largest).
 *  Duplicated per rule file on purpose — see rebalanceDrift.rule.ts. */
function materialityOffset(amount: Decimal, totalValue: Decimal): number {
  if (!totalValue || totalValue.lessThanOrEqualTo(ZERO)) return 4;
  const share = amount.abs().dividedBy(totalValue).toNumber();
  if (share >= 0.1) return 0;
  if (share >= 0.05) return 1;
  if (share >= 0.02) return 2;
  if (share >= 0.01) return 3;
  return 4;
}

/**
 * Oct 1 – Mar 31, the run-up to the Indian FY close.
 *
 * deterministicInsightsRules.isTaxLossHarvestWindow computes exactly this, and
 * the duplication is DELIBERATE. That helper belongs to the insights card and
 * is free to change its window (or move to a different clock) without anyone
 * thinking about advice generation; this rule is a prescriptive instruction to
 * sell a real position and must own the condition that gates it, from
 * `facts.asOf` rather than a clock, so a fixture can pin the date. Two callers
 * sharing one helper is only an improvement while they are guaranteed to want
 * the same answer, and these two are not.
 */
function isHarvestWindow(asOf: Date): boolean {
  const month = asOf.getUTCMonth(); // 0-indexed: Oct = 9, Jan = 0, Mar = 2
  return month >= 9 || month <= 2;
}

const LOSS_CLASSIFICATIONS = new Set<AdvisorHarvestCandidateFact['classification']>([
  'STCG_LOSS',
  'LTCG_LOSS',
]);

/** Financial year label for the close this harvest belongs to, e.g. "2025-26"
 *  for anything between 1 Oct 2025 and 31 Mar 2026. */
function financialYearLabel(asOf: Date): string {
  const year = asOf.getUTCFullYear();
  const startYear = asOf.getUTCMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * Which rate a realised loss actually saves tax at.
 *
 * A capital loss offsets a capital GAIN, so the rate that matters is the one
 * the offset gain would have been taxed at — not the investor's income slab.
 * Only non-equity short-term gains are taxed at slab. Getting this wrong
 * overstates the benefit by about half for the commonest case there is: a
 * 30%-slab investor harvesting an equity short-term loss, where the real
 * statutory rate is 20%.
 */
interface OffsetRate {
  pct: number | null;
  label: string;
}

/** Asset classes taxed under the equity regime (STT-paid equity and
 *  equity-oriented funds/ETFs). */
const EQUITY_TAX_REGIME = new Set(['EQUITY', 'MUTUAL_FUND', 'ETF']);

function offsetRateFor(
  candidate: { assetClass: string; classification: string },
  rates: AdvisorFacts['capitalGainsRates'] | undefined,
): OffsetRate {
  // Rules never throw on incomplete facts. Without a rate table we still emit
  // the recommendation — the loss and the deadline are real either way — and
  // simply decline to put a rupee figure on the tax saved.
  if (!rates) return { pct: null, label: 'your applicable gains' };
  const isEquity = EQUITY_TAX_REGIME.has(candidate.assetClass);
  const isLongTerm = candidate.classification === 'LTCG_LOSS';

  if (isEquity) {
    return isLongTerm
      ? { pct: rates.ltcgEquityPct, label: 'long-term equity gains' }
      : { pct: rates.stcgEquityPct, label: 'short-term equity gains' };
  }
  if (isLongTerm) {
    return { pct: rates.ltcgOtherNonIndexedPct, label: 'long-term non-equity gains' };
  }
  // Non-equity short-term genuinely is taxed at slab — the only branch where
  // the income slab is the right multiplier, and the only one that can be null.
  return { pct: rates.slabPct, label: 'short-term non-equity gains at your slab' };
}

export const taxLossHarvestRule: AdvisorRule = {
  id: 'TAX_LOSS_HARVEST',
  version: 1,
  description:
    'Between 1 October and 31 March, sells loss-making positions whose realised loss clears the harvest floor so the loss can be set off before the FY closes.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    if (!facts || !facts.asOf) return [];
    if (!isHarvestWindow(facts.asOf)) return [];

    const candidates = facts.harvestCandidates ?? [];
    if (candidates.length === 0) return [];

    const total = facts.totalPortfolioValue ?? ZERO;
    const rates = facts.capitalGainsRates;
    const fy = financialYearLabel(facts.asOf);

    const drafts: RecommendationDraft[] = [];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (!LOSS_CLASSIFICATIONS.has(candidate.classification)) continue;

      const pnl = candidate.unrealisedPnL ?? ZERO;
      if (!pnl.isFinite() || pnl.greaterThanOrEqualTo(ZERO)) continue;

      const loss = pnl.abs();
      if (loss.lessThan(MIN_HARVEST_LOSS_INR)) continue;

      const proceeds = candidate.currentValue ?? ZERO;
      if (!proceeds.isFinite() || proceeds.lessThanOrEqualTo(ZERO)) continue;

      const offset = offsetRateFor(candidate, rates);
      drafts.push(buildDraft(facts, candidate, { loss, proceeds, total, offset, fy }));
    }

    return drafts.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.dedupeKey.localeCompare(b.dedupeKey);
    });
  },
};

interface HarvestMath {
  loss: Decimal;
  proceeds: Decimal;
  total: Decimal;
  offset: OffsetRate;
  fy: string;
}

function buildDraft(
  facts: AdvisorFacts,
  candidate: AdvisorHarvestCandidateFact,
  m: HarvestMath,
): RecommendationDraft {
  const bucket = bucketForAssetClass(candidate.assetClass);
  const term = candidate.classification === 'LTCG_LOSS' ? 'long-term' : 'short-term';

  const sell: TradeAction = {
    direction: 'SELL',
    bucket,
    portfolioId: candidate.portfolioId,
    instrumentName: candidate.assetName,
    fundId: null,
    stockId: null,
    isin: candidate.isin,
    holdingKey: null,
    units: unitsFor(m.proceeds, candidate.currentPrice, candidate.priceStale),
    amountInr: money(m.proceeds),
  };

  const unitClause = sell.units
    ? `all ${sell.units} units`
    : 'the entire position (we are withholding a unit count because the last price we have for it is stale)';

  // The rate a harvested loss actually offsets is the rate on the gain it is
  // set off against, NOT the income slab. Equity has its own statutory rates
  // (20% STCG / 12.5% LTCG post Finance Act 2024); only non-equity STCG is
  // taxed at slab. Using the slab for everything overstated the benefit by
  // roughly half for a 30%-slab investor harvesting an equity loss.
  const taxSaved = m.offset.pct != null ? m.loss.times(m.offset.pct).dividedBy(100) : null;
  const taxClause =
    taxSaved != null
      ? `Set off against ${m.offset.label}, that loss is worth roughly ${inr(taxSaved)} in tax saved at ${m.offset.pct}%, provided you have matching gains to set it against.`
      : 'We do not have your tax slab on file, so we are not putting a number on the tax saved — complete the risk questionnaire and we will.';

  const rationale =
    `${candidate.assetName} is down ${inr(m.loss)} and the ${m.fy} financial year closes on 31 March. ` +
    `Sell ${unitClause} for about ${inr(m.proceeds)} to realise that ${inr(m.loss)} as a ${term} capital loss. ` +
    `${taxClause} After 31 March this loss stops being available for this year's set-off.`;

  return {
    ruleId: taxLossHarvestRule.id,
    ruleVersion: taxLossHarvestRule.version,
    category: 'TAX_HARVEST',
    priority: BASE_PRIORITY + materialityOffset(m.loss, m.total),
    action: [sell],
    rationale,
    inputsUsed: {
      asOf: facts.asOf.toISOString(),
      harvestWindow: 'OCT_1_TO_MAR_31',
      financialYear: m.fy,
      minHarvestLossInr: MIN_HARVEST_LOSS_INR.toString(),
      totalPortfolioValue: m.total.toString(),
      offsetRatePct: m.offset.pct,
      offsetRateBasis: m.offset.label,
      estimatedTaxSavedInr: taxSaved ? taxSaved.toString() : null,
      riskProfileAssessmentId: facts.riskProfile?.assessmentId ?? null,
      candidate: {
        portfolioId: candidate.portfolioId,
        assetName: candidate.assetName,
        assetClass: candidate.assetClass,
        bucket,
        isin: candidate.isin,
        quantity: candidate.quantity.toString(),
        currentPrice: candidate.currentPrice ? candidate.currentPrice.toString() : null,
        currentValue: candidate.currentValue.toString(),
        unrealisedPnL: candidate.unrealisedPnL.toString(),
        classification: candidate.classification,
        longTermEligible: candidate.longTermEligible,
        priceStale: candidate.priceStale,
      },
    },
    // Sell-only: no product is being recommended for purchase.
    provenance: { kind: 'NONE' },
    dedupeKey: `TAX_LOSS_HARVEST:${candidate.portfolioId}:${candidate.isin ?? candidate.assetName}`,
  };
}

export default taxLossHarvestRule;
