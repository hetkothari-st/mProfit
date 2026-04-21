import type { UserRole, PlanTier } from './enums.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  pan?: string | null;
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
  plan?: PlanTier;
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
  token: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
  pan?: string;
  dob?: string;
}
