import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AuthUser, AuthTokens } from '@everypaisa/shared';

// "Remember me on this device". Remembered sessions live in localStorage and
// survive closing the browser; the rest live in sessionStorage and end with
// the tab. The choice itself is kept in localStorage so a reload knows where
// to look. Absent means remembered — that is how every session worked before
// the checkbox did anything, so nobody already signed in gets logged out.
const REMEMBER_KEY = 'everypaisa.auth.remember';

export function isSessionRemembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** False when storage is blocked (private mode etc.) — nothing persists then anyway. */
function setSessionRemembered(remember: boolean): boolean {
  try {
    localStorage.setItem(REMEMBER_KEY, String(remember));
    return true;
  } catch {
    return false;
  }
}

const authStorage: StateStorage = {
  getItem: (name) => (isSessionRemembered() ? localStorage : sessionStorage).getItem(name),
  setItem: (name, value) => {
    const [keep, drop] = isSessionRemembered()
      ? [localStorage, sessionStorage]
      : [sessionStorage, localStorage];
    keep.setItem(name, value);
    // Never leave a copy behind in the other store — an un-remembered session
    // must not outlive the tab through a stale localStorage entry.
    drop.removeItem(name);
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  hydrated: boolean;

  /**
   * `remember` is set only at sign-in. Token refreshes and plan changes omit
   * it and keep whatever the user chose.
   */
  setSession: (user: AuthUser, tokens: AuthTokens, opts?: { remember?: boolean }) => void;
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

      setSession: (user, tokens, opts) => {
        // Before set(): persisting happens inside set() and reads this flag.
        if (opts?.remember !== undefined) setSessionRemembered(opts.remember);
        set({
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        });
      },
      setUser: (user) => set({ user }),
      clearSession: () => {
        // Wipe the "viewing as family" selector too — a fresh sign-in
        // must never land in a previous user's family scope. Imported
        // lazily to avoid a circular module boundary between the two
        // stores; the store isn't guaranteed to have subscribers at
        // logout time either.
        // `.catch`, not try/catch: the import is asynchronous, so a rejection
        // arrives after this block has already returned and the try could
        // never have caught it. The failure it was meant to absorb was
        // reaching the console as an unhandled rejection instead.
        void import('./familyScope.store')
          .then((m) => m.useFamilyScopeStore.getState().clear())
          .catch(() => {
            // Nothing left to clean up here — the session is being torn down
            // and the scope store is per-tab, so the next sign-in re-reads it.
          });
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
      name: 'everypaisa.auth',
      storage: createJSONStorage(() => authStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
