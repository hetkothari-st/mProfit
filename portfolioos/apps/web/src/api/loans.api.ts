import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

// ── DTOs ─────────────────────────────────────────────────────────────

export interface LoanPaymentDTO {
  id: string;
  loanId: string;
  paymentType: string; // EMI | PREPAYMENT | FORECLOSURE | PROCESSING_FEE
  paidOn: string;
  amount: string;
  principalPart: string | null;
  interestPart: string | null;
  forMonth: string | null;
  notes: string | null;
}

export interface LoanDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  lenderName: string;
  accountNumber: string | null;
  loanType: string; // HOME|CAR|PERSONAL|EDUCATION|BUSINESS|GOLD|LAS|OTHER
  borrowerName: string;
  principalAmount: string;
  interestRate: string; // annual %
  tenureMonths: number;
  emiAmount: string;
  emiDueDay: number;
  disbursementDate: string;
  firstEmiDate: string;
  prepaymentOption: string; // REDUCE_TENURE | REDUCE_EMI
  vehicleId: string | null;
  rentalPropertyId: string | null;
  taxBenefitSection: string | null;
  status: string; // ACTIVE | CLOSED | FORECLOSED | DEFAULT
  closedDate: string | null;
  payments: LoanPaymentDTO[];
  createdAt: string;
}

export interface LoanSummaryDTO {
  outstandingBalance: string;
  totalPrincipalPaid: string;
  totalInterestPaid: string;
  nextEmiDate: string | null;
  nextEmiAmount: string;
  remainingEmiCount: number;
  remainingTenureMonths: number;
  totalInterestPayable: string;
  effectiveEndDate: string;
  prepaymentSavings: string | null;
  taxBenefit: {
    section: string;
    principalDeduction: string;
    interestDeduction: string;
    estimatedTaxSaving: string;
  } | null;
}

export interface AmortizationRowDTO {
  month: number;
  date: string; // YYYY-MM-DD
  emiAmount: string;
  principalPart: string;
  interestPart: string;
  openingBalance: string;
  closingBalance: string;
  isPaid: boolean;
  paidOn: string | undefined;
}

// ── Input types ───────────────────────────────────────────────────────

export interface CreateLoanInput {
  lenderName: string;
  loanType: string;
  borrowerName: string;
  accountNumber?: string | null;
  principalAmount: string;
  interestRate: string;
  tenureMonths: number;
  emiAmount: string;
  emiDueDay: number;
  disbursementDate: string;
  firstEmiDate: string;
  prepaymentOption: string;
  taxBenefitSection?: string | null;
  vehicleId?: string | null;
  rentalPropertyId?: string | null;
  portfolioId?: string | null;
  status?: string;
  closedDate?: string | null;
}

export type UpdateLoanInput = Partial<CreateLoanInput>;

export interface AddPaymentInput {
  paymentType: string;
  paidOn: string;
  amount: string;
  forMonth?: string | null;
  principalPart?: string | null;
  interestPart?: string | null;
  notes?: string | null;
}

// ── API client ────────────────────────────────────────────────────────

export const loansApi = {
  async list(): Promise<LoanDTO[]> {
    const { data } = await api.get<ApiResponse<LoanDTO[]>>('/api/loans');
    return unwrap(data);
  },
  async get(id: string): Promise<LoanDTO> {
    const { data } = await api.get<ApiResponse<LoanDTO>>(`/api/loans/${id}`);
    return unwrap(data);
  },
  async getSummary(id: string): Promise<LoanSummaryDTO> {
    const { data } = await api.get<ApiResponse<LoanSummaryDTO>>(`/api/loans/${id}/summary`);
    return unwrap(data);
  },
  async getAmortization(id: string): Promise<AmortizationRowDTO[]> {
    const { data } = await api.get<ApiResponse<AmortizationRowDTO[]>>(
      `/api/loans/${id}/amortization`,
    );
    return unwrap(data);
  },
  async create(input: CreateLoanInput): Promise<LoanDTO> {
    const { data } = await api.post<ApiResponse<LoanDTO>>('/api/loans', input);
    return unwrap(data);
  },
  async update(id: string, input: UpdateLoanInput): Promise<LoanDTO> {
    const { data } = await api.patch<ApiResponse<LoanDTO>>(`/api/loans/${id}`, input);
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/loans/${id}`);
  },
  async addPayment(loanId: string, input: AddPaymentInput): Promise<LoanPaymentDTO> {
    const { data } = await api.post<ApiResponse<LoanPaymentDTO>>(
      `/api/loans/${loanId}/payments`,
      input,
    );
    return unwrap(data);
  },
  async deletePayment(paymentId: string): Promise<void> {
    await api.delete(`/api/loans/payments/${paymentId}`);
  },
};
