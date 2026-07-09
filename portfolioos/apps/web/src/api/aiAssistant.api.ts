import { api, unwrap } from './client';
import type { ApiResponse } from '@portfolioos/shared';
import { getApiBaseUrl } from './baseUrl';
import { useAuthStore } from '@/stores/auth.store';
import { useFamilyScopeStore } from '@/stores/familyScope.store';

export type AiCardType = 'holding' | 'goal' | 'stat' | 'action';

export interface AiCard {
  cardType: AiCardType;
  data: Record<string, unknown>;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cardData: AiCard | null;
  createdAt: string;
  /** True for the one synthetic FREE-tier preview answer — render blurred. */
  locked: boolean;
}

export interface AiSuggestion {
  question: string;
  intent: string;
}

export interface AiQuota {
  allowed: boolean;
  reason?: 'tier_locked' | 'daily_cap';
  used: number;
  limit: number;
  resetsAt: string;
  /**
   * Only meaningful when reason === 'tier_locked'. Server-side source of
   * truth for "has this user already spent their one-time free preview" —
   * survives a refresh, a relogin, or a different device/browser, unlike
   * a client-only flag.
   */
  previewUsed?: boolean;
}

export interface AiChatSession {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

export type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'card'; data: AiCard }
  | { type: 'locked' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export const aiAssistantApi = {
  async listSessions(): Promise<AiChatSession[]> {
    const { data } = await api.get<ApiResponse<AiChatSession[]>>('/api/assistant/sessions');
    return unwrap(data);
  },
  async createSession(): Promise<AiChatSession> {
    const { data } = await api.post<ApiResponse<AiChatSession>>('/api/assistant/sessions');
    return unwrap(data);
  },
  async deleteSession(sessionId: string): Promise<void> {
    await api.delete(`/api/assistant/sessions/${sessionId}`);
  },
  async renameSession(sessionId: string, title: string): Promise<AiChatSession> {
    const { data } = await api.patch<ApiResponse<AiChatSession>>(
      `/api/assistant/sessions/${sessionId}`,
      { title },
    );
    return unwrap(data);
  },
  async sessionHistory(sessionId: string): Promise<AiMessage[]> {
    const { data } = await api.get<ApiResponse<AiMessage[]>>(
      `/api/assistant/sessions/${sessionId}/history`,
    );
    return unwrap(data);
  },
  async suggested(): Promise<AiSuggestion[]> {
    const { data } = await api.get<ApiResponse<AiSuggestion[]>>('/api/assistant/suggested');
    return unwrap(data);
  },
  async quota(): Promise<AiQuota> {
    const { data } = await api.get<ApiResponse<AiQuota>>('/api/assistant/quota');
    return unwrap(data);
  },

  /**
   * SSE streaming POST /chat. Uses raw fetch because axios doesn't
   * expose the underlying ReadableStream in a way that lets us parse
   * `data: ...\n\n` chunks live. Manually attaches the same auth +
   * family headers the axios interceptors would.
   */
  async streamChat(
    message: string,
    sessionId: string,
    onEvent: (e: StreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = useAuthStore.getState().accessToken;
    const familyId = useFamilyScopeStore.getState().viewingAsFamilyId;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (familyId) headers['X-Viewing-As-Family'] = familyId;

    const response = await fetch(`${getApiBaseUrl()}/api/assistant/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, sessionId }),
      signal,
    });

    if (!response.ok) {
      let payload: Record<string, unknown> = {};
      try {
        payload = (await response.json()) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      onEvent({
        type: 'error',
        message:
          (payload.message as string) ??
          (payload.error as string) ??
          `HTTP ${response.status}`,
      });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onEvent({ type: 'error', message: 'No response body' });
      return;
    }
    const decoder = new TextDecoder();
    let buf = '';
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Split on double newline (SSE event boundary).
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload) as StreamEvent;
            onEvent(parsed);
          } catch {
            /* skip malformed events */
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'stream_aborted';
      onEvent({ type: 'error', message });
    }
  },
};
