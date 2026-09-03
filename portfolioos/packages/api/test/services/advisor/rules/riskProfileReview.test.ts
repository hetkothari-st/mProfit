import { describe, it, expect } from 'vitest';
import { riskProfileReviewRule } from '../../../../src/services/advisor/rules/riskProfileReview.rule.js';
import { d, emptyPortfolioFacts, makeFacts } from './fixtures.js';
import type { RiskCategoryValue } from '../../../../src/services/riskProfileMath.js';

const AS_OF = new Date('2026-01-15T00:00:00.000Z');

function profileFacts(
  profile: {
    assessmentId?: string | null;
    assessedAt?: Date | null;
    category?: RiskCategoryValue | null;
  } = {},
  factsOver: Parameters<typeof makeFacts>[0] = {},
) {
  return makeFacts({
    asOf: AS_OF,
    totalPortfolioValue: d(1_000_000),
    riskProfile: {
      assessmentId: 'assessment-1',
      category: 'BALANCED',
      age: 38,
      taxSlabPct: 30,
      assessedAt: new Date('2025-10-01T00:00:00.000Z'),
      ...profile,
    },
    ...factsOver,
  });
}

describe('riskProfileReviewRule', () => {
  it('fires when the assessment is older than the review interval', () => {
    const drafts = riskProfileReviewRule.evaluate(
      profileFacts({ assessedAt: new Date('2024-01-15T00:00:00.000Z') }),
    );

    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;

    expect(draft.ruleId).toBe('RISK_PROFILE_REVIEW');
    expect(draft.category).toBe('RISK_PROFILE_REVIEW');
    expect(draft.action).toEqual([]); // advisory, not a trade
    expect(draft.provenance.kind).toBe('NONE');
    expect(draft.dedupeKey).toBe('RISK_PROFILE_REVIEW:assessment-1');
    expect(draft.rationale).toContain('January 2024');
    expect(draft.rationale).toContain('24 months ago');
    expect(draft.rationale).toContain('12 months');
    expect(draft.rationale).toContain('₹10,00,000.00');
    expect((draft.inputsUsed as Record<string, unknown>).trigger).toBe('STALE');
  });

  it('fires when there is no assessment at all, and sorts it ahead of a merely stale one', () => {
    const never = riskProfileReviewRule.evaluate(
      profileFacts({ assessmentId: null, assessedAt: null, category: null }),
    )[0]!;
    const stale = riskProfileReviewRule.evaluate(
      profileFacts({ assessedAt: new Date('2024-01-15T00:00:00.000Z') }),
    )[0]!;

    expect(never.action).toEqual([]);
    expect(never.dedupeKey).toBe('RISK_PROFILE_REVIEW:NONE');
    expect(never.rationale).toContain('no risk profile on file');
    expect(never.rationale).toContain('₹10,00,000.00');
    expect((never.inputsUsed as Record<string, unknown>).trigger).toBe('NEVER_ASSESSED');
    expect(never.priority).toBeLessThan(stale.priority);
  });

  it('fires when the assessment id is present but the date is missing', () => {
    expect(riskProfileReviewRule.evaluate(profileFacts({ assessedAt: null }))).toHaveLength(1);
  });

  it('does not fire on a profile inside the review window', () => {
    // 3.5 months old.
    expect(riskProfileReviewRule.evaluate(profileFacts())).toEqual([]);
    // One day short of 12 months: due tomorrow is not due.
    expect(
      riskProfileReviewRule.evaluate(
        profileFacts({ assessedAt: new Date('2025-01-16T00:00:00.000Z') }),
      ),
    ).toEqual([]);
  });

  it('fires on exactly the review interval', () => {
    expect(
      riskProfileReviewRule.evaluate(
        profileFacts({ assessedAt: new Date('2025-01-15T00:00:00.000Z') }),
      ),
    ).toHaveLength(1);
  });

  it('reads the clock from facts.asOf and nothing else', () => {
    const assessedAt = new Date('2025-01-15T00:00:00.000Z');
    expect(
      riskProfileReviewRule.evaluate(
        profileFacts({ assessedAt }, { asOf: new Date('2025-06-01T00:00:00.000Z') }),
      ),
    ).toEqual([]);
    expect(
      riskProfileReviewRule.evaluate(
        profileFacts({ assessedAt }, { asOf: new Date('2030-06-01T00:00:00.000Z') }),
      ),
    ).toHaveLength(1);
  });

  it('returns [] on an empty portfolio with a current profile', () => {
    expect(riskProfileReviewRule.evaluate(emptyPortfolioFacts())).toEqual([]);
  });

  it('still fires on an empty portfolio when the profile was never taken', () => {
    const facts = makeFacts({
      riskProfile: {
        assessmentId: null,
        category: null,
        age: null,
        taxSlabPct: null,
        assessedAt: null,
      },
    });
    const draft = riskProfileReviewRule.evaluate(facts)[0]!;

    expect(draft.action).toEqual([]);
    expect(draft.rationale).toMatch(/\d/); // a rationale with no numbers is not a rationale
    expect(Number.isInteger(draft.priority)).toBe(true);
    expect(draft.priority).toBeGreaterThan(0);
    expect(draft.priority).toBeLessThanOrEqual(60);
  });
});
