/**
 * REBALANCE_DRIFT — pull the portfolio back toward its model weights.
 *
 * The rule pairs an overweight bucket with an underweight one so the output
 * reads as a single funded instruction ("sell 40 units of X, move ₹3.2L into
 * Y") rather than two unrelated nudges the user has to reconcile. Pairing is
 * greedy on rupee size: the biggest overweight funds the biggest underweight,
 * because that is the pair that closes the most drift per instruction.
 *
 * Only INVESTABLE_BUCKETS are traded. REAL_ASSETS and OTHER_ALT carry a 0%
 * target in every model, so a portfolio holding property or crypto is
 * permanently "overweight" there — telling someone to sell a flat in ₹3L
 * slices to hit a weight is not advice, it is arithmetic pretending to be
 * advice. Those buckets are reported by the allocation surface and left alone
 * here.
 *
 * The SELL leg is always sourced from the LARGEST holding in the overweight
 * bucket: it is the position most able to absorb the trade without being
 * wiped out, and it is the one whose trim also does the most for
 * concentration.
 */

import { Decimal } from 'decimal.js';
import { formatINR } from '@portfolioos/shared';
import { INVESTABLE_BUCKETS } from '../assetBuckets.js';
import { CATEGORY_BASE_PRIORITY, MIN_TRADE_INR, REBALANCE_BAND_PP } from '../constants.js';
import { computeDrift, sizeRebalanceTrade, unitsFor, type DriftRow } from '../allocationMath.js';
import { resolveProduct } from '../productResolution.js';
import type {
  AdvisorAssetBucketValue,
  AdvisorFacts,
  AdvisorHoldingFact,
  AdvisorRule,
  DraftProvenance,
  RecommendationDraft,
  TradeAction,
} from '../types.js';

const ZERO = new Decimal(0);
const BASE_PRIORITY = CATEGORY_BASE_PRIORITY.REBALANCE;

/** Rupee amounts are written to the draft at exactly two decimals and rendered
 *  into the rationale through the same string, so the figure a user reads and
 *  the figure the engine stores can never disagree. */
const money = (d: Decimal): string => d.abs().toFixed(2);
const inr = (d: Decimal): string => formatINR(money(d));

/** Bigger rupee impact sorts first inside the category's band (0 = largest).
 *  Deliberately duplicated in each rule file rather than shared: a rule is
 *  meant to be readable and testable as one self-contained unit, and the
 *  offsets are identical by design. */
function materialityOffset(amount: Decimal, totalValue: Decimal): number {
  if (!totalValue || totalValue.lessThanOrEqualTo(ZERO)) return 4;
  const share = amount.abs().dividedBy(totalValue).toNumber();
  if (share >= 0.1) return 0;
  if (share >= 0.05) return 1;
  if (share >= 0.02) return 2;
  if (share >= 0.01) return 3;
  return 4;
}

const BUCKET_LABEL: Record<AdvisorAssetBucketValue, string> = {
  EQUITY_DOMESTIC: 'Indian equity',
  EQUITY_INTERNATIONAL: 'international equity',
  DEBT: 'debt',
  GOLD: 'gold',
  REAL_ASSETS: 'real assets',
  CASH_EQUIVALENT: 'cash and deposits',
  OTHER_ALT: 'alternatives',
};

interface SizedRow {
  row: DriftRow;
  direction: 'BUY' | 'SELL';
  amountInr: Decimal;
}

/** Largest holding in a bucket, by current value. Ties broken by holdingKey so
 *  identical facts always produce the identical instruction. */
function largestHoldingIn(
  holdings: AdvisorHoldingFact[],
  bucket: AdvisorAssetBucketValue,
): AdvisorHoldingFact | null {
  const inBucket = holdings.filter((h) => h && h.bucket === bucket && h.currentValue.greaterThan(ZERO));
  if (inBucket.length === 0) return null;
  return [...inBucket].sort((a, b) => {
    const byValue = b.currentValue.comparedTo(a.currentValue);
    if (byValue !== 0) return byValue;
    return a.holdingKey.localeCompare(b.holdingKey);
  })[0]!;
}

function sellLeg(holding: AdvisorHoldingFact, amount: Decimal): TradeAction {
  return {
    direction: 'SELL',
    bucket: holding.bucket,
    portfolioId: holding.portfolioId,
    instrumentName: holding.assetName,
    fundId: holding.fundId,
    stockId: holding.stockId,
    isin: holding.isin,
    holdingKey: holding.holdingKey,
    units: unitsFor(amount, holding.currentPrice, holding.priceStale),
    amountInr: money(amount),
  };
}

