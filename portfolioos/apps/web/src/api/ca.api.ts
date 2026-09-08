import { api, unwrap } from './client';
import type { ApiResponse } from '@portfolioos/shared';

export type ClientKind = 'SHADOW' | 'INVITED';
export type ClientStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';
export type CaConsentBasis =
  | 'ENGAGEMENT_LETTER'
  | 'WRITTEN_CONSENT'
  | 'EXISTING_CLIENT_RELATIONSHIP'
  | 'OTHER';

export interface CaClient {
  id: string;
  name: string;
  email: string | null;
  pan: string | null;
  phone: string | null;
  category: string | null;
  userId: string | null;
  kind: ClientKind;
  status: ClientStatus;
  invitedEmail: string | null;
  inviteExpiresAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  consentBasis: CaConsentBasis | null;
  consentNote: string | null;
  createdAt: string;
}

export interface CaAuditEntry {
  id: string;
  actorUserId: string;
  subjectUserId: string;
  clientId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  summary: string;
  metadata: { before?: unknown; after?: unknown } | null;
  createdAt: string;
}

export interface MyProfessional {
  clientId: string;
  grantedAt: string | null;
  advisor: { id: string; name: string; email: string } | null;
}

export const CONSENT_BASIS_LABEL: Record<CaConsentBasis, string> = {
  ENGAGEMENT_LETTER: 'Signed engagement letter',
  WRITTEN_CONSENT: 'Written consent on file',
  EXISTING_CLIENT_RELATIONSHIP: 'Existing client relationship',
  OTHER: 'Other (described below)',
};

export const caApi = {
  async listClients(): Promise<CaClient[]> {
    const { data } = await api.get<ApiResponse<CaClient[]>>('/api/ca/clients');
    return unwrap(data);
  },

  async createManagedClient(payload: {
    name: string;
    email?: string;
    pan?: string;
    phone?: string;
    category?: string;
    consentBasis: CaConsentBasis;
    consentNote?: string;
  }): Promise<CaClient> {
    const { data } = await api.post<ApiResponse<CaClient>>('/api/ca/clients', payload);
    return unwrap(data);
  },

  /**
   * Returns the invitation token rather than mailing it — delivery isn't wired
   * server-side yet, so the UI shows the link for the CA to send themselves.
   */
  async inviteClient(payload: { name: string; email: string }): Promise<{
    client: CaClient;
    token: string;
  }> {
    const { data } = await api.post<ApiResponse<{ client: CaClient; token: string }>>(
      '/api/ca/clients/invite',
      payload,
    );
    return unwrap(data);
  },

  async revokeGrant(clientId: string): Promise<void> {
    await api.post(`/api/ca/clients/${clientId}/revoke`);
  },

  async activity(clientId?: string): Promise<CaAuditEntry[]> {
    const { data } = await api.get<ApiResponse<CaAuditEntry[]>>('/api/ca/activity', {
      params: clientId ? { clientId } : undefined,
    });
    return unwrap(data);
  },

  // ─── A client's books ──────────────────────────────────────────────

  async accountsTree(clientId: string): Promise<unknown[]> {
    const { data } = await api.get<ApiResponse<unknown[]>>(
      `/api/ca/clients/${clientId}/accounts/tree`,
    );
    return unwrap(data);
  },

  async accountsFlat(clientId: string): Promise<CaAccountRow[]> {
    const { data } = await api.get<ApiResponse<CaAccountRow[]>>(
      `/api/ca/clients/${clientId}/accounts/flat`,
    );
    return unwrap(data);
  },

  async vouchers(
    clientId: string,
    params: { from?: string; to?: string; type?: string } = {},
  ): Promise<CaVoucherRow[]> {
    const { data } = await api.get<ApiResponse<CaVoucherRow[]>>(
      `/api/ca/clients/${clientId}/vouchers`,
      { params },
    );
    return unwrap(data);
  },

  async createAccount(clientId: string, payload: CaAccountInput): Promise<CaAccountRow> {
    const { data } = await api.post<ApiResponse<CaAccountRow>>(
      `/api/ca/clients/${clientId}/accounts`,
      payload,
    );
    return unwrap(data);
  },

  async updateAccount(
    clientId: string,
    id: string,
    payload: Partial<CaAccountInput>,
  ): Promise<CaAccountRow> {
    const { data } = await api.patch<ApiResponse<CaAccountRow>>(
      `/api/ca/clients/${clientId}/accounts/${id}`,
      payload,
    );
    return unwrap(data);
  },

  async deleteAccount(clientId: string, id: string): Promise<void> {
    await api.delete(`/api/ca/clients/${clientId}/accounts/${id}`);
  },

  async createVoucher(clientId: string, payload: CaVoucherInput): Promise<CaVoucherRow> {
    const { data } = await api.post<ApiResponse<CaVoucherRow>>(
      `/api/ca/clients/${clientId}/vouchers`,
      payload,
    );
    return unwrap(data);
  },

  async deleteVoucher(clientId: string, id: string): Promise<void> {
    await api.delete(`/api/ca/clients/${clientId}/vouchers/${id}`);
  },

  async nextVoucherNo(clientId: string, type: string): Promise<string> {
    const { data } = await api.get<ApiResponse<{ voucherNo: string }>>(
      `/api/ca/clients/${clientId}/vouchers/next-no`,
      { params: { type } },
    );
    return unwrap(data).voucherNo;
  },

  /** Corrections only — the server refuses anything that isn't an edit. */
  async correctTransaction(
    clientId: string,
    id: string,
    payload: Record<string, string>,
  ): Promise<unknown> {
    const { data } = await api.patch<ApiResponse<unknown>>(
      `/api/ca/clients/${clientId}/transactions/${id}`,
      payload,
    );
    return unwrap(data);
  },

  async trialBalance(clientId: string, asOf?: string): Promise<CaTrialBalanceRow[]> {
    const { data } = await api.get<ApiResponse<CaTrialBalanceRow[]>>(
      `/api/ca/clients/${clientId}/trial-balance`,
      { params: asOf ? { asOf } : undefined },
    );
    return unwrap(data);
  },
};

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'] as const;
export const VOUCHER_TYPES = [
  'JOURNAL',
  'PAYMENT',
  'RECEIPT',
  'CONTRA',
  'PURCHASE',
  'SALES',
] as const;

