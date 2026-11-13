import type {
  AdminLoanRateSourceWire, ApiResponse, LoanRateReadingWire, LoanRatesWire, ManualRateInputWire, MclrTenor, RateLoanType,
} from '@everypaisa/shared';
import { api, unwrap } from './client';

/** Live loan rates (EMI calculator plan 2). Rates arrive as decimal strings and stay strings. */
export const loanRatesApi = {
  async list(loanType: RateLoanType): Promise<LoanRatesWire> {
    const { data } = await api.get<ApiResponse<LoanRatesWire>>('/api/loan-rates', { params: { loanType } });
    return unwrap(data);
  },
};

const ADMIN = '/api/admin/loan-rates';

/** Settings - Loan rates. Every call needs ADMIN and a session signed in with a second factor. */
export const loanRatesAdminApi = {
  async list(): Promise<AdminLoanRateSourceWire[]> {
    const { data } = await api.get<ApiResponse<{ sources: AdminLoanRateSourceWire[] }>>(ADMIN);
    return unwrap(data).sources;
  },
  async setManual(sourceId: string, input: ManualRateInputWire): Promise<LoanRateReadingWire> {
    const { data } = await api.post<ApiResponse<LoanRateReadingWire>>(`${ADMIN}/${encodeURIComponent(sourceId)}/manual`, input);
    return unwrap(data);
  },
  async clearManual(sourceId: string, tenor: MclrTenor | null): Promise<number> {
    const { data } = await api.delete<ApiResponse<{ cleared: number }>>(`${ADMIN}/${encodeURIComponent(sourceId)}/manual`, {
      params: tenor ? { tenor } : {},
    });
    return unwrap(data).cleared;
  },
  async approve(id: string): Promise<LoanRateReadingWire> {
    const { data } = await api.post<ApiResponse<LoanRateReadingWire>>(`${ADMIN}/readings/${encodeURIComponent(id)}/approve`);
    return unwrap(data);
  },
  async reject(id: string): Promise<LoanRateReadingWire> {
    const { data } = await api.post<ApiResponse<LoanRateReadingWire>>(`${ADMIN}/readings/${encodeURIComponent(id)}/reject`);
    return unwrap(data);
  },
  async run(sourceId?: string): Promise<void> {
    await api.post(`${ADMIN}/run`, sourceId ? { sourceId } : {});
  },
};