export const rebalanceDriftRule: AdvisorRule = {
  id: 'REBALANCE_DRIFT',
  version: 1,
  description:
    'Pairs an overweight bucket with an underweight one and sizes the switch that closes the drift, once the gap clears the rebalance band.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    if (!facts) return [];
    const total = facts.totalPortfolioValue ?? ZERO;
    if (total.lessThanOrEqualTo(ZERO)) return [];

    const targets = facts.modelPortfolio?.targets ?? [];
    // No model portfolio means no target to drift from. RISK_PROFILE_REVIEW is
    // the rule that tells the user how to get one; inventing a target here
    // would be advice nobody chose.
    if (targets.length === 0) return [];

    const rows = computeDrift(facts.currentAllocation ?? [], targets, total);

    const sized: SizedRow[] = [];
    for (const row of rows) {
      if (!INVESTABLE_BUCKETS.includes(row.bucket)) continue;
      const trade = sizeRebalanceTrade(row, total);
      if (!trade) continue;
      sized.push({ row, direction: trade.direction, amountInr: trade.amountInr });
    }

    const byAmountDesc = (a: SizedRow, b: SizedRow) => {
      const byValue = b.amountInr.comparedTo(a.amountInr);
      if (byValue !== 0) return byValue;
      return a.row.bucket.localeCompare(b.row.bucket);
    };

    const overs = sized.filter((s) => s.direction === 'SELL').sort(byAmountDesc);
    const unders = sized.filter((s) => s.direction === 'BUY').sort(byAmountDesc);

    const drafts: RecommendationDraft[] = [];
    const pairCount = Math.min(overs.length, unders.length);

    for (let i = 0; i < pairCount; i += 1) {
      const draft = buildPairedDraft(facts, overs[i]!, unders[i]!, total);
      if (draft) drafts.push(draft);
    }

    for (let i = pairCount; i < overs.length; i += 1) {
      const draft = buildSellOnlyDraft(facts, overs[i]!, total);
      if (draft) drafts.push(draft);
    }

    for (let i = pairCount; i < unders.length; i += 1) {
      const draft = buildBuyOnlyDraft(facts, unders[i]!, total);
      if (draft) drafts.push(draft);
    }

    return drafts;
  },
};

/** The funded case: sell the overweight, buy the underweight, one amount. The
 *  amount is the smaller of the two legs so the instruction never sells more
 *  than it deploys or deploys more than it raises. */
function buildPairedDraft(
  facts: AdvisorFacts,
  over: SizedRow,
  under: SizedRow,
  total: Decimal,
): RecommendationDraft | null {
  const source = largestHoldingIn(facts.holdings ?? [], over.row.bucket);
  const resolved = resolveProduct(under.row.bucket, facts);

  // Missing either half degrades to the single-leg form rather than dropping
  // the drift on the floor.
  if (!source) return buildBuyOnlyDraft(facts, under, total);
  if (!resolved) return buildSellOnlyDraft(facts, over, total);

  const amount = Decimal.min(over.amountInr, under.amountInr, source.currentValue);
  if (amount.lessThan(MIN_TRADE_INR)) return null;

  const buy: TradeAction = {
    direction: 'BUY',
    bucket: under.row.bucket,
    portfolioId: facts.defaultPortfolioId,
    instrumentName: resolved.product.label,
    fundId: resolved.product.fundId,
    stockId: resolved.product.stockId,
    isin: null,
    holdingKey: null,
    units: unitsFor(amount, null, false),
    amountInr: money(amount),
  };
  const sell = sellLeg(source, amount);

  const unitClause = sell.units
    ? ` (about ${sell.units} units)`
    : ' (unit count withheld — the last price we have for it is stale)';

  const rationale =
    `Your ${BUCKET_LABEL[over.row.bucket]} allocation is ${Math.abs(over.row.driftPp).toFixed(1)}pp above its ` +
    `${over.row.targetPct.toFixed(0)}% target while ${BUCKET_LABEL[under.row.bucket]} sits ` +
    `${Math.abs(under.row.driftPp).toFixed(1)}pp below its ${under.row.targetPct.toFixed(0)}% target. ` +
    `Sell ${inr(amount)} of ${source.assetName}${unitClause} and move that ${inr(amount)} into ` +
    `${resolved.product.label}. That single switch closes both gaps and leaves your ` +
    `${inr(total)} portfolio back inside the ${REBALANCE_BAND_PP}pp rebalance band.`;

  return {
    ruleId: rebalanceDriftRule.id,
    ruleVersion: rebalanceDriftRule.version,
    category: 'REBALANCE',
    priority: BASE_PRIORITY + materialityOffset(amount, total),
    action: [sell, buy],
    rationale,
    inputsUsed: inputsFor(facts, total, [over.row, under.row], source, resolved),
    provenance: resolved.provenance,
    dedupeKey: `REBALANCE_DRIFT:${over.row.bucket}->${under.row.bucket}`,
  };
}

/** Overweight with nothing to fund. Still worth saying: the money is
 *  mis-positioned whether or not we can name where it goes next. */
