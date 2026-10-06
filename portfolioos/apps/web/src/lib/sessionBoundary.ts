import type { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useFamilyScopeStore } from '@/stores/familyScope.store';
import { useActingAsStore } from '@/stores/actingAs.store';

/**
 * Nothing loaded for one account may ever be shown to another.
 *
 * The query cache is per tab, not per account, and it was never emptied on
 * sign-out or sign-in. So after one account signed out and another signed in
 * in the same tab, every screen first rendered the previous account's cached
 * data — dashboard, portfolios, family view — and kept showing it while the
 * refetches (correctly refused by the server with 403) failed, because a
 * failed refetch leaves the old data in place.
 *
 * This wipes the cache and the family-scope selection the moment the session
 * ends or its identity changes. It runs inside the auth store's `set`, i.e.
 * synchronously and before React renders the next screen, so there is no
 * frame in which old data can appear. A token refresh for the same account
 * changes neither condition and keeps the cache.
 *
 * Returns the unsubscribe function (for tests).
 */
export function bindSessionBoundary(queryClient: QueryClient): () => void {
  const offAuth = useAuthStore.subscribe((next, prev) => {
    const signedOut = Boolean(prev.accessToken) && !next.accessToken;
    const switchedAccount =
      Boolean(prev.user) && Boolean(next.user) && prev.user!.id !== next.user!.id;
    // A profile entered by someone else (an old tab, a shared machine) is
    // never carried into this session.
    const acting = useActingAsStore.getState().profile;
    const foreignActing = Boolean(acting && next.user && acting.managerId !== next.user.id);
    if (foreignActing) useActingAsStore.getState().leave();
    if (!signedOut && !switchedAccount) return;

    useFamilyScopeStore.getState().clear();
    useActingAsStore.getState().leave();
    queryClient.clear();
  });

  // Entering or leaving a managed profile is a change of whose data every
  // screen shows — the same boundary as an account switch, so the same wipe.
  // The family view is personal to the real account and ends with it.
  const offActing = useActingAsStore.subscribe((next, prev) => {
    if (next.profile?.id === prev.profile?.id) return;
    useFamilyScopeStore.getState().clear();
    queryClient.clear();
  });

  return () => {
    offAuth();
    offActing();
  };
}
