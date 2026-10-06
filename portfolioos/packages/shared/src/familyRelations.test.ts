import { describe, it, expect } from 'vitest';
import {
  buildUnits,
  normalizePartners,
  partnersOf,
  placeRelative,
  relationPlacement,
  type TreeShape,
} from './familyRelations.js';

// Het (top) -> Akshay. invitedBy chain: Akshay invited by Het.
const invitedBy: Record<string, string | null> = { het: null, akshay: 'het' };
const parentOf = (id: string) => invitedBy[id] ?? null;
const empty: TreeShape = { parents: {}, partners: [] };
const from = (parents: Record<string, string | null>, partners: [string, string][] = []): TreeShape => ({
  parents,
  partners,
});

describe('placeRelative', () => {
  it('puts a child under the person', () => {
    expect(placeRelative(empty, parentOf, 'kid', 'akshay', 'Son')).toEqual({
      parents: { kid: 'akshay' },
      partners: [],
    });
  });

  it('joins a spouse to them instead of to their parents', () => {
    // The bug this replaced: a wife took her husband's parent and was drawn
    // as her father-in-law's daughter.
    expect(placeRelative(empty, parentOf, 'wife', 'akshay', 'Wife')).toEqual({
      parents: { wife: null },
      partners: [['wife', 'akshay']],
    });
  });

  it('puts a sibling beside them, under the same parent', () => {
    expect(placeRelative(empty, parentOf, 'bro', 'het', 'Brother')).toEqual({
      parents: { bro: null },
      partners: [],
    });
    expect(placeRelative(empty, parentOf, 'sis', 'akshay', 'Sister')).toEqual({
      parents: { sis: 'het' },
      partners: [],
    });
  });

  it("gives a spouse's sibling the spouse's own parent, not the couple's", () => {
    const married = placeRelative(empty, parentOf, 'wife', 'akshay', 'Wife');
    const withSister = placeRelative(married, parentOf, 'her-sis', 'wife', 'Sister');
    expect(withSister.parents['her-sis']).toBeNull();
    expect(withSister.parents.wife).toBeNull();
  });

  it('puts a parent above them, in their old place', () => {
    expect(placeRelative(empty, parentOf, 'papa', 'het', 'Father')).toEqual({
      parents: { papa: null, het: 'papa' },
      partners: [],
    });
    expect(placeRelative(empty, parentOf, 'mil', 'akshay', 'Mother-in-law')).toEqual({
      parents: { mil: 'het', akshay: 'mil' },
      partners: [],
    });
  });

  it('puts a grandparent above the parent', () => {
    expect(placeRelative(empty, parentOf, 'dada', 'akshay', 'Grandfather')).toEqual({
      parents: { dada: null, het: 'dada' },
      partners: [],
    });
  });

  it('respects an arrangement the family already saved', () => {
    const saved = from({ het: 'papa', papa: null });
    expect(placeRelative(saved, parentOf, 'sis', 'het', 'Sister')).toEqual({
      parents: { ...saved.parents, sis: 'papa' },
      partners: [],
    });
  });

  it('keeps existing couples when someone else is added', () => {
    const shape = from({ sarita: null }, [['mahendra', 'sarita']]);
    const next = placeRelative(shape, parentOf, 'akshay', 'mahendra', 'Son');
    expect(next.partners).toEqual([['mahendra', 'sarita']]);
    expect(next.parents.akshay).toBe('mahendra');
  });

  it('does not pair the same two people twice', () => {
    const shape = from({}, [['mahendra', 'sarita']]);
    const again = placeRelative(shape, parentOf, 'sarita', 'mahendra', 'Spouse');
    expect(again.partners).toEqual([['mahendra', 'sarita']]);
  });

  it('places a relation it does not know under the person', () => {
    expect(relationPlacement('Guardian')).toBe('BELOW');
    expect(placeRelative(empty, parentOf, 'g', 'akshay', 'Guardian')).toEqual({
      parents: { g: 'akshay' },
      partners: [],
    });
  });
});

describe('partners', () => {
  it('reads a pair from either side', () => {
    const pairs: [string, string][] = [['a', 'b']];
    expect(partnersOf(pairs, 'a')).toEqual(['b']);
    expect(partnersOf(pairs, 'b')).toEqual(['a']);
    expect(partnersOf(pairs, 'c')).toEqual([]);
  });

  it('drops self-pairs, duplicates and people who have left', () => {
    const raw = [
      ['a', 'b'],
      ['b', 'a'],
      ['c', 'c'],
      ['a', 'gone'],
    ] as [string, string][];
    expect(normalizePartners(raw, (id) => id !== 'gone')).toEqual([['a', 'b']]);
  });
});

describe('buildUnits', () => {
  it('draws a couple as one place and everyone else on their own', () => {
    const units = buildUnits(['mahendra', 'sarita', 'akshay'], [['mahendra', 'sarita']]);
    expect(units).toEqual([
      { ids: ['mahendra', 'sarita'], anchor: 'mahendra' },
      { ids: ['akshay'], anchor: 'akshay' },
    ]);
  });

  it('stands a remarried person with one partner only, so the drawing stays a tree', () => {
    const units = buildUnits(['a', 'b', 'c'], [
      ['a', 'b'],
      ['a', 'c'],
    ]);
    expect(units).toEqual([
      { ids: ['a', 'b'], anchor: 'a' },
      { ids: ['c'], anchor: 'c' },
    ]);
  });

  it('ignores a partner who is not on the tree', () => {
    expect(buildUnits(['a'], [['a', 'ghost']])).toEqual([{ ids: ['a'], anchor: 'a' }]);
  });
});
