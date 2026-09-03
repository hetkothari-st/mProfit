/**
 * CONCENTRATION_TRIM — no single position should be able to halve the
 * portfolio on its own.
 *
 * Fires on any holding above CONCENTRATION_CAP_PCT of total portfolio value
 * and sizes the sell that brings it back to exactly the cap.
 *
 * One deliberate departure from "exactly the cap": MAX_SINGLE_TRADE_PCT still
 * applies. A freshly-onboarded portfolio that is 85% one stock would otherwise
 * produce a single instruction moving 70% of everything the user owns, which
 * is not a recommendation so much as a restructuring, and it would drown every
 * other draft in the run. When the cap bites, the rationale says so and states
 * how far the position still has to travel — a first tranche described
 * honestly beats one enormous number nobody acts on.
 *
 * This is a sell-only draft: it names no product to buy, so its provenance is
 * NONE by design. Where the proceeds should go is REBALANCE_DRIFT's and
 * CASH_DEPLOYMENT's question, and answering it here would couple two
 * independent judgements into one instruction.
 */

import { Decimal } from 'decimal.js';
import { formatINR } from '@portfolioos/shared';
import {
  CATEGORY_BASE_PRIORITY,
  CONCENTRATION_CAP_PCT,
  MAX_SINGLE_TRADE_PCT,
  MIN_TRADE_INR,
} from '../constants.js';
import { unitsFor } from '../allocationMath.js';
import type {
  AdvisorFacts,
  AdvisorHoldingFact,
  AdvisorRule,
  RecommendationDraft,
  TradeAction,
} from '../types.js';

const ZERO = new Decimal(0);
const BASE_PRIORITY = CATEGORY_BASE_PRIORITY.CONCENTRATION_TRIM;

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

export const concentrationTrimRule: AdvisorRule = {
  id: 'CONCENTRATION_TRIM',
  version: 1,
  description:
    'Trims any single holding worth more than the concentration cap back down to that cap, sourced from that holding alone.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    if (!facts) return [];
    const total = facts.totalPortfolioValue ?? ZERO;
    if (total.lessThanOrEqualTo(ZERO)) return [];

    const holdings = facts.holdings ?? [];
    if (holdings.length === 0) return [];

    const capValue = total.times(CONCENTRATION_CAP_PCT).dividedBy(100);
    const tradeCeiling = total.times(MAX_SINGLE_TRADE_PCT).dividedBy(100);

    const drafts: RecommendationDraft[] = [];

    for (const holding of holdings) {
      if (!holding) continue;
      const value = holding.currentValue ?? ZERO;
      if (!value.isFinite() || value.lessThanOrEqualTo(ZERO)) continue;

      const pct = value.dividedBy(total).times(100);
      if (pct.lessThanOrEqualTo(CONCENTRATION_CAP_PCT)) continue;

      const excess = value.minus(capValue);
      const amount = Decimal.min(excess, tradeCeiling);
      // Below the friction floor the trade costs more than the risk it removes.
      if (amount.lessThan(MIN_TRADE_INR)) continue;

      drafts.push(buildDraft(facts, holding, { total, value, pct, capValue, excess, amount }));
    }

    // Largest concentration first, then holdingKey, so identical facts always
    // produce an identically ordered list.
    return drafts.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.dedupeKey.localeCompare(b.dedupeKey);
    });
  },
};

interface TrimMath {
  total: Decimal;
  value: Decimal;
  pct: Decimal;
  capValue: Decimal;
  excess: Decimal;
  amount: Decimal;
}

function buildDraft(
  facts: AdvisorFacts,
  holding: AdvisorHoldingFact,
  m: TrimMath,
): RecommendationDraft {
  const sell: TradeAction = {
    direction: 'SELL',
    bucket: holding.bucket,
    portfolioId: holding.portfolioId,
    instrumentName: holding.assetName,
    fundId: holding.fundId,
    stockId: holding.stockId,
    isin: holding.isin,
    holdingKey: holding.holdingKey,
    units: unitsFor(m.amount, holding.currentPrice, holding.priceStale),
    amountInr: money(m.amount),
  };

  const unitClause = sell.units
    ? ` — about ${sell.units} units`
    : ' — we are withholding a unit count because the last price we have for it is stale';

  const capped = m.amount.lessThan(m.excess);
  const residual = m.excess.minus(m.amount);

  const tail = capped
    ? `That is the largest single instruction we will issue at once (${MAX_SINGLE_TRADE_PCT}% of the portfolio); ` +
      `a further ${inr(residual)} still has to come out after it to reach the ${CONCENTRATION_CAP_PCT}% cap of ${inr(m.capValue)}.`
    : `That leaves ${inr(m.capValue)} in it — exactly the ${CONCENTRATION_CAP_PCT}% cap.`;

  const rationale =
    `${holding.assetName} is ${m.pct.toFixed(1)}% of your ${inr(m.total)} portfolio, worth ${inr(m.value)} against a ` +
    `${CONCENTRATION_CAP_PCT}% ceiling of ${inr(m.capValue)}. Sell ${inr(m.amount)} of it${unitClause}. ${tail}`;

  return {
    ruleId: concentrationTrimRule.id,
    ruleVersion: concentrationTrimRule.version,
    category: 'CONCENTRATION_TRIM',
    priority: BASE_PRIORITY + materialityOffset(m.amount, m.total),
    action: [sell],
    rationale,
    inputsUsed: {
      asOf: facts.asOf?.toISOString() ?? null,
      totalPortfolioValue: m.total.toString(),
      concentrationCapPct: CONCENTRATION_CAP_PCT,
      maxSingleTradePct: MAX_SINGLE_TRADE_PCT,
      minTradeInr: MIN_TRADE_INR.toString(),
      capValue: m.capValue.toString(),
      excessOverCap: m.excess.toString(),
      cappedByMaxSingleTrade: capped,
      residualAfterTrade: residual.toString(),
      holding: {
        holdingKey: holding.holdingKey,
        portfolioId: holding.portfolioId,
        assetName: holding.assetName,
        assetClass: holding.assetClass,
        bucket: holding.bucket,
        fundId: holding.fundId,
        stockId: holding.stockId,
        isin: holding.isin,
        quantity: holding.quantity.toString(),
        currentValue: holding.currentValue.toString(),
        currentPrice: holding.currentPrice ? holding.currentPrice.toString() : null,
        priceStale: holding.priceStale,
        sharePct: m.pct.toNumber(),
      },
    },
    // Sell-only: nothing is being bought, so there is no product to attribute.
    provenance: { kind: 'NONE' },
    dedupeKey: `CONCENTRATION_TRIM:${holding.holdingKey}`,
  };
}

export default concentrationTrimRule;
