/**
 * `mf.pf.goal-mismatch` — `GOAL_MISMATCH` and `GOAL_UNDERPOWERED`.
 *
 * One rule, two codes, so the suite checks that they are emitted independently
 * and that their finding ids differ — portfolio-scope findings all carry
 * `schemeCode: null`, so the code is the only thing separating them in
 * `makeFinding`'s deterministic id.
 *
 * The rule takes `MfGoalFitDto.suitability` at its word rather than
 * re-deriving the horizon matrix (`04 §6`), and the SUITABLE case below is
 * what pins that: a small-cap fund on a two-year goal is silent here if the
 * DTO says SUITABLE, because a second implementation of the same judgement is
 * how the goals page and this finding start contradicting each other.
 */

import { describe, it, expect } from 'vitest';
import { serializeMoney, serializeRatio } from '@portfolioos/shared';

import { pfGoalMismatchRule } from '../../../../src/services/mfAnalytics/rules/pf.goal-mismatch.js';
import { MF_HEADLINE_MAX_CHARS } from '../../../../src/services/mfAnalytics/types.js';
import {
  makeGoalFit,
  makePartialScope,
  makePortfolioFacts,
  type PortfolioFactsOptions,
} from './_portfolio.fixture.js';

function factsWithGoals(
  goals: ReturnType<typeof makeGoalFit>[],
  extra: PortfolioFactsOptions = {},
) {
  return makePortfolioFacts({
    ...extra,
    portfolio: { goals, ...(extra.portfolio ?? {}) },
  });
}

const MISMATCHED = makeGoalFit({
  goalId: 'goal_car',
  goalName: 'New car',
  horizonYears: serializeRatio('2.100000'),
  suitability: 'MISMATCH',
  reason: 'Small-cap funds fund a goal less than three years away.',
});

const UNDERPOWERED = makeGoalFit({
  goalId: 'goal_retire',
  goalName: 'Retirement',
  horizonYears: serializeRatio('15.400000'),
  suitability: 'UNDERPOWERED',
  reason: 'A liquid fund funds a goal fifteen years away.',
});

describe('mf.pf.goal-mismatch', () => {
  it('is a portfolio-scope rule in the GOAL category', () => {
    expect(pfGoalMismatchRule.id).toBe('mf.pf.goal-mismatch');
    expect(pfGoalMismatchRule.scope).toBe('PORTFOLIO');
    expect(pfGoalMismatchRule.category).toBe('GOAL');
  });

  it('emits GOAL_MISMATCH for a goal funded with too much risk', () => {
    const findings = pfGoalMismatchRule.evaluate(factsWithGoals([MISMATCHED]));

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe('GOAL_MISMATCH');
    expect(finding.severity).toBe('WARNING');
    expect(finding.category).toBe('GOAL');
    expect(finding.schemeCode).toBeNull();
    expect(finding.headline).toContain('New car');
    expect(finding.headline).toContain('2.1y');
    expect(finding.headline).toContain('too risky');
    expect(finding.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
  });

  it('emits GOAL_UNDERPOWERED for a goal funded too conservatively', () => {
    const findings = pfGoalMismatchRule.evaluate(factsWithGoals([UNDERPOWERED]));

    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe('GOAL_UNDERPOWERED');
    expect(findings[0]!.headline).toContain('too conservative');
    expect(findings[0]!.headline).toContain('15.4y');
    expect(findings[0]!.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
  });

  it('emits both codes with distinct ids when both apply', () => {
    const findings = pfGoalMismatchRule.evaluate(factsWithGoals([MISMATCHED, UNDERPOWERED]));

    expect(findings.map((f) => f.code).sort()).toEqual(['GOAL_MISMATCH', 'GOAL_UNDERPOWERED']);
    // Both carry `schemeCode: null`, so the code is what keeps their
    // deterministic ids apart.
    expect(new Set(findings.map((f) => f.id)).size).toBe(2);
  });

  it('defers to the DTO verdict rather than re-deriving the matrix', () => {
    const suitableButShort = makeGoalFit({
      horizonYears: serializeRatio('1.200000'),
      suitability: 'SUITABLE',
      reason: 'Already de-risked into a short-duration fund.',
    });

    expect(pfGoalMismatchRule.evaluate(factsWithGoals([suitableButShort]))).toEqual([]);
  });

  it('stays silent when no goals are on file', () => {
    expect(pfGoalMismatchRule.evaluate(factsWithGoals([]))).toEqual([]);
  });

  it('leads with the goal where the gap bites hardest', () => {
    const sooner = makeGoalFit({
      goalId: 'goal_soon',
      goalName: 'School fees',
      horizonYears: serializeRatio('0.800000'),
      suitability: 'MISMATCH',
      reason: 'Equity funds a goal under a year away.',
    });

    const finding = pfGoalMismatchRule.evaluate(factsWithGoals([MISMATCHED, sooner]))[0]!;

    // Shortest horizon = least time to recover a fall.
    expect(finding.headline).toContain('School fees');
    expect(finding.headline).toContain('(+1 more)');
  });

  it('names the horizon and the verdict in whatWouldChangeThis', () => {
    const finding = pfGoalMismatchRule.evaluate(factsWithGoals([MISMATCHED]))[0]!;

    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('2.1');
    expect(finding.whatWouldChangeThis).toContain('MISMATCH');
    // The DTO's own explanation, so the goals page and the finding say the
    // same thing in the same words.
    expect(finding.whatWouldChangeThis).toContain(MISMATCHED.reason);
  });

  it('cites a shortfall only when the projection produced one', () => {
    const withShortfall = makeGoalFit({
      suitability: 'UNDERPOWERED',
      horizonYears: serializeRatio('15.400000'),
      shortfall: serializeMoney('420000'),
    });

    const withNone = pfGoalMismatchRule.evaluate(factsWithGoals([UNDERPOWERED]))[0]!;
    const withSome = pfGoalMismatchRule.evaluate(factsWithGoals([withShortfall]))[0]!;

    // Null shortfall means the category-median projection did not run, never
    // a shortfall of zero.
    expect(withNone.evidence.some((e) => e.metric === 'goals.shortfall')).toBe(false);
    expect(withSome.evidence.some((e) => e.metric === 'goals.shortfall')).toBe(true);
  });

  it('calls the affected-goal count a floor under a partial family scope', () => {
    const facts = factsWithGoals([MISMATCHED], { portfolio: { scope: makePartialScope() } });

    const finding = pfGoalMismatchRule.evaluate(facts)[0]!;

    expect(finding.whatWouldChangeThis).toContain('floor');
    expect(finding.evidence.some((e) => e.label.includes('floor'))).toBe(true);
  });
});
