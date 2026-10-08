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
});
