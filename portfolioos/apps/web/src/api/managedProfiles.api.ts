import type { ApiResponse } from '@everypaisa/shared';
import { api, unwrap } from './client';

/** A family member without a login whose account you keep. */
export interface ManagedProfile {
  id: string;
  name: string;
  relation: string | null;
  familyId: string | null;
  familyName: string | null;
}

export const managedProfilesApi = {
  /** Profiles you manage, across your families. */
  async list(): Promise<ManagedProfile[]> {
    const { data } = await api.get<ApiResponse<ManagedProfile[]>>('/api/managed-profiles');
    return unwrap(data);
  },
  /** Confirms you may act for this profile, and records that you did. */
  async enter(profileId: string): Promise<void> {
    await api.post(`/api/managed-profiles/${profileId}/enter`);
  },
};
