import { describe, it, expect } from 'vitest';
import { insurerInitials, resolveInsurer } from './insurerBrand';

describe('resolveInsurer', () => {
  it('reads the insurer out of a longer label', () => {
    expect(resolveInsurer('LIC Jeevan Anand')?.name).toBe('LIC');
    expect(resolveInsurer('Star Health Family Optima')?.name).toBe('Star Health');
    expect(resolveInsurer('Max Bupa Health Companion')?.name).toBe('Niva Bupa');
  });

  it('tells sister companies apart by the longest match', () => {
    expect(resolveInsurer('HDFC Ergo Optima Secure')?.name).toBe('HDFC ERGO');
    expect(resolveInsurer('HDFC Life Click 2 Protect')?.name).toBe('HDFC Life');
    expect(resolveInsurer('Bajaj Allianz Life eTouch')?.name).toBe('Bajaj Allianz Life');
    expect(resolveInsurer('Bajaj Allianz car cover')?.name).toBe('Bajaj Allianz General');
  });

  it("doesn't guess from a bare group name", () => {
    expect(resolveInsurer('HDFC')).toBeUndefined();
    expect(resolveInsurer('Some Local Co-op Insurer')).toBeUndefined();
    expect(resolveInsurer('')).toBeUndefined();
  });
});

describe('insurerInitials', () => {
  it('drops the generic words', () => {
    expect(insurerInitials('HDFC ERGO')).toBe('HE');
    expect(insurerInitials('New India Assurance')).toBe('NI');
    expect(insurerInitials('LIC')).toBe('LIC');
  });
});
