import { useAuthStore } from '@/stores/auth.store';
import { useActingAsStore } from '@/stores/actingAs.store';

/** The name "me" carries in split groups: the managed profile's while acting as one, else the signed-in user's. */
export function useSplitDisplayName(): string {
  const user = useAuthStore((s: { user: { name?: string | null } | null }) => s.user);
  const acting = useActingAsStore((s) => s.profile);
  return acting?.name.trim() || user?.name?.trim() || 'Me';
}
