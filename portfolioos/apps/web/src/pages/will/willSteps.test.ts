import { describe, it, expect } from 'vitest';
import { stepBySlug, willStepPath, WILL_STEPS } from './willSteps';

describe('will steps', () => {
  it('has eight steps, overview first', () => {
    expect(WILL_STEPS.map((s) => s.slug)).toEqual(['overview', 'details', 'people', 'estate', 'allocation', 'instructions', 'review', 'preview']);
    expect(WILL_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('builds paths', () => {
    expect(willStepPath('w1', 1)).toBe('/will');
    expect(willStepPath('w1', 4)).toBe('/will/w1/estate');
    expect(willStepPath('w1', 99)).toBe('/will/w1/details');
    expect(stepBySlug('review')?.n).toBe(7);
    expect(stepBySlug('nope')).toBeUndefined();
  });
});
