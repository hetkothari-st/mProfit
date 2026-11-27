import { api } from './client';
import type { ApiResponse, HiddenCostsView } from '@everypaisa/shared';

export const HIDDEN_COSTS_KEY = ['hidden-costs'] as const;

/**
 * The X-ray builds the full advisor facts per request, which can be slow on a
 * large portfolio. Under the client's 2-minute default plus one retry a hung
 * request spun for minutes (launch review B4); fail sooner and say so.
 */
export const HIDDEN_COSTS_TIMEOUT_MS = 45_000;

export const hiddenCostsApi = {
  async view(): Promise<HiddenCostsView> {
    const { data } = await api.get<ApiResponse<HiddenCostsView>>('/api/hidden-costs', { timeout: HIDDEN_COSTS_TIMEOUT_MS });
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
