import { api, unwrap } from './client';
import type { ApiResponse } from '@everypaisa/shared';

export type LoanGivenMode = 'FLEXIBLE' | 'EMI';
export type LoanGivenStatus = 'ACTIVE' | 'SETTLED' | 'WRITTEN_OFF';
export type LoanGivenEntryKind = 'REPAYMENT' | 'INTEREST_RECEIVED' | 'ADDITIONAL_LENT' | 'WAIVER';
export type Relationship = 'FRIEND' | 'FAMILY' | 'COLLEAGUE' | 'BUSINESS' | 'OTHER';

export interface LoanGivenSummary {
  principalLent: string;
  repaid: string;
  waived: string;
  interestReceived: string;
  totalReceived: string;
  outstandingPrincipal: string;
  interestAccrued: string | null;
  interestDue: string | null;
  nextDue: { date: string; amount: string } | null;
  overdueDays: number;
  emi: {
    installmentsTotal: number;
    installmentsPaid: number;
    expectedTotal: string;
    remainingToReceive: string;
  } | null;
}

export type InstallmentStatus = 'PAID' | 'WAIVED' | 'PARTIAL' | 'OVERDUE' | 'DUE' | 'UPCOMING';
export type InstallmentAction = 'PAID' | 'PARTIAL' | 'WAIVED' | 'PENDING';

export interface InstallmentRow {
  no: number;
  dueDate: string;
  amount: string;
  principal: string | null;
  interest: string | null;
  balanceAfter: string;
  paid: string;
  waived: string;
  remaining: string;
  status: InstallmentStatus;
  overdue: boolean;
  lastPaidOn: string | null;
  /** Some of the cover was marked against this instalment (so it can be undone here). */
  marked: boolean;
}

export interface LoanGivenEntryDTO {
  id: string;
  kind: LoanGivenEntryKind;
  amount: string;
  date: string;
  notes: string | null;
  installmentNo: number | null;
}

export interface LoanGivenDTO {
  id: string;
  borrowerName: string;
  borrowerContact: string | null;
  relationship: Relationship | null;
  principalAmount: string;
  lentOn: string;
  interestRate: string;
  dueDate: string | null;
  repaymentMode: LoanGivenMode;
  emiAmount: string | null;
  tenureMonths: number | null;
  firstEmiDate: string | null;
  status: LoanGivenStatus;
  closedOn: string | null;
  notes: string | null;
  createdAt: string;
  entries: LoanGivenEntryDTO[];
  summary: LoanGivenSummary;
  /** EMI loans only. */
  schedule: InstallmentRow[] | null;
}

export interface LoanGivenInput {
  borrowerName: string;
  borrowerContact?: string | null;
  relationship?: Relationship | null;
  principalAmount: string;
  lentOn: string;
  interestRate?: string;
  dueDate?: string | null;
  repaymentMode?: LoanGivenMode;
  emiAmount?: string | null;
  tenureMonths?: number | null;
  firstEmiDate?: string | null;
  notes?: string | null;
}

export interface LoanGivenEntryInput {
  kind: LoanGivenEntryKind;
  amount: string;
  date: string;
  notes?: string | null;
}

const BASE = '/api/loans-given';

export const loansGivenApi = {
  async list(): Promise<LoanGivenDTO[]> {
    const { data } = await api.get<ApiResponse<LoanGivenDTO[]>>(BASE);
    return unwrap(data);
  },
  async get(id: string): Promise<LoanGivenDTO> {
    const { data } = await api.get<ApiResponse<LoanGivenDTO>>(`${BASE}/${id}`);
    return unwrap(data);
  },
  async create(input: LoanGivenInput): Promise<LoanGivenDTO> {
    const { data } = await api.post<ApiResponse<LoanGivenDTO>>(BASE, input);
    return unwrap(data);
  },
  async update(id: string, input: Partial<LoanGivenInput>): Promise<LoanGivenDTO> {
    const { data } = await api.patch<ApiResponse<LoanGivenDTO>>(`${BASE}/${id}`, input);
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`${BASE}/${id}`);
  },
  async addEntry(id: string, input: LoanGivenEntryInput): Promise<LoanGivenDTO> {
    const { data } = await api.post<ApiResponse<LoanGivenDTO>>(`${BASE}/${id}/entries`, input);
    return unwrap(data);
  },
  async removeEntry(entryId: string): Promise<LoanGivenDTO> {
    const { data } = await api.delete<ApiResponse<LoanGivenDTO>>(`${BASE}/entries/${entryId}`);
    return unwrap(data);
  },
  async settle(id: string, date: string): Promise<LoanGivenDTO> {
    const { data } = await api.post<ApiResponse<LoanGivenDTO>>(`${BASE}/${id}/settle`, { date });
    return unwrap(data);
  },
  async writeOff(id: string, date: string, notes?: string): Promise<LoanGivenDTO> {
    const { data } = await api.post<ApiResponse<LoanGivenDTO>>(`${BASE}/${id}/write-off`, {
      date,
      notes,
    });
    return unwrap(data);
  },
  async setInstallment(
    id: string,
    no: number,
    input: { action: InstallmentAction; amount?: string; date?: string; notes?: string | null },
  ): Promise<LoanGivenDTO> {
    const { data } = await api.put<ApiResponse<LoanGivenDTO>>(
      `${BASE}/${id}/installments/${no}`,
      input,
    );
    return unwrap(data);
  },
  async reopen(id: string): Promise<LoanGivenDTO> {
    const { data } = await api.post<ApiResponse<LoanGivenDTO>>(`${BASE}/${id}/reopen`);
    return unwrap(data);
  },
};

/** Everything the loans-given screens read; invalidate together after any change. */
export const LOANS_GIVEN_KEYS = [['loans-given'], ['dashboard']] as const;
