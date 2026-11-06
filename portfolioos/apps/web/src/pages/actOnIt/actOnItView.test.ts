import { describe, it, expect } from 'vitest';
import { barShare, outcomeLabel, stateLabel, twoPathEnds, riskSteps, shortInr } from './actOnItView';

describe('act on it view helpers', () => {
  it('two paths: ₹1,80,000 for a year at 3% vs 6.5%', () => {
    expect(twoPathEnds('180000.00', 3, 6.5)).toEqual({ doNothing: '185400.00', act: '191700.00', gap: '6300.00' });
  });

  it('bar widths share the largest absolute result, never over 100%', () => {
    expect(barShare('31200.00', ['31200.00', '-9400.00', '18900.00'])).toBe(100);
    expect(barShare('-9400.00', ['31200.00', '-9400.00'])).toBeCloseTo(30.13, 1);
    expect(barShare(null, ['1.00'])).toBe(0);
  });

  it('labels states and outcomes in plain words', () => {
    expect(stateLabel('ACCEPTED')).toBe('You accepted, not seen yet');
    expect(stateLabel('CONFIRMED')).toBe('Confirmed in your data');
    expect(stateLabel('CONFIRMED_BY_USER')).toBe('Done, by your word');
    expect(outcomeLabel('NOT_MEASURED', null)).toBe('Not measured');
    expect(outcomeLabel('PENDING', null)).toBe('Result due later');
  });

  it('risk meter steps and short rupees', () => {
    expect(riskSteps('LOW')).toBe(1);
    expect(riskSteps('HIGH')).toBe(5);
    expect(shortInr('180000.00')).toBe('₹1.8 lakh');
    expect(shortInr('62400.00')).toBe('₹62,400');
  });
});
