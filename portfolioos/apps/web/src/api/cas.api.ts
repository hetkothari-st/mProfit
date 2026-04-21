import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface CasProvider {
  id: 'CAMS' | 'KFINTECH' | 'NSDL' | 'CDSL';
  name: string;
  coverage: string;
  url: string;
  passwordHint: string;
  emailFromPattern: string;
  subjectPattern: string;
  notes: string;
}

export interface CasRequestInput {
  provider: 'CAMS' | 'KFINTECH' | 'NSDL' | 'CDSL';
  pan?: string;
  email?: string;
  fromDate?: string;
  toDate?: string;
  statementType?: 'DETAILED' | 'SUMMARY';
}

export interface CasRequestResult {
  portalUrl: string;
  instructions: string[];
  nextSteps: string[];
}

export const casApi = {
  async providers(): Promise<{ providers: CasProvider[] }> {
    const { data } = await api.get<ApiResponse<{ providers: CasProvider[] }>>('/api/cas/providers');
    return unwrap(data);
  },
  async buildRequest(input: CasRequestInput): Promise<CasRequestResult> {
    const { data } = await api.post<ApiResponse<CasRequestResult>>('/api/cas/request', input);
    return unwrap(data);
  },
};
