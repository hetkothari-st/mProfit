import { api, unwrap } from './client';
import type { ApiResponse, CoverageResponse } from '@everypaisa/shared';

/**
 * The coverage check's figures and seeded assumptions. Verdicts are worked
 * out on the client with the shared `computeCoverage`, so edits on the page
 * recompute without another request.
 */
export const insuranceCoverageApi = {
  async get(): Promise<CoverageResponse> {
    const { data } = await api.get<ApiResponse<CoverageResponse>>('/api/insurance/coverage');
    return unwrap(data);
  },
};
