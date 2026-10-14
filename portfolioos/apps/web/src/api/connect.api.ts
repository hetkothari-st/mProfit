import type { AiConnectionWire, AiConnectorArea, AiConnectorAuthRequestWire, AiConnectorDecisionResultWire, ApiResponse } from '@everypaisa/shared';
import { api, unwrap } from './client';

const BASE = '/api/connect';

/** AI Connector: approve a chatbot, list and revoke connections. */
export const connectApi = {
  async getRequest(reqId: string): Promise<AiConnectorAuthRequestWire> {
    const { data } = await api.get<ApiResponse<AiConnectorAuthRequestWire>>(`${BASE}/requests/${encodeURIComponent(reqId)}`);
    return unwrap(data);
  },
  async decide(reqId: string, approve: boolean, areas: AiConnectorArea[]): Promise<AiConnectorDecisionResultWire> {
    const { data } = await api.post<ApiResponse<AiConnectorDecisionResultWire>>(`${BASE}/requests/${encodeURIComponent(reqId)}/decision`, { approve, areas });
    return unwrap(data);
  },
  async connections(): Promise<AiConnectionWire[]> {
    const { data } = await api.get<ApiResponse<AiConnectionWire[]>>(`${BASE}/connections`);
    return unwrap(data);
  },
  async revoke(id: string): Promise<void> {
    await api.delete(`${BASE}/connections/${encodeURIComponent(id)}`);
  },
};
