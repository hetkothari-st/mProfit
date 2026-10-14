import { describe, it, expect } from 'vitest';
import { nameKey, matchPerson } from '../../src/services/docSorter/personMatch.js';

const c = (id: string, name: string, pan: string | null = null) => ({ id, nameKey: nameKey(name), panLast4: pan });

describe('nameKey', () => {
  it('strips honorifics/punctuation and sorts tokens', () => {
    expect(nameKey('Mr. Het  KOTHARI')).toBe('het kothari');
    expect(nameKey('Kothari, Het')).toBe('het kothari');
  });
});

describe('matchPerson', () => {
  it('matches an exact key regardless of token order', () => {
    expect(matchPerson([c('1', 'Het Kothari')], nameKey('Kothari Het'), null)).toBe('1');
  });
  it('matches initial-tolerant tokens', () => {
    expect(matchPerson([c('1', 'Rahul Kumar Sharma')], nameKey('Rahul K Sharma'), null)).toBe('1');
  });
  it('matches a 1-letter spelling variant on long tokens', () => {
    expect(matchPerson([c('1', 'Anita Verma')], nameKey('Anita Varma'), null)).toBe('1');
  });
  it('prefers the exact person when a similar one also exists', () => {
    const cands = [c('1', 'Rahul Sharma'), c('2', 'Rahul Kumar Sharma')];
    expect(matchPerson(cands, nameKey('Rahul Sharma'), null)).toBe('1');
  });
  it('does not match different people sharing a first name', () => {
    expect(matchPerson([c('1', 'Rahul Sharma')], nameKey('Rahul Verma'), null)).toBeNull();
  });
  it('does not guess when two people are equally similar', () => {
    const cands = [c('1', 'Rahul Kumar Sharma'), c('2', 'Rahul Kishore Sharma')];
    expect(matchPerson(cands, nameKey('Rahul K Sharma'), null)).toBeNull();
  });
  it('uses PAN last4 plus a shared token as a strong signal', () => {
    expect(matchPerson([c('1', 'Anita Verma', '234F')], nameKey('Anita V'), '234F')).toBe('1');
  });
  it('PAN alone without a shared token is not enough', () => {
    expect(matchPerson([c('1', 'Anita Verma', '234F')], nameKey('Bob Smith'), '234F')).toBeNull();
  });
  it('single-token names only match exactly', () => {
    expect(matchPerson([c('1', 'Rahul')], nameKey('Rahulk'), null)).toBeNull();
  });
});
