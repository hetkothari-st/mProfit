import { describe, it, expect } from 'vitest';
import { encodeEmiUrl, decodeEmiUrl } from './emiUrl';
import { defaultCalcState, defaultCompareState } from './emiState';

const calc = { ...defaultCalcState(new Date(2026, 9, 12)), principal: '25,00,000', ratePct: '9', taxOn: true };
const compare = defaultCompareState();

describe('emi share URL', () => {
  it('keeps the Live rates tab', () => {
    expect(decodeEmiUrl('?tab=rates')).toEqual({ tab: 'rates' });
    expect(decodeEmiUrl(`?${encodeEmiUrl('rates', calc, compare)}`).tab).toBe('rates');
    expect(decodeEmiUrl('?tab=bogus').tab).toBe('calculate');
  });

  it('round-trips state and tab', () => {
    const q = encodeEmiUrl('compare', calc, compare);
    expect(q.startsWith('v=1&')).toBe(true);
    const d = decodeEmiUrl(`?${q}`);
    expect(d.error).toBeUndefined();
    expect(d.tab).toBe('compare');
    expect(d.calc).toEqual(calc);
    expect(d.compare).toEqual(compare);
  });

  it('survives non-ASCII offer labels', () => {
    const c = { offers: [{ ...compare.offers[0]!, label: 'घर ऋण' }, compare.offers[1]!] };
    expect(decodeEmiUrl(`?${encodeEmiUrl('compare', calc, c)}`).compare).toEqual(c);
  });

  it('empty search is not an error', () => {
    expect(decodeEmiUrl('')).toEqual({ tab: 'calculate' });
  });

  it.each([
    '?v=1&s=%%%garbage',
    '?v=99&s=e30',
    `?v=1&s=${btoa(JSON.stringify({ principal: 5 }))}`,
  ])('rejects %s with an error and no state', (search) => {
    const d = decodeEmiUrl(search);
    expect(d.error).toBeDefined();
    expect(d.calc).toBeUndefined();
  });
});
