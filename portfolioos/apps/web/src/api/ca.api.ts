import { api, unwrap } from './client';
import type { ApiResponse } from '@everypaisa/shared';

export type ClientKind = 'SHADOW' | 'INVITED';
export type ClientStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';
export type CaConsentBasis =
  | 'ENGAGEMENT_LETTER'
  | 'WRITTEN_CONSENT'
  | 'EXISTING_CLIENT_RELATIONSHIP'
  | 'OTHER';

export interface CaClient {
  id: string;
  /**
   * What the person who OPENED the relationship typed. For an invitation the
   * account holder sent, that is the professional's own name — so screens on
   * the professional's side must use `displayName`, never this.
   */
  name: string;
  /** Who these books belong to. What the professional's screens show. */
  displayName: string;
  displayEmail: string | null;
  initiatedBy: 'ADVISOR' | 'CLIENT';
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
  /**
   * What this grant permits changing. The client decides; the policies
   * enforce. Present here so the workspace can stop offering buttons that are
   * certain to be refused — which is a courtesy, not the boundary.
   */
  canEditBooks: boolean;
  canEditTransactions: boolean;
  canEditImports: boolean;
  canEditFmv: boolean;
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
  status: ClientStatus;
  revokedAt: string | null;
  accessFrom: string | null;
  accessUntil: string | null;
  scopeAllPortfolios: boolean;
  scopeAllAssetClasses: boolean;
  scopeAllCategories: boolean;
  portfolioCount: number;
  assetClassCount: number;
  categoryCount: number;
}

/** The categories a grant can be narrowed by, and how they read on screen. */
export const CA_SCOPE_CATEGORIES = [
  'VEHICLE',
  'RENTAL',
  'INSURANCE',
  'LOAN',
  'CREDIT_CARD',
  'BANK_ACCOUNT',
  'OWNED_PROPERTY',
  'GOAL',
] as const;
export type CaScopeCategory = (typeof CA_SCOPE_CATEGORIES)[number];

export const CA_SCOPE_CATEGORY_LABEL: Record<CaScopeCategory, string> = {
  VEHICLE: 'Vehicles',
  RENTAL: 'Rental property',
  INSURANCE: 'Insurance',
  LOAN: 'Loans',
  CREDIT_CARD: 'Credit cards',
  BANK_ACCOUNT: 'Bank accounts',
  OWNED_PROPERTY: 'Property owned',
  GOAL: 'Goals',
};

/** One grant in full: what it covers now, and everything it could cover. */
export interface GrantEditRights {
  books: boolean;
  transactions: boolean;
  imports: boolean;
  fmv: boolean;
}

export interface GrantDetail {
  edit: GrantEditRights;
  clientId: string;
  kind: ClientKind;
  status: ClientStatus;
  name: string;
  advisor: { id: string; name: string; email: string } | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  accessFrom: string | null;
  accessUntil: string | null;
  scopeAllPortfolios: boolean;
  scopeAllAssetClasses: boolean;
  scopeAllCategories: boolean;
  portfolioIds: string[];
  assetClasses: string[];
  categories: string[];
  availablePortfolios: Array<{ id: string; name: string; type: string; familyId: string | null }>;
}

/**
 * A field left out is untouched; an explicit `null` widens that dimension back
 * to everything. The two are different requests, so they stay distinguishable
 * all the way to the server.
 */
export interface GrantScopePatch {
  /** Any subset; anything left out is untouched. */
  edit?: Partial<GrantEditRights>;
  portfolioIds?: string[] | null;
  assetClasses?: string[] | null;
  categories?: CaScopeCategory[] | null;
  accessFrom?: string | null;
  accessUntil?: string | null;
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

