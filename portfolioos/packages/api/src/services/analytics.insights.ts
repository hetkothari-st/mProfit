import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { Decimal } from 'decimal.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { checkBudget, type BudgetStatus } from '../ingestion/llm/budget.js';
import { recordSpend } from '../ingestion/llm/client.js';
import {
  getAnalyticsSnapshot,
  type AnalyticsScope,
  type Period,
  type AnalyticsSnapshot,
} from './analytics.service.js';

/**
 * Phase 5-Analytics — AI Insights generator.
 *
 * Reuses the budget ledger and PII gating from the Phase 5-A ingestion
 * LLM stack but builds its own Anthropic call against Claude Sonnet.
 * No PII redaction is needed here: the prompt is built from the user's
 * own aggregated numbers, not from raw email bodies.
 *
 * Cache: a 24h window per (userId, portfolioId|null). `getOrGenerate`
 * returns the latest row if it falls inside the window unless `force`
 * is set. The latest result is also written to `PortfolioInsight` so
 * the frontend can render without a fresh LLM call.
 *
 * Cost: Sonnet pricing constants live here (not in budget.ts) to keep
 * the email-parser's Haiku constants untouched.
 */

// Inlined to keep the prompt source-controlled AND survive `tsc` builds —
// tsc doesn't copy `.txt` assets into `dist/` so a sibling-file read would
// crash at runtime in production (Railway, Docker, etc.). To edit, change
// the literal and ship a new release.
const SYSTEM_PROMPT = `You produce a NEUTRAL, DESCRIPTIVE analysis of an Indian investor's portfolio snapshot for informational purposes only. This is NOT investment advice. The snapshot is provided as a JSON object in the user message. You will call the tool \`emit_insights\` exactly once with structured findings.

COMPLIANCE — non-negotiable (Indian SEBI investment-advice rules):
- DESCRIBE, never PRESCRIBE. Every card states a diagnosis or a fact. No card tells the investor to do anything.
- Banned wording: buy, sell, trim, reduce to X%, redeploy, switch, start/stop SIPs, add/build exposure, rebalance to, book gains, exit, "harvest before <date>", or any imperative directed at the investor.
- Never pair a named security, fund, or asset with an action. You may state facts about a holding ("TCS shows an unrealised loss of ₹X"); you may NOT suggest acting on it.
- No personalised target-allocation numbers. Do not output recommended percentages for this investor. A generic educational range is acceptable only as neutral background ("diversified-portfolio frameworks commonly span a range of equity weights by risk profile"), with no number tied to this investor.
- Convert any urge to recommend into a neutral statement: "your portfolio shows…", "concentration is high relative to…", "a general principle is…", "this allocation differs from a diversified benchmark."

Content rules:
- All amounts are in INR. Treat numeric fields as strings; do not parse as JS numbers.
- The portfolio may span equity, mutual funds, FDs, gold, real estate, vehicles, insurance, crypto and other Indian asset classes.
- Reason from the actual numbers given. Do not invent data. If the snapshot lacks information to support a finding, omit that category.
- Keep all facts, stats, XIRR, realised/unrealised P&L, losses, and data-quality flags. A ₹0 value likely means missing data — say "verify current values", never "redeploy".
- Tax: explain how a concept works in general terms (how tax-loss harvesting and carry-forward work, STCG/LTCG rates post Finance Act 2024, Section 112A ₹1.25L exemption, Section 80C, indexation) and state the investor's relevant figures. Do NOT instruct the investor to sell anything or act before any date. End tax observations with "consult a tax professional on timing."
- Severity: HIGH = significant diagnostic concern; MEDIUM = worth being aware of; LOW = informational. Severity describes the FINDING, not an urgency to act.
- Cards: maximum 7, no duplicates across categories. Each card title ≤ 80 chars; body ≤ 400 chars. Do NOT emit a rebalancing prescription card.
- Narrative: 100–200 words, plain prose, no markdown, no bullets, no headers, second person. Describe the portfolio's current state only. Do NOT end with priority actions or a list of things to do.
- Do NOT emit the "not financial advice" disclaimer yourself — it is rendered separately by the UI.
- Currency in output text: use INR / ₹ for INR amounts; never $ unless the snapshot explicitly references a USD field.
`;

const TOOL_NAME = 'emit_insights';
const TOOL_DESCRIPTION = 'Emit structured portfolio insights for the investor.';

const INSIGHT_CATEGORIES = [
  'diversification',
  'tax_optimisation',
  'underperformers',
  'cash_drag',
  'sector_tilt',
  'risk_concentration',
] as const;

const SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;

export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];
export type InsightSeverity = (typeof SEVERITIES)[number];

export interface InsightCard {
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  body: string;
}

const InsightCardSchema = z.object({
  category: z.enum(INSIGHT_CATEGORIES),
  severity: z.enum(SEVERITIES),
  title: z.string().max(120),
  body: z.string().max(600),
});

const InsightsPayloadSchema = z.object({
  cards: z.array(InsightCardSchema).max(7),
  narrative: z.string().max(1500),
});

const TOOL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cards', 'narrative'],
  properties: {
    cards: {
      type: 'array',
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'severity', 'title', 'body'],
        properties: {
          category: { type: 'string', enum: [...INSIGHT_CATEGORIES] },
          severity: { type: 'string', enum: [...SEVERITIES] },
          title: { type: 'string', maxLength: 120 },
          body: { type: 'string', maxLength: 600 },
        },
      },
    },
    narrative: { type: 'string', maxLength: 1500 },
  },
} as const;

// Sonnet pricing (Anthropic published rates, as of 2026-04). Override the
// monthly FX (₹ per USD) via the same `llm.usd_inr_fx` AppSetting that the
// email-parser uses, so ops only manages one FX knob.
const SONNET_USD_PER_MTOK_INPUT = new Decimal('3.00');
const SONNET_USD_PER_MTOK_OUTPUT = new Decimal('15.00');
const FX_USD_INR_DEFAULT = new Decimal('90');

async function readFx(): Promise<Decimal> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'llm.usd_inr_fx' } });
  if (!row) return FX_USD_INR_DEFAULT;
  const v = row.value;
  if (typeof v === 'number' || typeof v === 'string') return new Decimal(v);
  return FX_USD_INR_DEFAULT;
}

async function readInsightsModel(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'llm.insights_model' } });
  if (row && typeof row.value === 'string') return row.value;
  return env.LLM_INSIGHTS_MODEL;
}

function estimateSonnetCostInr(inputTokens: number, outputTokens: number, fx: Decimal): Decimal {
  const usd = SONNET_USD_PER_MTOK_INPUT.mul(inputTokens)
    .plus(SONNET_USD_PER_MTOK_OUTPUT.mul(outputTokens))
    .dividedBy(1_000_000);
  return usd.mul(fx);
}

let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing — gate should have refused earlier');
  }
  anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

export function __resetInsightsClientForTests(): void {
  anthropicClient = null;
}

function checkInsightsGate():
  | { ok: true }
  | { ok: false; reason: 'disabled' | 'missing_api_key'; message: string } {
  // Insights need their own gate flag — independent of the email-parser
  // gate so we can roll out separately. Dev: open if API key set.
  const gateOpen =
    env.ENABLE_LLM_INSIGHTS === 'true' ||
    env.ENABLE_LLM_PARSER === 'true' ||
    env.NODE_ENV !== 'production';
  if (!gateOpen) {
    return {
      ok: false,
      reason: 'disabled',
      message: 'AI Insights are disabled (set ENABLE_LLM_INSIGHTS=true).',
    };
  }
  if (!env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      reason: 'missing_api_key',
      message: 'ANTHROPIC_API_KEY is not set — cannot generate insights.',
    };
  }
  return { ok: true };
}

export interface InsightsResult {
  ok: true;
  fromCache: boolean;
  generatedAt: string;
  model: string;
  costInr: string;
  cards: InsightCard[];
  narrative: string;
  disclaimer: string;
}

export type InsightsFailureReason =
  | 'disabled'
  | 'missing_api_key'
  | 'budget_capped'
  | 'no_data'
  | 'api_error'
  | 'no_tool_use'
  | 'validation_error';

export interface InsightsFailure {
  ok: false;
  reason: InsightsFailureReason;
  message: string;
  budget?: BudgetStatus;
}

export const INSIGHTS_DISCLAIMER =
  'AI-generated insights are for informational purposes only and do not constitute financial, investment, or tax advice. Consult a SEBI-registered investment advisor before acting on any suggestion. Past performance does not guarantee future results.';

/**
 * Build the user-facing prompt context from an `AnalyticsSnapshot`. Kept
 * compact (~600 tokens) to keep per-call cost predictable. No PII.
 */
