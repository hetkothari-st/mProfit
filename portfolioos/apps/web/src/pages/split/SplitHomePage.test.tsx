// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { SplitHomePage } from './SplitHomePage';

const api = vi.hoisted(() => ({
  friends: vi.fn(), listGroups: vi.fn(), activity: vi.fn(), listContacts: vi.fn(),
  createGroup: vi.fn(), createContact: vi.fn(),
}));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { name: 'Alice Rao' } }) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function seed() {
  api.friends.mockResolvedValue([
    { key: 'u:u2', displayName: 'Bob', userId: 'u2', contactId: 'c2', currency: 'INR', net: '70.0000', approx: false, groups: [] },
    { key: 'c:c3', displayName: 'Chetan', userId: null, contactId: 'c3', currency: 'INR', net: '-130.0000', approx: true, groups: [] },
  ]);
  api.listGroups.mockResolvedValue([
    { id: 'g1', name: 'Goa trip', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, members: [], myNet: '200.0000' },
  ]);
  api.activity.mockResolvedValue([
    { id: 'x1', groupId: 'g1', groupName: 'Goa trip', actorUserId: 'u2', actorName: 'Bob', kind: 'EXPENSE_ADDED', payload: { description: 'Hotel', amount: '90.00', currency: 'INR' }, createdAt: '2026-10-08T10:00:00Z' },
  ]);
  api.listContacts.mockResolvedValue([{ id: 'c2', name: 'Bob', email: null, phone: null, upiId: null, linkedUserId: 'u2' }]);
}

describe('SplitHomePage', () => {
  it('shows totals, friends, groups and activity', async () => {
    seed();
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    expect(await screen.findByText('Bob')).toBeTruthy();
    expect(screen.getByText('owes you ₹70.00')).toBeTruthy();
    expect(screen.getByText('you owe ≈ ₹130.00')).toBeTruthy();
    expect(screen.getByText('Goa trip')).toBeTruthy();
    expect(screen.getByTestId('split-owed-total').textContent).toContain('₹70.00');
    expect(screen.getByTestId('split-owe-total').textContent).toContain('₹130.00');
    expect(screen.getByText(/Bob added “Hotel”/)).toBeTruthy();
  });

  it('empty state invites the first group', async () => {
    api.friends.mockResolvedValue([]);
    api.listGroups.mockResolvedValue([]);
    api.activity.mockResolvedValue([]);
    api.listContacts.mockResolvedValue([]);
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    expect(await screen.findByText('No groups yet')).toBeTruthy();
  });

  it('creates a group with my name and chosen contacts', async () => {
    seed();
    api.createGroup.mockResolvedValue({ id: 'g9', name: 'Flat', type: 'HOME', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, members: [], myNet: '0.0000' });
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    fireEvent.click(await screen.findByRole('button', { name: 'New group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Flat' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'HOME' } });
    fireEvent.click(await screen.findByLabelText('Bob'));
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith({
      name: 'Flat', type: 'HOME', baseCurrency: 'INR', simplifyDebts: true, myDisplayName: 'Alice Rao', contactIds: ['c2'],
    }));
  });

  it('does not show zero totals when balances fail to load', async () => {
    seed();
    api.friends.mockRejectedValue(new Error('x'));
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    expect(await screen.findByText(/Couldn't load balances\./)).toBeTruthy();
    expect(screen.getByTestId('split-owed-total').textContent).toBe('—');
    expect(screen.getByTestId('split-owe-total').textContent).toBe('—');
  });

  it('shows an error when groups fail to load', async () => {
    seed();
    api.listGroups.mockRejectedValue(new Error('x'));
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    expect(await screen.findByText(/Couldn't load groups\./)).toBeTruthy();
    expect(screen.queryByText('No groups yet')).toBeNull();
  });

  const ARCHIVED = { id: 'g7', name: 'Old flat', type: 'HOME', baseCurrency: 'INR', simplifyDebts: true, archivedAt: '2026-09-01T00:00:00Z', members: [], myNet: '0.0000' };

  it('reaches archived groups through a toggle', async () => {
    seed();
    api.listGroups.mockImplementation((includeArchived?: boolean) => Promise.resolve(includeArchived
      ? [...[{ id: 'g1', name: 'Goa trip', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, members: [], myNet: '200.0000' }], ARCHIVED]
      : [{ id: 'g1', name: 'Goa trip', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, members: [], myNet: '200.0000' }]));
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    const toggle = await screen.findByRole('button', { name: 'Show archived (1)' });
    expect(screen.queryByText('Old flat')).toBeNull();
    fireEvent.click(toggle);
    expect(await screen.findByText('Old flat')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide archived' })).toBeTruthy();
  });

  it('hides the archived toggle when nothing is archived', async () => {
    seed();
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    await screen.findByText('Goa trip');
    await waitFor(() => expect(api.listGroups).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('button', { name: /Show archived/ })).toBeNull();
  });

  it('group rows count active members only', async () => {
    seed();
    api.listGroups.mockResolvedValue([{ id: 'g1', name: 'Goa trip', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, myNet: '0.0000',
      members: [{ id: 'a', leftAt: null }, { id: 'b', leftAt: null }, { id: 'c', leftAt: '2026-09-01T00:00:00Z' }] }]);
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    expect(await screen.findByText('2 people · INR')).toBeTruthy();
  });

  it('totals are marked approximate when any friend balance is', async () => {
    seed();
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    await screen.findByText('Bob');
    expect(screen.getByTestId('split-owe-total').textContent).toBe('≈ ₹130.00');
    expect(screen.getByTestId('split-owed-total').textContent).toBe('≈ ₹70.00');
  });

  it('home feed words a payment with its amount', async () => {
    seed();
    api.activity.mockResolvedValue([{ id: 'x2', groupId: 'g1', groupName: 'Goa trip', actorUserId: 'u2', actorName: 'Bob', kind: 'SETTLED', payload: { from: 'b', to: 'a', amount: '100.00', currency: 'INR' }, createdAt: '2026-10-08T10:00:00Z' }]);
    renderWithProviders(<SplitHomePage />, { route: '/split', path: '/split' });
    expect(await screen.findByText(/Bob recorded a payment of ₹100\.00/)).toBeTruthy();
  });
});