  /**
   * Re-derive vouchers from the client's recorded activity.
   *
   * The books tabs already do this when they load, so this is the catch-up
   * case: the client added transactions while the CA had the page open.
   */
  async generateVouchers(clientId: string): Promise<CaGenerateResult> {
    const { data } = await api.post<ApiResponse<CaGenerateResult>>(
      `/api/ca/clients/${clientId}/vouchers/generate`,
    );
    return unwrap(data);
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

export interface CaGenerateResult {
  created: number;
  skipped: number;
  errors: number;
  total: number;
}

/**
 * One line of a trial balance, exactly as `getTrialBalance` returns it.
 *
 * This used to declare `debit`/`credit`, which the server has never sent. The
 * columns read those two names, got `undefined` for every row, and rendered a
 * dash — so the tab showed an empty-looking balance even for a client whose
 * books were fully posted.
 */
export interface CaTrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
}

/**
 * The client's own side. Deliberately a separate object from `caApi`: these
 * endpoints are not behind the CA_WORKSPACE entitlement, because the person
 * whose books these are must be able to see and end access whatever plan they
 * are on. A revoke button that needed a subscription would not be one.
 */

/** The invitation email: what would be sent, and sending it. */
export interface InviteEmailDraft {
  to: string;
  recipientName: string;
  subject: string;
  message: string;
  /** Exactly what would be sent, with the current edits applied. */
  html: string;
  acceptUrl: string;
  expiresOn: string;
  advisorName: string;
  advisorEmail: string;
  sendsRemaining: number;
  /** False when the server has no mailer — the UI then offers the link only. */
  canSend: boolean;
}

export interface InviteEmailEdits {
  subject?: string;
  message?: string;
}

export const caInviteEmailApi = {
  /**
   * A POST that reads: it carries the advisor's current edits so the preview
   * is rendered by the same builder that will send, rather than a second one
   * on this side that could drift.
   */
  async preview(clientId: string, edits: InviteEmailEdits = {}): Promise<InviteEmailDraft> {
    const { data } = await api.post<ApiResponse<InviteEmailDraft>>(
      `/api/ca/clients/${clientId}/invite-email/preview`,
      edits,
    );
    return unwrap(data);
  },

  async send(
    clientId: string,
    edits: InviteEmailEdits,
  ): Promise<{ sent: boolean; to: string; sendsRemaining: number; reason?: string }> {
    const { data } = await api.post<
      ApiResponse<{ sent: boolean; to: string; sendsRemaining: number; reason?: string }>
    >(`/api/ca/clients/${clientId}/invite-email/send`, edits);
    return unwrap(data);
  },
};


/** A row on the Account Access page: an open invitation, or a live grant. */
export interface MyProfessionalGrant {
  clientId: string;
  name: string;
  status: ClientStatus;
  initiatedBy: 'ADVISOR' | 'CLIENT';
  invitedEmail: string | null;
  /** Null while nobody has accepted — an invitation holds nothing yet. */
  advisor: { id: string; name: string; email: string } | null;
  grantedAt: string | null;
  revokedAt: string | null;
  inviteExpiresAt: string | null;
  accessFrom: string | null;
  accessUntil: string | null;
  scopeAllPortfolios: boolean;
  scopeAllAssetClasses: boolean;
  scopeAllCategories: boolean;
  portfolioCount: number;
  assetClassCount: number;
  categoryCount: number;
  /** True when ANY of the four write switches is on. */
  canEdit: boolean;
  /** Nothing, some, or all of the four write switches. */
  editMode: 'VIEW' | 'PARTIAL' | 'FULL';
}

/** What a signed-out professional is told before deciding to sign up. */
export interface ProfessionalInvitePreview {
  invitedBy: string;
  invitedEmail: string | null;
  expiresAt: string;
}

export const professionalInviteApi = {
  /** Works signed out: someone new to the product is being asked to join it. */
  async peek(token: string): Promise<ProfessionalInvitePreview> {
    const { data } = await api.get<ApiResponse<ProfessionalInvitePreview>>(
      `/api/professional-invitations/${token}`,
    );
    return unwrap(data);
  },

  async accept(token: string): Promise<CaClient> {
    const { data } = await api.post<ApiResponse<CaClient>>(
      `/api/professional-invitations/${token}/accept`,
    );
    return unwrap(data);
  },
};

/**
 * A client's receipts, from the CA's side. Same three shapes as the client's
 * own downloads, reached through the grant — a narrowed grant produces a
 * narrower set, because the server builds them from what the CA could read.
 */
export const caReceiptsApi = {
  async view(clientId: string, voucherId: string): Promise<void> {
    const res = await api.get(
      `/api/ca/clients/${clientId}/vouchers/${voucherId}/receipt.pdf`,
      { params: { inline: 'true' }, responseType: 'blob' },
    );
    const url = URL.createObjectURL(res.data as Blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  async download(clientId: string, voucherId: string, fileName: string): Promise<void> {
    const res = await api.get(
      `/api/ca/clients/${clientId}/vouchers/${voucherId}/receipt.pdf`,
      { responseType: 'blob' },
    );
    saveCaBlob(res.data as Blob, fileName);
  },

  async bundle(
    clientId: string,
    format: 'zip' | 'xlsx',
    params: { from?: string; to?: string } = {},
  ): Promise<void> {
    const res = await api.get(`/api/ca/clients/${clientId}/receipts.${format}`, {
      params,
      responseType: 'blob',
    });
    saveCaBlob(res.data as Blob, `receipts.${format}`);
  },
};

function saveCaBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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

  /** Everything, invitations nobody has accepted included. */
  async grants(): Promise<MyProfessionalGrant[]> {
    const { data } = await api.get<ApiResponse<MyProfessionalGrant[]>>(
      '/api/me/professional-access/grants',
    );
    return unwrap(data);
  },

  async invite(payload: { name: string; email: string }): Promise<{ client: CaClient; token: string }> {
    const { data } = await api.post<ApiResponse<{ client: CaClient; token: string }>>(
      '/api/me/professional-access/invite',
      payload,
    );
    return unwrap(data);
  },

  /** Withdraw an invitation nobody has accepted. Different from revoking. */
  async cancelInvitation(clientId: string): Promise<void> {
    await api.post(`/api/me/professional-access/${clientId}/cancel`);
  },

  async revoke(clientId: string): Promise<void> {
    await api.post(`/api/me/professional-access/${clientId}/revoke`);
  },

  async reinstate(clientId: string): Promise<void> {
    await api.post(`/api/me/professional-access/${clientId}/reinstate`);
  },

  async grant(clientId: string): Promise<GrantDetail> {
    const { data } = await api.get<ApiResponse<GrantDetail>>(
      `/api/me/professional-access/${clientId}`,
    );
    return unwrap(data);
  },

  async updateScope(clientId: string, patch: GrantScopePatch): Promise<GrantDetail> {
    const { data } = await api.patch<ApiResponse<GrantDetail>>(
      `/api/me/professional-access/${clientId}/scope`,
      patch,
    );
    return unwrap(data);
  },

  async acceptInvitation(token: string): Promise<CaClient> {
    const { data } = await api.post<ApiResponse<CaClient>>(
      `/api/me/professional-access/invitations/${token}/accept`,
    );
    return unwrap(data);
  },
};
