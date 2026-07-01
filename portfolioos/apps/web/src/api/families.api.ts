import { api, unwrap } from './client';
import type { ApiResponse } from '@portfolioos/shared';

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

export interface MyFamily {
  id: string;
  name: string;
  description: string | null;
  role: FamilyRole;
  status: FamilyMemberStatus;
  joinedAt: string;
}

export interface FamilyMemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
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
  id: string;
  token: string;
  expiresAt: string;
  invitedEmail: string;
  invitedName: string | null;
  role: FamilyRole;
  familyName: string;
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
    },
  ): Promise<InviteResult> {
    const { data } = await api.post<ApiResponse<InviteResult>>(
      `/api/families/${familyId}/members/invite`,
      input,
    );
    return unwrap(data);
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
