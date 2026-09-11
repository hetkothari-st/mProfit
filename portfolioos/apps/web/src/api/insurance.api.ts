import { api, unwrap } from './client';
import type { ApiResponse, ClaimKind, ClaimProgress, NextPremiumDue } from '@portfolioos/shared';

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

/** One line in the claim's own log: a call, a letter, a visit. */
export interface ClaimLogEntry {
  on: string;
  note: string;
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
  /** Claims guide it follows; null for "something else". */
  kind: ClaimKind | null;
  documentsCompletedOn: string | null;
  surveyorAllocatedOn: string | null;
  /** Guide document ids ticked off. */
  checklist: Record<string, true> | null;
  timeline: ClaimLogEntry[] | null;
  rejectionReason: string | null;
  grievanceFiledOn: string | null;
  grievanceRef: string | null;
  ombudsmanFiledOn: string | null;
  ombudsmanRef: string | null;
  createdAt: string;
  updatedAt: string;
  /** Where it stands and what to do next, worked out by the server. */
  progress: ClaimProgress;
}

export interface Nominee {
  name: string;
  relation: string;
  /** Percent of the payout; when any nominee has one, they total 100. */
  sharePercent?: number | null;
  isMinor?: boolean;
  /** Receives the money for a minor nominee. */
  appointeeName?: string | null;
  appointeeRelation?: string | null;
}

export interface PolicyContacts {
  helpline?: string | null;
  claimEmail?: string | null;
  claimUrl?: string | null;
  tpaName?: string | null;
  tpaHelpline?: string | null;
  agentName?: string | null;
  agentPhone?: string | null;
  agentEmail?: string | null;
}

export interface HealthCoverDetails {
  members?: string[];
  roomRent?: string | null;
  coPay?: number | null;
  subLimits?: Record<string, string>;
  preExistingWait?: number | null;
}

export interface InsurancePolicyDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  insurer: string;
  /** The policy number is never sent in full; reveal it via `revealPolicyNumber`. */
  policyNumberLast4: string | null;
  hasPolicyNumber: boolean;
  type: string;
  planName: string | null;
  policyHolder: string;
  nominees: Nominee[] | null;
  contacts: PolicyContacts | null;
  sumAssured: string;
  premiumAmount: string;
  premiumFrequency: string;
  startDate: string;
  maturityDate: string | null;
  nextPremiumDue: string | null;
  /** Premiums due before this date aren't tracked (treated as settled). */
  premiumsTrackedFrom: string | null;
  /** Grace period the user set; null = the usual one for this kind of policy. */
  gracePeriodDays: number | null;
  /** Grace period in effect (the user's, or the usual one). */
  graceDays: number;
  /** Where the next premium stands, worked out by the server. */
  premiumDue: NextPremiumDue;
  vehicleId: string | null;
  vehicle?: { id: string; registrationNo: string; make: string | null; model: string | null } | null;
  healthCoverDetails: HealthCoverDetails | null;
  status: string;
  createdAt: string;
  premiumHistory?: PremiumPaymentDTO[];
  claims?: InsuranceClaimDTO[];
}

// ── Input types ───────────────────────────────────────────────────────

export interface CreatePolicyInput {
  insurer: string;
  policyNumber: string;
  type: string;
  planName?: string | null;
  policyHolder: string;
  nominees?: Nominee[] | null;
  contacts?: PolicyContacts | null;
  sumAssured: string;
  premiumAmount: string;
  premiumFrequency: string;
  startDate: string;
  maturityDate?: string | null;
  nextPremiumDue?: string | null;
  gracePeriodDays?: number | null;
  vehicleId?: string | null;
  portfolioId?: string | null;
  healthCoverDetails?: HealthCoverDetails | null;
  status?: string;
}

/** Leave `policyNumber` out to keep the saved one. */
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
  kind?: ClaimKind | null;
  documentsCompletedOn?: string | null;
  surveyorAllocatedOn?: string | null;
  checklist?: Record<string, boolean> | null;
  timeline?: ClaimLogEntry[] | null;
  rejectionReason?: string | null;
  grievanceFiledOn?: string | null;
  grievanceRef?: string | null;
  ombudsmanFiledOn?: string | null;
  ombudsmanRef?: string | null;
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
  /** The full policy number. Audit-logged and rate-limited on the server. */
  async revealPolicyNumber(id: string): Promise<{ policyNumber: string | null }> {
    const { data } = await api.post<ApiResponse<{ policyNumber: string | null }>>(
      `/api/insurance/policies/${id}/reveal`,
    );
    return unwrap(data);
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
