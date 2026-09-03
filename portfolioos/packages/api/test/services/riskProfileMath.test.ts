import { describe, it, expect } from 'vitest';
import {
  ageBasedEquityGuidelinePct,
  categoryForScore,
  scoreRiskQuestionnaire,
  AGGRESSIVE_AGE_CAP,
  TAX_SLAB_PCT,
  type RiskAnswers,
} from '../../src/services/riskProfileMath.js';

function answers(overrides: Partial<RiskAnswers> = {}): RiskAnswers {
  return {
    age: 35,
    horizon: 'Y7_15',
    drawdownReaction: 'HOLD',
    investableShareOfIncome: 'PCT_10_20',
    objective: 'BALANCED_GROWTH',
    hasEmergencyFund: true,
    taxSlab: 'PCT_30',
    ...overrides,
  };
}

describe('ageBasedEquityGuidelinePct', () => {
  it('returns 100 - age for a normal age', () => {
    expect(ageBasedEquityGuidelinePct(35)).toBe(65);
  });

  it('floors at 0 rather than going negative for a very old age', () => {
    expect(ageBasedEquityGuidelinePct(120)).toBe(0);
  });

  it('returns null for unknown age so callers cannot silently advise on a guess', () => {
    expect(ageBasedEquityGuidelinePct(null)).toBeNull();
    expect(ageBasedEquityGuidelinePct(0)).toBeNull();
    expect(ageBasedEquityGuidelinePct(Number.NaN)).toBeNull();
  });
});

describe('categoryForScore', () => {
  it('maps each band to its category', () => {
    expect(categoryForScore(0)).toBe('CONSERVATIVE');
    expect(categoryForScore(29)).toBe('CONSERVATIVE');
    expect(categoryForScore(30)).toBe('BALANCED');
    expect(categoryForScore(54)).toBe('BALANCED');
    expect(categoryForScore(55)).toBe('GROWTH');
    expect(categoryForScore(79)).toBe('GROWTH');
    expect(categoryForScore(80)).toBe('AGGRESSIVE');
    expect(categoryForScore(100)).toBe('AGGRESSIVE');
  });
});

describe('scoreRiskQuestionnaire', () => {
  it('scores the most cautious answer set at 0 / CONSERVATIVE', () => {
    const out = scoreRiskQuestionnaire(
      answers({
        horizon: 'LT_3Y',
        drawdownReaction: 'SELL_ALL',
        investableShareOfIncome: 'LT_10',
        objective: 'PRESERVE',
      }),
    );
    expect(out.score).toBe(0);
    expect(out.category).toBe('CONSERVATIVE');
    expect(out.overrides).toEqual([]);
  });

  it('scores the boldest answer set at 100 / AGGRESSIVE', () => {
    const out = scoreRiskQuestionnaire(
      answers({
        age: 30,
        horizon: 'GT_15Y',
        drawdownReaction: 'BUY_MORE',
        investableShareOfIncome: 'GT_35',
        objective: 'MAX_GROWTH',
      }),
    );
    expect(out.score).toBe(100);
    expect(out.category).toBe('AGGRESSIVE');
    expect(out.overrides).toEqual([]);
  });

  it('never returns a score outside 0-100', () => {
    const out = scoreRiskQuestionnaire(answers());
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
  });

  it('caps AGGRESSIVE to GROWTH at the age cap, and records why', () => {
    const out = scoreRiskQuestionnaire(
      answers({
        age: AGGRESSIVE_AGE_CAP,
        horizon: 'GT_15Y',
        drawdownReaction: 'BUY_MORE',
        investableShareOfIncome: 'GT_35',
        objective: 'MAX_GROWTH',
      }),
    );
    expect(out.category).toBe('GROWTH');
    expect(out.overrides).toHaveLength(1);
    expect(out.overrides[0]!.rule).toBe('AGE_CAP');
    expect(out.overrides[0]!.from).toBe('AGGRESSIVE');
    expect(out.overrides[0]!.to).toBe('GROWTH');
  });

  it('steps risk down one band when there is no emergency fund', () => {
    const out = scoreRiskQuestionnaire(
      answers({
        age: 30,
        horizon: 'GT_15Y',
        drawdownReaction: 'BUY_MORE',
        investableShareOfIncome: 'GT_35',
        objective: 'MAX_GROWTH',
        hasEmergencyFund: false,
      }),
    );
    expect(out.category).toBe('GROWTH');
    expect(out.overrides.map((o) => o.rule)).toEqual(['NO_EMERGENCY_FUND']);
  });

  it('applies the age cap and the emergency-fund step together, worst case first', () => {
    const out = scoreRiskQuestionnaire(
      answers({
        age: 60,
        horizon: 'GT_15Y',
        drawdownReaction: 'BUY_MORE',
        investableShareOfIncome: 'GT_35',
        objective: 'MAX_GROWTH',
        hasEmergencyFund: false,
      }),
    );
    expect(out.category).toBe('BALANCED');
    expect(out.overrides.map((o) => o.rule)).toEqual(['AGE_CAP', 'NO_EMERGENCY_FUND']);
  });

  it('guardrails only ever reduce risk, never raise it', () => {
    const cautious = answers({
      age: 70,
      horizon: 'LT_3Y',
      drawdownReaction: 'SELL_ALL',
      investableShareOfIncome: 'LT_10',
      objective: 'PRESERVE',
      hasEmergencyFund: false,
    });
    const out = scoreRiskQuestionnaire(cautious);
    expect(out.category).toBe('CONSERVATIVE');
    expect(out.overrides).toEqual([]);
  });

  it('keeps an unsure tax slab null rather than assuming the top rate', () => {
    expect(scoreRiskQuestionnaire(answers({ taxSlab: 'UNSURE' })).taxSlabPct).toBeNull();
    expect(scoreRiskQuestionnaire(answers({ taxSlab: 'PCT_5' })).taxSlabPct).toBe(5);
    expect(TAX_SLAB_PCT.PCT_30).toBe(30);
  });
});
