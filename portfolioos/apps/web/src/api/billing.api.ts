import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';
import type { PlanTierValue } from '@portfolioos/shared';

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export interface CheckoutIntentResult {
  status: 'not_implemented';
  tier: PlanTierValue;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  message: string;
}

export const billingApi = {
  // TODO: wire to Razorpay checkout — see payments task. Today this only
  // hits the placeholder stub in packages/api/src/routes/billing.routes.ts.
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
};
