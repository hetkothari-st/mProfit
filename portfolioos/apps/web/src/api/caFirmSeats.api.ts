import { api, unwrap } from './client';
import type { ApiResponse } from '@everypaisa/shared';

export type SeatStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface Seat {
  id: string;
  name: string;
  invitedEmail: string;
  status: SeatStatus;
  inviteExpiresAt: string | null;
  acceptedAt: string | null;
  clientIds: string[];
}

export interface SeatInvitePreview {
  firm: string;
  invitedEmail: string;
  expiresAt: string;
}

export const caFirmSeatsApi = {
  async list(): Promise<Seat[]> {
    const { data } = await api.get<ApiResponse<Seat[]>>('/api/ca/seats');
    return unwrap(data);
  },
  async invite(input: { name: string; email: string }): Promise<{ seat: Seat; token: string }> {
    const { data } = await api.post<ApiResponse<{ seat: Seat; token: string }>>('/api/ca/seats', input);
    return unwrap(data);
  },
  async assign(seatId: string, clientId: string): Promise<void> {
    await api.post(`/api/ca/seats/${seatId}/clients`, { clientId });
  },
  async unassign(seatId: string, clientId: string): Promise<void> {
    await api.delete(`/api/ca/seats/${seatId}/clients/${clientId}`);
  },
  async revoke(seatId: string): Promise<void> {
    await api.post(`/api/ca/seats/${seatId}/revoke`);
  },
  async peek(token: string): Promise<SeatInvitePreview> {
    const { data } = await api.get<ApiResponse<SeatInvitePreview>>(`/api/ca/seats/invite/${encodeURIComponent(token)}`);
    return unwrap(data);
  },
  async accept(token: string): Promise<void> {
    await api.post('/api/ca/seats/accept', { token });
  },
};

/** The link a staff member opens to accept their seat. */
export const seatInviteLink = (token: string) => `${window.location.origin}/firm-invite/${token}`;
