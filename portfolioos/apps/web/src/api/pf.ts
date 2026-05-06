import { api } from './client';
import { getApiBaseUrl } from './baseUrl';

export interface PfMemberIdDTO {
  id: string;
  memberIdLast4: string;
  establishmentName: string | null;
  currentBalance: string | null;
}

export interface PfAccount {
  id: string;
  type: 'EPF' | 'PPF';
  institution: string;
  identifierLast4: string;
  holderName: string;
  status: string;
  lastRefreshedAt: string | null;
  lastFetchSource: string | null;
  currentBalance: string | null;
  memberIds: PfMemberIdDTO[];
}

export const pfApi = {
  list: () =>
    api
      .get<{ success: true; data: PfAccount[] }>('/api/epfppf/accounts')
      .then((r) => r.data.data),

  create: (body: {
    type: 'EPF' | 'PPF';
    institution: string;
    identifier: string;
    holderName: string;
    portfolioId?: string;
  }) =>
    api
      .post<{ success: true; data: PfAccount }>('/api/epfppf/accounts', body)
      .then((r) => r.data.data),

  startSession: (body: {
    accountId: string;
    saveCredentials: boolean;
    credentials?: { username: string; password: string; mpin?: string };
  }) =>
    api
      .post<{ success: true; data: { sessionId: string } }>('/api/epfppf/sessions', body)
      .then((r) => r.data.data.sessionId),

  forgetCredentials: (id: string) =>
    api.delete(`/api/epfppf/accounts/${id}/credentials`),

  respondCaptcha: (sessionId: string, promptId: string, value: string) =>
    api.post(`/api/epfppf/sessions/${sessionId}/captcha`, { promptId, value }),

  respondOtp: (sessionId: string, promptId: string, value: string) =>
    api.post(`/api/epfppf/sessions/${sessionId}/otp`, { promptId, value }),

  /**
   * Opens a native EventSource for the SSE stream of a fetch session.
   * The Authorization header cannot be set on EventSource; the server relies
   * on cookies or the query-param token fallback. If your setup requires a
   * bearer token here, switch to a polyfill that supports custom headers.
   */
  eventStream: (sessionId: string): EventSource => {
    const base = getApiBaseUrl();
    return new EventSource(
      `${base}/api/epfppf/sessions/${sessionId}/events`,
      { withCredentials: true },
    );
  },
};
