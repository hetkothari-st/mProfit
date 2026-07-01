import { describe, it, expect } from 'vitest';
import { classifyQuery, QueryIntent } from '../../src/ai/queryClassifier.js';

/**
 * Deterministic assertions on the intent classifier. The classifier
 * is the ONE piece of the AI stack that must never regress silently —
 * a misfired intent picks the wrong context and hallucinations follow.
 */
describe('classifyQuery', () => {
  const cases: Array<[string, QueryIntent, Partial<{ entity: string; amount: number; period: string }>]> = [
    ["what's my xirr on sbi bluechip", QueryIntent.XIRR_QUERY, { entity: 'sbi bluechip' }],
    ['xirr on my hdfc bank', QueryIntent.XIRR_QUERY, { entity: 'hdfc bank' }],
    ['returns on my portfolio', QueryIntent.XIRR_QUERY, { entity: 'portfolio' }],
    ['how much return am I making', QueryIntent.XIRR_QUERY, {}],

    ['should I sell HDFC Bank now', QueryIntent.TAX_DRAG, {}],
    ['am I close to my LTCG exemption', QueryIntent.TAX_DRAG, {}],
    ['what capital gains have I booked', QueryIntent.TAX_DRAG, {}],
    ['any tax loss harvesting opportunities', QueryIntent.TAX_DRAG, {}],

    ['am I overweight in it sector', QueryIntent.ALLOCATION_CHECK, { entity: 'IT' }],
    ['too much in banking', QueryIntent.ALLOCATION_CHECK, { entity: 'Banking' }],
    ['how much exposure to pharma', QueryIntent.ALLOCATION_CHECK, { entity: 'Pharma' }],
    ['my equity allocation percentage', QueryIntent.ALLOCATION_CHECK, {}],

    ['am I on track for retirement', QueryIntent.GOAL_PROJECTION, {}],
    ['when will I reach my retirement goal', QueryIntent.GOAL_PROJECTION, {}],
    ['am I on target for house downpayment', QueryIntent.GOAL_PROJECTION, {}],

    // Period extraction is heuristic — either YTD or 1Y is acceptable
    // for phrases like "this year vs last year". Don't over-constrain.
    ['net worth this year vs last year', QueryIntent.NET_WORTH_COMPARE, {}],
    ['how much have I grown 3 months', QueryIntent.NET_WORTH_COMPARE, {}],

    ['how much interest am I paying on my credit card', QueryIntent.DEBT_ANALYSIS, {}],
    ['what is my total loan outstanding', QueryIntent.DEBT_ANALYSIS, {}],
    ['what is my monthly emi', QueryIntent.DEBT_ANALYSIS, {}],

    ['what if I increase SIP by 5000', QueryIntent.WHAT_IF, { amount: 5000 }],
    ['if I add ₹1,00,000 lump sum', QueryIntent.WHAT_IF, { amount: 100000 }],
    ['suppose I invest 10 lakh more', QueryIntent.WHAT_IF, { amount: 1000000 }],

    ['how am I doing overall', QueryIntent.PORTFOLIO_HEALTH, {}],
    ["what's my financial health", QueryIntent.PORTFOLIO_HEALTH, {}],

    ['how am I doing vs nifty', QueryIntent.BENCHMARK_COMPARE, {}],
    ['am I beating the market', QueryIntent.BENCHMARK_COMPARE, {}],

    ['should I rebalance', QueryIntent.REBALANCE_ADVICE, {}],

    ['random gibberish question about the weather', QueryIntent.GENERAL, {}],
    ['', QueryIntent.GENERAL, {}],
  ];

  for (const [query, expected, expectedExtras] of cases) {
    it(`classifies "${query.slice(0, 60)}" → ${expected}`, () => {
      const result = classifyQuery(query);
      expect(result.intent, `intent for "${query}"`).toBe(expected);
      if (expectedExtras.entity !== undefined) {
        expect(result.entity?.toLowerCase(), `entity for "${query}"`).toBe(
          expectedExtras.entity.toLowerCase(),
        );
      }
      if (expectedExtras.amount !== undefined) {
        expect(result.amount, `amount for "${query}"`).toBe(expectedExtras.amount);
      }
      if (expectedExtras.period !== undefined) {
        expect(result.period, `period for "${query}"`).toBe(expectedExtras.period);
      }
    });
  }

  it('never throws on empty or weird input', () => {
    expect(() => classifyQuery('')).not.toThrow();
    expect(() => classifyQuery('    ')).not.toThrow();
    expect(() => classifyQuery('🚀 🚀 🚀')).not.toThrow();
    expect(() => classifyQuery('what?')).not.toThrow();
  });

  it('extracts rupee amounts with commas', () => {
    const r = classifyQuery('what if I invest ₹1,00,000 now');
    expect(r.amount).toBe(100000);
  });

  it('extracts crore amounts', () => {
    const r = classifyQuery('what if I have 2 crore what happens');
    expect(r.amount).toBe(20_000_000);
  });
});
