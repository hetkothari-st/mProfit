// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { FriendPage } from './FriendPage';

const api = vi.hoisted(() => ({ friends: vi.fn(), directGroup: vi.fn(), createExpense: vi.fn() }));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { name: 'Alice' } }) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const FRIENDS = [
  { key: 'u:u2', displayName: 'Bob', userId: 'u2', contactId: 'c2', currency: 'INR', net: '70.0000', approx: true,
    groups: [{ groupId: 'g1', groupName: 'Goa trip', net: '50.0000', currency: 'INR' }, { groupId: 'g2', groupName: 'Bangkok', net: '0.2500', currency: 'USD' }] },
  { key: 'm:mx', displayName: 'Dev', userId: null, contactId: null, currency: 'INR', net: '-10.0000', approx: false,
    groups: [{ groupId: 'g1', groupName: 'Goa trip', net: '-10.0000', currency: 'INR' }] },
];

describe('FriendPage', () => {
  it('shows overall approx balance and per-group nets', async () => {
    api.friends.mockResolvedValue(FRIENDS);
    renderWithProviders(<FriendPage />, { route: '/split/friends/u%3Au2', path: '/split/friends/:key' });
    expect(await screen.findByText('owes you ≈ ₹70.00')).toBeTruthy();
    expect(screen.getByText('Goa trip')).toBeTruthy();
    expect(screen.getByText('owes you $0.25')).toBeTruthy();
  });

  it('add expense opens the 1:1 ledger', async () => {
    api.friends.mockResolvedValue(FRIENDS);
    api.directGroup.mockResolvedValue({ id: 'd1', name: 'Bob', type: 'DIRECT', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, myNet: '0.0000',
      members: [{ id: 'a', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null }, { id: 'b', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null }] });
    renderWithProviders(<FriendPage />, { route: '/split/friends/u%3Au2', path: '/split/friends/:key' });
    fireEvent.click(await screen.findByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(api.directGroup).toHaveBeenCalledWith('c2', 'Alice'));
    expect(await screen.findByRole('heading', { name: 'Add expense' })).toBeTruthy();
  });

  it('someone else’s placeholder has no 1:1 add', async () => {
    api.friends.mockResolvedValue(FRIENDS);
    renderWithProviders(<FriendPage />, { route: '/split/friends/m%3Amx', path: '/split/friends/:key' });
    expect(await screen.findByText('Add expenses with Dev inside your shared groups.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add expense' })).toBeNull();
  });

  it('a failed friends load is an error, not an empty state', async () => {
    api.friends.mockRejectedValue({ isAxiosError: true, message: 'x', response: { status: 500, data: {} } });
    renderWithProviders(<FriendPage />, { route: '/split/friends/u%3Au2', path: '/split/friends/:key' });
    expect(await screen.findByText(/Couldn't load balances\./)).toBeTruthy();
    expect(screen.queryByText(/No balances with this person/)).toBeNull();
  });

  it('an unknown key after a successful load says no balances', async () => {
    api.friends.mockResolvedValue(FRIENDS);
    renderWithProviders(<FriendPage />, { route: '/split/friends/u%3Anobody', path: '/split/friends/:key' });
    expect(await screen.findByText(/No balances with this person/)).toBeTruthy();
  });

  it('the 1:1 group row reads "Just you two"', async () => {
    api.friends.mockResolvedValue([{ ...FRIENDS[0]!, groups: [
      { groupId: 'd1', groupName: 'Bob', groupType: 'DIRECT', net: '20.0000', currency: 'INR' },
      { groupId: 'g1', groupName: 'Goa trip', groupType: 'TRIP', net: '50.0000', currency: 'INR' },
    ] }]);
    renderWithProviders(<FriendPage />, { route: '/split/friends/u%3Au2', path: '/split/friends/:key' });
    expect(await screen.findByText('Just you two')).toBeTruthy();
    expect(screen.getByText('Goa trip')).toBeTruthy();
  });
});
