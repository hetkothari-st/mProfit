/**
 * AI Assistant — Layer 1 query classifier.
 *
 * Deterministic keyword + regex classifier that maps a natural-language
 * user question to one of a fixed set of intents. Runs *without* an LLM:
 * fast, cheap, no hallucination surface. The unclassifiable fallback
 * is `GENERAL`, which sends Claude a broad portfolio summary and lets
 * it answer conversationally.
 *
 * Order of checks matters — earlier keywords win. Ordering rationale:
 *   - Highly specific intents (WHAT_IF, TAX_DRAG, XIRR) checked first.
 *   - Broader intents (ALLOCATION, HEALTH) last.
 *   - `GENERAL` catches anything unmatched.
 */

export enum QueryIntent {
  XIRR_QUERY = 'xirr_query',
  TAX_DRAG = 'tax_drag',
  ALLOCATION_CHECK = 'allocation_check',
  GOAL_PROJECTION = 'goal_projection',
  NET_WORTH_COMPARE = 'net_worth_compare',
  DEBT_ANALYSIS = 'debt_analysis',
  WHAT_IF = 'what_if',
  PORTFOLIO_HEALTH = 'portfolio_health',
  BENCHMARK_COMPARE = 'benchmark_compare',
  REBALANCE_ADVICE = 'rebalance_advice',
  HOLDING_DETAIL = 'holding_detail',
  GENERAL = 'general',
}

export interface ClassifiedQuery {
  intent: QueryIntent;
  entity: string | null;
  amount: number | null;
  period: string | null;
  originalQuery: string;
}

/** Case-insensitive substring match against a list of keywords. */
function hasAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

/** Extract an amount like ₹5000, 5,000, "5k", "10 lakh", "1 crore". */
function extractAmount(text: string): number | null {
  // Explicit lakh / crore.
  const lakh = text.match(/(\d+(?:\.\d+)?)\s*lakh/);
  if (lakh) return Math.round(parseFloat(lakh[1]!) * 100_000);
  const cr = text.match(/(\d+(?:\.\d+)?)\s*(?:crore|cr)/);
  if (cr) return Math.round(parseFloat(cr[1]!) * 10_000_000);
  // Shorthand "5k".
  const kShort = text.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if (kShort) return Math.round(parseFloat(kShort[1]!) * 1_000);
  // Rupees with optional commas.
  const rupees = text.match(/₹\s*([\d,]+)/);
  if (rupees) return parseInt(rupees[1]!.replace(/,/g, ''), 10);
  // Bare number (last resort).
  const bare = text.match(/\b(\d{4,})\b/);
  if (bare) return parseInt(bare[1]!, 10);
  return null;
}

