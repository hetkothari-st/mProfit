import { describe, it, expect } from 'vitest';
import { placeRelative, relationPlacement } from './familyRelations.js';

// Het (top) -> Akshay. invitedBy chain: Akshay invited by Het.
const invitedBy: Record<string, string | null> = { het: null, akshay: 'het' };
const parentOf = (id: string) => invitedBy[id] ?? null;

describe('placeRelative', () => {
  it('puts a child under the person', () => {
    expect(placeRelative({}, parentOf, 'kid', 'akshay', 'Son')).toEqual({ kid: 'akshay' });
  });

  it('puts a spouse or sibling beside them, under the same parent', () => {
    expect(placeRelative({}, parentOf, 'wife', 'akshay', 'Wife')).toEqual({ wife: 'het' });
    expect(placeRelative({}, parentOf, 'bro', 'het', 'Brother')).toEqual({ bro: null });
  });

  it('puts a parent above them, in their old place', () => {
    expect(placeRelative({}, parentOf, 'papa', 'het', 'Father')).toEqual({ papa: null, het: 'papa' });
    expect(placeRelative({}, parentOf, 'mil', 'akshay', 'Mother-in-law')).toEqual({
      mil: 'het',
      akshay: 'mil',
    });
  });

  it('puts a grandparent above the parent', () => {
    expect(placeRelative({}, parentOf, 'dada', 'akshay', 'Grandfather')).toEqual({
      dada: null,
      het: 'dada',
    });
  });

  it('respects an arrangement the family already saved', () => {
    const saved = { het: 'papa', papa: null };
    expect(placeRelative(saved, parentOf, 'sis', 'het', 'Sister')).toEqual({ ...saved, sis: 'papa' });
  });

  it('places a relation it does not know under the person', () => {
    expect(relationPlacement('Guardian')).toBe('BELOW');
    expect(placeRelative({}, parentOf, 'g', 'akshay', 'Guardian')).toEqual({ g: 'akshay' });
  });
});
