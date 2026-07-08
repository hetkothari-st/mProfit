import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import { BadRequestError } from '../../lib/errors.js';

export interface OrderNotes {
  userId: string;
  tier: string;
  billingCycle: string;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw new BadRequestError('Razorpay is not configured on this server');
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
  }
  return client;
}

// Razorpay caps `receipt` at 40 chars. Real identity binding lives in
// `notes` (re-fetched and trusted at verify time) — this is just a
// short, merchant-facing reference, so a truncated tier + short random
// suffix is enough; it doesn't need to encode the full userId/timestamp.
function shortReceipt(tier: string): string {
  return `${tier.slice(0, 20)}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Creates a Razorpay order for the given amount. `notes` are opaque
 * metadata Razorpay stores alongside the order and returns unmodified on
 * fetch — used here to bind the order to a specific user + plan tier so
 * `verifyAndFetchOrder` never has to trust client-supplied plan data.
 */
export async function createOrder(input: {
  amountPaise: number;
  notes: OrderNotes;
}): Promise<{ orderId: string; amount: number; currency: string }> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) {
    throw new BadRequestError('Order amount must be at least 100 paise');
  }
  const order = await getClient().orders.create({
    amount: input.amountPaise,
    currency: 'INR',
    receipt: shortReceipt(input.notes.tier),
    notes: input.notes as unknown as Record<string, string | number>,
  });
  return {
    orderId: order.id,
    // order.amount echoes back the integer paise value we sent — already
    // the smallest currency unit (no fractional/decimal precision at
    // stake), just typed as `number | string` by the SDK.
    // eslint-disable-next-line portfolioos/no-money-coercion -- integer paise, not a decimal amount
    amount: Number(order.amount),
    currency: order.currency,
  };
}

/**
 * Verifies the HMAC-SHA256 signature Razorpay's checkout returns
 * (`orderId|paymentId` signed with the key secret). Uses a constant-time
 * comparison to avoid leaking timing information. Returns nothing on
 * success; throws on mismatch — never mark a payment as accepted on a
 * failed compare.
 */
export function assertValidSignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): void {
  if (!isRazorpayConfigured()) {
    throw new BadRequestError('Razorpay is not configured on this server');
  }
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET!)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(input.razorpaySignature, 'hex');
  const valid =
    expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

  if (!valid) {
    throw new BadRequestError('Payment signature verification failed');
  }
}

/**
 * Fetches the order back from Razorpay so the caller can read the trusted
 * `notes` (userId/tier/billingCycle) set at creation time, rather than
 * trusting whatever the client posts to the verify endpoint — a client
 * that captured someone else's order/payment/signature triple should not
 * be able to claim a different tier than what was actually paid for.
 */
export async function fetchOrderNotes(orderId: string): Promise<OrderNotes> {
  const order = await getClient().orders.fetch(orderId);
  const notes = order.notes as unknown as Partial<OrderNotes> | undefined;
  if (!notes?.userId || !notes?.tier || !notes?.billingCycle) {
    throw new BadRequestError('Order is missing plan metadata');
  }
  return { userId: notes.userId, tier: notes.tier, billingCycle: notes.billingCycle };
}
