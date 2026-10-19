import axios from 'axios';
import type { LegacyViewDTO } from '@everypaisa/shared';
import { getApiBaseUrl } from '../baseUrl';
import { unwrap } from '../client';

/**
 * Legacy Transfer link pages and the nominee view. A separate axios instance
 * with no interceptors: these pages must never attach (or try to refresh) a
 * user's JWT, and a 401 here must not trigger the app's sign-out flow.
 */
const http = axios.create({ baseURL: getApiBaseUrl() });
const sess = (s: string) => ({ headers: { 'X-Legacy-Session': s } });

export const legacyPublic = {
  http,
  async imOk(token: string): Promise<{ ok: boolean }> {
    return unwrap((await http.post(`/api/legacy-public/ok/${encodeURIComponent(token)}`)).data);
  },
  async ack(token: string): Promise<{ ownerName: string }> {
    return unwrap((await http.post(`/api/legacy-public/ack/${encodeURIComponent(token)}`)).data);
  },
  async peekVerify(token: string): Promise<{ ownerName: string }> {
    return unwrap((await http.get(`/api/legacy-public/verify/${encodeURIComponent(token)}`)).data);
  },
  async answerVerify(token: string, answer: 'CONFIRM' | 'FINE'): Promise<{ ok: boolean }> {
    return unwrap((await http.post(`/api/legacy-public/verify/${encodeURIComponent(token)}`, { answer })).data);
  },
  async requestOtp(token: string): Promise<{ maskedEmail: string; ownerName: string }> {
    return unwrap((await http.post(`/api/legacy-public/access/${encodeURIComponent(token)}/otp`)).data);
  },
  async openSession(token: string, code: string): Promise<string> {
    return unwrap<{ session: string }>((await http.post(`/api/legacy-public/access/${encodeURIComponent(token)}/session`, { code })).data).session;
  },
  async reissue(token: string): Promise<void> {
    await http.post(`/api/legacy-public/access/${encodeURIComponent(token)}/reissue`);
  },
  async view(session: string): Promise<LegacyViewDTO> {
    return unwrap((await http.get('/api/legacy-view', sess(session))).data);
  },
  async download(session: string, path: string, filename: string): Promise<void> {
    const res = await http.get(`/api/legacy-view${path}`, { ...sess(session), responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
