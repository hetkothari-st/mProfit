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

  /**
   * Returns the paginated envelope, not a bare array.
   *
   * `listVouchers` has always answered `{ vouchers, total, page, limit }`.
   * Typing this as `CaVoucherRow[]` compiled fine — a type declaration is a
   * claim, not a check — and then crashed at runtime the first time the tab
   * was opened, because `.map` is not a function on an object.
   */
  async vouchers(
    clientId: string,
    params: { from?: string; to?: string; type?: string } = {},
  ): Promise<CaVoucherPage> {
    const { data } = await api.get<ApiResponse<CaVoucherPage>>(
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

  async transactions(clientId: string): Promise<CaTransactionRow[]> {
    const { data } = await api.get<ApiResponse<CaTransactionRow[]>>(
      `/api/ca/clients/${clientId}/transactions`,
    );
    return unwrap(data);
  },

  /**
   * Records a new transaction in the client's books. Same field shape the
   * app's own transaction form sends — no `portfolioId`: the server resolves
   * (and bootstraps, on a client's very first write) the one portfolio these
   * books use.
   */
  async createTransaction(
    clientId: string,
    payload: CaTransactionInput,
  ): Promise<CaTransactionRow> {
    const { data } = await api.post<ApiResponse<CaTransactionRow>>(
      `/api/ca/clients/${clientId}/transactions`,
      payload,
    );
    return unwrap(data);
  },

  async imports(clientId: string): Promise<CaImportJobRow[]> {
    const { data } = await api.get<ApiResponse<CaImportJobRow[]>>(
      `/api/ca/clients/${clientId}/imports`,
    );
    return unwrap(data);
  },

  async uploadImport(
    clientId: string,
    { file, broker, password }: { file: File; broker?: string; password?: string },
  ): Promise<CaImportCreateResponse> {
    const form = new FormData();
    form.append('file', file);
    if (broker) form.append('broker', broker);
    if (password) form.append('password', password);
    const { data } = await api.post<ApiResponse<CaImportCreateResponse>>(
      `/api/ca/clients/${clientId}/imports`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return unwrap(data);
  },

  async fmvOverrides(clientId: string): Promise<CaFmvRow[]> {
    const { data } = await api.get<ApiResponse<CaFmvRow[]>>(`/api/ca/clients/${clientId}/fmv`);
    return unwrap(data);
  },

  async setFmv(
    clientId: string,
    isin: string,
    payload: { fmvPerUnit: string; scripName?: string },
  ): Promise<CaFmvRow> {
    const { data } = await api.put<ApiResponse<CaFmvRow>>(
      `/api/ca/clients/${clientId}/fmv/${isin}`,
      payload,
    );
    return unwrap(data);
  },

  async deleteFmv(clientId: string, isin: string): Promise<void> {
    await api.delete(`/api/ca/clients/${clientId}/fmv/${isin}`);
  },

  async documents(clientId: string): Promise<CaDocumentRow[]> {
    const { data } = await api.get<ApiResponse<CaDocumentRow[]>>('/api/documents/all', {
      params: { clientId },
    });
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

// Same enum values `TransactionFormDialog.tsx` (the app's own transaction
// form) offers, so the CA workspace's "Add transaction" dialog mirrors it
// rather than inventing a different set of choices.
export const CA_ASSET_CLASSES = [
  'EQUITY', 'MUTUAL_FUND', 'ETF',
  'BOND', 'GOVT_BOND', 'CORPORATE_BOND',
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT',
  'NPS', 'PPF', 'EPF',
  'PHYSICAL_GOLD', 'GOLD_BOND', 'GOLD_ETF', 'PHYSICAL_SILVER',
  'CRYPTOCURRENCY', 'REIT', 'INVIT',
  'PMS', 'AIF', 'ULIP',
  'FOREIGN_EQUITY',
  'REAL_ESTATE', 'ART_COLLECTIBLES', 'CASH', 'OTHER',
] as const;

export const CA_TRANSACTION_TYPES = [
  'BUY',
  'SELL',
  'SIP',
  'SWITCH_IN',
  'SWITCH_OUT',
  'DIVIDEND_PAYOUT',
  'DIVIDEND_REINVEST',
  'BONUS',
  'SPLIT',
  'REDEMPTION',
] as const;

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

export interface CaTransactionRow {
  id: string;
  tradeDate: string;
  assetClass: string;
  transactionType: string;
  assetName: string | null;
  isin: string | null;
  /** Decimal strings throughout — never parsed into a number. */
  quantity: string;
  price: string;
  netAmount: string;
  narration: string | null;
}

/**
 * The fields `baseTransactionSchema` (server) validates, minus
 * `portfolioId` — mirrors `apps/web/src/pages/transactions/
 * TransactionFormDialog.tsx`'s own request shape for the fields this
 * workspace's dialog collects. Every money/quantity field is a decimal
 * STRING the caller has already validated, never a number.
 */
export interface CaTransactionInput {
  transactionType: string;
  assetClass: string;
  stockSymbol?: string;
  stockName?: string;
  exchange?: string;
  schemeCode?: string;
  schemeName?: string;
  amcName?: string;
  assetName?: string;
  isin?: string;
  tradeDate: string;
  quantity: string;
  price: string;
  brokerage?: string;
  stt?: string;
  stampDuty?: string;
  exchangeCharges?: string;
  gst?: string;
  sebiCharges?: string;
  otherCharges?: string;
  broker?: string;
  narration?: string;
}

export interface CaImportJobRow {
  id: string;
  type: string;
  status: string;
  fileName: string;
  totalRows: number | null;
  successRows: number | null;
  failedRows: number | null;
  createdAt: string;
  completedAt: string | null;
  _count?: { transactions: number };
}

export interface CaImportCreateResponse {
  id: string;
  status: string;
  type: string;
  fileName: string;
  createdAt: string;
}

export interface CaFmvRow {
  isin: string;
  scripName: string | null;
  fmvPerUnit: string;
  source: 'SEED' | 'USER';
}

export interface CaDocumentRow {
  id: string;
  ownerType: string;
  ownerId: string;
  category: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CaVoucherPage {
  vouchers: CaVoucherRow[];
  total: number;
  page: number;
  limit: number;
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
