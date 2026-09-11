/**
 * The tools the adviser can call mid-answer. Each one reads an existing
 * service — the same numbers the Advisor, Goals, Tax and Insurance pages show
 * — so the adviser never has to do arithmetic of its own. Most answers need
 * none: the client's facts arrive with the question; tools are for detail.
 *
 * A tool never throws at the model. A failure comes back as `ok: false` with
 * a plain message, and the adviser is told to say so rather than estimate.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { Decimal } from 'decimal.js';
import { logger } from '../lib/logger.js';
import { buildTaxSummary } from '../services/tax.service.js';
import { listRecommendations } from '../services/advisor/advisorRecommendations.service.js';
import { computeHealthScore } from '../services/healthScore.service.js';
import { requiredMonthlySip } from '../services/goalMath.js';
import type { AdvisorAssetBucketValue, AdvisorFacts } from '../services/advisor/types.js';
import { buildInsuranceData } from './contextBuilder.js';
import { QueryIntent } from './queryClassifier.js';
import { searchKnowledge } from './knowledge/search.js';

export interface ToolContext {
  userId: string;
  facts: AdvisorFacts | null;
  financialYear: string;
}

export interface ToolOutcome {
  ok: boolean;
  result: unknown;
}

const obj = (properties: Record<string, unknown>, required: string[] = []): Anthropic.Tool['input_schema'] => ({
  type: 'object',
  properties,
  ...(required.length > 0 ? { required } : {}),
});

const BUCKETS: AdvisorAssetBucketValue[] = [
  'EQUITY_DOMESTIC',
  'EQUITY_INTERNATIONAL',
  'DEBT',
  'GOLD',
  'REAL_ASSETS',
  'CASH_EQUIVALENT',
  'OTHER_ALT',
];

export const ADVISOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_holdings',
    description:
      "The client's holdings, largest first, with value, cost, unrealised gain and share of the portfolio. Use for questions about specific holdings or concentration.",
    input_schema: obj({
      limit: { type: 'integer', minimum: 1, maximum: 25, description: 'How many holdings (default 10).' },
      bucket: { type: 'string', enum: BUCKETS, description: 'Only holdings in this asset bucket.' },
    }),
  },
  {
    name: 'get_goal_projection',
    description:
      "The client's goals: target, current value, years left, whether on track, the return needed, and the SIP needed at the goal's expected return.",
    input_schema: obj({ goalName: { type: 'string', description: 'Part of the goal name, to pick one goal.' } }),
  },
  {
    name: 'compute_sip_for_goal',
    description:
      'The monthly SIP needed to reach a goal. Either name a goal on file, or give targetAmount (₹) and years, and optionally currentAmount (₹). annualReturnPct is an assumption — say so when you quote the result.',
    input_schema: obj({
      goalName: { type: 'string' },
      targetAmount: { type: 'string', description: 'Rupees, digits only.' },
      currentAmount: { type: 'string', description: 'Rupees already saved towards it.' },
      years: { type: 'number' },
      annualReturnPct: { type: 'number', description: 'Assumed yearly return; omit for no growth.' },
    }),
  },
  {
    name: 'get_tax_harvest_candidates',
    description:
      'Holdings with unrealised gains or losses that could be booked to save tax, with the statutory capital-gains rates to value them at.',
    input_schema: obj({}),
  },
  {
    name: 'get_capital_gains_summary',
    description: "Realised capital gains and estimated tax for a financial year (default: the current one).",
    input_schema: obj({ financialYear: { type: 'string', description: 'Like 2026-27.' } }),
  },
  {
    name: 'get_advisor_recommendations',
    description: "The adviser engine's open recommendations for this client — rebalancing, harvesting, goal SIPs and so on.",
    input_schema: obj({}),
  },
  {
    name: 'get_approved_products',
    description:
      'The products the firm has approved, by asset bucket. The ONLY specific products you may name. Empty means speak in categories only.',
    input_schema: obj({ bucket: { type: 'string', enum: BUCKETS } }),
  },
  {
    name: 'get_health_score',
    description: "The client's financial health score and its parts, each with an insight and an action.",
    input_schema: obj({}),
  },
  {
    name: 'get_insurance_overview',
    description:
      "The client's insurance policies, premiums due, open claims and nominee gaps, plus the matching Help and rights topics with their official sources.",
    input_schema: obj({ question: { type: 'string', description: 'The insurance question, to pick help topics.' } }),
  },
  {
    name: 'plan_passive_income',
    description:
      'Sizes a monthly passive-income goal: the corpus that can pay it at a withdrawal rate (after inflation to the start date), and the monthly SIP that builds that corpus for each horizon and assumed return. Use for "how do I get ₹X a month" or retirement-income questions. Defaults: 10, 15 and 20 years; 10% and 12% returns; 4% withdrawal; 6% inflation.',
    input_schema: obj(
      {
        monthlyIncome: { type: 'string', description: "Monthly income wanted, in today's rupees, digits only." },
        yearsToStart: { type: 'array', items: { type: 'number' }, description: 'Years until the income should start.' },
        annualReturnPct: { type: 'array', items: { type: 'number' }, description: 'Assumed yearly returns while building.' },
        withdrawalRatePct: { type: 'number', description: 'Share of the corpus drawn each year (default 4).' },
        inflationPct: { type: 'number', description: 'Yearly inflation (default 6).' },
        currentCorpus: { type: 'string', description: 'Rupees already set aside for this goal.' },
      },
      ['monthlyIncome'],
    ),
  },
  {
    name: 'search_knowledge',
    description:
      'Search the adviser library: principles from The Intelligent Investor, The Little Book of Common Sense Investing, A Random Walk Down Wall Street, The Psychology of Money and Let’s Talk Money, plus the planning framework.',
    input_schema: obj({ query: { type: 'string' } }, ['query']),
  },
];

const str = (d: Decimal) => d.toString();
const pct = (part: Decimal, whole: Decimal) =>
  whole.greaterThan(0) ? part.dividedBy(whole).times(100).toDecimalPlaces(1).toNumber() : 0;

function need(facts: AdvisorFacts | null): AdvisorFacts {
  if (!facts) throw new Error('Portfolio facts are not available right now.');
  return facts;
}

function decimalFrom(v: unknown): Decimal | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).replace(/[,₹\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return new Decimal(s);
}

type Executor = (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

const EXECUTORS: Record<string, Executor> = {
  async get_holdings(input, ctx) {
    const f = need(ctx.facts);
    const limit = Math.min(25, Math.max(1, typeof input['limit'] === 'number' ? Math.floor(input['limit']) : 10));
    const rows = f.holdings
      .filter((h) => !input['bucket'] || h.bucket === input['bucket'])
      .sort((a, b) => b.currentValue.comparedTo(a.currentValue))
      .slice(0, limit);
    return {
      totalPortfolioValue: str(f.totalPortfolioValue),
      holdings: rows.map((h) => ({
        name: h.assetName,
        assetClass: h.assetClass,
        bucket: h.bucket,
        value: str(h.currentValue),
        invested: str(h.totalCost),
        unrealisedGain: str(h.unrealisedPnL),
        shareOfPortfolioPct: pct(h.currentValue, f.totalPortfolioValue),
        priceStale: h.priceStale,
      })),
    };
  },

  async get_goal_projection(input, ctx) {
    const f = need(ctx.facts);
    const q = typeof input['goalName'] === 'string' ? input['goalName'].toLowerCase() : '';
    const goals = f.goals.filter((g) => !q || g.name.toLowerCase().includes(q));
    return {
      goals: goals.map((g) => {
        const sip = requiredMonthlySip(g.remaining, g.yearsRemaining, g.expectedReturnPct);
        return {
          name: g.name,
          category: g.category,
          priority: g.priority,
          target: str(g.targetAmount),
          current: str(g.currentValue),
          remaining: str(g.remaining),
          yearsRemaining: g.yearsRemaining,
          onTrack: g.isOnTrack,
          requiredReturnPct: g.requiredCagr,
          expectedReturnPct: g.expectedReturnPct,
          currentMonthlyContribution: g.currentMonthlyContribution ? str(g.currentMonthlyContribution) : null,
          monthlySipNeeded: sip ? sip.toDecimalPlaces(0, Decimal.ROUND_UP).toString() : null,
        };
      }),
    };
  },

  async compute_sip_for_goal(input, ctx) {
    let remaining: Decimal | null;
    let years: number | null;
    let rate: number | null = typeof input['annualReturnPct'] === 'number' ? input['annualReturnPct'] : null;

    if (typeof input['goalName'] === 'string' && input['goalName'].trim()) {
      const f = need(ctx.facts);
      const q = input['goalName'].toLowerCase();
      const goal = f.goals.find((g) => g.name.toLowerCase().includes(q));
      if (!goal) throw new Error(`No goal named like "${input['goalName']}" is on file.`);
      remaining = goal.remaining;
      years = typeof input['years'] === 'number' ? input['years'] : goal.yearsRemaining;
      rate ??= goal.expectedReturnPct;
    } else {
      const target = decimalFrom(input['targetAmount']);
      const current = decimalFrom(input['currentAmount']) ?? new Decimal(0);
      remaining = target ? target.minus(current) : null;
      years = typeof input['years'] === 'number' ? input['years'] : null;
    }
    if (!remaining || remaining.lessThanOrEqualTo(0) || !years || years <= 0) {
      throw new Error('Give a positive amount still to save and a number of years.');
    }
    const sip = requiredMonthlySip(remaining, years, rate);
    if (!sip) throw new Error('That goal needs no further saving.');
    return {
      remaining: str(remaining),
      years,
      annualReturnPct: rate,
      monthlySip: sip.toDecimalPlaces(0, Decimal.ROUND_UP).toString(),
      assumption:
        rate === null || rate === 0
          ? 'No growth assumed.'
          : `Assumes ${rate}% a year — an assumption, not a promise.`,
    };
  },

  async get_tax_harvest_candidates(_input, ctx) {
    const f = need(ctx.facts);
    return {
      capitalGainsRates: f.capitalGainsRates,
      note: 'Value any tax saving at the statutory capital-gains rate for its type, never the income slab.',
      candidates: f.harvestCandidates.slice(0, 20).map((h) => ({
        name: h.assetName,
        assetClass: h.assetClass,
        value: str(h.currentValue),
        unrealisedGainOrLoss: str(h.unrealisedPnL),
        classification: h.classification,
        longTermEligible: h.longTermEligible,
        priceStale: h.priceStale,
      })),
    };
  },

  async get_capital_gains_summary(input, ctx) {
    const fy = typeof input['financialYear'] === 'string' && /^\d{4}-\d{2}$/.test(input['financialYear'])
      ? input['financialYear']
      : ctx.financialYear;
    try {
      const s = await buildTaxSummary(ctx.userId, fy);
      return {
        financialYear: s.financialYear,
        rates: s.rates,
        capitalGains: s.capitalGains,
        totalRealisedGain: s.totalRealisedGain,
        totalEstimatedTax: s.totalEstimatedTax,
      };
    } catch (err) {
      throw new Error(`Couldn't load the capital-gains summary right now (${err instanceof Error ? err.message : 'error'}).`);
    }
  },

  async get_advisor_recommendations(_input, ctx) {
    const recs = await listRecommendations(ctx.userId, { status: 'OPEN', limit: 10 });
    return {
      recommendations: recs.map((r) => ({
        category: r.category,
        priority: r.priority,
        rationale: r.rationale,
        actions: r.action.map((a) => ({ direction: a.direction, instrument: a.instrumentName, amountInr: a.amountInr })),
        createdAt: r.createdAt,
      })),
    };
  },

  async get_approved_products(input, ctx) {
    const f = need(ctx.facts);
    const byBucket: Partial<Record<AdvisorAssetBucketValue, string[]>> = {};
    for (const b of BUCKETS) {
      if (input['bucket'] && input['bucket'] !== b) continue;
      const labels = f.approvedProducts[b].map((p) => p.label);
      if (labels.length > 0) byBucket[b] = labels;
    }
    return Object.keys(byBucket).length > 0
      ? { byBucket }
      : { byBucket, note: 'No approved products are on file — speak in categories only.' };
  },

  async get_health_score(_input, ctx) {
    const h = await computeHealthScore(ctx.userId);
    return { overallScore: h.overallScore, grade: h.grade, subScores: h.subScores, computedAt: h.computedAt };
  },

  async get_insurance_overview(input, ctx) {
    const question = typeof input['question'] === 'string' ? input['question'] : '';
    return buildInsuranceData(ctx.userId, {
      intent: QueryIntent.INSURANCE,
      entity: null,
      amount: null,
      period: null,
      originalQuery: question,
    });
  },

  async plan_passive_income(input) {
    const monthly = decimalFrom(input['monthlyIncome']);
    if (!monthly || monthly.lessThanOrEqualTo(0)) throw new Error("Give the monthly income wanted, in today's rupees.");
    const numbers = (v: unknown, fallback: number[], min: number, max: number): number[] => {
      const list = Array.isArray(v) ? v : typeof v === 'number' ? [v] : fallback;
      const clean = list.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max);
      return (clean.length > 0 ? clean : fallback).slice(0, 4);
    };
    const horizons = numbers(input['yearsToStart'], [10, 15, 20], 1, 40);
    const returns = numbers(input['annualReturnPct'], [10, 12], 0, 20);
    const withdrawal = numbers(input['withdrawalRatePct'], [4], 2, 10)[0]!;
    const inflation = numbers(input['inflationPct'], [6], 0, 15)[0]!;
    const current = decimalFrom(input['currentCorpus']) ?? new Decimal(0);

    const rupees = (x: Decimal) => x.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString();
    const corpusFor = (income: Decimal) => income.times(12).dividedBy(new Decimal(withdrawal).dividedBy(100));
    return {
      assumptions: {
        withdrawalRatePct: withdrawal,
        inflationPct: inflation,
        note: 'Returns, inflation and the withdrawal rate are assumptions, not promises. The corpus is what can pay the income at that withdrawal rate; the SIP builds it by the start date.',
      },
      monthlyIncomeToday: rupees(monthly),
      corpusIfStartingNow: rupees(corpusFor(monthly)),
      currentCorpus: rupees(current),
      scenarios: horizons.map((years) => {
        const incomeThen = monthly.times(new Decimal(1).plus(new Decimal(inflation).dividedBy(100)).pow(years));
        const corpus = corpusFor(incomeThen);
        return {
          yearsToStart: years,
          monthlyIncomeThen: rupees(incomeThen),
          corpusNeeded: rupees(corpus),
          sipByReturn: returns.map((r) => {
            const grown = current.times(new Decimal(1).plus(new Decimal(r).dividedBy(1200)).pow(Math.round(years * 12)));
            const sip = requiredMonthlySip(corpus.minus(grown), years, r);
            return { annualReturnPct: r, monthlySip: sip ? sip.toDecimalPlaces(0, Decimal.ROUND_UP).toString() : '0' };
          }),
        };
      }),
    };
  },

  async search_knowledge(input) {
    const q = typeof input['query'] === 'string' ? input['query'] : '';
    return {
      passages: searchKnowledge(q, { limit: 4 }).map(({ entry: e }) => ({
        id: e.id,
        title: e.title,
        credit: e.source.kind === 'BOOK' ? `${e.source.book}, ${e.source.author}` : 'Planning framework',
        principle: e.principle,
        inPractice: e.inPractice ?? null,
      })),
    };
  },
};

/** Run one tool call. Never throws: failures come back as ok:false with a plain message. */
export async function runAdvisorTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const exec = EXECUTORS[name];
  if (!exec) return { ok: false, result: { error: `Unknown tool "${name}".` } };
  try {
    const args = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return { ok: true, result: await exec(args, ctx) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ tool: name, err: message }, '[ai.tools] tool failed');
    return { ok: false, result: { error: message } };
  }
}
