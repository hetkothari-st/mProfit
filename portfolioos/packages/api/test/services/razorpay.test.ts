import crypto from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';

// `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are optional in config/env.ts and
// are absent from the checked-in .env, so on a developer machine
// `isRazorpayConfigured()` is false and `assertValidSignature` refuses before
// it ever reaches the HMAC — while the test's own `createHmac(undefined)`
// throws a TypeError. Seed deterministic dummy credentials so the signature
// check is exercised for real. `vi.hoisted` runs before the ESM imports below,
// which is when config/env.ts parses process.env; `dotenv/config` does not
// overwrite variables that are already set, so a real .env still wins.
const { TEST_KEY_SECRET } = vi.hoisted(() => {
  const secret = 'rzp_test_secret_do_not_use_in_production';
  process.env['RAZORPAY_KEY_ID'] ??= 'rzp_test_key_id';
  process.env['RAZORPAY_KEY_SECRET'] ??= secret;
  return { TEST_KEY_SECRET: secret };
});

const { assertValidSignature } = await import(
  '../../src/services/billing/razorpay.service.js'
);
const { env } = await import('../../src/config/env.js');

function signaturesFor(orderId: string, paymentId: string): string {
  // Read back through `env` rather than the literal so the test still signs
  // with the real secret when one is configured in the environment.
  return crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET ?? TEST_KEY_SECRET)
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