/** Extract entity: what follows "on", "of", "for", or "about". */
function extractEntityAfterPreposition(text: string): string | null {
  const m = text.match(/(?:on|of|for|about|in|from)\s+([a-z0-9][a-z0-9 &.'-]{2,60}?)(?:\s+(?:sip|fund|stock|shares?|holding|mf|portfolio|since|now|today|this|last|and|but|so)\b|[?.!,]|$)/i);
  if (!m) return null;
  let raw = m[1]!.trim();
  // Strip leading possessives ("my SBI Bluechip" → "SBI Bluechip").
  raw = raw.replace(/^(my|the|a|an|this|that|these|those)\s+/i, '').trim();
  if (!raw) return null;
  if (/^(my|the|a|an|this|that|these|those)$/i.test(raw)) return null;
  return raw;
}

/** Extract common time periods. */
function extractPeriod(text: string): string | null {
  if (/\b(this\s+year|ytd)\b/.test(text)) return 'YTD';
  if (/\blast\s+year\b/.test(text)) return '1Y';
  if (/\b(3\s*months?|3m|quarter|last quarter)\b/.test(text)) return '3M';
  if (/\b(6\s*months?|6m|half\s+year)\b/.test(text)) return '6M';
  if (/\b(1\s*year|1y|last\s+12\s+months?)\b/.test(text)) return '1Y';
  if (/\b(3\s*years?|3y)\b/.test(text)) return '3Y';
  if (/\b(5\s*years?|5y)\b/.test(text)) return '5Y';
  if (/\ball\s+time|since\s+inception|lifetime\b/.test(text)) return 'All';
  if (/\b(1\s*month|1m|last\s+month)\b/.test(text)) return '1M';
  return null;
}

/** Canonical sector token from a free-text mention. */
const SECTOR_ALIASES: Record<string, string> = {
  it: 'IT',
  tech: 'IT',
  technology: 'IT',
  software: 'IT',
  bank: 'Banking',
  banking: 'Banking',
  banks: 'Banking',
  financial: 'Financial Services',
  finance: 'Financial Services',
  pharma: 'Pharma',
  pharmaceutical: 'Pharma',
  healthcare: 'Healthcare',
  health: 'Healthcare',
  fmcg: 'FMCG',
  consumer: 'FMCG',
  auto: 'Auto',
  automotive: 'Auto',
  infra: 'Infrastructure',
  infrastructure: 'Infrastructure',
  power: 'Power',
  energy: 'Energy',
  oil: 'Oil & Gas',
  gas: 'Oil & Gas',
  metal: 'Metals',
  metals: 'Metals',
  cement: 'Cement',
  realty: 'Real Estate',
  telecom: 'Telecom',
};

function detectSector(text: string): string | null {
  for (const alias of Object.keys(SECTOR_ALIASES).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${alias}\\b`, 'i');
    if (re.test(text)) return SECTOR_ALIASES[alias]!;
  }
  return null;
}

const XIRR_KEYWORDS = [
  'xirr',
  'annualised return',
  'annualized return',
  'annualised returns',
  'returns on',
  'return on',
  'what return',
  'how much return',
  'cagr',
] as const;

const TAX_KEYWORDS = [
  'tax',
  'stcg',
  'ltcg',
  'capital gain',
  'capital gains',
  'tax drag',
  'sell now',
  'should i sell',
  'tax efficient',
  'tax loss',
  'harvest',
  'harvesting',
  'exemption',
] as const;

const ALLOCATION_KEYWORDS = [
  'overweight',
  'underweight',
  'too much in',
  'allocation',
  'exposure to',
  'exposure',
  'how much in',
  'percentage in',
  'weighted',
  '% in',
  'concentrated',
  'concentration',
] as const;

const GOAL_KEYWORDS = [
  'retire',
  'retirement',
  'goal',
  'on track',
  'reach',
  'achieve',
  'target',
  'how long',
  'when will i',
  'education',
  'house',
  'car',
  'wedding',
  'corpus',
] as const;

const NET_WORTH_KEYWORDS = [
  'net worth',
  'this year vs',
  'last year',
  'compared to',
  'grown',
  'growth',
  'how much have i',
  'total wealth',
  'wealth this year',
] as const;

const DEBT_KEYWORDS = [
  'emi',
  'loan',
  'interest',
  'credit card',
  'debt',
  'paying',
  'monthly payment',
  'principal',
  'prepay',
  'outstanding',
] as const;

const WHAT_IF_KEYWORDS = [
  'what if',
  'if i increase',
  'if i add',
  'if i invest',
  'suppose i',
  'hypothetically',
  'scenario',
  'if i put',
  'if i start',
  'if i change',
] as const;

const HEALTH_KEYWORDS = [
  'healthy',
  'health',
  'score',
  'how am i doing',
  'overall',
  'summary',
  'overview',
  'how is my portfolio',
] as const;

const BENCHMARK_KEYWORDS = [
  'vs nifty',
  'vs market',
  'benchmark',
  'beat the market',
  'index',
  'nifty 50',
  'nifty50',
  'sensex',
  'beating',
  'beat market',
] as const;

const REBALANCE_KEYWORDS = [
  'rebalance',
  'should i change',
  'should i switch',
  'restructure',
  'too concentrated',
  'diversify',
  'reallocate',
] as const;

const HOLDING_DETAIL_KEYWORDS = [
  'tell me about',
  'details on',
  'more about',
  'my holding',
  'my holdings',
  'top holding',
] as const;

export function classifyQuery(userMessage: string): ClassifiedQuery {
  const text = (userMessage ?? '').trim().toLowerCase();
  const original = userMessage ?? '';
  const amount = extractAmount(text);
  const period = extractPeriod(text);

  // WHAT_IF wins early — it may share keywords with other intents.
  if (hasAny(text, WHAT_IF_KEYWORDS)) {
    return {
      intent: QueryIntent.WHAT_IF,
      entity: extractEntityAfterPreposition(text),
      amount,
      period,
      originalQuery: original,
    };
  }

  if (hasAny(text, XIRR_KEYWORDS)) {
    return {
      intent: QueryIntent.XIRR_QUERY,
      entity: extractEntityAfterPreposition(text),
      amount,
      period,
      originalQuery: original,
    };
  }

  if (hasAny(text, TAX_KEYWORDS)) {
    return {
      intent: QueryIntent.TAX_DRAG,
      entity: extractEntityAfterPreposition(text),
      amount,
      period,
      originalQuery: original,
    };
  }

  if (hasAny(text, DEBT_KEYWORDS)) {
    return {
      intent: QueryIntent.DEBT_ANALYSIS,
      entity: null,
      amount,
      period,
      originalQuery: original,
    };
  }

  if (hasAny(text, BENCHMARK_KEYWORDS)) {
    return {
      intent: QueryIntent.BENCHMARK_COMPARE,
      entity: null,
      amount,
      period,
      originalQuery: original,
    };
  }

  if (hasAny(text, ALLOCATION_KEYWORDS)) {
    const sector = detectSector(text);
    return {
      intent: QueryIntent.ALLOCATION_CHECK,
      entity: sector ?? extractEntityAfterPreposition(text),
      amount,
      period,
      originalQuery: original,
    };
  }

  if (hasAny(text, GOAL_KEYWORDS)) {
    return {
      intent: QueryIntent.GOAL_PROJECTION,
      entity: extractEntityAfterPreposition(text),
      amount,
      period,
      originalQuery: original,
    };
  }

  if (hasAny(text, NET_WORTH_KEYWORDS)) {
    return {
      intent: QueryIntent.NET_WORTH_COMPARE,
      entity: null,
      amount,
      period,
      originalQuery: original,
    };
  }

  if (hasAny(text, REBALANCE_KEYWORDS)) {
    return {
      intent: QueryIntent.REBALANCE_ADVICE,
      entity: null,
      amount,
      period,
      originalQuery: original,
    };
  }

  if (hasAny(text, HEALTH_KEYWORDS)) {
    return {
      intent: QueryIntent.PORTFOLIO_HEALTH,
      entity: null,
      amount,
      period,
      originalQuery: original,
    };
  }

  if (hasAny(text, HOLDING_DETAIL_KEYWORDS)) {
    return {
      intent: QueryIntent.HOLDING_DETAIL,
      entity: extractEntityAfterPreposition(text),
      amount,
      period,
      originalQuery: original,
    };
  }

  return {
    intent: QueryIntent.GENERAL,
    entity: null,
    amount,
    period,
    originalQuery: original,
  };
}
