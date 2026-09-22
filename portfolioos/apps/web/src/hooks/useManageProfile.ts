import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store';
import { useActingAsStore } from '@/stores/actingAs.store';
import { managedProfilesApi } from '@/api/managedProfiles.api';
import { apiErrorMessage } from '@/api/client';

/**
 * Switch this tab into a managed family member's account, and back.
 *
 * Entering asks the server first — the same check every acting request makes
 * — so a profile you no longer manage fails here, with a message, rather than
 * as a page of 403s. Both directions land on the dashboard: the page you were
 * on showed the other account's data, and the cache for it has just been
 * emptied.
 */
export function useManageProfile() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const enterStore = useActingAsStore((s) => s.enter);
  const leaveStore = useActingAsStore((s) => s.leave);

  const enter = useCallback(
    async (profile: { id: string; name: string }) => {
      if (!me) return;
      try {
        await managedProfilesApi.enter(profile.id);
      } catch (err) {
        toast.error(apiErrorMessage(err, 'You cannot open this account.'));
        return;
      }
      enterStore({ id: profile.id, name: profile.name, managerId: me.id });
      navigate('/dashboard');
      toast.success(`Now managing ${profile.name}’s account`);
    },
    [me, enterStore, navigate],
  );

  const leave = useCallback(() => {
    leaveStore();
    navigate('/dashboard');
  }, [leaveStore, navigate]);

  return { enter, leave };
}