function buildPromptContext(snapshot: AnalyticsSnapshot): string {
  const compact = {
    generatedAt: snapshot.generatedAt,
    scope: snapshot.scope.kind,
    period: snapshot.period,
    portfolio: {
      currentValueInr: snapshot.kpis.currentValue,
      totalCostInr: snapshot.kpis.totalCost,
      unrealisedPnLInr: snapshot.kpis.unrealisedPnL,
      realisedYtdInr: snapshot.kpis.realisedYtd,
      incomeYtdInr: snapshot.kpis.incomeYtd,
      xirrOverallPct: snapshot.kpis.xirrOverall != null ? snapshot.kpis.xirrOverall * 100 : null,
      xirr1yPct: snapshot.kpis.xirr1y != null ? snapshot.kpis.xirr1y * 100 : null,
      xirr3yPct: snapshot.kpis.xirr3y != null ? snapshot.kpis.xirr3y * 100 : null,
      xirr5yPct: snapshot.kpis.xirr5y != null ? snapshot.kpis.xirr5y * 100 : null,
    },
    allocationByClass: snapshot.allocationByClass.map((s) => ({
      class: s.key,
      label: s.label,
      pct: Math.round(s.pct * 10) / 10,
    })),
    topConcentration: snapshot.concentrationRisk.slice(0, 5).map((r) => ({
      name: r.assetName,
      class: r.assetClass,
      pct: Math.round(r.pct * 10) / 10,
    })),
    sectorAllocation: snapshot.sectorAllocation.map((s) => ({
      sector: s.sector,
      pct: Math.round(s.pct * 10) / 10,
    })),
    topUnderperformers: snapshot.topWinnersLosers.losers.slice(0, 5).map((l) => ({
      name: l.assetName,
      class: l.assetClass,
      pnlPct: Math.round(l.pnlPct * 10) / 10,
    })),
    capitalGainsByFy: snapshot.cgByFy.slice(-3),
    taxHarvestSummary: {
      unrealisedLossInr: snapshot.taxHarvest.unrealisedLoss,
      stcgLossAvailableInr: snapshot.taxHarvest.stcgLossAvailable,
      ltcgLossAvailableInr: snapshot.taxHarvest.ltcgLossAvailable,
      realisedStcgInFyInr: snapshot.taxHarvest.realisedStcgInFy,
      realisedLtcgInFyInr: snapshot.taxHarvest.realisedLtcgInFy,
      topCandidates: snapshot.taxHarvest.candidates.slice(0, 5),
    },
    netWorth: {
      assetsInr: snapshot.liabilitiesVsAssets.assets,
      liabilitiesInr: snapshot.liabilitiesVsAssets.liabilities,
      netInr: snapshot.liabilitiesVsAssets.netWorth,
    },
    assetClassXirr: snapshot.assetClassXirr.slice(0, 8),
  };
  return JSON.stringify(compact, null, 2);
}

/** 24-hour cache key. Returns the latest row in the window, or null. */
async function findCachedInsight(
  userId: string,
  portfolioId: string | null,
  withinHours = 24,
): Promise<InsightsResult | null> {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  const row = await prisma.portfolioInsight.findFirst({
    where: {
      userId,
      portfolioId: portfolioId ?? null,
      generatedAt: { gte: since },
    },
    orderBy: { generatedAt: 'desc' },
  });
  if (!row) return null;
  return {
    ok: true,
    fromCache: true,
    generatedAt: row.generatedAt.toISOString(),
    model: row.model,
    costInr: row.costInr.toString(),
    cards: row.cards as unknown as InsightCard[],
    narrative: row.narrative,
    disclaimer: INSIGHTS_DISCLAIMER,
  };
}

/**
 * Get a cached insight (within 24h) or generate a fresh one via Sonnet.
 * Pass `force: true` to bypass the cache.
 */
