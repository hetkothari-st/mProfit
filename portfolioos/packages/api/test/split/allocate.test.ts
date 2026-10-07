import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { allocate, computeShares, toBase, allocateBase } from '../../src/services/split/allocate.js';

const D = (v: string) => new Decimal(v);
const sum = (m: Map<string, Decimal>) => [...m.values()].reduce((a, b) => a.plus(b), D('0'));
const str = (m: Map<string, Decimal>) => Object.fromEntries([...m].map(([k, v]) => [k, v.toFixed(2)]));

describe('allocate', () => {
  it('splits 100 three ways exactly, extra paisa to lowest id', () => {
    const r = allocate(D('100'), [
      { id: 'b', weight: D('1') }, { id: 'a', weight: D('1') }, { id: 'c', weight: D('1') },
    ]);
    expect(str(r)).toEqual({ a: '33.34', b: '33.33', c: '33.33' });
    expect(sum(r).toFixed(2)).toBe('100.00');
  });

  it('hands out multiple leftover paise in id order', () => {
    const r = allocate(D('0.05'), [
      { id: 'a', weight: D('1') }, { id: 'b', weight: D('1') }, { id: 'c', weight: D('1') },
    ]);
    expect(str(r)).toEqual({ a: '0.02', b: '0.02', c: '0.01' });
  });

  it('weights proportionally', () => {
    const r = allocate(D('90'), [{ id: 'a', weight: D('2') }, { id: 'b', weight: D('1') }]);
    expect(str(r)).toEqual({ a: '60.00', b: '30.00' });
  });

  it('rejects empty or zero-weight input', () => {
    expect(() => allocate(D('10'), [])).toThrow(/SPLIT_NO_PARTICIPANTS/);
    expect(() => allocate(D('10'), [{ id: 'a', weight: D('0') }])).toThrow(/SPLIT_NO_PARTICIPANTS/);
  });
});

describe('computeShares', () => {
  it('EQUAL', () => {
    const r = computeShares('EQUAL', D('100'), [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }]);
    expect(sum(r).toFixed(2)).toBe('100.00');
  });

  it('EXACT must sum to amount', () => {
    const ok = computeShares('EXACT', D('100'), [{ memberId: 'a', value: '60' }, { memberId: 'b', value: '40' }]);
    expect(str(ok)).toEqual({ a: '60.00', b: '40.00' });
    expect(() =>
      computeShares('EXACT', D('100'), [{ memberId: 'a', value: '60' }, { memberId: 'b', value: '39.99' }]),
    ).toThrow(/SPLIT_SUM_MISMATCH/);
  });

  it('PERCENT 33.33/33.33/33.34 of 100 totals exactly', () => {
    const r = computeShares('PERCENT', D('100'), [
      { memberId: 'a', value: '33.33' }, { memberId: 'b', value: '33.33' }, { memberId: 'c', value: '33.34' },
    ]);
    expect(sum(r).toFixed(2)).toBe('100.00');
  });

  it('PERCENT not summing to 100 is rejected', () => {
    expect(() =>
      computeShares('PERCENT', D('100'), [{ memberId: 'a', value: '50' }, { memberId: 'b', value: '40' }]),
    ).toThrow(/SPLIT_PERCENT_NOT_100/);
  });

  it('SHARES 2:1', () => {
    const r = computeShares('SHARES', D('300'), [{ memberId: 'a', value: '2' }, { memberId: 'b', value: '1' }]);
    expect(str(r)).toEqual({ a: '200.00', b: '100.00' });
  });

  it('rejects negative, non-numeric, more than 2 dp in EXACT, and duplicate members', () => {
    expect(() => computeShares('SHARES', D('10'), [{ memberId: 'a', value: '-1' }])).toThrow(/SPLIT_BAD_INPUT/);
    expect(() => computeShares('SHARES', D('10'), [{ memberId: 'a', value: 'abc' }])).toThrow(/SPLIT_BAD_INPUT/);
    expect(() => computeShares('EXACT', D('10'), [{ memberId: 'a', value: '10.001' }])).toThrow(/SPLIT_BAD_INPUT/);
    expect(() => computeShares('EQUAL', D('10'), [{ memberId: 'a' }, { memberId: 'a' }])).toThrow(/SPLIT_BAD_INPUT/);
  });

  it('rejects an amount with more than 2 dp or <= 0', () => {
    expect(() => computeShares('EQUAL', D('10.005'), [{ memberId: 'a' }])).toThrow(/SPLIT_BAD_INPUT/);
    expect(() => computeShares('EQUAL', D('0'), [{ memberId: 'a' }])).toThrow(/SPLIT_BAD_INPUT/);
  });
});

describe('base currency', () => {
  it('toBase rounds half-even to 2 dp', () => {
    expect(toBase(D('10'), D('83.12345')).toFixed(2)).toBe('831.23');
    expect(toBase(D('1'), D('0.125')).toFixed(2)).toBe('0.12');
  });

  it('allocateBase keeps base totals exact', () => {
    const shares = new Map([['a', D('33.34')], ['b', D('33.33')], ['c', D('33.33')]]);
    const base = allocateBase(D('8312.35'), shares);
    expect(sum(base).toFixed(2)).toBe('8312.35');
  });
});
