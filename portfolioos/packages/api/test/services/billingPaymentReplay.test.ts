import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// A verified Razorpay payment used to be re-playable by its own buyer: POSTing
// the same (order, payment, signature) to /verify-payment again reset
// planExpiresAt to now + cycle every time, so one purchase renewed forever.
// Each payment may activate a plan exactly once.
const { paymentCreate, userUpdate, userFind } = vi.hoisted(() => ({
  paymentCreate: vi.fn(),
  userUpdate: vi.fn(),
  userFind: vi.fn(),
}));

vi.mock('../../src/lib/prisma.js', () => {
  const tx = {
    billingPayment: { create: (...a: unknown[]) => paymentCreate(...a) },
    user: {
      update: (...a: unknown[]) => userUpdate(...a),
      findUniqueOrThrow: (...a: unknown[]) => userFind(...a),
    },
  };
  return {
    prisma: tx,
    runInTransaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
});

import { activatePaidPlan } from '../../src/services/billing/planActivation.service.js';

const seen = new Set<string>();

beforeEach(() => {
  seen.clear();
  paymentCreate.mockReset().mockImplementation(async ({ data }: { data: { razorpayPaymentId: string } }) => {
    if (seen.has(data.razorpayPaymentId)) {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
    }
    seen.add(data.razorpayPaymentId);
    return data;
  });
  userUpdate.mockReset().mockImplementation(async ({ data }: { data: object }) => ({ id: 'u1', ...data }));
  userFind.mockReset().mockResolvedValue({ id: 'u1', plan: 'PLUS', planExpiresAt: new Date('2026-11-05') });
});

const input = {
  userId: 'u1',
  razorpayOrderId: 'order_1',
  razorpayPaymentId: 'pay_1',
  tier: 'PLUS' as const,
  billingCycle: 'MONTHLY' as const,
};

describe('activatePaidPlan', () => {
  it('activates the plan on the first use of a payment', async () => {
    const r = await activatePaidPlan(input);
    expect(r.replayed).toBe(false);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    expect(userUpdate.mock.calls[0]![0].data.plan).toBe('PLUS');
  });

  it('does not extend the plan when the same payment is presented again', async () => {
    await activatePaidPlan(input);
    const again = await activatePaidPlan(input);
    expect(again.replayed).toBe(true);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    expect(again.user).toEqual(expect.objectContaining({ id: 'u1' }));
  });

  it('a different payment still activates normally', async () => {
    await activatePaidPlan(input);
    await activatePaidPlan({ ...input, razorpayOrderId: 'order_2', razorpayPaymentId: 'pay_2' });
    expect(userUpdate).toHaveBeenCalledTimes(2);
  });
});
