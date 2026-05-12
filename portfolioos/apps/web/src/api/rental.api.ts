import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

// ── DTOs ─────────────────────────────────────────────────────────────

export interface PropertyExpenseDTO {
  id: string;
  propertyId: string;
  expenseType: string;
  amount: string;
  paidOn: string;
  description: string | null;
  receiptUrl: string | null;
}

export interface RentReceiptDTO {
  id: string;
  tenancyId: string;
  forMonth: string;
  expectedAmount: string;
  receivedAmount: string | null;
  dueDate: string;
  receivedOn: string | null;
  status: 'EXPECTED' | 'RECEIVED' | 'PARTIAL' | 'OVERDUE' | 'SKIPPED';
  cashFlowId: string | null;
  notes: string | null;
  autoMatchedFromEventId: string | null;
  tenancy?: {
    id: string;
    tenantName: string;
    property: { id: string; name: string; portfolioId: string | null };
  };
}

export interface TenancyDTO {
  id: string;
  propertyId: string;
  tenantName: string;
  tenantContact: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  startDate: string;
  endDate: string | null;
  monthlyRent: string;
  securityDeposit: string | null;
  rentDueDay: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  rentReceipts?: RentReceiptDTO[];
}

export interface RentalPropertyDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  name: string;
  address: string | null;
  propertyType: 'RESIDENTIAL' | 'COMMERCIAL' | 'LAND' | 'PARKING';
  purchaseDate: string | null;
  purchasePrice: string | null;
  currentValue: string | null;
  isActive: boolean;
  createdAt: string;
  tenancies?: TenancyDTO[];
  expenses?: PropertyExpenseDTO[];
  _count?: { expenses: number };
}

export interface PropertyPnLDTO {
  propertyId: string;
  from: string;
  to: string;
  rentReceived: string;
  expensesTotal: string;
  netPnL: string;
  receiptCount: number;
  expenseCount: number;
}

// ── Input types ───────────────────────────────────────────────────────

export interface CreatePropertyInput {
  name: string;
  address?: string | null;
  propertyType: 'RESIDENTIAL' | 'COMMERCIAL' | 'LAND' | 'PARKING';
  portfolioId?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: string | null;
  currentValue?: string | null;
  isActive?: boolean;
}

export type UpdatePropertyInput = Partial<CreatePropertyInput>;

export interface CreateTenancyInput {
  tenantName: string;
  tenantContact?: string | null;
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  startDate: string;
  endDate?: string | null;
  monthlyRent: string;
  securityDeposit?: string | null;
  rentDueDay?: number;
  notes?: string | null;
}

export type UpdateTenancyInput = Partial<CreateTenancyInput> & {
  isActive?: boolean;
};

export interface MarkReceivedInput {
  receivedAmount: string;
  receivedOn: string;
  notes?: string | null;
}

export interface CreateExpenseInput {
  expenseType:
    | 'PROPERTY_TAX'
    | 'MAINTENANCE'
    | 'REPAIRS'
    | 'UTILITIES'
    | 'AGENT_FEE'
    | 'LEGAL'
    | 'OTHER';
  amount: string;
  paidOn: string;
  description?: string | null;
  receiptUrl?: string | null;
}

export interface ListReceiptsQuery {
  tenancyId?: string;
  propertyId?: string;
  status?: RentReceiptDTO['status'];
  from?: string;
  to?: string;
  limit?: number;
}

// ── API client ────────────────────────────────────────────────────────

