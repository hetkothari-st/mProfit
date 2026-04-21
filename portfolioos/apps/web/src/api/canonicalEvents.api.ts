import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export type CanonicalEventStatus =
  | 'PARSED'
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'PROJECTED'
  | 'REJECTED'
  | 'FAILED'
  | 'ARCHIVED';

export type CanonicalEventType =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'INTEREST_CREDIT'
  | 'INTEREST_DEBIT'
  | 'EMI_DEBIT'
  | 'PREMIUM_PAID'
  | 'MATURITY_CREDIT'
  | 'RENT_RECEIVED'
  | 'RENT_PAID'
  | 'SIP_INSTALLMENT'
  | 'FD_CREATION'
  | 'FD_MATURITY'
  | 'CARD_PURCHASE'
  | 'CARD_PAYMENT'
  | 'UPI_CREDIT'
  | 'UPI_DEBIT'
  | 'NEFT_CREDIT'
  | 'NEFT_DEBIT'
  | 'VALUATION_SNAPSHOT'
  | 'VEHICLE_CHALLAN'
  | 'OTHER';

export interface CanonicalEventDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  sourceAdapter: string;
  sourceAdapterVer: string;
  sourceRef: string;
  sourceHash: string;
  senderAddress: string | null;
  eventType: CanonicalEventType;
  eventDate: string;
  amount: string | null;
  quantity: string | null;
  price: string | null;
  counterparty: string | null;
  instrumentIsin: string | null;
  instrumentSymbol: string | null;
  instrumentName: string | null;
  accountLast4: string | null;
  currency: string;
  metadata: unknown;
  confidence: string;
  parserNotes: string | null;
  status: CanonicalEventStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  projectedTransactionId: string | null;
  projectedCashFlowId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListCanonicalEventsParams {
  status?: CanonicalEventStatus;
  senderAddress?: string;
  limit?: number;
}

export interface CanonicalEventPatch {
  eventType?: CanonicalEventType;
  eventDate?: string;
  amount?: string | null;
  quantity?: string | null;
  price?: string | null;
  counterparty?: string | null;
  instrumentIsin?: string | null;
  instrumentSymbol?: string | null;
  instrumentName?: string | null;
  portfolioId?: string | null;
}

export type ApproveOutcome = {
  event: CanonicalEventDTO;
  projection:
    | { kind: 'projected'; transactionId?: string; cashFlowId?: string }
    | { kind: 'failed'; reason: string; message?: string };
  senderReachedAutoCommit: boolean;
};

export interface BulkApproveOutcome {
  requested: number;
  approved: number;
  failed: number;
  outcomes: ApproveOutcome[];
}

export const canonicalEventsApi = {
  async list(params: ListCanonicalEventsParams = {}): Promise<CanonicalEventDTO[]> {
    const query: Record<string, string> = {};
    if (params.status) query.status = params.status;
    if (params.senderAddress) query.senderAddress = params.senderAddress;
    if (params.limit !== undefined) query.limit = String(params.limit);
    const { data } = await api.get<ApiResponse<CanonicalEventDTO[]>>(
      '/api/canonical-events',
      { params: query },
    );
    return unwrap(data);
  },
  async get(id: string): Promise<CanonicalEventDTO> {
    const { data } = await api.get<ApiResponse<CanonicalEventDTO>>(
      `/api/canonical-events/${id}`,
    );
    return unwrap(data);
  },
  async patch(id: string, body: CanonicalEventPatch): Promise<CanonicalEventDTO> {
    const { data } = await api.patch<ApiResponse<CanonicalEventDTO>>(
      `/api/canonical-events/${id}`,
      body,
    );
    return unwrap(data);
  },
  async approve(id: string): Promise<ApproveOutcome> {
    const { data } = await api.post<ApiResponse<ApproveOutcome>>(
      `/api/canonical-events/${id}/approve`,
    );
    return unwrap(data);
  },
  async reject(id: string, reason?: string): Promise<CanonicalEventDTO> {
    const { data } = await api.post<ApiResponse<CanonicalEventDTO>>(
      `/api/canonical-events/${id}/reject`,
      { reason },
    );
    return unwrap(data);
  },
  async bulkApprove(senderAddress: string): Promise<BulkApproveOutcome> {
    const { data } = await api.post<ApiResponse<BulkApproveOutcome>>(
      '/api/canonical-events/bulk-approve',
      { senderAddress },
    );
    return unwrap(data);
  },
};
