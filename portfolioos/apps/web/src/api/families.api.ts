import type { InviteEmailDraft } from './ca.api';
import { api, unwrap } from './client';
import type { ApiResponse, AuthUser, AuthTokens } from '@everypaisa/shared';

export type FamilyRole = 'OWNER' | 'CONTRIBUTOR' | 'VIEWER';
export type FamilyMemberStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export const NON_AC_CATEGORIES = [
  'VEHICLE',
  'RENTAL',
  'INSURANCE',
  'LOAN',
  'CREDIT_CARD',
  'BANK_ACCOUNT',
  'OWNED_PROPERTY',
  'GOAL',
] as const;
export type NonAcCategory = (typeof NON_AC_CATEGORIES)[number];

/** What is using the family's seats. An open invitation holds one. */
export interface SeatUsage {
  includedSeats: number;
  members: number;
  openInvitations: number;
  used: number;
}

export interface MyFamily {
  id: string;
  name: string;
  description: string | null;
  role: FamilyRole;
  status: FamilyMemberStatus;
  joinedAt: string;
  seats: SeatUsage | null;
}

export interface FamilyMemberRow {
  id: string;
  userId: string;
  name: string;
  /** Null for a managed member: their address is a placeholder. */
  email: string | null;
  /** Someone without an email or login, kept by another member. */
  managed: boolean;
  managedBy: { id: string; name: string } | null;
  /** "Father", "Wife" — of `relatedTo`. */
  relation: string | null;
  /** Who `relation` is measured against, while they are still in the family. */
  relatedTo: { id: string; name: string } | null;
  role: FamilyRole;
  status: FamilyMemberStatus;
  visibleAssetClasses: string[];
  visibleCategories: NonAcCategory[];
  joinedAt: string;
  invitedById: string | null;
}

export interface PendingInvitation {
  id: string;
  invitedEmail: string;
  invitedName: string | null;
  role: FamilyRole;
  createdAt: string;
  expiresAt: string;
}

export interface InviteResult {
  status: 'invited';
  id: string;
  token: string;
  expiresAt: string;
  invitedEmail: string;
  invitedName: string | null;
  role: FamilyRole;
  familyName: string;
  seatNumber: number;
  includedSeats: number;
}

export interface SeatPaymentRequiredResult {
  status: 'seat_payment_required';
  pendingInviteId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  extraSeatPriceInr: string;
  seatNumber: number;
  includedSeats: number;
  message: string;
}

export type InviteOutcome = InviteResult | SeatPaymentRequiredResult;

export interface ManagedMemberResult {
  status: 'managed_added';
  userId: string;
  name: string;
  familyName: string;
  seatNumber: number;
  includedSeats: number;
}

export type ManagedOutcome = ManagedMemberResult | SeatPaymentRequiredResult;

export interface FamilyTreeNodePos {
  userId: string;
  x: number;
  y: number;
}
export interface FamilyTreeLink {
  fromUserId: string;
  toUserId: string;
  label?: string | null;
}
export interface FamilyTreeLayout {
  nodes?: FamilyTreeNodePos[];
  links?: FamilyTreeLink[];
  /** child userId → parent userId, or null for someone at the top of the tree. */
  parents?: Record<string, string | null>;
}

export interface InvitationPeek {
  familyName: string;
  invitedByName: string;
  invitedByEmail: string;
  invitedEmail: string;
  role: FamilyRole;
  expiresAt: string;
}

