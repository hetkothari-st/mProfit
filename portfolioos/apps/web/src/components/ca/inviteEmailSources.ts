import { myInviteEmailApi } from '@/api/ca.api';
import type { InviteEmailSource } from './InviteEmailComposer';

/**
 * An account holder's own invitation to their professional. Not the CA
 * workspace endpoints: those need the professional's two-factor sign-in, and
 * the person granting access to their own books should not.
 */
export function accountHolderInviteSource(clientId: string): InviteEmailSource {
  return {
    key: ['me', 'professional-invite-email', clientId],
    preview: (edits) => myInviteEmailApi.preview(clientId, edits),
    send: (edits) => myInviteEmailApi.send(clientId, edits),
  };
}
