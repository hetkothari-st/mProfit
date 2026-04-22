import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

// ── DTOs ─────────────────────────────────────────────────────────────

export interface PremiumPaymentDTO {
  id: string;
  policyId: string;
  paidOn: string;
  amount: string;
  periodFrom: string;
  periodTo: string;
  canonicalEventId: string | null;
}

export interface InsuranceClaimDTO {
  id: string;
  policyId: string;
  claimNumber: string | null;
  claimDate: string;
  claimType: string;
  claimedAmount: string;
  settledAmount: string | null;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SETTLED';
  settledOn: string | null;
  documents: unknown;
}

export interface InsurancePolicyDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  insurer: string;
  policyNumber: string;
  type: string;
  planName: string | null;
  policyHolder: string;
  nominees: unknown;
  sumAssured: string;
  premiumAmount: string;
  premiumFrequency: string;
  startDate: string;
  maturityDate: string | null;
  nextPremiumDue: string | null;
  vehicleId: string | null;
  vehicle?: { id: string; registrationNo: string; make: string | null; model: string | null } | null;
  healthCoverDetails: HealthCoverDetails | null;
  status: string;
  createdAt: string;
  premiumHistory?: PremiumPaymentDTO[];
  claims?: InsuranceClaimDTO[];
}

export interface HealthCoverDetails {
  members?: string[];
  roomRent?: string | null;
  coPay?: number | null;
  subLimits?: Record<string, string>;
  preExistingWait?: number | null;
}

// ── Input types ───────────────────────────────────────────────────────

export interface CreatePolicyInput {
  insurer: string;
  policyNumber: string;
  type: string;
  planName?: string | null;
  policyHolder: string;
  nominees?: unknown;
  sumAssured: string;
  premiumAmount: string;
  premiumFrequency: string;
  startDate: string;
  maturityDate?: string | null;
  nextPremiumDue?: string | null;
  vehicleId?: string | null;
  portfolioId?: string | null;
  healthCoverDetails?: HealthCoverDetails | null;
  status?: string;
}

export type UpdatePolicyInput = Partial<CreatePolicyInput>;

export interface AddPremiumInput {
  paidOn: string;
  amount: string;
  periodFrom: string;
  periodTo: string;
  canonicalEventId?: string | null;
}

export interface AddClaimInput {
  claimNumber?: string | null;
  claimDate: string;
  claimType: string;
  claimedAmount: string;
  status: InsuranceClaimDTO['status'];
  settledAmount?: string | null;
  settledOn?: string | null;
  documents?: unknown;
}

export type UpdateClaimInput = Partial<AddClaimInput>;

// ── API client ────────────────────────────────────────────────────────

export const insuranceApi = {
  async listPolicies(): Promise<InsurancePolicyDTO[]> {
    const { data } = await api.get<ApiResponse<InsurancePolicyDTO[]>>('/api/insurance/policies');
    return unwrap(data);
  },
  async getPolicy(id: string): Promise<InsurancePolicyDTO> {
    const { data } = await api.get<ApiResponse<InsurancePolicyDTO>>(
      `/api/insurance/policies/${id}`,
    );
    return unwrap(data);
  },
  async createPolicy(input: CreatePolicyInput): Promise<InsurancePolicyDTO> {
    const { data } = await api.post<ApiResponse<InsurancePolicyDTO>>(
      '/api/insurance/policies',
      input,
    );
    return unwrap(data);
  },
  async updatePolicy(id: string, input: UpdatePolicyInput): Promise<InsurancePolicyDTO> {
    const { data } = await api.patch<ApiResponse<InsurancePolicyDTO>>(
      `/api/insurance/policies/${id}`,
      input,
    );
    return unwrap(data);
  },
  async deletePolicy(id: string): Promise<void> {
    await api.delete(`/api/insurance/policies/${id}`);
  },
  async addPremium(policyId: string, input: AddPremiumInput): Promise<PremiumPaymentDTO> {
    const { data } = await api.post<ApiResponse<PremiumPaymentDTO>>(
      `/api/insurance/policies/${policyId}/premiums`,
      input,
    );
    return unwrap(data);
  },
  async removePremium(paymentId: string): Promise<void> {
    await api.delete(`/api/insurance/premiums/${paymentId}`);
  },
  async addClaim(policyId: string, input: AddClaimInput): Promise<InsuranceClaimDTO> {
    const { data } = await api.post<ApiResponse<InsuranceClaimDTO>>(
      `/api/insurance/policies/${policyId}/claims`,
      input,
    );
    return unwrap(data);
  },
  async updateClaim(claimId: string, input: UpdateClaimInput): Promise<InsuranceClaimDTO> {
    const { data } = await api.patch<ApiResponse<InsuranceClaimDTO>>(
      `/api/insurance/claims/${claimId}`,
      input,
    );
    return unwrap(data);
  },
  async removeClaim(claimId: string): Promise<void> {
    await api.delete(`/api/insurance/claims/${claimId}`);
  },
  async triggerRenewalAlerts(): Promise<{ created: number }> {
    const { data } = await api.post<ApiResponse<{ created: number }>>(
      '/api/insurance/alerts/trigger',
    );
    return unwrap(data);
  },
};
