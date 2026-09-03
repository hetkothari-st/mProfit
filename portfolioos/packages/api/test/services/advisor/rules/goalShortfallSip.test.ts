import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { goalShortfallSipRule } from '../../../../src/services/advisor/rules/goalShortfallSip.rule.js';
import { requiredMonthlySip } from '../../../../src/services/goalMath.js';
import {
  d,
  driftedPortfolioFacts,
  emptyPortfolioFacts,
  emptyProductMap,
  makeGoal,
} from './fixtures.js';

/** What the rule should be prescribing, computed from the same helper it uses,
 *  so the test pins the wiring rather than re-deriving the annuity by hand. */
const REQUIRED = requiredMonthlySip(d(1_500_000), 8, 12)!;
const GAP = REQUIRED.minus(d(2_000));

function goalFacts(goalOver: Parameters<typeof makeGoal>[0] = {}, factsOver = {}) {
  return driftedPortfolioFacts({ goals: [makeGoal(goalOver)], ...factsOver });
}

describe('goalShortfallSipRule', () => {
  it('prescribes the monthly top-up an off-track goal needs, into the most underweight bucket', () => {
    const drafts = goalShortfallSipRule.evaluate(goalFacts());

    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;

    expect(draft.ruleId).toBe('GOAL_SHORTFALL_SIP');
    expect(draft.category).toBe('GOAL_SHORTFALL_SIP');
    expect(draft.dedupeKey).toBe('GOAL_SHORTFALL_SIP:goal-1');
    expect(draft.action).toHaveLength(1);

    const buy = draft.action[0]!;
    expect(buy.direction).toBe('BUY');
    expect(buy.amountInr).toBe(GAP.toFixed(2));
    // DEBT is 17pp below target in this fixture — the furthest below of the
    // investable buckets.
    expect(buy.bucket).toBe('DEBT');
    expect(buy.instrumentName).toBe('ICICI Prudential Corporate Bond Fund');
    expect(buy.units).toBeNull(); // a SIP into a fund has no price fact to size units from
    expect(draft.provenance.kind).toBe('APPROVED_LIST');
  });

  it('names the required SIP, the existing contribution and the top-up in the rationale', () => {
    const draft = goalShortfallSipRule.evaluate(goalFacts())[0]!;

    expect(draft.rationale).toContain('Kabir college fund');
    expect(draft.rationale).toContain('₹2,000.00'); // what is going in today
    expect(draft.rationale).toContain('8.0 years');
    expect(draft.rationale).toContain('12% return');
    // The amount on the action leg must be in the prose, formatted the house way.
    expect(draft.rationale.replace(/[₹,]/g, '')).toContain(GAP.toFixed(2));
  });

  it('does not fire for a goal that is on track, or one that could not be judged', () => {
    expect(goalShortfallSipRule.evaluate(goalFacts({ isOnTrack: true }))).toEqual([]);
    expect(goalShortfallSipRule.evaluate(goalFacts({ isOnTrack: null }))).toEqual([]);
  });

  it('does not fire when the top-up is below the minimum trade size', () => {
    // Already contributing all but ₹100/month of what the goal needs.
    const nearlyThere = REQUIRED.minus(new Decimal(100));
    expect(
      goalShortfallSipRule.evaluate(goalFacts({ currentMonthlyContribution: nearlyThere })),
    ).toEqual([]);

    // Contributing more than required is not a shortfall at all.
    expect(
      goalShortfallSipRule.evaluate(
        goalFacts({ currentMonthlyContribution: REQUIRED.plus(new Decimal(1_000)) }),
      ),
    ).toEqual([]);
  });

  it('skips a goal whose required SIP cannot be computed honestly', () => {
    // No time left to fund it in: an "infinite monthly SIP" is not advice.
    expect(goalShortfallSipRule.evaluate(goalFacts({ yearsRemaining: 0 }))).toEqual([]);
    expect(goalShortfallSipRule.evaluate(goalFacts({ remaining: d(0) }))).toEqual([]);
  });

  it('returns [] on an empty portfolio with no goals', () => {
    expect(goalShortfallSipRule.evaluate(emptyPortfolioFacts())).toEqual([]);
  });

  it('still states the rupee top-up when no product can be named, with NONE provenance', () => {
    const draft = goalShortfallSipRule.evaluate(
      goalFacts({}, { approvedProducts: emptyProductMap(), fallbackRankings: emptyProductMap() }),
    )[0]!;

    expect(draft.action).toEqual([]);
    expect(draft.provenance.kind).toBe('NONE');
    expect(draft.rationale.replace(/[₹,]/g, '')).toContain(GAP.toFixed(2));
    expect(draft.rationale).toContain('cannot name a fund');
  });

  it('emits no unit count anywhere, stale prices or not', () => {
    const drafts = goalShortfallSipRule.evaluate(goalFacts());
    expect(drafts.every((x) => x.action.every((a) => a.units === null))).toBe(true);
  });

  it('records the goal and the destination bucket in inputsUsed', () => {
    const used = goalShortfallSipRule.evaluate(goalFacts())[0]!.inputsUsed as Record<string, unknown>;

    expect(used.goal).toMatchObject({ goalId: 'goal-1', isOnTrack: false, yearsRemaining: 8 });
    expect(used.requiredMonthlySipInr).toBe(REQUIRED.toString());
    expect(used.monthlyTopUpInr).toBe(GAP.toString());
    expect(used.targetBucket).toMatchObject({ bucket: 'DEBT' });
    expect(used.resolvedProduct).toMatchObject({ provenance: 'APPROVED_LIST' });
  });

  it('keeps priority a positive integer inside the optimisation band', () => {
    const draft = goalShortfallSipRule.evaluate(goalFacts())[0]!;
    expect(Number.isInteger(draft.priority)).toBe(true);
    expect(draft.priority).toBeGreaterThanOrEqual(40);
    expect(draft.priority).toBeLessThanOrEqual(60);
  });
});
