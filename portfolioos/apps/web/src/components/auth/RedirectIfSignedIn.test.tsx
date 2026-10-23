// @vitest-environment jsdom
/**
 * /register and /forgot-password stayed open to signed-in users (only /login
 * redirected). They now send a signed-in visitor on, and stay put for a
 * signed-out one — including when the page itself signs the user in.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AuthUser } from '@everypaisa/shared';
import { useAuthStore } from '@/stores/auth.store';
import { RedirectIfSignedIn } from './RedirectIfSignedIn';

const user: AuthUser = {
  id: 'u-redirect',
  email: 'het@example.com',
  name: 'Het',
  role: 'INVESTOR',
  plan: 'FREE',
  isActive: true,
  createdAt: new Date().toISOString(),
};
const tokens = { accessToken: 'a', refreshToken: 'r', accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<div>Dashboard</div>} />
        <Route path="/onboarding" element={<div>Onboarding</div>} />
        <Route path="/somewhere" element={<div>Somewhere</div>} />
        <Route path="/register" element={<RedirectIfSignedIn><div>Register page</div></RedirectIfSignedIn>} />
        <Route
          path="/forgot-password"
          element={<RedirectIfSignedIn><div>Forgot page</div></RedirectIfSignedIn>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  useAuthStore.getState().clearSession();
});

describe('RedirectIfSignedIn', () => {
  it('shows the page to a signed-out visitor', () => {
    renderAt('/register');
    expect(screen.getByText('Register page')).toBeTruthy();
  });

  it('sends a signed-in user away from /register and /forgot-password', () => {
    useAuthStore.getState().setSession(user, tokens);
    renderAt('/register');
    expect(screen.queryByText('Register page')).toBeNull();
    cleanup();
    renderAt('/forgot-password');
    expect(screen.queryByText('Forgot page')).toBeNull();
  });

  it('honours ?next= like /login does', () => {
    useAuthStore.getState().setSession(user, tokens);
    renderAt('/register?next=%2Fsomewhere');
    expect(screen.getByText('Somewhere')).toBeTruthy();
  });

  it('does not yank the page away when the page itself signs the user in', () => {
    renderAt('/register');
    act(() => useAuthStore.getState().setSession(user, tokens));
    expect(screen.getByText('Register page')).toBeTruthy();
  });
});
