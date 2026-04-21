import { api } from './client';
import type {
  AuthUser,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  ApiResponse,
} from '@portfolioos/shared';

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
  async register(payload: RegisterRequest): Promise<AuthResult> {
    const { data } = await api.post<ApiResponse<AuthResult>>('/api/auth/register', payload);
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
};
