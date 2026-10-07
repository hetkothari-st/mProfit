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

/** Password/Google step passed on a two-factor account: send a code next. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  expiresAt: string;
}

export function isMfaChallenge(x: unknown): x is MfaChallenge {
  return typeof x === 'object' && x !== null && (x as { mfaRequired?: unknown }).mfaRequired === true;
}

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
  /** This session was signed in with a code (what the CA workspace needs). */
  sessionVerified: boolean;
}

export const authApi = {
  async login(payload: LoginRequest): Promise<AuthResult | MfaChallenge> {
    const { data } = await api.post<ApiResponse<AuthResult | MfaChallenge>>('/api/auth/login', payload);
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
  async loginWithGoogle(
    idToken: string,
    restore?: boolean,
  ): Promise<(AuthResult & { isNew?: boolean }) | MfaChallenge> {
    const { data } = await api.post<ApiResponse<(AuthResult & { isNew?: boolean }) | MfaChallenge>>(
      '/api/auth/google',
      restore ? { idToken, restore } : { idToken },
    );
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  /** Second step of a two-factor sign-in. */
  async verifyTwoFactor(mfaToken: string, code: string): Promise<AuthResult> {
    const { data } = await api.post<ApiResponse<AuthResult>>('/api/auth/2fa/verify', { mfaToken, code });
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async twoFactorStatus(): Promise<TwoFactorStatus> {
    const { data } = await api.get<ApiResponse<TwoFactorStatus>>('/api/auth/me/2fa');
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async twoFactorSetup(): Promise<{ secret: string; otpauthUrl: string }> {
    const { data } = await api.post<ApiResponse<{ secret: string; otpauthUrl: string }>>('/api/auth/me/2fa/setup');
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  /** Also returns a fresh session marked as signed in with the second factor. */
  async twoFactorEnable(code: string): Promise<{ backupCodes: string[]; session?: AuthResult }> {
    const { data } = await api.post<ApiResponse<{ backupCodes: string[]; session?: AuthResult }>>('/api/auth/me/2fa/enable', { code });
    if (!data.success) throw new Error(data.error);
    return data.data;
  },
  async twoFactorDisable(code: string): Promise<void> {
    const { data } = await api.post<ApiResponse<{ enabled: false }>>('/api/auth/me/2fa/disable', { code });
    if (!data.success) throw new Error(data.error);
  },
  async twoFactorBackupCodes(code: string): Promise<{ backupCodes: string[] }> {
    const { data } = await api.post<ApiResponse<{ backupCodes: string[] }>>('/api/auth/me/2fa/backup-codes', { code });
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
