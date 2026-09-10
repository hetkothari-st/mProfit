import { api, unwrap } from './client';
import type { ApiResponse } from '@portfolioos/shared';

export type BankAccountType = 'SAVINGS' | 'CURRENT' | 'SALARY' | 'NRE' | 'NRO' | 'OD';
export type BankAccountStatus = 'ACTIVE' | 'DORMANT' | 'CLOSED';
export type BankBalanceSource = 'manual' | 'statement' | 'auto_event';

export interface BankBalanceSnapshotDTO {
  id: string;
  accountId: string;
  asOfDate: string;
  balance: string;
  source: BankBalanceSource;
  canonicalEventId: string | null;
  note: string | null;
  createdAt: string;
}

export interface BankAccountDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  bankName: string;
  accountType: BankAccountType;
  accountHolder: string;
  last4: string;
  /** A full account number is saved (encrypted); fetch it via `revealAccountNumber`. */
  hasAccountNumber: boolean;
  customerId: string | null;
  ifsc: string | null;
  branch: string | null;
  branchAddress: string | null;
  nickname: string | null;
  jointHolders: string[];
  nomineeName: string | null;
  nomineeRelation: string | null;
  debitCardLast4: string | null;
  debitCardExpiry: string | null;
  currentBalance: string | null;
  balanceAsOf: string | null;
  balanceSource: BankBalanceSource | null;
  status: BankAccountStatus;
  openedOn: string | null;
  closedOn: string | null;
  createdAt: string;
  updatedAt: string;
  snapshots?: BankBalanceSnapshotDTO[];
}

export interface BankAccountCashFlowDTO {
  id: string;
  portfolioId: string;
  bankAccountId: string | null;
  date: string;
  type: 'INFLOW' | 'OUTFLOW';
  amount: string;
  description: string | null;
  currency: string | null;
}

export interface IfscDetailsDTO {
  ifsc: string;
  bank: string | null;
  branch: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

export interface CreateBankAccountInput {
  bankName: string;
  accountType: BankAccountType;
  accountHolder: string;
  last4: string;
  /** Full account number. Write-only: stored encrypted, never returned by list/get. */
  accountNumber?: string | null;
  customerId?: string | null;
  portfolioId?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  branchAddress?: string | null;
  nickname?: string | null;
  jointHolders?: string[];
  nomineeName?: string | null;
  nomineeRelation?: string | null;
  debitCardLast4?: string | null;
  debitCardExpiry?: string | null;
  currentBalance?: string | null;
  balanceAsOf?: string | null;
  status?: BankAccountStatus;
  openedOn?: string | null;
  closedOn?: string | null;
}

export type UpdateBankAccountInput = Partial<CreateBankAccountInput>;

export interface AddSnapshotInput {
  asOfDate: string;
  balance: string;
  source?: BankBalanceSource;
  note?: string | null;
}

export const bankAccountsApi = {
  async list(): Promise<BankAccountDTO[]> {
    const { data } = await api.get<ApiResponse<BankAccountDTO[]>>('/api/bank-accounts');
    return unwrap(data);
  },
  async get(id: string): Promise<BankAccountDTO> {
    const { data } = await api.get<ApiResponse<BankAccountDTO>>(`/api/bank-accounts/${id}`);
    return unwrap(data);
  },
  async create(input: CreateBankAccountInput): Promise<BankAccountDTO> {
    const { data } = await api.post<ApiResponse<BankAccountDTO>>('/api/bank-accounts', input);
    return unwrap(data);
  },
  async update(id: string, input: UpdateBankAccountInput): Promise<BankAccountDTO> {
    const { data } = await api.patch<ApiResponse<BankAccountDTO>>(`/api/bank-accounts/${id}`, input);
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/bank-accounts/${id}`);
  },
  /** Audited + rate-limited server-side. Deliberately not cached in react-query. */
  async revealAccountNumber(id: string): Promise<{ accountNumber: string | null }> {
    const { data } = await api.post<ApiResponse<{ accountNumber: string | null }>>(
      `/api/bank-accounts/${id}/reveal`,
    );
    return unwrap(data);
  },
  /** Ready-to-send bank details text (includes the full number). Audited server-side. */
  async shareDetails(id: string): Promise<{ text: string }> {
    const { data } = await api.post<ApiResponse<{ text: string }>>(
      `/api/bank-accounts/${id}/share`,
    );
    return unwrap(data);
  },
  async lookupIfsc(code: string): Promise<IfscDetailsDTO> {
    const { data } = await api.get<ApiResponse<IfscDetailsDTO>>(
      `/api/bank-accounts/ifsc/${encodeURIComponent(code)}`,
    );
    return unwrap(data);
  },
  async addSnapshot(id: string, input: AddSnapshotInput): Promise<BankBalanceSnapshotDTO> {
    const { data } = await api.post<ApiResponse<BankBalanceSnapshotDTO>>(
      `/api/bank-accounts/${id}/snapshots`,
      input,
    );
    return unwrap(data);
  },
  async deleteSnapshot(snapshotId: string): Promise<void> {
    await api.delete(`/api/bank-accounts/snapshots/${snapshotId}`);
  },
  async cashFlows(id: string, limit = 100): Promise<BankAccountCashFlowDTO[]> {
    const { data } = await api.get<ApiResponse<BankAccountCashFlowDTO[]>>(
      `/api/bank-accounts/${id}/cashflows`,
      { params: { limit } },
    );
    return unwrap(data);
  },
};
