import { Decimal } from 'decimal.js';
import type { HiddenCostSource, HiddenCostsView } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { buildAdvisorFacts } from '../advisor/advisorFacts.builder.js';
import { latestTer } from '../advisor/actOnItFacts.builder.js';
import { hasSpendingConsent } from '../safeToInvest/stiSpendStore.js';
import {
  COMPOUND_RATE_PCT,
  COMPOUND_YEARS,
  PMS_FIXED_FEE_PCT,
  ULIP_CHARGE_CAP_PCT,
  EXIT_LOAD_PCT,
  compoundYearly,
  exitLoadEstimate,
  isBankCharge,
  pctOf,
  yearlyTerCost,
} from './hiddenCostMath.js';

/**
 * Hidden Cost X-ray. Every source is read on its own; one that fails is
 * reported in `unavailable` and the rest still show. Window: the 12 months to
 * `asOf` for things paid (trades, bank charges, exit loads); the current value
 * for yearly charges on what is held (expense ratios, ULIP, PMS).
 */

const YEAR_MS = 365 * 86_400_000;
const ZERO = new Decimal(0);
const money = (d: Decimal) => d.toFixed(2);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Draft = Omit<HiddenCostSource, 'amountInr'> & { amount: Decimal };

export async function getHiddenCosts(userId: string, asOf: Date = new Date()): Promise<HiddenCostsView> {
  const from = new Date(asOf.getTime() - YEAR_MS);
  const unavailable: string[] = [];
  const safe = async <T>(name: string, fallback: T, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      logger.warn({ err, userId, section: name }, '[hiddenCosts] section failed');
      unavailable.push(name);
      return fallback;
    }
  };

  const facts = await safe('holdings', null, () => buildAdvisorFacts(userId, asOf));
  const drafts: Draft[] = [];
  let fundsWithoutTer = 0;

  if (facts) {
    // ── Mutual funds: commission on regular plans, and every fund's running cost ──
    const funds = await safe('funds', { commission: ZERO, commissionFunds: 0, running: ZERO, runningFunds: 0, unknown: 0 }, async () => {
      const held = facts.holdings.filter((h) => h.fundId && !h.priceStale && h.currentValue.greaterThan(0));
      const regular = new Map((facts.extra?.regularPlans ?? []).map((r) => [r.holdingKey, r]));
      const masters = await prisma.mutualFundMaster.findMany({ where: { id: { in: held.map((h) => h.fundId!) } }, select: { id: true, schemeCode: true } });
      const codeOf = new Map(masters.map((m) => [m.id, m.schemeCode]));
      const ter = await latestTer(masters.map((m) => m.schemeCode));
      let commission = ZERO;
      let running = ZERO;
      let commissionFunds = 0;
      let runningFunds = 0;
      let unknown = 0;
      for (const h of held) {
        const r = regular.get(h.holdingKey);
        if (r) {
          // Regular plan: the gap to its direct sibling is commission; the direct part is the fund's own cost.
          commission = commission.plus(yearlyTerCost(h.currentValue, r.regularTerPct - r.directTerPct));
          running = running.plus(yearlyTerCost(h.currentValue, r.directTerPct));
          commissionFunds += 1;
          runningFunds += 1;
          continue;
        }
        const t = ter.get(codeOf.get(h.fundId!) ?? '');
        if (t === undefined) {
          unknown += 1;
          continue;
        }
        running = running.plus(yearlyTerCost(h.currentValue, t));
        runningFunds += 1;
      }
      return { commission, commissionFunds, running, runningFunds, unknown };
    });
    fundsWithoutTer = funds.unknown;
    drafts.push({
      key: 'REGULAR_COMMISSION', label: 'Regular-plan commissions', amount: funds.commission,
      detail: `${plural(funds.commissionFunds, 'fund')} · switchable to Direct`, basis: 'DATA', estimateNote: null, cuttable: true, unavoidable: false,
    });
    drafts.push({
      key: 'FUND_RUNNING_COST', label: 'Fund running costs', amount: funds.running,
      detail: `Expense ratio on ${plural(funds.runningFunds, 'fund')}`, basis: 'DATA', estimateNote: null, cuttable: false, unavoidable: false,
    });

    // ── ULIP and PMS: estimated on what is held ──
    const valueOf = (cls: string) => facts.holdings.filter((h) => h.assetClass === cls).reduce((s, h) => s.plus(h.currentValue), ZERO);
    const countOf = (cls: string) => facts.holdings.filter((h) => h.assetClass === cls && h.currentValue.greaterThan(0)).length;
    drafts.push({
      key: 'ULIP_CHARGES', label: 'ULIP charges', amount: pctOf(valueOf('ULIP'), ULIP_CHARGE_CAP_PCT),
      detail: `Mortality + fund management + admin · ${plural(countOf('ULIP'), 'policy', 'policies')}`, basis: 'ESTIMATE',
      estimateNote: `Up to ${ULIP_CHARGE_CAP_PCT}% a year, the IRDAI cap`, cuttable: false, unavoidable: false,
    });
    drafts.push({
      key: 'PMS_FEES', label: 'PMS fees', amount: pctOf(valueOf('PMS'), PMS_FIXED_FEE_PCT),
      detail: `Fixed fee · ${plural(countOf('PMS'), 'PMS account')}`, basis: 'ESTIMATE',
      estimateNote: `${PMS_FIXED_FEE_PCT}% a year, the usual fixed fee`, cuttable: false, unavoidable: false,
    });
  }

  // ── Trades in the last 12 months: charges, and the taxes on them ──
  const trades = await safe('trades', { charges: ZERO, taxes: ZERO, count: 0 }, async () => {
    const rows = await prisma.transaction.findMany({
      where: { portfolio: { userId }, tradeDate: { gte: from, lte: asOf } },
      select: { brokerage: true, exchangeCharges: true, sebiCharges: true, otherCharges: true, stt: true, stampDuty: true, gst: true },
    });
    let charges = ZERO;
    let taxes = ZERO;
    let count = 0;
    for (const t of rows) {
      const c = new Decimal(t.brokerage.toString()).plus(t.exchangeCharges.toString()).plus(t.sebiCharges.toString()).plus(t.otherCharges.toString());
      const x = new Decimal(t.stt.toString()).plus(t.stampDuty.toString()).plus(t.gst.toString());
      if (c.greaterThan(0) || x.greaterThan(0)) count += 1;
      charges = charges.plus(c);
      taxes = taxes.plus(x);
    }
    return { charges, taxes, count };
  });
  drafts.push({
    key: 'TRADING_CHARGES', label: 'Trading charges', amount: trades.charges,
    detail: `Brokerage and exchange fees · ${plural(trades.count, 'trade')}`, basis: 'DATA', estimateNote: null, cuttable: false, unavoidable: false,
  });
  drafts.push({
    key: 'TRADE_TAXES', label: 'Taxes on trades', amount: trades.taxes,
    detail: 'STT, stamp duty and GST · unavoidable', basis: 'DATA', estimateNote: null, cuttable: false, unavoidable: true,
  });

  // ── Exit loads: equity and hybrid fund units sold within a year of buying ──
  const exits = await safe('exitLoads', { amount: ZERO, count: 0 }, async () => {
    const rows = await prisma.capitalGain.findMany({
      where: { assetClass: 'MUTUAL_FUND', sellDate: { gte: from, lte: asOf }, sellTransaction: { portfolio: { userId } } },
      select: { buyDate: true, sellDate: true, sellAmount: true, sellTransactionId: true, sellTransaction: { select: { fund: { select: { category: true } } } } },
    });
    let amount = ZERO;
    const sales = new Set<string>();
    for (const r of rows) {
      const e = exitLoadEstimate(new Decimal(r.sellAmount.toString()), r.buyDate, r.sellDate, r.sellTransaction.fund?.category ?? null);
      if (!e) continue;
      amount = amount.plus(e);
      sales.add(r.sellTransactionId);
    }
    return { amount, count: sales.size };
  });
  drafts.push({
    key: 'EXIT_LOADS', label: 'Exit loads paid', amount: exits.amount,
    detail: `${plural(exits.count, 'early redemption')}`, basis: 'ESTIMATE',
    estimateNote: `${EXIT_LOAD_PCT}% on units sold within a year`, cuttable: false, unavoidable: false,
  });

  // ── Bank and card charges, from the spending the user agreed we may read ──
  const bank = await safe('bankCharges', { amount: ZERO, count: 0 }, async () => {
    if (!(await hasSpendingConsent(userId))) return { amount: ZERO, count: 0 };
    const rows = await prisma.spendTxn.findMany({
      where: { userId, direction: 'DEBIT', txnDate: { gte: from, lte: asOf }, duplicateOfId: null, excludeReason: null },
      select: { amount: true, narration: true, counterparty: true, category: true },
    });
    let amount = ZERO;
    let count = 0;
    for (const r of rows) {
      const text = `${r.narration ?? ''} ${r.counterparty ?? ''}`;
      if (!isBankCharge(text, r.category)) continue;
      amount = amount.plus(r.amount.toString());
      count += 1;
    }
    return { amount, count };
  });
  drafts.push({
    key: 'BANK_CARD_CHARGES', label: 'Bank and card charges', amount: bank.amount,
    detail: `SMS, ATM, late and annual fees · ${plural(bank.count, 'charge')}`, basis: 'DATA', estimateNote: null, cuttable: true, unavoidable: false,
  });

  const sources = drafts
    .filter((s) => s.amount.greaterThanOrEqualTo(0.5))
    .sort((a, b) => b.amount.comparedTo(a.amount))
    .map(({ amount, ...rest }) => ({ ...rest, amountInr: money(amount) }));
  const sum = (pick: (s: HiddenCostSource) => boolean) => sources.filter(pick).reduce((t, s) => t.plus(s.amountInr), ZERO);
  const total = sum(() => true);

  return {
    asOf: asOf.toISOString(),
    totalInr: money(total),
    estimatedInr: money(sum((s) => s.basis === 'ESTIMATE')),
    cuttableInr: money(sum((s) => s.cuttable)),
    compound: { years: COMPOUND_YEARS, ratePct: COMPOUND_RATE_PCT, valueInr: money(compoundYearly(total)) },
    sources,
    fundsWithoutTer,
    unavailable,
  };
}
