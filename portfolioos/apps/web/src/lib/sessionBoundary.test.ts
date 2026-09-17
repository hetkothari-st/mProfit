// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { AuthUser, AuthTokens } from '@everypaisa/shared';
import { useAuthStore } from '@/stores/auth.store';
import { useFamilyScopeStore } from '@/stores/familyScope.store';
import { bindSessionBoundary } from './sessionBoundary';

const tokens = (t: string): AuthTokens => ({
  accessToken: `access-${t}`,
  refreshToken: `refresh-${t}`,
  accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
});

const account = (id: string): AuthUser => ({
  id,
  email: `${id}@example.com`,
  name: id,
  role: 'INVESTOR',
  plan: 'FREE',
  isActive: true,
  createdAt: new Date().toISOString(),
});

let queryClient: QueryClient;
let unbind: () => void;

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    accessTokenExpiresAt: null,
  });
  useFamilyScopeStore.getState().clear();
  queryClient = new QueryClient();
  unbind = bindSessionBoundary(queryClient);
});

afterEach(() => unbind());

/** What account A's dashboard would have left behind in the tab. */
function cacheAccountAData() {
  queryClient.setQueryData(['dashboard', 'net-worth'], { total: '9999999' });
  queryClient.setQueryData(['families'], [{ id: 'family-of-a' }]);
  useFamilyScopeStore.getState().setFamily('family-of-a', "A's family");
}

describe('session boundary', () => {
  it('drops the previous account’s data when another account signs in', () => {
    useAuthStore.getState().setSession(account('a'), tokens('a'));
    cacheAccountAData();

    useAuthStore.getState().setSession(account('b'), tokens('b'));

    expect(queryClient.getQueryData(['dashboard', 'net-worth'])).toBeUndefined();
    expect(queryClient.getQueryData(['families'])).toBeUndefined();
    expect(useFamilyScopeStore.getState().viewingAsFamilyId).toBeNull();
  });

  it('drops everything on sign-out, before the next sign-in', () => {
    useAuthStore.getState().setSession(account('a'), tokens('a'));
    cacheAccountAData();

    useAuthStore.getState().clearSession();

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(useFamilyScopeStore.getState().viewingAsFamilyId).toBeNull();
  });

  it('keeps the cache across a token refresh for the same account', () => {
    useAuthStore.getState().setSession(account('a'), tokens('a'));
    queryClient.setQueryData(['portfolios'], [{ id: 'p1' }]);

    useAuthStore.getState().setSession(account('a'), tokens('a2'));

    expect(queryClient.getQueryData(['portfolios'])).toEqual([{ id: 'p1' }]);
  });

  it('keeps the cache when a resumed session loads its profile', () => {
    useAuthStore.setState({ accessToken: 'access-a', refreshToken: 'refresh-a' });
    queryClient.setQueryData(['auth-me', 'access-a'], account('a'));

    useAuthStore.getState().setUser(account('a'));

    expect(queryClient.getQueryData(['auth-me', 'access-a'])).toBeDefined();
  });
});
