// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { AcceptProfessionalInvitePage } from './AcceptProfessionalInvitePage';

/**
 * A professional who already has an account opens a second client's link in
 * a new tab. The tab holds a session token but no loaded profile — the
 * profile is never persisted — and the page used to read that as signed out
 * and offer "Sign in / Create account" to someone already signed in.
 */

const api = vi.hoisted(() => ({
  me: vi.fn(),
  peek: vi.fn(),
}));
vi.mock('@/api/auth.api', () => ({ authApi: { me: api.me, logout: vi.fn() } }));
vi.mock('@/api/ca.api', () => ({
  professionalInviteApi: { peek: api.peek, accept: vi.fn() },
}));

const INVITE = {
  invitedBy: 'Amit Shah',
  invitedEmail: 'mahesh@example.com',
  expiresAt: '2026-10-06T00:00:00.000Z',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/professional-invitations/tok123']}>
        <Routes>
          <Route path="/professional-invitations/:token" element={<AcceptProfessionalInvitePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.peek.mockResolvedValue(INVITE);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null });
});

describe('opening an invitation in a new tab', () => {
  it('recognises a session that holds a token but no profile yet', async () => {
    useAuthStore.setState({ accessToken: 'token', refreshToken: 'refresh', user: null });
    api.me.mockResolvedValue({ id: 'u2', email: 'mahesh@example.com', name: 'Mahesh Iyer' });

    renderPage();

    expect(await screen.findByRole('button', { name: /accept and open their books/i })).toBeTruthy();
    expect(screen.queryByText(/create account/i)).toBeNull();
    expect(api.me).toHaveBeenCalledTimes(1);
  });

  it('says so, and offers the right account, when signed in as someone else', async () => {
    useAuthStore.setState({ accessToken: 'token', refreshToken: 'refresh', user: null });
    api.me.mockResolvedValue({ id: 'u3', email: 'amit@example.com', name: 'Amit Shah' });

    renderPage();

    expect(await screen.findByRole('button', { name: /sign in as mahesh@example.com/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /accept and open their books/i })).toBeNull();
  });

  it('still offers sign in or create account with no session at all', async () => {
    renderPage();

    expect(await screen.findByText(/create account/i)).toBeTruthy();
    expect(api.me).not.toHaveBeenCalled();
  });
});
