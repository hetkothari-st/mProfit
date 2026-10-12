import type { ApiResponse, LoanRatesWire, RateLoanType } from '@everypaisa/shared';
import { api, unwrap } from './client';

/** Live loan rates (EMI calculator plan 2). Rates arrive as decimal strings and stay strings. */
export const loanRatesApi = {
  async list(loanType: RateLoanType): Promise<LoanRatesWire> {
    const { data } = await api.get<ApiResponse<LoanRatesWire>>('/api/loan-rates', { params: { loanType } });
    return unwrap(data);
  },
};
