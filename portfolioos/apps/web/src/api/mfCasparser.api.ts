import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

// CDSL OTP fetch (sync via casparser.in)
export interface CdslRequestOtpInput {
  pan: string;
  boId: string;       // 16-digit CDSL Client ID
  dob: string;        // YYYY-MM-DD
  portfolioId?: string | null;
  nickname?: string | null;
}

export interface CdslRequestOtpResult {
  jobId: string;
  maskedContact: string;
  status: 'OTP_PENDING';
}

export interface CdslSubmitOtpResult {
  jobId: string;
  status: 'COMPLETED' | 'FAILED';
  txnsCreated: number;
  fundsFound: number;
  warnings: string[];
  portfolioId: string | null;
}

// KFintech mailback (async via casparser.in)
export interface KfintechMailbackInput {
  pan: string;
  email: string;
  fromDate?: string | null;
  toDate?: string | null;
}

export interface KfintechMailbackResult {
  ok: boolean;
  message: string;
  requestId: string | null;
}

export interface CreditsResult {
  credits_remaining?: number;
  credits_total?: number;
  plan?: string;
  [k: string]: unknown;
}

export const mfCasparserApi = {
  async cdslRequestOtp(input: CdslRequestOtpInput): Promise<CdslRequestOtpResult> {
    const { data } = await api.post<ApiResponse<CdslRequestOtpResult>>(
      '/api/mf-casparser/cdsl/request-otp',
      input,
    );
    return unwrap(data);
  },
  async cdslSubmitOtp(jobId: string, otp: string): Promise<CdslSubmitOtpResult> {
    const { data } = await api.post<ApiResponse<CdslSubmitOtpResult>>(
      '/api/mf-casparser/cdsl/submit-otp',
      { jobId, otp },
    );
    return unwrap(data);
  },
  async kfintechMailback(input: KfintechMailbackInput): Promise<KfintechMailbackResult> {
    // Casparser can take up to 60s. Default axios timeout=0 (none) but some
    // proxies/firewalls cut at 30s — set explicit 90s ceiling so we surface
    // a real timeout instead of opaque Network Error.
    const { data } = await api.post<ApiResponse<KfintechMailbackResult>>(
      '/api/mf-casparser/kfintech/mailback',
      input,
      { timeout: 90_000 },
    );
    return unwrap(data);
  },
  async credits(): Promise<CreditsResult> {
    const { data } = await api.get<ApiResponse<CreditsResult>>('/api/mf-casparser/credits');
    return unwrap(data);
  },
};
