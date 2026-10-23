import { describe, it, expect } from 'vitest';
import { familyHref, pickFamilyId } from './familySelection';

const families = [{ id: 'fam-a' }, { id: 'fam-b' }];

describe('which family the Family page shows', () => {
  it('opens the family named in the URL, not always the first', () => {
    expect(pickFamilyId(families, 'fam-b')).toBe('fam-b');
  });

  it('defaults bare /family to the first family', () => {
    expect(pickFamilyId(families, null)).toBe('fam-a');
  });

  it('falls back to the first family for an id the user is not in', () => {
    expect(pickFamilyId(families, 'someone-elses')).toBe('fam-a');
    expect(pickFamilyId([], 'fam-a')).toBeNull();
  });

  it('builds a link per family', () => {
    expect(familyHref('fam-b')).toBe('/family?family=fam-b');
  });
});
