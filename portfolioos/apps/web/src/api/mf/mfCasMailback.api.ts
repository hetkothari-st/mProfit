import { api } from '../client';
import type { ApiResponse } from '@everypaisa/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface InitiateInput {
  /** Omit to use the PAN on the effective profile (see `pan()`). */
  pan?: string;
  email: string;
  portfolioId?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  nickname?: string | null;
  providers?: ('CAMS' | 'KFINTECH')[];
}

export interface ProviderInitState {
  sessionKey: string;
  captchaImageBase64: string | null;
}

export interface InitiateResult {
  jobId: string;
  emailMasked: string;
  cams: ProviderInitState | null;
  kfintech: ProviderInitState | null;
}

export interface SubmitInput {
  jobId: string;
  pdfPassword?: string; // optional — backend defaults to user.pan
  cams?: { sessionKey: string; captcha?: string } | null;
  kfintech?: { sessionKey: string; captcha?: string } | null;
}

export interface SubmitProviderResult {
  ok: boolean;
  requestRef: string | null;
  message: string;
}

export interface SubmitResult {
  jobId: string;
  status: 'SUBMITTED' | 'FAILED';
  cams: SubmitProviderResult | null;
  kfintech: SubmitProviderResult | null;
}

export interface MFCasMailbackJobDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  panLast4: string;
  emailMasked: string;
  periodFrom: string | null;
  periodTo: string | null;
  nickname: string | null;
  camsStatus: 'NOT_REQUESTED' | 'PENDING' | 'SUBMITTED' | 'FAILED';
  camsRequestRef: string | null;
  camsErrorMessage: string | null;
  kfintechStatus: 'NOT_REQUESTED' | 'PENDING' | 'SUBMITTED' | 'FAILED';
  kfintechRequestRef: string | null;
  kfintechErrorMessage: string | null;
  status: 'PENDING' | 'CAPTCHA_REQUIRED' | 'SUBMITTING' | 'SUBMITTED' | 'FAILED';
  errorMessage: string | null;
  createdAt: string;
  submittedAt: string | null;
}

export const mfCasMailbackApi = {
  /** The masked PAN a mailback will use — the effective (acted-for) profile's. */
  async pan(): Promise<{ panMasked: string | null }> {
    const { data } = await api.get<ApiResponse<{ panMasked: string | null }>>(
      '/api/mf-cas-mailback/pan',
    );
    return unwrap(data);
  },
  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const { data } = await api.post<ApiResponse<InitiateResult>>(
      '/api/mf-cas-mailback/initiate',
      input,
    );
    return unwrap(data);
  },
  async submit(input: SubmitInput): Promise<SubmitResult> {
    const { data } = await api.post<ApiResponse<SubmitResult>>(
      '/api/mf-cas-mailback/submit',
      input,
    );
    return unwrap(data);
  },
  async getJob(id: string): Promise<MFCasMailbackJobDTO> {
    const { data } = await api.get<ApiResponse<MFCasMailbackJobDTO>>(
      `/api/mf-cas-mailback/jobs/${id}`,
    );
    return unwrap(data);
  },
  async listJobs(): Promise<MFCasMailbackJobDTO[]> {
    const { data } = await api.get<ApiResponse<MFCasMailbackJobDTO[]>>('/api/mf-cas-mailback/jobs');
    return unwrap(data);
  },
};