function buildSellOnlyDraft(
  facts: AdvisorFacts,
  over: SizedRow,
  total: Decimal,
): RecommendationDraft | null {
  const source = largestHoldingIn(facts.holdings ?? [], over.row.bucket);
  if (!source) return null;

  const amount = Decimal.min(over.amountInr, source.currentValue);
  if (amount.lessThan(MIN_TRADE_INR)) return null;

  const sell = sellLeg(source, amount);
  const unitClause = sell.units
    ? ` (about ${sell.units} units)`
    : ' (unit count withheld — the last price we have for it is stale)';

  const rationale =
    `Your ${BUCKET_LABEL[over.row.bucket]} allocation is ${over.row.currentPct.toFixed(1)}% against a ` +
    `${over.row.targetPct.toFixed(0)}% target — ${Math.abs(over.row.driftPp).toFixed(1)}pp overweight on a ` +
    `${inr(total)} portfolio. Sell ${inr(amount)} of ${source.assetName}${unitClause}, your largest position ` +
    `in that bucket, to bring the weight back to target.`;

  return {
    ruleId: rebalanceDriftRule.id,
    ruleVersion: rebalanceDriftRule.version,
    category: 'REBALANCE',
    priority: BASE_PRIORITY + materialityOffset(amount, total),
    action: [sell],
    rationale,
    inputsUsed: inputsFor(facts, total, [over.row], source, null),
    provenance: { kind: 'NONE' },
    dedupeKey: `REBALANCE_DRIFT:${over.row.bucket}->NONE`,
  };
}

/** Underweight with no overweight to fund it — new money is what closes this
 *  one, so the draft names the destination and leaves the source to the user
 *  (CASH_DEPLOYMENT and GOAL_SHORTFALL_SIP cover the funded versions). */
function buildBuyOnlyDraft(
  facts: AdvisorFacts,
  under: SizedRow,
  total: Decimal,
): RecommendationDraft | null {
  const resolved = resolveProduct(under.row.bucket, facts);
  if (!resolved) return null;

  const amount = under.amountInr;
  if (amount.lessThan(MIN_TRADE_INR)) return null;

  const buy: TradeAction = {
    direction: 'BUY',
    bucket: under.row.bucket,
    portfolioId: facts.defaultPortfolioId,
    instrumentName: resolved.product.label,
    fundId: resolved.product.fundId,
    stockId: resolved.product.stockId,
    isin: null,
    holdingKey: null,
    units: unitsFor(amount, null, false),
    amountInr: money(amount),
  };

  const rationale =
    `Your ${BUCKET_LABEL[under.row.bucket]} allocation is ${under.row.currentPct.toFixed(1)}% against a ` +
    `${under.row.targetPct.toFixed(0)}% target — ${Math.abs(under.row.driftPp).toFixed(1)}pp short on a ` +
    `${inr(total)} portfolio. Add ${inr(amount)} to ${resolved.product.label} to close the gap.`;

  return {
    ruleId: rebalanceDriftRule.id,
    ruleVersion: rebalanceDriftRule.version,
    category: 'REBALANCE',
    priority: BASE_PRIORITY + materialityOffset(amount, total),
    action: [buy],
    rationale,
    inputsUsed: inputsFor(facts, total, [under.row], null, resolved),
    provenance: resolved.provenance,
    dedupeKey: `REBALANCE_DRIFT:NONE->${under.row.bucket}`,
  };
}

/** The audit record: every fact this draft was computed from, in the shape it
 *  was read in. Decimals are stringified so the row survives JSON storage. */
function inputsFor(
  facts: AdvisorFacts,
  total: Decimal,
  rows: DriftRow[],
  source: AdvisorHoldingFact | null,
  resolved: { product: { label: string }; provenance: DraftProvenance } | null,
): Record<string, unknown> {
  return {
    asOf: facts.asOf?.toISOString() ?? null,
    totalPortfolioValue: total.toString(),
    rebalanceBandPp: REBALANCE_BAND_PP,
    minTradeInr: MIN_TRADE_INR.toString(),
    modelPortfolioId: facts.modelPortfolio?.id ?? null,
    modelPortfolioVersionId: facts.modelPortfolio?.versionId ?? null,
    modelPortfolioVersion: facts.modelPortfolio?.version ?? null,
    targets: (facts.modelPortfolio?.targets ?? []).map((t) => ({
      bucket: t.bucket,
      targetPct: t.targetPct,
    })),
    currentAllocation: (facts.currentAllocation ?? []).map((a) => ({
      bucket: a.bucket,
      currentPct: a.currentPct,
      currentValue: a.currentValue.toString(),
    })),
    driftRows: rows.map((r) => ({
      bucket: r.bucket,
      currentPct: r.currentPct,
      targetPct: r.targetPct,
      driftPp: r.driftPp,
      driftValue: r.driftValue.toString(),
    })),
    sourceHolding: source
      ? {
          holdingKey: source.holdingKey,
          portfolioId: source.portfolioId,
          assetName: source.assetName,
          bucket: source.bucket,
          currentValue: source.currentValue.toString(),
          currentPrice: source.currentPrice ? source.currentPrice.toString() : null,
          priceStale: source.priceStale,
        }
      : null,
    resolvedProduct: resolved
      ? { label: resolved.product.label, provenance: resolved.provenance.kind }
      : null,
    defaultPortfolioId: facts.defaultPortfolioId ?? null,
  };
}

export default rebalanceDriftRule;
