import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, AuthTokens } from '@portfolioos/shared';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  hydrated: boolean;

  setSession: (user: AuthUser, tokens: AuthTokens) => void;
  setUser: (user: AuthUser) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
      hydrated: false,

      setSession: (user, tokens) =>
        set({
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        }),
      setUser: (user) => set({ user }),
      clearSession: () => {
        // Wipe the "viewing as family" selector too — a fresh sign-in
        // must never land in a previous user's family scope. Imported
        // lazily to avoid a circular module boundary between the two
        // stores; the store isn't guaranteed to have subscribers at
        // logout time either.
        try {
          void import('./familyScope.store').then((m) =>
            m.useFamilyScopeStore.getState().clear(),
          );
        } catch {
          /* best-effort clear */
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresAt: null,
        });
      },
      isAuthenticated: () => Boolean(get().accessToken && get().user),
    }),
    {
      name: 'portfolioos.auth',
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