export interface CaAccountInput {
  code: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  parentId?: string | null;
  openingBalance?: string;
}

export interface CaVoucherEntryInput {
  debitAccountId: string;
  creditAccountId: string;
  /** Decimal string. Never a number — see the money discipline in CONTEXT.md. */
  amount: string;
  narration?: string;
}

export interface CaVoucherInput {
  type: (typeof VOUCHER_TYPES)[number];
  voucherNo: string;
  date: string;
  narration?: string;
  entries: CaVoucherEntryInput[];
}

export interface CaAccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
}

export interface CaVoucherRow {
  id: string;
  voucherNo: string;
  type: string;
  date: string;
  narration: string | null;
}

export interface CaTrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  debit: string;
  credit: string;
}

/**
 * The client's own side. Deliberately a separate object from `caApi`: these
 * endpoints are not behind the CA_WORKSPACE entitlement, because the person
 * whose books these are must be able to see and end access whatever plan they
 * are on. A revoke button that needed a subscription would not be one.
 */
export const professionalAccessApi = {
  async list(): Promise<MyProfessional[]> {
    const { data } = await api.get<ApiResponse<MyProfessional[]>>('/api/me/professional-access');
    return unwrap(data);
  },

  async activity(): Promise<CaAuditEntry[]> {
    const { data } = await api.get<ApiResponse<CaAuditEntry[]>>(
      '/api/me/professional-access/activity',
    );
    return unwrap(data);
  },

  async revoke(clientId: string): Promise<void> {
    await api.post(`/api/me/professional-access/${clientId}/revoke`);
  },

  async acceptInvitation(token: string): Promise<CaClient> {
    const { data } = await api.post<ApiResponse<CaClient>>(
      `/api/me/professional-access/invitations/${token}/accept`,
    );
    return unwrap(data);
  },
};
