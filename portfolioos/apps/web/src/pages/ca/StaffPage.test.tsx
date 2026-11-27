// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const seats = vi.hoisted(() => ({ list: vi.fn(), invite: vi.fn(), assign: vi.fn(), unassign: vi.fn(), revoke: vi.fn(), peek: vi.fn(), accept: vi.fn() }));
const ca = vi.hoisted(() => ({ listClients: vi.fn() }));
vi.mock('@/api/caFirmSeats.api', async (orig) => ({
  ...(await orig<typeof import('@/api/caFirmSeats.api')>()),
  caFirmSeatsApi: seats,
}));
vi.mock('@/api/ca.api', async (orig) => ({ ...(await orig<typeof import('@/api/ca.api')>()), caApi: ca }));

import { StaffPage } from './StaffPage';

beforeEach(() => {
  for (const f of [...Object.values(seats), ...Object.values(ca)]) f.mockReset().mockResolvedValue(undefined);
  seats.list.mockResolvedValue([
    { id: 's1', name: 'Ramesh', invitedEmail: 'ramesh@example.test', status: 'ACTIVE', inviteExpiresAt: null, acceptedAt: '2026-11-20T00:00:00Z', clientIds: [] },
  ]);
  ca.listClients.mockResolvedValue([
    { id: 'c1', displayName: 'Asha Verma', status: 'ACTIVE', actingAs: 'ADVISOR' },
    { id: 'c2', displayName: 'Someone Else', status: 'ACTIVE', actingAs: 'STAFF' },
  ]);
  seats.invite.mockResolvedValue({ seat: {}, token: 'tok123456789' });
});
afterEach(() => cleanup());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <StaffPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StaffPage', () => {
  it('invites by email and shows the link to send', async () => {
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: /staff name/i }), { target: { value: 'Priya' } });
    fireEvent.change(screen.getByRole('textbox', { name: /staff email/i }), { target: { value: 'priya@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: /invite/i }));
    await waitFor(() => expect(seats.invite).toHaveBeenCalledWith({ name: 'Priya', email: 'priya@example.test' }));
    expect(await screen.findByText(/\/firm-invite\/tok123456789/)).toBeTruthy();
  });

  it("assigns only the CA's own clients", async () => {
    renderPage();
    const box = await screen.findByRole('checkbox', { name: 'Asha Verma' });
    expect(screen.queryByRole('checkbox', { name: 'Someone Else' })).toBeNull();
    fireEvent.click(box);
    await waitFor(() => expect(seats.assign).toHaveBeenCalledWith('s1', 'c1'));
  });
});
