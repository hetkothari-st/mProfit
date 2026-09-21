import { describe, it, expect } from 'vitest';
import { amcForTerName, amcKey, joinTerToSchemes, type JoinScheme, type JoinTerRow } from '../../src/priceFeeds/terJoin.js';
import { normaliseSchemeName } from '../../src/priceFeeds/amfiTer.parse.js';

/**
 * The failure this join is built to avoid: AMFI's TER file carries no scheme
 * code and no ISIN, so the only key is a name — and product names are not
 * unique across AMCs. A name-only join hands one AMC's cost to another AMC's
 * fund, which is worse than no TER at all: a missing TER is a recorded gap
 * the methodology handles, a wrong one is a silent input to a cost-weighted
 * ranking nobody would ever question.
 */

const scheme = (schemeCode: string, schemeName: string, amcName: string): JoinScheme => ({
  schemeCode,
  schemeName,
  amcName,
});

const ter = (schemeName: string, directTerPct: number | null, asOf = new Date('2026-08-01')): JoinTerRow => ({
  schemeName,
  nameKey: normaliseSchemeName(schemeName),
  directTerPct,
  asOf,
});

describe('amcKey', () => {
  it('strips the suffix that appears in the AMC name and never in a scheme name', () => {
    expect(amcKey('Aditya Birla Sun Life Mutual Fund')).toBe('aditya birla sun life');
    expect(amcKey('Axis Mutual Fund')).toBe('axis');
    expect(amcKey('360 ONE Mutual Fund')).toBe('360 one');
  });
});

describe('amcForTerName', () => {
  const keys = ['axis', 'bajaj', 'bajaj finserv', 'aditya birla sun life'];

  it('reads the AMC off the front of the scheme name', () => {
    expect(amcForTerName(normaliseSchemeName('Axis Children\'s Fund'), keys)).toBe('axis');
  });

  // Specificity, not ambiguity: the longer brand is the more precise answer.
  it('prefers the longest matching brand', () => {
    expect(amcForTerName(normaliseSchemeName('Bajaj Finserv Multi Cap Fund'), keys)).toBe(
      'bajaj finserv',
    );
  });

  it('returns null when the name begins with no AMC we hold', () => {
    expect(amcForTerName(normaliseSchemeName('Some Other House Large Cap'), keys)).toBeNull();
  });

  // "Axistra" is not Axis. Without the word boundary a prefix match would
  // quietly claim it.
  it('matches whole words, not letter prefixes', () => {
    expect(amcForTerName(normaliseSchemeName('Axistra Growth Fund'), keys)).toBeNull();
  });
});

