import { api } from './client';
import type { ApiResponse, AuthUser, PlanTierValue } from '@portfolioos/shared';

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

export interface VerifyPaymentResult {
  user: AuthUser;
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
  }): Promise<VerifyPaymentResult> {
    const { data } = await api.post<ApiResponse<VerifyPaymentResult>>(
      '/api/billing/verify-payment',
      payload,
    );
    return unwrap(data);
  },
};
