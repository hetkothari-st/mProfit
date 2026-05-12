import { api } from './client';
import type { UserPreferences, ApiResponse } from '@portfolioos/shared';

export const userPreferencesApi = {
  async get(): Promise<UserPreferences> {
    const { data } = await api.get<ApiResponse<UserPreferences>>('/api/user/preferences');
    if (!data.success) throw new Error(data.error);
    return data.data;
  },

  async update(prefs: UserPreferences): Promise<UserPreferences> {
    const { data } = await api.patch<ApiResponse<UserPreferences>>('/api/user/preferences', prefs);
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
