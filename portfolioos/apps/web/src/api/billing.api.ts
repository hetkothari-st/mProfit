import { api } from './client';
import type { ApiResponse, AuthTokens, AuthUser, PlanTierValue } from '@portfolioos/shared';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export type CheckoutIntentResult =
  | {
      status: 'not_implemented';
      tier: PlanTierValue;
      billingCycle: 'MONTHLY' | 'ANNUAL';
      message: string;
    }
  | {
      status: 'order_created';
      orderId: string;
      amount: number;
      currency: string;
      keyId: string;
      tier: PlanTierValue;
      billingCycle: 'MONTHLY' | 'ANNUAL';
    };

// Both plan-changing endpoints re-issue the session, because `plan` is
// carried in the access token and enforced from there server-side. Callers
// MUST store `tokens`, not just `user`, or the API keeps gating them on
// their old tier.
export interface PlanChangeResult {
  user: AuthUser;
  tokens: AuthTokens;
}

export const billingApi = {
  async checkoutIntent(
    tier: PlanTierValue,
    billingCycle: 'MONTHLY' | 'ANNUAL' = 'MONTHLY',
  ): Promise<CheckoutIntentResult> {
    const { data } = await api.post<ApiResponse<CheckoutIntentResult>>('/api/billing/checkout-intent', {
      tier,
      billingCycle,
    });
    return unwrap(data);
  },

  async verifyPayment(payload: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<PlanChangeResult> {
    const { data } = await api.post<ApiResponse<PlanChangeResult>>(
      '/api/billing/verify-payment',
      payload,
    );
    return unwrap(data);
  },

  // ADMIN-only. Sets your own plan directly, no Razorpay involved — QA
  // escape hatch for checking billing display across tiers without
  // spending real money on every check.
  async devSetPlan(tier: PlanTierValue): Promise<PlanChangeResult> {
    const { data } = await api.post<ApiResponse<PlanChangeResult>>('/api/billing/dev-set-plan', {
      tier,
    });
    return unwrap(data);
  },
};
