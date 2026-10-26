import { describe, expect, it } from 'vitest';
import { MF_FORM_BAND_ORDER, mfFormBand } from './mfAnalytics.rating.js';

describe('mfFormBand', () => {
  it('reads each star rating as one band', () => {
    expect(mfFormBand(5)).toBe('LEADING');
    expect(mfFormBand(4)).toBe('LEADING');
    expect(mfFormBand(3)).toBe('STEADY');
    expect(mfFormBand(2)).toBe('LAGGING');
    expect(mfFormBand(1)).toBe('WEAK');
  });

  it('gives no band to an unrated or out-of-range rating', () => {
    expect(mfFormBand(null)).toBeNull();
    expect(mfFormBand(undefined)).toBeNull();
    expect(mfFormBand(0)).toBeNull();
    expect(mfFormBand(6)).toBeNull();
  });

  it('orders bands best first', () => {
    expect(MF_FORM_BAND_ORDER).toEqual(['LEADING', 'STEADY', 'LAGGING', 'WEAK']);
  });
});