export const familiesApi = {
  async list(): Promise<MyFamily[]> {
    const { data } = await api.get<ApiResponse<MyFamily[]>>('/api/families');
    return unwrap(data);
  },
  async create(input: { name: string; description?: string }) {
    const { data } = await api.post<ApiResponse<{ id: string; name: string }>>(
      '/api/families',
      input,
    );
    return unwrap(data);
  },
  async update(familyId: string, patch: { name?: string; description?: string }) {
    const { data } = await api.patch<ApiResponse<{ id: string; name: string }>>(
      `/api/families/${familyId}`,
      patch,
    );
    return unwrap(data);
  },

  async members(familyId: string): Promise<FamilyMemberRow[]> {
    const { data } = await api.get<ApiResponse<FamilyMemberRow[]>>(
      `/api/families/${familyId}/members`,
    );
    return unwrap(data);
  },
  async updateMemberPermissions(
    familyId: string,
    memberUserId: string,
    patch: {
      role?: FamilyRole;
      visibleAssetClasses?: string[];
      visibleCategories?: NonAcCategory[];
      relation?: string | null;
      relatedToId?: string | null;
    },
  ) {
    const { data } = await api.patch<ApiResponse<FamilyMemberRow>>(
      `/api/families/${familyId}/members/${memberUserId}/permissions`,
      patch,
    );
    return unwrap(data);
  },
  async revokeMember(familyId: string, memberUserId: string): Promise<void> {
    await api.delete(`/api/families/${familyId}/members/${memberUserId}`);
  },
  async leaveFamily(familyId: string) {
    const { data } = await api.post<ApiResponse<FamilyMemberRow>>(
      `/api/families/${familyId}/leave`,
    );
    return unwrap(data);
  },

  async pendingInvitations(familyId: string): Promise<PendingInvitation[]> {
    const { data } = await api.get<ApiResponse<PendingInvitation[]>>(
      `/api/families/${familyId}/invitations`,
    );
    return unwrap(data);
  },
  async invite(
    familyId: string,
    input: {
      invitedEmail: string;
      invitedName?: string;
      role?: FamilyRole;
      visibleAssetClasses?: string[];
      visibleCategories?: NonAcCategory[];
      relation?: string;
      relatedToId?: string;
    },
  ): Promise<InviteOutcome> {
    const { data } = await api.post<ApiResponse<InviteOutcome>>(
      `/api/families/${familyId}/members/invite`,
      input,
    );
    return unwrap(data);
  },
  // Completes an overage invite after its Razorpay payment succeeds —
  // see verifySeatPaymentAndInvite on the backend for the trust model.
  async verifySeatPayment(
    familyId: string,
    payload: {
      pendingInviteId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
  ): Promise<InviteResult | ManagedMemberResult> {
    const { data } = await api.post<ApiResponse<InviteResult | ManagedMemberResult>>(
      `/api/families/${familyId}/members/invite/verify-payment`,
      payload,
    );
    return unwrap(data);
  },
  /** Add someone with no email or login, kept by `managerId` (default: you). */
  async addManagedMember(
    familyId: string,
    input: { name: string; relation?: string; relatedToId?: string; managerId?: string },
  ): Promise<ManagedOutcome> {
    const { data } = await api.post<ApiResponse<ManagedOutcome>>(
      `/api/families/${familyId}/members/managed`,
      input,
    );
    return unwrap(data);
  },
  async setManager(familyId: string, memberUserId: string, managerId: string): Promise<void> {
    await api.patch(`/api/families/${familyId}/members/${memberUserId}/manager`, { managerId });
  },
  async cancelInvitation(familyId: string, invitationId: string): Promise<void> {
    await api.delete(`/api/families/${familyId}/invitations/${invitationId}`);
  },
  async peek(token: string): Promise<InvitationPeek> {
    const { data } = await api.get<ApiResponse<InvitationPeek>>(
      `/api/families/invitations/${token}/peek`,
    );
    return unwrap(data);
  },
  async accept(token: string) {
    const { data } = await api.post<ApiResponse<FamilyMemberRow>>(
      `/api/families/invitations/${token}/accept`,
    );
    return unwrap(data);
  },

  async getTreeLayout(familyId: string): Promise<FamilyTreeLayout | null> {
    const { data } = await api.get<ApiResponse<FamilyTreeLayout | null>>(
      `/api/families/${familyId}/tree-layout`,
    );
    return unwrap(data);
  },
  async saveTreeLayout(
    familyId: string,
    layout: FamilyTreeLayout,
  ): Promise<FamilyTreeLayout> {
    const { data } = await api.put<ApiResponse<FamilyTreeLayout>>(
      `/api/families/${familyId}/tree-layout`,
      layout,
    );
    return unwrap(data);
  },

  async sharePortfolio(familyId: string, portfolioId: string) {
    const { data } = await api.post<ApiResponse<{ id: string; familyId: string | null }>>(
      `/api/families/${familyId}/portfolios/${portfolioId}/share`,
    );
    return unwrap(data);
  },
  async unsharePortfolio(familyId: string, portfolioId: string) {
    const { data } = await api.post<ApiResponse<{ id: string; familyId: string | null }>>(
      `/api/families/${familyId}/portfolios/${portfolioId}/unshare`,
    );
    return unwrap(data);
  },

  async createFamilyPortfolio(
    familyId: string,
    input: { name: string; description?: string; currency?: string; type?: string },
  ) {
    const { data } = await api.post<ApiResponse<{ id: string; name: string }>>(
      `/api/families/${familyId}/portfolios`,
      input,
    );
    return unwrap(data);
  },
};

/** Handing a managed member the account that was kept for them. */
export interface ClaimInviteResult {
  invitationId: string;
  token: string;
  invitedEmail: string;
  expiresAt: string;
}

export interface ClaimPreview {
  profileName: string;
  familyName: string;
  invitedBy: string;
  invitedEmail: string;
  expiresAt: string;
}

export const familyClaimApi = {
  /** Invite the person a managed profile belongs to, now that they have an email. */
  async invite(
    familyId: string,
    memberUserId: string,
    email: string,
  ): Promise<ClaimInviteResult> {
    const { data } = await api.post<ApiResponse<ClaimInviteResult>>(
      `/api/families/${familyId}/members/${memberUserId}/claim-invite`,
      { email },
    );
    return unwrap(data);
  },
  /** Public: what the link says, before they have an account. */
  async peek(token: string): Promise<ClaimPreview> {
    const { data } = await api.get<ApiResponse<ClaimPreview>>(
      `/api/families/claims/${token}/peek`,
    );
    return unwrap(data);
  },
  /** Public: take it over. Returns a session — they are signed in as it. */
  async claim(
    token: string,
    input: { email: string; password: string },
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const { data } = await api.post<ApiResponse<{ user: AuthUser; tokens: AuthTokens }>>(
      `/api/families/claims/${token}`,
      input,
    );
    return unwrap(data);
  },
};

/** The family invitation email: drafted and sent by the server, edited here. */
export const familyInviteEmailApi = {
  async preview(
    familyId: string,
    invitationId: string,
    edits: { subject?: string; message?: string } = {},
  ): Promise<InviteEmailDraft> {
    const { data } = await api.post<ApiResponse<InviteEmailDraft>>(
      `/api/families/${familyId}/invitations/${invitationId}/email/preview`,
      edits,
    );
    return unwrap(data);
  },
  async send(
    familyId: string,
    invitationId: string,
    edits: { subject?: string; message?: string },
  ): Promise<{ sent: boolean; to: string; sendsRemaining: number; reason?: string }> {
    const { data } = await api.post<
      ApiResponse<{ sent: boolean; to: string; sendsRemaining: number; reason?: string }>
    >(`/api/families/${familyId}/invitations/${invitationId}/email/send`, edits);
    return unwrap(data);
  },
};
