import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { assertValidSignature } from '../../src/services/billing/razorpay.service.js';
import { env } from '../../src/config/env.js';

function signaturesFor(orderId: string, paymentId: string): string {
  return crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

describe('assertValidSignature', () => {
  it('does not throw for a correctly-computed signature', () => {
    const orderId = 'order_test123';
    const paymentId = 'pay_test456';
    const razorpaySignature = signaturesFor(orderId, paymentId);
    expect(() =>
      assertValidSignature({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature }),
    ).not.toThrow();
  });

  it('throws on a mismatched signature', () => {
    expect(() =>
      assertValidSignature({
        razorpayOrderId: 'order_test123',
        razorpayPaymentId: 'pay_test456',
        razorpaySignature: 'deadbeef',
      }),
    ).toThrow(/signature/i);
  });

  it('throws when the signature was computed for a different order/payment pair', () => {
    const forged = signaturesFor('order_OTHER', 'pay_OTHER');
    expect(() =>
      assertValidSignature({
        razorpayOrderId: 'order_test123',
        razorpayPaymentId: 'pay_test456',
        razorpaySignature: forged,
      }),
    ).toThrow(/signature/i);
  });
});
