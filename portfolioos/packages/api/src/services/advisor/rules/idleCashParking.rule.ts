/**
 * IDLE_CASH_PARKING — savings that have sat well above 3 months of spending
 * for months, earning the savings rate, are moved to a liquid fund: same
 * safety, money back the next working day, more interest.
 *
 * Silent unless every fact is the user's own: known monthly spending, at
 * least 6 month-end balances in the last year above the buffer including the
 * last 3, and a balance read in the last two months. The savings rate is the
 * account's own when the user gave it; otherwise the typical rate, flagged on
 * the card and lowering confidence.
 */
import { Decimal } from 'decimal.js';
import {
  CATEGORY_BASE_PRIORITY, IDLE_BUFFER_MONTHS, IDLE_MIN_AMOUNT_INR, IDLE_MIN_GAIN_INR, IDLE_MIN_MONTHS, LIQUID_FUND_YIELD_PCT,
} from '../constants.js';
import { resolveProduct } from '../productResolution.js';
import { addDays, dec, inr, money2, promise } from '../actOnItDraft.js';
import type { AdvisorFacts, AdvisorRule, RecommendationDraft, TradeAction } from '../types.js';

const ROUND_TO = new Decimal(10_000);
const monthsBack = (asOf: Date, n: number) =>
  new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - n, 1)).toISOString().slice(0, 7);

export const idleCashParkingRule: AdvisorRule = {
  id: 'IDLE_CASH_PARKING',
  version: 1,
  description: 'Moves savings that have rested above 3 months of spending into a liquid fund.',

  evaluate(facts: AdvisorFacts): RecommendationDraft[] {
    const x = facts?.extra;
    if (!x || !x.monthlySpending || x.monthlySpending.lessThanOrEqualTo(0) || !x.bank.latestBalance) return [];
    const months = x.bank.balanceMonths;
    const last = months[months.length - 1];
    if (!last || last.month < monthsBack(facts.asOf, 2)) return []; // stale balances say nothing about today

    const buffer = x.monthlySpending.times(IDLE_BUFFER_MONTHS);
    const above = months.filter((m) => m.balance.greaterThan(buffer));
    const lastThree = months.slice(-3);
    if (above.length < IDLE_MIN_MONTHS || lastThree.length < 3 || !lastThree.every((m) => m.balance.greaterThan(buffer))) return [];

    const amount = x.bank.latestBalance.minus(buffer).dividedBy(ROUND_TO).floor().times(ROUND_TO);
    if (amount.lessThan(IDLE_MIN_AMOUNT_INR)) return [];
    const edgePct = LIQUID_FUND_YIELD_PCT - x.bank.savingsRatePct;
    if (edgePct <= 0) return [];
    const gain = amount.times(edgePct).dividedBy(100);
    if (gain.lessThan(IDLE_MIN_GAIN_INR)) return [];

    const resolved = resolveProduct('CASH_EQUIVALENT', facts);
    const fundName = resolved ? resolved.product.label : 'a liquid fund (direct plan)';
    const action: TradeAction[] = resolved
      ? [{
          direction: 'BUY', bucket: 'CASH_EQUIVALENT', portfolioId: facts.defaultPortfolioId, instrumentName: resolved.product.label,
          fundId: resolved.product.fundId, stockId: resolved.product.stockId, isin: null, holdingKey: null, units: null, amountInr: money2(amount),
        }]
      : [];

    const rateClause = x.bank.savingsRateAssumed
      ? `about ${x.bank.savingsRatePct}% (we assumed a typical savings rate; add your account's rate for an exact figure)`
      : `${x.bank.savingsRatePct}% in your savings account`;
    const rationale =
      `For ${above.length} of the last ${months.length} months your bank balance stayed above ${inr(buffer)}, ` +
      `3 months of your spending at ${inr(x.monthlySpending)} a month. The ${inr(amount)} above that buffer earns ${rateClause}. ` +
      `Moved to ${fundName}, it stays one working day away and has been earning about ${LIQUID_FUND_YIELD_PCT}%: ` +
      `roughly ${inr(gain)} more a year. Your 3-month buffer stays in the bank.`;

    return [{
      ruleId: idleCashParkingRule.id,
      ruleVersion: idleCashParkingRule.version,
      category: 'IDLE_CASH_PARKING',
      priority: CATEGORY_BASE_PRIORITY.IDLE_CASH_PARKING,
      action,
      rationale,
      inputsUsed: {
        asOf: facts.asOf.toISOString(),
        monthlySpending: dec(x.monthlySpending),
        bufferInr: dec(buffer),
        latestBalance: dec(x.bank.latestBalance),
        monthsAboveBuffer: above.length,
        monthsSeen: months.length,
        balanceMonths: months.map((m) => ({ month: m.month, balance: m.balance.toString() })),
        savingsRatePct: x.bank.savingsRatePct,
        savingsRateAssumed: x.bank.savingsRateAssumed,
        liquidYieldPct: LIQUID_FUND_YIELD_PCT,
      },
      provenance: resolved ? resolved.provenance : { kind: 'NONE' },
      dedupeKey: 'IDLE_CASH_PARKING:bank',
      headline: `Your ${inr(amount)} is resting. Put it to work.`,
      promise: promise({
        gainInr: money2(gain), riskBand: 'LOW', costInr: '0.00', liquidity: '1 working day',
        confidence: x.bank.savingsRateAssumed ? 'MEDIUM' : 'HIGH',
      }),
      measurement: {
        method: 'NAV_VS_CASH',
        horizonDays: 365,
        baseline: {
          amountInr: money2(amount), savingsRatePct: x.bank.savingsRatePct, expectedYieldPct: LIQUID_FUND_YIELD_PCT,
          referenceSchemeCode: x.liquidFund?.schemeCode ?? null, referenceFundId: resolved?.product.fundId ?? x.liquidFund?.fundId ?? null,
          fundKind: 'LIQUID',
        },
      },
      expiresAt: addDays(facts.asOf, 30),
      urgentUntil: null,
    }];
  },
};

export default idleCashParkingRule;
