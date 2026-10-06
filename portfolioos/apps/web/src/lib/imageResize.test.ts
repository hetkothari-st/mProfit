import { describe, it, expect } from 'vitest';
import { fitWithin } from './imageResize';

describe('fitWithin', () => {
  it('shrinks the long side to the limit, keeping the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never enlarges a small image', () => {
    expect(fitWithin(1000, 800, 1600)).toEqual({ width: 1000, height: 800 });
  });

  it('rounds to whole pixels and never goes below one', () => {
    expect(fitWithin(4032, 3024, 480)).toEqual({ width: 480, height: 360 });
    expect(fitWithin(10000, 3, 480)).toEqual({ width: 480, height: 1 });
  });
});
