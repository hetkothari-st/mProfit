import { describe, it, expect, vi } from 'vitest';
import { EmiError } from '@everypaisa/shared';
import { computeCompare, defaultCompareState } from './emiState';

vi.mock('@everypaisa/shared', async (orig) => {
  const actual = await orig<typeof import('@everypaisa/shared')>();
  return {
    ...actual,
    compareLoanOffers: () => { throw new actual.EmiError('INVALID_INPUT', 'This loan would not be repaid within 100 years - check the EMI and rates', 'emi'); },
  };
});

describe('computeCompare', () => {
  it('turns an EmiError from the maths into a field error instead of throwing', () => {
    const o = computeCompare(defaultCompareState(), '2026-11-05');
    expect(o).toEqual({ ok: false, errors: [{ field: 'emi', message: expect.stringContaining('100 years') }] });
    expect(EmiError).toBeTypeOf('function');
  });
});
