import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * "Viewing as family" selector for the HOF hierarchical feature.
 *
 * `viewingAsFamilyId = null` → personal view (single-user default).
 * Set to a family id → every scoped API call attaches an
 * `X-Viewing-As-Family` header (see api/client.ts interceptor) and
 * the backend resolves an EffectiveScope for that family.
 *
 * Persisted to localStorage so the choice survives reloads. Cleared
 * on `clearSession` from auth.store (via subscription in App root, so
 * a fresh sign-in never starts in someone else's family view).
 */
export interface FamilyScopeState {
  viewingAsFamilyId: string | null;
  viewingAsFamilyName: string | null;
  setFamily: (id: string | null, name?: string | null) => void;
  clear: () => void;
}

export const useFamilyScopeStore = create<FamilyScopeState>()(
  persist(
    (set) => ({
      viewingAsFamilyId: null,
      viewingAsFamilyName: null,
      setFamily: (id, name) =>
        set({ viewingAsFamilyId: id, viewingAsFamilyName: name ?? null }),
      clear: () => set({ viewingAsFamilyId: null, viewingAsFamilyName: null }),
    }),
    { name: 'portfolioos.familyScope' },
  ),
);
