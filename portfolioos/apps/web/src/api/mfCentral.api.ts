import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface RequestOtpInput {
  pan: string;
  otpMethod: 'PHONE' | 'EMAIL';
  contactValue: string;
  portfolioId?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  nickname?: string | null;
}

export interface RequestOtpResult {
  jobId: string;
  maskedContact: string;
  status: 'OTP_PENDING';
}

export interface SubmitOtpResult {
  jobId: string;
  status: 'COMPLETED' | 'FAILED';
  txnsCreated: number;
  fundsFound: number;
  warnings: string[];
  portfolioId: string | null;
  errorMessage?: string;
}

export interface MFCentralSyncJobDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  panLast4: string;
  otpMethod: 'PHONE' | 'EMAIL';
  contactMasked: string;
  periodFrom: string | null;
  periodTo: string | null;
  nickname: string | null;
  status:
    | 'OTP_PENDING'
    | 'OTP_SUBMITTED'
    | 'DOWNLOADING'
    | 'PARSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'EXPIRED';
  txnsCreated: number | null;
  fundsFound: number | null;
  warningLog: string[] | null;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
}

export const mfCentralApi = {
  async requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
    const { data } = await api.post<ApiResponse<RequestOtpResult>>(
      '/api/mf-central/request-otp',
      input,
    );
    return unwrap(data);
  },
  async submitOtp(jobId: string, otp: string): Promise<SubmitOtpResult> {
    const { data } = await api.post<ApiResponse<SubmitOtpResult>>(
      '/api/mf-central/submit-otp',
      { jobId, otp },
    );
    return unwrap(data);
  },
  async getJob(jobId: string): Promise<MFCentralSyncJobDTO> {
    const { data } = await api.get<ApiResponse<MFCentralSyncJobDTO>>(
      `/api/mf-central/jobs/${jobId}`,
    );
    return unwrap(data);
  },
  async listJobs(): Promise<MFCentralSyncJobDTO[]> {
    const { data } = await api.get<ApiResponse<MFCentralSyncJobDTO[]>>('/api/mf-central/jobs');
    return unwrap(data);
  },
};
