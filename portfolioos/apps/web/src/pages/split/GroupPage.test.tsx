// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { GroupPage } from './GroupPage';

const api = vi.hoisted(() => ({
  getGroup: vi.fn(), listExpenses: vi.fn(), balances: vi.fn(), activity: vi.fn(), listContacts: vi.fn(),
  createSettlement: vi.fn(), updateGroup: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(), listSettlements: vi.fn(),
}));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: toastError } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const GROUP = {
  id: 'g1', name: 'Goa trip', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, myNet: '200.0000',
  members: [
    { id: 'a', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null },
    { id: 'b', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null },
    { id: 'c', displayName: 'Chetan', userId: null, contactId: 'c3', isMe: false, leftAt: null },
  ],
};

function seed() {
  api.getGroup.mockResolvedValue(GROUP);
  api.listExpenses.mockResolvedValue([
    { id: 'e1', groupId: 'g1', description: 'Hotel', date: '2026-10-01', amount: '300.0000', currency: 'INR', fxRate: '1', baseAmount: '300.0000', splitMode: 'EQUAL', createdById: 'u1', createdAt: '2026-10-01T00:00:00Z', sourceType: 'MANUAL', deletedAt: null,
      payers: [{ memberId: 'a', amount: '300.0000', baseAmount: '300.0000' }],
      shares: ['a', 'b', 'c'].map((m) => ({ memberId: m, amount: '100.0000', baseAmount: '100.0000', rawInput: null })) },
  ]);
  api.balances.mockResolvedValue({ groupId: 'g1', baseCurrency: 'INR', simplified: true,
    nets: [{ memberId: 'a', net: '200.0000' }, { memberId: 'b', net: '-100.0000' }, { memberId: 'c', net: '-100.0000' }],
    transfers: [{ fromMemberId: 'b', toMemberId: 'a', amount: '100.0000' }, { fromMemberId: 'c', toMemberId: 'a', amount: '100.0000' }] });
  api.activity.mockResolvedValue([]);
  api.listContacts.mockResolvedValue([]);
  api.listSettlements.mockResolvedValue([]);
}

const renderPage = () => renderWithProviders(<GroupPage />, { route: '/split/groups/g1', path: '/split/groups/:id' });

describe('GroupPage', () => {
  it('lists expenses with my lent amount', async () => {
    seed();
    renderPage();
    expect(await screen.findByText('Hotel')).toBeTruthy();
    expect(screen.getByText('you lent ₹200.00')).toBeTruthy();
  });

  it('balances tab settles a transfer', async () => {
    seed();
    api.createSettlement.mockResolvedValue({});
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Balances' }));
    expect(await screen.findByText('Bob pays You ₹100.00')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Settle' })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(api.createSettlement).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 'g1', fromMemberId: 'b', toMemberId: 'a', amount: '100', currency: 'INR', method: 'CASH',
    })));
  });

  it('remove member with balance shows server message', async () => {
    seed();
    // apiErrorMessage reads response.data.error as a string.
    api.removeMember.mockRejectedValue({ isAxiosError: true, message: 'Request failed', response: { status: 409, data: { success: false, error: 'SPLIT_MEMBER_HAS_BALANCE: settle this member to zero first', code: 'CONFLICT' } } });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Bob' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining('settle this member to zero first')));
  });

  it('direct groups hide member management', async () => {
    seed();
    api.getGroup.mockResolvedValue({ ...GROUP, type: 'DIRECT', members: GROUP.members.slice(0, 2) });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    expect(screen.queryByRole('button', { name: 'Remove Bob' })).toBeNull();
  });

  it('balances load failure is not shown as settled', async () => {
    seed();
    api.balances.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Balances' }));
    expect(await screen.findByText(/Couldn't load balances\./)).toBeTruthy();
    expect(screen.queryByText('Everyone is settled up.')).toBeNull();
  });

  it('expenses load failure shows an error', async () => {
    seed();
    api.listExpenses.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText(/Couldn't load expenses\./)).toBeTruthy();
    expect(screen.queryByText('No expenses yet.')).toBeNull();
  });

  it('group 404 shows not-found text', async () => {
    seed();
    api.getGroup.mockRejectedValue({ isAxiosError: true, message: 'nf', response: { status: 404, data: {} } });
    renderPage();
    expect(await screen.findByText(/doesn’t exist or you’re no longer in it/)).toBeTruthy();
  });

  it('group 500 shows a retryable error', async () => {
    seed();
    api.getGroup.mockRejectedValue({ isAxiosError: true, message: 'x', response: { status: 500, data: {} } });
    renderPage();
    expect(await screen.findByText(/Couldn't load this group\./, undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText(/doesn’t exist/)).toBeNull();
  });

  it('groups expenses under date headings in order', async () => {
    seed();
    const base = (await api.listExpenses())[0];
    api.listExpenses.mockResolvedValue([
      { ...base, id: 'e1', description: 'Hotel', date: '2026-10-02' },
      { ...base, id: 'e2', description: 'Taxi', date: '2026-10-02' },
      { ...base, id: 'e3', description: 'Lunch', date: '2026-10-01' },
    ]);
    renderPage();
    await screen.findByText('Lunch');
    const heads = screen.getAllByTestId('expense-day').map((h) => h.textContent ?? '');
    expect(heads).toHaveLength(2);
    expect(heads[0]).toContain('2 Oct');
    expect(heads[1]).toContain('1 Oct');
  });
});
