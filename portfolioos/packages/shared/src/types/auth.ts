import type { UserRole, PlanTier } from './enums.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  /**
   * Masked PAN for display (XXXXX1234F). The full value is never part of the
   * profile payload — it was, and it ended up persisted in localStorage next
   * to the auth tokens. Fetch the real one from POST /api/auth/pan/reveal,
   * which is authenticated, rate-limited and audited.
   */
  panMasked?: string | null;
  hasPan?: boolean;
  dob?: string | null;
  role: UserRole;
  plan: PlanTier;
  planExpiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: UserRole;
  // No client-supplied `plan` — every new account starts FREE and upgrades
  // only through the billing flow (see @everypaisa/shared/entitlements).
}

/** Returned by register/resend: a code was emailed, no account exists yet. */
export interface PendingRegistration {
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
}

export interface VerifyRegistrationRequest {
  email: string;
  code: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
  pan?: string;
  dob?: string;
}
