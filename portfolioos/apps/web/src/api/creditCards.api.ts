import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

// ── DTOs ─────────────────────────────────────────────────────────────

export interface CreditCardStatementDTO {
  id: string;
  cardId: string;
  forMonth: string;
  statementAmount: string;
  minimumDue: string | null;
  dueDate: string;
  paidAmount: string | null;
  paidOn: string | null;
  status: string; // PENDING | PAID | PARTIAL | OVERDUE
}

export interface CreditCardDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  issuerBank: string;
  cardName: string;
  last4: string;
  network: string | null; // VISA | MASTERCARD | AMEX | RUPAY
  creditLimit: string;
  outstandingBalance: string | null;
  statementDay: number;
  dueDay: number;
  interestRate: string | null;
  annualFee: string | null;
  status: string; // ACTIVE | BLOCKED | CLOSED
  statements: CreditCardStatementDTO[];
  createdAt: string;
}

export interface CardSummaryDTO {
  totalLimit: string;
  outstanding: string;
  utilizationPct: number;
  overdueStatements: number;
  nextDueDate: string | null;
  nextDueAmount: string | null;
}

// ── Input types ───────────────────────────────────────────────────────

export interface CreateCardInput {
  issuerBank: string;
  cardName: string;
  last4: string;
  network?: string | null;
  creditLimit: string;
  statementDay: number;
  dueDay: number;
  interestRate?: string | null;
  annualFee?: string | null;
  portfolioId?: string | null;
  status?: string;
}

export type UpdateCardInput = Partial<CreateCardInput>;

export interface AddStatementInput {
  forMonth: string;
  statementAmount: string;
  minimumDue?: string | null;
  dueDate: string;
}

export interface MarkStatementPaidInput {
  paidAmount: string;
  paidOn: string;
}

// ── API client ────────────────────────────────────────────────────────

export const creditCardsApi = {
  async list(): Promise<CreditCardDTO[]> {
    const { data } = await api.get<ApiResponse<CreditCardDTO[]>>('/api/credit-cards');
    return unwrap(data);
  },
  async get(id: string): Promise<CreditCardDTO> {
    const { data } = await api.get<ApiResponse<CreditCardDTO>>(`/api/credit-cards/${id}`);
    return unwrap(data);
  },
  async getSummary(id: string): Promise<CardSummaryDTO> {
    const { data } = await api.get<ApiResponse<CardSummaryDTO>>(
      `/api/credit-cards/${id}/summary`,
    );
    return unwrap(data);
  },
  async create(input: CreateCardInput): Promise<CreditCardDTO> {
    const { data } = await api.post<ApiResponse<CreditCardDTO>>('/api/credit-cards', input);
    return unwrap(data);
  },
  async update(id: string, input: UpdateCardInput): Promise<CreditCardDTO> {
    const { data } = await api.patch<ApiResponse<CreditCardDTO>>(
      `/api/credit-cards/${id}`,
      input,
    );
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/credit-cards/${id}`);
  },
  async addStatement(cardId: string, input: AddStatementInput): Promise<CreditCardStatementDTO> {
    const { data } = await api.post<ApiResponse<CreditCardStatementDTO>>(
      `/api/credit-cards/${cardId}/statements`,
      input,
    );
    return unwrap(data);
  },
  async markStatementPaid(
    statementId: string,
    input: MarkStatementPaidInput,
  ): Promise<CreditCardStatementDTO> {
    const { data } = await api.patch<ApiResponse<CreditCardStatementDTO>>(
      `/api/credit-cards/statements/${statementId}`,
      input,
    );
    return unwrap(data);
  },
  async deleteStatement(statementId: string): Promise<void> {
    await api.delete(`/api/credit-cards/statements/${statementId}`);
  },
};
