import { describe, it, expect } from 'vitest';
import { nameKey, matchPerson } from '../../src/services/docSorter/personMatch.js';

const c = (id: string, name: string, pan: string | null = null, aliasKeys: string[] = []) => ({ id, nameKey: nameKey(name), panLast4: pan, aliasKeys });
const match = (cands: ReturnType<typeof c>[], name: string, pan: string | null = null) => matchPerson(cands, nameKey(name), pan);

describe('nameKey', () => {
  it('strips honorifics/punctuation and sorts tokens', () => {
    expect(nameKey('Mr. Het  KOTHARI')).toBe('het kothari');
    expect(nameKey('Kothari, Het')).toBe('het kothari');
  });
});

describe('matchPerson: merges the same person', () => {
  it('matches an exact key regardless of token order', () => {
    expect(match([c('1', 'Het Kothari')], 'Kothari Het')).toBe('1');
  });
  it('lets an initial stand for the full name on the other side', () => {
    expect(match([c('1', 'Rahul Kumar Sharma')], 'Rahul K Sharma')).toBe('1');
    expect(match([c('1', 'Anita Verma')], 'Anita V')).toBe('1');
  });
  it('matches a name that an earlier merge or rename recorded as an alias', () => {
    expect(match([c('1', 'Suresh Iyer', null, [nameKey('Suresh lyer')])], 'Suresh lyer')).toBe('1');
  });
  it('prefers the exact person when a similar one also exists', () => {
    expect(match([c('1', 'Rahul Sharma'), c('2', 'Rahul Kumar Sharma')], 'Rahul Sharma')).toBe('1');
  });
});

describe('matchPerson: never merges different people', () => {
  it.each([
    ['Rahul Sharma', 'Rahul K Sharma'], // a stray initial is not evidence of the same person
    ['Rahul Sharma', 'Rahul Kumar Sharma'],
    ['Rakesh Gupta', 'Ramesh Gupta'],
    ['Mohan Singh', 'Sohan Singh'], // brothers
    ['Ankit Jain', 'Ankita Jain'],
    ['Anita Verma', 'Anita Varma'], // one-letter spelling differences are suggestions, not merges
    ['Rahul Sharma', 'Rahul Verma'],
  ])('keeps %s and %s apart', (existing, incoming) => {
    expect(match([c('1', existing)], incoming)).toBeNull();
  });
  it('does not guess when two people are equally similar', () => {
    expect(match([c('1', 'Rahul Kumar Sharma'), c('2', 'Rahul Kishore Sharma')], 'Rahul K Sharma')).toBeNull();
  });
  it('single-token names only match exactly', () => {
    expect(match([c('1', 'Rahul')], 'Rahulk')).toBeNull();
  });
  it('a PAN alone, with no similar name, is not enough', () => {
    expect(match([c('1', 'Anita Verma', '234F')], 'Bob Smith', '234F')).toBeNull();
    expect(match([c('1', 'Rahul Sharma', '234F')], 'Priya Sharma', '234F')).toBeNull();
  });
});

describe('matchPerson: PAN last-4 is a tiebreaker and a veto, never a key', () => {
  it('a conflicting PAN vetoes a name-similar match', () => {
    expect(match([c('1', 'Rahul Kumar Sharma', '111A')], 'Rahul K Sharma', '999B')).toBeNull();
  });
  it('breaks a tie between two similar people', () => {
    const cands = [c('1', 'Rahul Kumar Sharma', '111A'), c('2', 'Rahul Kishore Sharma', '999B')];
    expect(match(cands, 'Rahul K Sharma', '999B')).toBe('2');
  });
});
