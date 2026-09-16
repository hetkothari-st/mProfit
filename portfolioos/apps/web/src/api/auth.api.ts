import { api } from './client';
import type {
  AuthUser,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  PendingRegistration,
  VerifyRegistrationRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  ApiResponse,
} from '@everypaisa/shared';

export interface AccountDeletionStatus {
  blockers: Array<{ familyId: string; familyName: string; otherMembers: number }>;
  graceDays: number;
}

export interface AuthResult {
  user: AuthUser;
  tokens: AuthTokens;
}

export const authApi = {
  async login(payload: LoginRequest): Promise<AuthResult> {
    const { data } = await api.post<ApiResponse<AuthResult>>('/api/auth/login', payload);
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  /** Emails a verification code. The account is created by `verifyRegistration`. */
  async register(payload: RegisterRequest): Promise<PendingRegistration> {
    const { data } = await api.post<ApiResponse<PendingRegistration>>(
      '/api/auth/register',
      payload,
    );
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async verifyRegistration(payload: VerifyRegistrationRequest): Promise<AuthResult> {
    const { data } = await api.post<ApiResponse<AuthResult>>(
      '/api/auth/register/verify',
      payload,
    );
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async resendRegistrationCode(email: string): Promise<PendingRegistration> {
    const { data } = await api.post<ApiResponse<PendingRegistration>>(
      '/api/auth/register/resend',
      { email },
    );
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async loginWithGoogle(idToken: string, restore?: boolean): Promise<AuthResult & { isNew?: boolean }> {
    const { data } = await api.post<ApiResponse<AuthResult & { isNew?: boolean }>>(
      '/api/auth/google',
      restore ? { idToken, restore } : { idToken },
    );
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async logout(refreshToken: string | null): Promise<void> {
    await api.post('/api/auth/logout', refreshToken ? { refreshToken } : {});
  },
  async forgotPassword(payload: ForgotPasswordRequest): Promise<{ message: string }> {
    const { data } = await api.post<ApiResponse<{ message: string }>>(
      '/api/auth/forgot-password',
      payload,
    );
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async resetPassword(payload: ResetPasswordRequest): Promise<{ message: string }> {
    const { data } = await api.post<ApiResponse<{ message: string }>>(
      '/api/auth/reset-password',
      payload,
    );
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  /**
   * Fetch the caller's full PAN. Separate from the profile on purpose: the
   * profile is cached and the full value should not be. Rate-limited and
   * audited server-side.
   */
  async revealPan(): Promise<string | null> {
    const { data } = await api.post<ApiResponse<{ pan: string | null }>>(
      '/api/auth/pan/reveal',
    );
    if (!data.success) throw new Error(data.error);
    return data.data.pan;
  },
  async me(): Promise<AuthUser> {
    const { data } = await api.get<ApiResponse<AuthUser>>('/api/auth/me');
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async updateProfile(payload: UpdateProfileRequest): Promise<AuthUser> {
    const { data } = await api.patch<ApiResponse<AuthUser>>('/api/auth/me', payload);
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  /** What would block deleting the account right now. */
  async deletionStatus(): Promise<AccountDeletionStatus> {
    const { data } = await api.get<ApiResponse<AccountDeletionStatus>>('/api/auth/me/deletion');
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async sendDeletionCode(): Promise<{ sentTo: string }> {
    const { data } = await api.post<ApiResponse<{ sentTo: string }>>('/api/auth/me/deletion/code');
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async requestDeletion(payload: {
    confirmText: string;
    password?: string;
    code?: string;
  }): Promise<{ scheduledFor: string }> {
    const { data } = await api.post<ApiResponse<{ scheduledFor: string }>>('/api/auth/me/deletion', payload);
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
};
