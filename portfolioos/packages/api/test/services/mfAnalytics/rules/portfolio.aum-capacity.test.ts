/**
 * `mf.portfolio.aum-capacity` (`05 §4` row 12, `05 §8.1`).
 *
 * `smallCapAumCapInr` is a rupee decimal STRING ('200000000000' = ₹20,000
 * crore). The boundary case below is at exactly that value, which is also the
 * case a naive numeric comparison would get subtly wrong if the constant ever
 * grew past `Number.MAX_SAFE_INTEGER` — hence `Decimal` on both sides.
 */

import { describe, expect, it } from 'vitest';
import { serializeMoney, type MfMetricStatus } from '@portfolioos/shared';
import { portfolioAumCapacityRule as rule } from '../../../../src/services/mfAnalytics/rules/portfolio.aum-capacity.js';
import { SCHEME, makeFacts, makeFundFacts } from './_facts.fixture.js';

function facts(options: {
  aum: string | null;
  sebiSubCategory?: string;
  fieldStatus?: Record<string, MfMetricStatus>;
}) {
  return makeFacts({
    funds: {
      [SCHEME]: makeFundFacts({
        meta: {
          sebiSubCategory: (options.sebiSubCategory ?? 'Small Cap Fund') as 'Small Cap Fund',
        },
        profile: {
          aum: options.aum === null ? null : serializeMoney(options.aum),
          ...(options.fieldStatus === undefined ? {} : { fieldStatus: options.fieldStatus }),
        },
      }),
    },
  });
}

describe('mf.portfolio.aum-capacity', () => {
  it('fires for a small-cap fund above the capacity mark', () => {
    // ₹25,400 crore against a ₹20,000 crore cap.
    const found = rule.evaluate(facts({ aum: '254000000000' }), SCHEME);

    expect(found).toHaveLength(1);
    const finding = found[0]!;
    expect(finding.code).toBe('AUM_CAPACITY');
    // NOTICE: a constraint on future flexibility, not a measured failure.
    expect(finding.severity).toBe('NOTICE');
    expect(finding.category).toBe('PORTFOLIO');
    expect(finding.headline).toContain('₹25,400 crore');
    expect(finding.headline).toContain('₹20,000 crore');
  });

  it('does not fire at the cap exactly', () => {
    // `05 §4` says "AUM > SMALLCAP_AUM_CAP_INR".
    expect(rule.evaluate(facts({ aum: '200000000000' }), SCHEME)).toEqual([]);
  });

  it('does not fire outside the Small Cap sub-category, however large', () => {
    // A ₹25,400 crore large-cap fund can still buy its whole universe.
    for (const sub of ['Large Cap Fund', 'Mid Cap Fund', 'Flexi Cap Fund', 'UNMAPPED']) {
      expect(rule.evaluate(facts({ aum: '254000000000', sebiSubCategory: sub }), SCHEME)).toEqual(
        [],
      );
    }
  });

  it('names the cap in whatWouldChangeThis', () => {
    const finding = rule.evaluate(facts({ aum: '254000000000' }), SCHEME)[0]!;
    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('₹20,000 crore');
  });

  it('is silent when AUM is undisclosed rather than small', () => {
    expect(rule.evaluate(facts({ aum: null }), SCHEME)).toEqual([]);

    const notOk = facts({ aum: '254000000000', fieldStatus: { aum: 'STALE' } });
    expect(rule.evaluate(notOk, SCHEME)).toEqual([]);
  });
});
