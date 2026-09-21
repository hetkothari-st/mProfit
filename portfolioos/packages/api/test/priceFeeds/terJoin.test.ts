import { describe, it, expect } from 'vitest';
import {
  amcForTerName,
  amcKey,
  deriveAmcBrands,
  joinTerToSchemes,
  type JoinScheme,
  type JoinTerRow,
} from '../../src/priceFeeds/terJoin.js';
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

/**
 * These fixtures use invented AMCs, which the COMMITTED brand map correctly
 * refuses to join — that is the point of the map. So each test states its own
 * vocabulary, derived from its own schemes, and the map-is-authoritative
 * behaviour is asserted separately below.
 */
function join(schemes: JoinScheme[], rows: JoinTerRow[]) {
  const brands = deriveAmcBrands(schemes);
  return joinTerToSchemes(schemes, rows, brands, (key) =>
    schemes.some((s) => amcKey(s.amcName) === key),
  );
}

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
    const r = join(
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
    const r = join(schemes, rows);
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
    const r = join(schemes, [ter('Nifty 50 Index Fund', 0.1)]);
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
    const r = join(schemes, [ter('Alpha Large Cap Fund', 0.4)]);
    expect(r.matches).toEqual([]);
    expect(r.ambiguous).toEqual([
      { key: 'alpha::alpha large cap fund', reason: 'multiple_schemes', count: 2 },
    ]);
    // AMBIGUOUS is not UNMATCHED: the name exists on both sides, it just does
    // not identify one scheme, which is a different problem to report.
    expect(r.unmatched).toEqual([]);
  });

  it('refuses a key claimed by two TER rows that disagree', () => {
    const r = join(
      [scheme('A1', 'Alpha Large Cap Fund', 'Alpha Mutual Fund')],
      [ter('Alpha Large Cap Fund', 0.4), ter('Alpha Large Cap Fund', 1.2)],
    );
    expect(r.matches).toEqual([]);
    expect(r.ambiguous[0]).toMatchObject({ reason: 'multiple_ter_rows', count: 2 });
  });

  // Two rows that agree are one answer written twice — not a collision.
  it('accepts duplicate TER rows that agree, taking the latest date', () => {
    const r = join(
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
    const r = join(
      [scheme('A1', 'Alpha Small Cap Fund', 'Alpha Mutual Fund')],
      [ter('Alpha Large Cap Fund', 0.4)],
    );
    expect(r.matches).toEqual([]);
    expect(r.unmatched.map((s) => s.schemeCode)).toEqual(['A1']);
  });

  // A blank direct-TER cell is not a claim on the key, so it must not make an
  // otherwise-clean match ambiguous.
  it('ignores a TER row with no direct-plan figure', () => {
    const r = join(
      [scheme('A1', 'Alpha Large Cap Fund', 'Alpha Mutual Fund')],
      [ter('Alpha Large Cap Fund', null), ter('Alpha Large Cap Fund', 0.4)],
    );
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.terPct).toBe(0.4);
  });

  it('matches through punctuation and casing differences between the two files', () => {
    const r = join(
      [scheme('A1', "Axis Children's Fund", 'Axis Mutual Fund')],
      [ter('AXIS CHILDRENS FUND', 0.71)],
    );
    expect(r.matches).toHaveLength(1);
  });

  it('handles an empty TER file without claiming anything matched', () => {
    const r = join([scheme('A1', 'Alpha Fund', 'Alpha Mutual Fund')], []);
    expect(r.matches).toEqual([]);
    expect(r.unmatched).toHaveLength(1);
  });
});

/**
 * The committed map is the authority, not the data in front of us. This is
 * what changed when brand derivation moved out of the runtime: an AMC nobody
 * has reviewed cannot join, however obvious its name looks.
 */
describe('joinTerToSchemes against the committed brand map', () => {
  const unknownHouse = [scheme('X1', 'Newhouse Large Cap Fund', 'Newhouse Mutual Fund')];

  it('refuses to join an AMC that is not in the map', () => {
    const r = joinTerToSchemes(unknownHouse, [ter('Newhouse Large Cap Fund', 0.4)]);
    expect(r.matches).toEqual([]);
    expect(r.unmappedAmc.map((s) => s.schemeCode)).toEqual(['X1']);
    // Not UNMATCHED: this is our mapping gap, not AMFI omitting the scheme,
    // and the two are fixed in completely different places.
    expect(r.unmatched).toEqual([]);
  });

  it('joins an AMC that is in the map', () => {
    // Kotak is the case that proves the map carries brands the registered
    // name does not: "Kotak Mahindra Mutual Fund" names its funds "Kotak …".
    const kotak = [scheme('K1', 'Kotak Bluechip Fund', 'Kotak Mahindra Mutual Fund')];
    const r = joinTerToSchemes(kotak, [ter('Kotak Bluechip Fund', 0.63)]);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.terPct).toBe(0.63);
    expect(r.unmappedAmc).toEqual([]);
  });

  it('keeps an unmapped AMC out of another AMC\u2019s key space', () => {
    // Both schemes share a product name. The mapped one must still match, and
    // the unmapped one must not make it ambiguous.
    const mixed = [
      scheme('K1', 'Kotak Liquid Fund', 'Kotak Mahindra Mutual Fund'),
      scheme('X1', 'Kotak Liquid Fund', 'Newhouse Mutual Fund'),
    ];
    const r = joinTerToSchemes(mixed, [ter('Kotak Liquid Fund', 0.2)]);
    expect(r.matches.map((m) => m.schemeCode)).toEqual(['K1']);
    expect(r.unmappedAmc.map((s) => s.schemeCode)).toEqual(['X1']);
    expect(r.ambiguous).toEqual([]);
  });
});

describe('deriveAmcBrands', () => {
  // The generator's own rule. A single-scheme AMC must not contribute that
  // scheme's whole name as a "brand" — it would match exactly one row and
  // look, in a committed file, like a considered decision.
  it('does not turn a lone scheme name into a brand', () => {
    const brands = deriveAmcBrands([scheme('A1', 'Solo Capital Liquid Fund', 'Solo Mutual Fund')]);
    expect([...brands.keys()]).toEqual(['solo']);
  });

  it('derives the brand an AMC actually uses, not its registered name', () => {
    const brands = deriveAmcBrands([
      scheme('K1', 'Kotak Bluechip Fund', 'Kotak Mahindra Mutual Fund'),
      scheme('K2', 'Kotak Liquid Fund', 'Kotak Mahindra Mutual Fund'),
    ]);
    expect(brands.get('kotak')).toBe('kotak mahindra');
    expect(brands.get('kotak mahindra')).toBe('kotak mahindra');
  });

  it('drops a brand two AMCs both claim', () => {
    const brands = deriveAmcBrands([
      scheme('A1', 'Shared Alpha Fund', 'Shared Mutual Fund'),
      scheme('A2', 'Shared Beta Fund', 'Shared Mutual Fund'),
      scheme('B1', 'Shared Gamma Fund', 'Shared Capital Mutual Fund'),
      scheme('B2', 'Shared Delta Fund', 'Shared Capital Mutual Fund'),
    ]);
    // "shared" is the derived prefix of both houses, so it identifies neither.
    expect(brands.has('shared')).toBe(false);
  });
});
