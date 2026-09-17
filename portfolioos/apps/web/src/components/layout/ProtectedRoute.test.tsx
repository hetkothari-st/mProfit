// @vitest-environment jsdom
/**
 * A failed /me from an expired session must not wipe the session the user
 * signs in with afterwards.
 *
 * Production sequence this reproduces: a deploy reloads the tab, the stored
 * token has expired, /me returns 401 and ProtectedRoute clears the session.
 * The user then signs in again without a page reload. React Query still holds
 * the old /me error, and ProtectedRoute used to act on it — clearing the
 * brand-new session on the first render, so every request went out with no
 * token and the user landed back on /login right after "Welcome back".
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import type { AuthUser } from '@everypaisa/shared';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/api/auth.api';
import { ProtectedRoute } from './ProtectedRoute';

const user: AuthUser = {
  id: 'u1',
  email: 'het@example.com',
  name: 'Het',
  role: 'INVESTOR',
  plan: 'FREE',
  isActive: true,
  createdAt: new Date().toISOString(),
};

let navigate: NavigateFunction = () => undefined;
function CaptureNavigate() {
  navigate = useNavigate();
  return null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    accessTokenExpiresAt: null,
  });
});

describe('ProtectedRoute', () => {
  it('keeps a fresh sign-in even though an earlier /me failed', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new Error('401'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Resumed session after a reload: a token, no profile, and /me rejects it.
    useAuthStore.setState({ user: null, accessToken: 'expired', refreshToken: 'stale' });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <CaptureNavigate />
          <Routes>
            <Route path="/login" element={<div>Login page</div>} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Dashboard</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('Login page');
    expect(useAuthStore.getState().accessToken).toBeNull();

    // Sign in again in the same page — no reload, so the /me error is still cached.
    act(() => {
      useAuthStore.getState().setSession(user, {
        accessToken: 'fresh',
        refreshToken: 'fresh-refresh',
        accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
      });
    });
    act(() => navigate('/dashboard'));

    await screen.findByText('Dashboard');
    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('fresh'));
    expect(useAuthStore.getState().refreshToken).toBe('fresh-refresh');
  });
});
