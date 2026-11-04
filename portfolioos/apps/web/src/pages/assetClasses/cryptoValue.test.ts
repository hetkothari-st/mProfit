import { describe, it, expect } from 'vitest';
import { Decimal } from '@everypaisa/shared';
import { cryptoHoldingValue, cryptoInrToUsd } from './cryptoUtils';

// The Crypto page valued holdings at the live quote it polls every 15s while
// the dashboard, Analytics and the Will Maker used the stored price, so the
// same coins showed different values on different pages.
describe('crypto valuation', () => {
  it('uses the stored value, whatever the live quote says', () => {
    expect(cryptoHoldingValue({ currentValue: '125000.50' })!.toString()).toBe('125000.5');
    expect(cryptoHoldingValue({ currentValue: null })).toBeNull();
  });

  it('converts that value to USD at the live INR/USD ratio', () => {
    const usd = cryptoInrToUsd(new Decimal('880000'), { priceInr: '8800000', priceUsd: '100000' });
    expect(usd!.toString()).toBe('10000');
    expect(cryptoInrToUsd(new Decimal('1'), { priceInr: null, priceUsd: '1' })).toBeNull();
  });
});
