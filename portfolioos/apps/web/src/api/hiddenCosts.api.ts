import { api } from './client';
import type { ApiResponse, HiddenCostsView } from '@everypaisa/shared';

export const HIDDEN_COSTS_KEY = ['hidden-costs'] as const;

export const hiddenCostsApi = {
  async view(): Promise<HiddenCostsView> {
    const { data } = await api.get<ApiResponse<HiddenCostsView>>('/api/hidden-costs');
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
