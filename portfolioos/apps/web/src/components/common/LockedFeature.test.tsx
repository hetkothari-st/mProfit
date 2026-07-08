// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AuthUser } from '@portfolioos/shared';
import { useAuthStore } from '@/stores/auth.store';
import { LockedFeature } from './LockedFeature';

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
});

function makeUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'u1',
    email: 'a@b.com',
    name: 'Test User',
    role: 'INVESTOR',
    plan: 'FREE',
    isActive: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderLocked(children = <div>Secret content</div>) {
  render(
    <MemoryRouter>
      <LockedFeature requiredTier="PLUS" featureName="Tax Report Catalog">
        {children}
      </LockedFeature>
    </MemoryRouter>,
  );
}

describe('LockedFeature', () => {
  it('renders children plainly when the user meets the required tier', () => {
    useAuthStore.setState({ user: makeUser({ plan: 'PLUS' }) });
    renderLocked();
    expect(screen.getByText('Secret content')).toBeTruthy();
    expect(screen.queryByText(/is locked/i)).toBeNull();
  });

  it('shows the locked overlay with an upgrade CTA when the user is below the required tier', () => {
    useAuthStore.setState({ user: makeUser({ plan: 'FREE' }) });
    renderLocked();
    expect(screen.getByText(/Tax Report Catalog is locked/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /view plans/i }).getAttribute('href')).toBe('/pricing');
    // Children still render (dimmed) behind the overlay, not hidden outright.
    expect(screen.getByText('Secret content')).toBeTruthy();
  });

  it('gates ADMIN role on their own plan too, same as any user (no automatic bypass)', () => {
    useAuthStore.setState({ user: makeUser({ plan: 'FREE', role: 'ADMIN' }) });
    renderLocked();
    expect(screen.getByText(/Tax Report Catalog is locked/i)).toBeTruthy();

    cleanup();
    useAuthStore.setState({ user: makeUser({ plan: 'PLUS', role: 'ADMIN' }) });
    renderLocked();
    expect(screen.getByText('Secret content')).toBeTruthy();
    expect(screen.queryByText(/is locked/i)).toBeNull();
  });

  it('locks when there is no authenticated user', () => {
    useAuthStore.setState({ user: null });
    renderLocked();
    expect(screen.getByText(/is locked/i)).toBeTruthy();
  });
});