export const rentalApi = {
  // Properties
  async listProperties(): Promise<RentalPropertyDTO[]> {
    const { data } = await api.get<ApiResponse<RentalPropertyDTO[]>>('/api/rental/properties');
    return unwrap(data);
  },
  async getProperty(id: string): Promise<RentalPropertyDTO> {
    const { data } = await api.get<ApiResponse<RentalPropertyDTO>>(
      `/api/rental/properties/${id}`,
    );
    return unwrap(data);
  },
  async createProperty(input: CreatePropertyInput): Promise<RentalPropertyDTO> {
    const { data } = await api.post<ApiResponse<RentalPropertyDTO>>(
      '/api/rental/properties',
      input,
    );
    return unwrap(data);
  },
  async updateProperty(
    id: string,
    input: UpdatePropertyInput,
  ): Promise<RentalPropertyDTO> {
    const { data } = await api.patch<ApiResponse<RentalPropertyDTO>>(
      `/api/rental/properties/${id}`,
      input,
    );
    return unwrap(data);
  },
  async deleteProperty(id: string): Promise<void> {
    await api.delete(`/api/rental/properties/${id}`);
  },
  async getPropertyPnL(id: string, from: string, to: string): Promise<PropertyPnLDTO> {
    const { data } = await api.get<ApiResponse<PropertyPnLDTO>>(
      `/api/rental/properties/${id}/pnl`,
      { params: { from, to } },
    );
    return unwrap(data);
  },

  // Tenancies
  async createTenancy(propertyId: string, input: CreateTenancyInput): Promise<TenancyDTO> {
    const { data } = await api.post<ApiResponse<TenancyDTO>>(
      `/api/rental/properties/${propertyId}/tenancies`,
      input,
    );
    return unwrap(data);
  },
  async updateTenancy(tenancyId: string, input: UpdateTenancyInput): Promise<TenancyDTO> {
    const { data } = await api.patch<ApiResponse<TenancyDTO>>(
      `/api/rental/tenancies/${tenancyId}`,
      input,
    );
    return unwrap(data);
  },
  async deleteTenancy(tenancyId: string): Promise<void> {
    await api.delete(`/api/rental/tenancies/${tenancyId}`);
  },

  // Receipts
  async listReceipts(q: ListReceiptsQuery = {}): Promise<RentReceiptDTO[]> {
    const { data } = await api.get<ApiResponse<RentReceiptDTO[]>>('/api/rental/receipts', {
      params: q,
    });
    return unwrap(data);
  },
  async markReceived(
    receiptId: string,
    input: MarkReceivedInput,
  ): Promise<RentReceiptDTO> {
    const { data } = await api.post<ApiResponse<RentReceiptDTO>>(
      `/api/rental/receipts/${receiptId}/mark-received`,
      input,
    );
    return unwrap(data);
  },
  async skipReceipt(
    receiptId: string,
    reason?: string | null,
  ): Promise<RentReceiptDTO> {
    const { data } = await api.post<ApiResponse<RentReceiptDTO>>(
      `/api/rental/receipts/${receiptId}/skip`,
      { reason },
    );
    return unwrap(data);
  },
  async undoAutoMatch(receiptId: string): Promise<RentReceiptDTO> {
    const { data } = await api.post<ApiResponse<RentReceiptDTO>>(
      `/api/rental/receipts/${receiptId}/undo-auto-match`,
    );
    return unwrap(data);
  },
  async unmarkReceived(receiptId: string): Promise<RentReceiptDTO> {
    const { data } = await api.post<ApiResponse<RentReceiptDTO>>(
      `/api/rental/receipts/${receiptId}/unmark-received`,
    );
    return unwrap(data);
  },
  async unskipReceipt(receiptId: string): Promise<RentReceiptDTO> {
    const { data } = await api.post<ApiResponse<RentReceiptDTO>>(
      `/api/rental/receipts/${receiptId}/unskip`,
    );
    return unwrap(data);
  },
  async markOverdue(): Promise<{ flipped: number }> {
    const { data } = await api.post<ApiResponse<{ flipped: number }>>(
      '/api/rental/receipts/mark-overdue',
    );
    return unwrap(data);
  },

  // Expenses
  async listExpenses(propertyId?: string): Promise<PropertyExpenseDTO[]> {
    const { data } = await api.get<ApiResponse<PropertyExpenseDTO[]>>(
      '/api/rental/expenses',
      { params: propertyId ? { propertyId } : undefined },
    );
    return unwrap(data);
  },
  async addExpense(
    propertyId: string,
    input: CreateExpenseInput,
  ): Promise<PropertyExpenseDTO> {
    const { data } = await api.post<ApiResponse<PropertyExpenseDTO>>(
      `/api/rental/properties/${propertyId}/expenses`,
      input,
    );
    return unwrap(data);
  },
  async removeExpense(expenseId: string): Promise<void> {
    await api.delete(`/api/rental/expenses/${expenseId}`);
  },

  // Reminders
  async listReminders(filter: { status?: ReminderStatus; tenancyId?: string } = {}): Promise<RentReminderDTO[]> {
    const { data } = await api.get<ApiResponse<RentReminderDTO[]>>(
      '/api/rental/reminders',
      { params: filter },
    );
    return unwrap(data);
  },
  async updateReminder(id: string, patch: UpdateReminderInput): Promise<RentReminderDTO> {
    const { data } = await api.patch<ApiResponse<RentReminderDTO>>(
      `/api/rental/reminders/${id}`,
      patch,
    );
    return unwrap(data);
  },
  async rejectReminder(id: string): Promise<RentReminderDTO> {
    const { data } = await api.post<ApiResponse<RentReminderDTO>>(
      `/api/rental/reminders/${id}/reject`,
    );
    return unwrap(data);
  },
  async approveReminder(
    id: string,
    channels?: { email?: boolean; sms?: boolean },
  ): Promise<RentReminderDTO> {
    const { data } = await api.post<ApiResponse<RentReminderDTO>>(
      `/api/rental/reminders/${id}/approve`,
      channels ? { channels } : undefined,
    );
    return unwrap(data);
  },
  async runReminderScan(): Promise<{ queued: number }> {
    const { data } = await api.post<ApiResponse<{ queued: number }>>(
      '/api/rental/reminders/scan',
    );
    return unwrap(data);
  },
};

// ── Reminder DTOs ─────────────────────────────────────────────────────

export type ReminderStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT'
  | 'FAILED'
  | 'REJECTED'
  | 'SUPERSEDED';

export interface RentReminderDTO {
  id: string;
  receiptId: string;
  tenancyId: string;
  leadDays: number;
  status: ReminderStatus;
  channels: { email?: boolean; sms?: boolean };
  subject: string;
  body: string;
  smsBody: string;
  emailStatus: string | null;
  emailError: string | null;
  smsStatus: string | null;
  smsError: string | null;
  createdAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  tenancy?: {
    id: string;
    tenantName: string;
    tenantEmail: string | null;
    tenantPhone: string | null;
    property: { id: string; name: string };
  };
  receipt?: {
    id: string;
    forMonth: string;
    dueDate: string;
    expectedAmount: string;
    status: string;
  };
}

export interface UpdateReminderInput {
  subject?: string;
  body?: string;
  smsBody?: string;
  channels?: { email?: boolean; sms?: boolean };
}
