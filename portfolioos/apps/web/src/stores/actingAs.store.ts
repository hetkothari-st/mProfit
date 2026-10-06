import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * "Managing Dadaji's account" — which managed family profile this tab acts for.
 *
 * While set, the API client adds `X-Act-As` to every data request, and the
 * server re-checks on each one that the signed-in user is this profile's
 * manager. Account routes (sign-in, billing, family, professional access)
 * never carry it, so they always run as the real person.
 *
 * Kept in sessionStorage, per tab: one tab can keep Dadaji's books while
 * another stays on your own, and closing the tab ends it. `managerId` records
 * who entered, so a different account signing in never inherits it.
 */
export interface ActingProfile {
  id: string;
  name: string;
  managerId: string;
}

interface ActingAsState {
  profile: ActingProfile | null;
  enter: (profile: ActingProfile) => void;
  leave: () => void;
}

export const useActingAsStore = create<ActingAsState>()(
  persist(
    (set) => ({
      profile: null,
      enter: (profile) => set({ profile }),
      leave: () => set({ profile: null }),
    }),
    {
      name: 'everypaisa.actingAs',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

/**
 * Routes that act on an ACCOUNT rather than its data, and so always run as
 * the signed-in person. Mirrors the server's list, which refuses them while
 * acting — this copy only keeps the client from asking.
 */
const ACCOUNT_ROUTE_PREFIXES = [
  '/api/auth',
  '/api/billing',
  '/api/families',
  '/api/ca',
  '/api/me',
  '/api/professional-invitations',
  '/api/managed-profiles',
  '/api/gmail',
  '/api/mailboxes',
];

export function isAccountRoute(url: string): boolean {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  return ACCOUNT_ROUTE_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`),
  );
}