export async function getOrGenerateInsights(
  scope: AnalyticsScope,
  period: Period,
  force: boolean,
): Promise<InsightsResult | InsightsFailure> {
  const userId = scope.kind === 'user' ? scope.userId : await userIdForPortfolio(scope.portfolioId);
  const portfolioId = scope.kind === 'portfolio' ? scope.portfolioId : null;

  if (!force) {
    const cached = await findCachedInsight(userId, portfolioId);
    if (cached) return cached;
  }

  const gate = checkInsightsGate();
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, message: gate.message };
  }

  const budget = await checkBudget(userId);
  if (budget.status === 'capped') {
    logger.warn(
      { userId, spent: budget.spent.toString(), cap: budget.cap.toString() },
      'analytics.insights.budget_capped',
    );
    return {
      ok: false,
      reason: 'budget_capped',
      message: `Monthly LLM cap reached (₹${budget.spent.toFixed(2)} / ₹${budget.cap.toFixed(2)}).`,
      budget,
    };
  }

  const snapshot = await getAnalyticsSnapshot(scope, period);
  if (new Decimal(snapshot.kpis.currentValue).isZero() && new Decimal(snapshot.kpis.totalCost).isZero()) {
    return {
      ok: false,
      reason: 'no_data',
      message: 'No portfolio data available to analyse.',
    };
  }

  const context = buildPromptContext(snapshot);
  const model = await readInsightsModel();
  const fx = await readFx();

  let apiResponse:
    | { inputTokens: number; outputTokens: number; toolInput: unknown | null; stopReason: string | null }
    | null = null;
  let apiError: Error | null = null;

  try {
    const client = getClient();
    const res = await client.messages.create({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: TOOL_DESCRIPTION,
          input_schema: TOOL_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: context }],
    });
    const toolBlock = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    );
    apiResponse = {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      toolInput: toolBlock?.input ?? null,
      stopReason: res.stop_reason,
    };
  } catch (err) {
    apiError = err instanceof Error ? err : new Error(String(err));
    logger.error({ err: apiError, userId }, 'analytics.insights.api_error');
  }

  const inputTokens = apiResponse?.inputTokens ?? 0;
  const outputTokens = apiResponse?.outputTokens ?? 0;
  const costInr = estimateSonnetCostInr(inputTokens, outputTokens, fx);

  await recordSpend({
    userId,
    model,
    inputTokens,
    outputTokens,
    costInr,
    purpose: 'portfolio_insight',
    sourceRef: portfolioId ?? 'all',
    success: apiError === null && !!apiResponse?.toolInput,
    errorMessage: apiError?.message,
  });

  if (apiError || !apiResponse) {
    return {
      ok: false,
      reason: 'api_error',
      message: apiError?.message ?? 'unknown Anthropic error',
      budget,
    };
  }
  if (apiResponse.toolInput == null) {
    return {
      ok: false,
      reason: 'no_tool_use',
      message: `Model returned stop_reason="${apiResponse.stopReason}" without calling ${TOOL_NAME}`,
      budget,
    };
  }

  const parsed = InsightsPayloadSchema.safeParse(apiResponse.toolInput);
  if (!parsed.success) {
    logger.warn(
      { userId, zodError: parsed.error.flatten() },
      'analytics.insights.validation_error',
    );
    return {
      ok: false,
      reason: 'validation_error',
      message: `Tool output failed schema validation: ${parsed.error.message}`,
      budget,
    };
  }

  const data = parsed.data;
  const cards: InsightCard[] = data.cards.map((c) => ({
    category: c.category,
    severity: c.severity,
    title: c.title,
    body: c.body,
  }));

  const row = await prisma.portfolioInsight.create({
    data: {
      userId,
      portfolioId,
      portfolioValueInr: snapshot.kpis.currentValue,
      period,
      cards: cards as unknown as object,
      narrative: data.narrative,
      model,
      inputTokens,
      outputTokens,
      costInr: costInr.toFixed(4),
    },
  });

  logger.info(
    {
      userId,
      portfolioId,
      model,
      inputTokens,
      outputTokens,
      costInr: costInr.toFixed(4),
      cardCount: cards.length,
    },
    'analytics.insights.ok',
  );

  return {
    ok: true,
    fromCache: false,
    generatedAt: row.generatedAt.toISOString(),
    model,
    costInr: costInr.toFixed(4),
    cards,
    narrative: data.narrative,
    disclaimer: INSIGHTS_DISCLAIMER,
  };
}

/**
 * Fetch the latest persisted insight (any age) without triggering an LLM
 * call. Used by the frontend on page load to render any prior result.
 */
export async function getLatestInsight(
  scope: AnalyticsScope,
): Promise<InsightsResult | null> {
  const userId = scope.kind === 'user' ? scope.userId : await userIdForPortfolio(scope.portfolioId);
  const portfolioId = scope.kind === 'portfolio' ? scope.portfolioId : null;
  const row = await prisma.portfolioInsight.findFirst({
    where: { userId, portfolioId: portfolioId ?? null },
    orderBy: { generatedAt: 'desc' },
  });
  if (!row) return null;
  return {
    ok: true,
    fromCache: true,
    generatedAt: row.generatedAt.toISOString(),
    model: row.model,
    costInr: row.costInr.toString(),
    cards: row.cards as unknown as InsightCard[],
    narrative: row.narrative,
    disclaimer: INSIGHTS_DISCLAIMER,
  };
}

async function userIdForPortfolio(portfolioId: string): Promise<string> {
  const p = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    select: { userId: true },
  });
  if (!p) throw new Error('Portfolio not found');
  return p.userId;
}