describe('joinTerToSchemes', () => {
  it('matches a scheme when the AMC and the name both agree', () => {
    const r = joinTerToSchemes(
      [scheme('120503', 'Axis Bluechip Fund', 'Axis Mutual Fund')],
      [ter('Axis Bluechip Fund', 0.62)],
    );
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]).toMatchObject({
      schemeCode: '120503',
      amfiName: 'Axis Bluechip Fund',
      terName: 'Axis Bluechip Fund',
      terPct: 0.62,
    });
    expect(r.unmatched).toEqual([]);
  });

  /**
   * THE TEST THIS FILE EXISTS FOR.
   *
   * Two AMCs, one product name. Under a name-only join, "Nifty 50 Index Fund"
   * resolves to both and one of them silently takes the other's TER. Here the
   * AMC is part of the key, so each gets its own figure — and, crucially, the
   * wrong one is never written.
   */
  it('keeps colliding names apart when the AMCs differ', () => {
    const schemes = [
      scheme('A1', 'Alpha Nifty 50 Index Fund', 'Alpha Mutual Fund'),
      scheme('B1', 'Beta Nifty 50 Index Fund', 'Beta Mutual Fund'),
    ];
    const rows = [
      ter('Alpha Nifty 50 Index Fund', 0.1),
      ter('Beta Nifty 50 Index Fund', 0.85),
    ];
    const r = joinTerToSchemes(schemes, rows);
    expect(r.matches).toHaveLength(2);
    const byCode = new Map(r.matches.map((m) => [m.schemeCode, m.terPct]));
    expect(byCode.get('A1')).toBe(0.1);
    expect(byCode.get('B1')).toBe(0.85);
  });

  /**
   * The same collision with the AMC brand absent from the product name — the
   * shape a truly generic name takes. Neither scheme can claim the row, so
   * neither gets a TER. A gap, not a guess.
   */
  it('writes nothing when a bare product name could belong to either AMC', () => {
    const schemes = [
      scheme('A1', 'Nifty 50 Index Fund', 'Alpha Mutual Fund'),
      scheme('B1', 'Nifty 50 Index Fund', 'Beta Mutual Fund'),
    ];
    const r = joinTerToSchemes(schemes, [ter('Nifty 50 Index Fund', 0.1)]);
    expect(r.matches).toEqual([]);
    expect(r.unknownAmc).toEqual(['Nifty 50 Index Fund']);
    expect(r.unmatched.map((s) => s.schemeCode).sort()).toEqual(['A1', 'B1']);
  });

  // One AMC, one name, two of our schemes. The name is not an identifier in
  // the direct-growth population, so it identifies nothing.
  it('refuses a key that resolves to two schemes of the same AMC', () => {
    const schemes = [
      scheme('A1', 'Alpha Large Cap Fund', 'Alpha Mutual Fund'),
      scheme('A2', 'Alpha Large Cap Fund', 'Alpha Mutual Fund'),
    ];
    const r = joinTerToSchemes(schemes, [ter('Alpha Large Cap Fund', 0.4)]);
    expect(r.matches).toEqual([]);
    expect(r.ambiguous).toEqual([
      { key: 'alpha::alpha large cap fund', reason: 'multiple_schemes', count: 2 },
    ]);
    // AMBIGUOUS is not UNMATCHED: the name exists on both sides, it just does
    // not identify one scheme, which is a different problem to report.
    expect(r.unmatched).toEqual([]);
  });

  it('refuses a key claimed by two TER rows that disagree', () => {
    const r = joinTerToSchemes(
      [scheme('A1', 'Alpha Large Cap Fund', 'Alpha Mutual Fund')],
      [ter('Alpha Large Cap Fund', 0.4), ter('Alpha Large Cap Fund', 1.2)],
    );
    expect(r.matches).toEqual([]);
    expect(r.ambiguous[0]).toMatchObject({ reason: 'multiple_ter_rows', count: 2 });
  });

  // Two rows that agree are one answer written twice — not a collision.
  it('accepts duplicate TER rows that agree, taking the latest date', () => {
    const r = joinTerToSchemes(
      [scheme('A1', 'Alpha Large Cap Fund', 'Alpha Mutual Fund')],
      [
        ter('Alpha Large Cap Fund', 0.4, new Date('2026-08-01')),
        ter('Alpha Large Cap Fund', 0.4, new Date('2026-08-28')),
      ],
    );
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.asOf.toISOString().slice(0, 10)).toBe('2026-08-28');
    expect(r.ambiguous).toEqual([]);
  });

  it('reports a scheme no TER row claimed as unmatched', () => {
    const r = joinTerToSchemes(
      [scheme('A1', 'Alpha Small Cap Fund', 'Alpha Mutual Fund')],
      [ter('Alpha Large Cap Fund', 0.4)],
    );
    expect(r.matches).toEqual([]);
    expect(r.unmatched.map((s) => s.schemeCode)).toEqual(['A1']);
  });

  // A blank direct-TER cell is not a claim on the key, so it must not make an
  // otherwise-clean match ambiguous.
  it('ignores a TER row with no direct-plan figure', () => {
    const r = joinTerToSchemes(
      [scheme('A1', 'Alpha Large Cap Fund', 'Alpha Mutual Fund')],
      [ter('Alpha Large Cap Fund', null), ter('Alpha Large Cap Fund', 0.4)],
    );
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.terPct).toBe(0.4);
  });

  it('matches through punctuation and casing differences between the two files', () => {
    const r = joinTerToSchemes(
      [scheme('A1', "Axis Children's Fund", 'Axis Mutual Fund')],
      [ter('AXIS CHILDRENS FUND', 0.71)],
    );
    expect(r.matches).toHaveLength(1);
  });

  it('handles an empty TER file without claiming anything matched', () => {
    const r = joinTerToSchemes([scheme('A1', 'Alpha Fund', 'Alpha Mutual Fund')], []);
    expect(r.matches).toEqual([]);
    expect(r.unmatched).toHaveLength(1);
  });
});
