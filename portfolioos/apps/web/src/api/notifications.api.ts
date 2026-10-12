import { api } from './client';
import type { ApiResponse, LoanAlertPrefsWire } from '@everypaisa/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface NotificationConfigDTO {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassMask: string;
  fromName: string;
  fromEmail: string;
  paymentInstructions: string | null;
  hasPassword: boolean;
}

export interface NotificationConfigInput {
  /** Empty/omitted = keep existing password. */
  smtpPass?: string;
  paymentInstructions?: string | null;
}

export interface SenderStatus {
  gmailConnected: boolean;
  gmailEmail: string | null;
  smtpConfigured: boolean;
}

export const notificationsApi = {
  async getStatus(): Promise<SenderStatus> {
    const { data } = await api.get<ApiResponse<SenderStatus>>('/api/notifications/status');
    return unwrap(data);
  },
  async getConfig(): Promise<NotificationConfigDTO | null> {
    const { data } = await api.get<ApiResponse<NotificationConfigDTO | null>>(
      '/api/notifications/config',
    );
    return unwrap(data);
  },
  async upsertConfig(input: NotificationConfigInput): Promise<NotificationConfigDTO> {
    const { data } = await api.put<ApiResponse<NotificationConfigDTO>>(
      '/api/notifications/config',
      input,
    );
    return unwrap(data);
  },
  async deleteConfig(): Promise<void> {
    await api.delete('/api/notifications/config');
  },
  /** Settings -> Notifications -> Loan rate alerts (spec s6.3). */
  async getPrefs(): Promise<LoanAlertPrefsWire> {
    const { data } = await api.get<ApiResponse<LoanAlertPrefsWire>>('/api/notifications/preferences');
    return unwrap(data);
  },
  async setPrefs(prefs: LoanAlertPrefsWire): Promise<LoanAlertPrefsWire> {
    const { data } = await api.put<ApiResponse<LoanAlertPrefsWire>>('/api/notifications/preferences', prefs);
    return unwrap(data);
  },
  async testEmail(to: string): Promise<{ ok: boolean; reason?: string }> {
    const { data } = await api.post<ApiResponse<{ ok: boolean; reason?: string }>>(
      '/api/notifications/test',
      { to },
    );
    return unwrap(data);
  },
};
