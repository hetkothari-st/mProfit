import { describe, it, expect } from 'vitest';
import { barShare, outcomeLabel, stateLabel, twoPathEnds, riskSteps, shortInr, factValue, reasonPoints, figureParts } from './actOnItView';

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

  it('shows a fact as money, a percentage or text', () => {
    expect(factValue({ label: 'Portfolio value', value: '1234567.8912', kind: 'inr' })).toBe('₹12,34,568');
    expect(factValue({ label: 'Savings rate', value: '3', kind: 'pct' })).toBe('3%');
    expect(factValue({ label: 'Matures on', value: 'Aug 2026', kind: 'text' })).toBe('Aug 2026');
  });

  it('splits the reason into short points, keeping decimals and drops paise', () => {
    const r = 'Gold is 40.0% of your ₹12,00,000.40 portfolio. Sell ₹2,50,000.60 of it — about 0.2500 units. That is the largest.';
    expect(reasonPoints(r)).toEqual([
      'Gold is 40.0% of your ₹12,00,000 portfolio.',
      'Sell ₹2,50,001 of it — about 0.2500 units.',
      'That is the largest.',
    ]);
  });

  it('marks the figures in a point so they can stand out', () => {
    expect(figureParts('Sell ₹2,50,001 now, 25% of it')).toEqual([
      { text: 'Sell ', figure: false },
      { text: '₹2,50,001', figure: true },
      { text: ' now, ', figure: false },
      { text: '25%', figure: true },
      { text: ' of it', figure: false },
    ]);
  });
});
