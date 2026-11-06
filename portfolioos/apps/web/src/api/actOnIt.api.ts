import { api } from './client';
import type { ActOnItView, AdvicePopupView, AdviceWhyView, ApiResponse } from '@everypaisa/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export type AdviceAction = 'accept' | 'snooze' | 'dismiss' | 'done-elsewhere';

/** Every action answers with the fresh page, so callers just setQueryData. */
export const actOnItApi = {
  async view(): Promise<ActOnItView> {
    const { data } = await api.get<ApiResponse<ActOnItView>>('/api/act-on-it');
    return unwrap(data);
  },
  async act(id: string, action: AdviceAction): Promise<ActOnItView> {
    const { data } = await api.post<ApiResponse<ActOnItView>>(`/api/act-on-it/${id}/${action}`);
    return unwrap(data);
  },
  async why(id: string): Promise<AdviceWhyView> {
    const { data } = await api.get<ApiResponse<AdviceWhyView>>(`/api/act-on-it/${id}/why`);
    return unwrap(data);
  },
  async popup(): Promise<AdvicePopupView | null> {
    const { data } = await api.get<ApiResponse<AdvicePopupView | null>>('/api/act-on-it/popup');
    return unwrap(data);
  },
  async popupSeen(promptId: string): Promise<void> {
    await api.post(`/api/act-on-it/popup/${promptId}/seen`);
  },
};

export const ACT_ON_IT_KEY = ['act-on-it'] as const;
export const ACT_ON_IT_POPUP_KEY = ['act-on-it', 'popup'] as const;
