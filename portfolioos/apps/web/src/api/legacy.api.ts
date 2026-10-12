import type { LegacyCategory, LegacyNomineeDTO, LegacyOverviewDTO, LegacyTriggerValue } from '@everypaisa/shared';
import { api, unwrap } from './client';

export const LEGACY_KEYS = { overview: ['legacy', 'overview'] as const };

export interface NomineeInput {
  name: string;
  email: string;
  relationship: string;
  priority: number;
  isVerifier: boolean;
  categories: LegacyCategory[];
  documentIds: string[];
  showAmounts: boolean;
}

export interface SettingsInput {
  triggerMode: LegacyTriggerValue;
  inactivityDays: number;
  scheduledFor: string | null;
  letter: string | null;
}

// Step-up grant lives in memory only (15 min server-side; a minute of slack
// here). A reload asks again — intended.
let grant: { value: string; until: number } | null = null;
const GRANT_MS = 14 * 60_000;
const withGrant = () => ({ headers: { 'X-Legacy-Grant': grant?.value ?? '' } });

export const legacyApi = {
  async overview(): Promise<LegacyOverviewDTO> {
    return unwrap((await api.get('/api/legacy')).data);
  },
  async startStepUp(): Promise<{ method: 'totp' | 'email' }> {
    return unwrap((await api.post('/api/legacy/step-up')).data);
  },
  async verifyStepUp(code: string): Promise<void> {
    const { grant: g } = unwrap<{ grant: string }>((await api.post('/api/legacy/step-up/verify', { code })).data);
    grant = { value: g, until: Date.now() + GRANT_MS };
  },
  hasGrant(): boolean {
    return grant !== null && grant.until > Date.now();
  },
  async saveSettings(b: SettingsInput): Promise<void> {
    await api.put('/api/legacy/settings', b, withGrant());
  },
  async addNominee(b: NomineeInput): Promise<LegacyNomineeDTO> {
    return unwrap((await api.post('/api/legacy/nominees', b, withGrant())).data);
  },
  async updateNominee(id: string, b: NomineeInput): Promise<LegacyNomineeDTO> {
    return unwrap((await api.put(`/api/legacy/nominees/${id}`, b, withGrant())).data);
  },
  async removeNominee(id: string): Promise<void> {
    await api.delete(`/api/legacy/nominees/${id}`, withGrant());
  },
  async activate(): Promise<void> {
    await api.post('/api/legacy/activate', undefined, withGrant());
  },
  async pause(until: string): Promise<void> {
    await api.post('/api/legacy/pause', { until }, withGrant());
  },
  async resume(): Promise<void> {
    await api.post('/api/legacy/resume', undefined, withGrant());
  },
  async deactivate(): Promise<void> {
    await api.post('/api/legacy/deactivate', undefined, withGrant());
  },
  async revoke(nomineeId?: string): Promise<void> {
    await api.post('/api/legacy/revoke', nomineeId ? { nomineeId } : {}, withGrant());
  },
};
