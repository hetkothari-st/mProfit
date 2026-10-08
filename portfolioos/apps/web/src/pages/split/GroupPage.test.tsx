// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { GroupPage } from './GroupPage';

const api = vi.hoisted(() => ({
  getGroup: vi.fn(), listExpenses: vi.fn(), balances: vi.fn(), activity: vi.fn(), listContacts: vi.fn(),
  createSettlement: vi.fn(), remind: vi.fn(), listLabels: vi.fn(), upiLink: vi.fn(), inviteContact: vi.fn(), deleteSettlement: vi.fn(), updateGroup: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(), listSettlements: vi.fn(), requestLink: vi.fn(),
}));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: toastError } }));

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
    { id: 'e1', groupId: 'g1', description: 'Hotel', date: '2026-10-01', amount: '300.0000', currency: 'INR', fxRate: '1', baseAmount: '300.0000', splitMode: 'EQUAL', createdById: 'u1', createdAt: '2026-10-01T00:00:00Z', sourceType: 'MANUAL', deletedAt: null, labelIds: [], hasReceipt: false,
      payers: [{ memberId: 'a', amount: '300.0000', baseAmount: '300.0000' }],
      shares: ['a', 'b', 'c'].map((m) => ({ memberId: m, amount: '100.0000', baseAmount: '100.0000', rawInput: null })) },
  ]);
  api.balances.mockResolvedValue({ groupId: 'g1', baseCurrency: 'INR', simplified: true,
    nets: [{ memberId: 'a', net: '200.0000' }, { memberId: 'b', net: '-100.0000' }, { memberId: 'c', net: '-100.0000' }],
    transfers: [{ fromMemberId: 'b', toMemberId: 'a', amount: '100.0000' }, { fromMemberId: 'c', toMemberId: 'a', amount: '100.0000' }] });
  api.activity.mockResolvedValue([]);
  api.listContacts.mockResolvedValue([]);
  api.listSettlements.mockResolvedValue([]);
  api.listLabels.mockResolvedValue([]);
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

  it('balances tab words each member row from that member point of view', async () => {
    seed();
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Balances' }));
    expect((await screen.findAllByText('you are owed ₹200.00')).length).toBe(2);
    expect(screen.getAllByText('owes ₹100.00')).toHaveLength(2);
    expect(screen.queryByText('owes you ₹200.00')).toBeNull();
    expect(screen.queryByText('you owe ₹100.00')).toBeNull();
  });

  it('remove member with balance shows server message', async () => {
    seed();
    // apiErrorMessage reads response.data.error as a string.
    api.removeMember.mockRejectedValue({ isAxiosError: true, message: 'Request failed', response: { status: 409, data: { success: false, error: 'SPLIT_MEMBER_HAS_BALANCE: settle this member to zero first', code: 'CONFLICT' } } });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Bob' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Settle this member to zero first'));
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
    expect(heads[0]).toContain('02/10/2026');
    expect(heads[1]).toContain('01/10/2026');
  });

  const SETTLEMENT = { id: 's1', groupId: 'g1', fromMemberId: 'b', toMemberId: 'a', amount: '100.0000', currency: 'INR', fxRate: '1', baseAmount: '100.0000', method: 'CASH', date: '2026-10-02', createdById: 'u2', createdAt: '2026-10-02T00:00:00Z', deletedAt: null };

  it('shows recorded payments in the expenses list', async () => {
    seed();
    api.listSettlements.mockResolvedValue([SETTLEMENT]);
    renderPage();
    expect(await screen.findByText('Bob paid you ₹100.00')).toBeTruthy();
    expect(screen.getByText('Payment')).toBeTruthy();
    expect(screen.getByText('Hotel')).toBeTruthy();
  });

  it('deleting a payment asks first, then deletes', async () => {
    seed();
    api.listSettlements.mockResolvedValue([SETTLEMENT]);
    api.deleteSettlement.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete payment' }));
    expect(api.deleteSettlement).not.toHaveBeenCalled();
    expect(await screen.findByText('Delete this payment? Balances will change back.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteSettlement).toHaveBeenCalledWith('s1'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it('cancelling the payment delete does nothing', async () => {
    seed();
    api.listSettlements.mockResolvedValue([SETTLEMENT]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete payment' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(api.deleteSettlement).not.toHaveBeenCalled();
  });

  it('activity words a recorded payment with names and amount', async () => {
    seed();
    api.activity.mockResolvedValue([{ id: 'x', groupId: 'g1', groupName: 'Goa trip', actorUserId: 'u2', actorName: 'Bob', kind: 'SETTLED',
      payload: { from: 'b', to: 'a', amount: '100.00', currency: 'INR' }, createdAt: '2026-10-08T10:00:00Z' }]);
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Activity' }));
    expect(await screen.findByText('Bob recorded Bob paying you ₹100.00')).toBeTruthy();
  });

  it('removing a member asks first and only then removes', async () => {
    seed();
    api.removeMember.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Bob' }));
    expect(await screen.findByText('Remove Bob from the group?')).toBeTruthy();
    expect(api.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.removeMember).toHaveBeenCalledWith('g1', 'b'));
  });

  it('leaving uses the leave copy', async () => {
    seed();
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove yourself' }));
    expect(await screen.findByText(/Leave this group\? You'll lose access to its history/)).toBeTruthy();
    expect(api.removeMember).not.toHaveBeenCalled();
  });

  it('archiving with unsettled balances asks first', async () => {
    seed();
    api.updateGroup.mockResolvedValue({});
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    await screen.findByRole('button', { name: 'Remove Bob' });
    await waitFor(() => expect(api.balances).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Archive group' }));
    expect(await screen.findByText('This group still has unsettled balances. Archive anyway?')).toBeTruthy();
    expect(api.updateGroup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(api.updateGroup).toHaveBeenCalledWith('g1', { archived: true }));
  });

  it('archiving a settled group needs no confirmation', async () => {
    seed();
    api.balances.mockResolvedValue({ groupId: 'g1', baseCurrency: 'INR', simplified: true,
      nets: [{ memberId: 'a', net: '0.0000' }, { memberId: 'b', net: '0.0000' }, { memberId: 'c', net: '0.0000' }], transfers: [] });
    api.updateGroup.mockResolvedValue({});
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    await waitFor(() => expect(api.balances).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Archive group' }));
    await waitFor(() => expect(api.updateGroup).toHaveBeenCalledWith('g1', { archived: true }));
  });

  it('settings no longer promise linking', async () => {
    seed();
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    await screen.findByText('Chetan');
    expect(screen.queryByText(/not on the app yet/)).toBeNull();
  });

  it('balances: Pay on my debt, Remind on what I am owed', async () => {
    seed();
    api.balances.mockResolvedValue({ groupId: 'g1', baseCurrency: 'INR', simplified: true,
      nets: [{ memberId: 'a', net: '0.0000' }, { memberId: 'b', net: '100.0000' }, { memberId: 'c', net: '-100.0000' }],
      transfers: [{ fromMemberId: 'a', toMemberId: 'b', amount: '100.0000' }, { fromMemberId: 'c', toMemberId: 'a', amount: '50.0000' }] });
    api.remind.mockResolvedValue({ sent: true });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Balances' }));
    expect(await screen.findByRole('button', { name: 'Pay' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remind' }));
    await waitFor(() => expect(api.remind).toHaveBeenCalledWith('g1', 'c'));
    expect(toastSuccess).toHaveBeenCalledWith('Reminder sent');
  });

  const OWED = () => {
    seed();
    api.balances.mockResolvedValue({ groupId: 'g1', baseCurrency: 'INR', simplified: true,
      nets: [{ memberId: 'a', net: '50.0000' }, { memberId: 'c', net: '-50.0000' }],
      transfers: [{ fromMemberId: 'c', toMemberId: 'a', amount: '50.0000' }] });
  };
  const URI = 'upi://pay?pa=alice%40oksbi&pn=Alice&am=50.00&cu=INR&tn=x';

  it('share pay link: uses the share sheet with the uri in the text', async () => {
    OWED();
    api.requestLink.mockResolvedValue({ uri: URI, payeeName: 'Alice', payeeVpa: 'alice@oksbi', amount: '50.0000', note: 'x' });
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Balances' }));
    const btn = await screen.findByRole('button', { name: 'Share pay link' });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    // Synchronous: the share sheet must open inside the click, before any await.
    expect(share).toHaveBeenCalledTimes(1);
    expect(api.requestLink).toHaveBeenCalledWith('g1', 'c');
    const arg = share.mock.calls[0]![0] as { text: string; title: string; url?: string };
    expect(arg.text).toContain(URI);
    expect(arg.text).toContain('Chetan');
    expect(arg.url).toBeUndefined();
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('share pay link: NotAllowedError falls back to copying the uri', async () => {
    OWED();
    api.requestLink.mockResolvedValue({ uri: URI, payeeName: 'Alice', payeeVpa: 'alice@oksbi', amount: '50.0000', note: 'x' });
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Balances' }));
    const btn = await screen.findByRole('button', { name: 'Share pay link' });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URI));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Pay link copied - paste it in WhatsApp or SMS'));
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('share pay link: copies when there is no share sheet', async () => {
    OWED();
    api.requestLink.mockResolvedValue({ uri: URI, payeeName: 'Alice', payeeVpa: 'alice@oksbi', amount: '50.0000', note: 'x' });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Balances' }));
    const btn = await screen.findByRole('button', { name: 'Share pay link' });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URI));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Pay link copied - paste it in WhatsApp or SMS'));
  });

  it('share pay link: no UPI ID points to Split settings', async () => {
    OWED();
    api.requestLink.mockRejectedValue({ isAxiosError: true, message: 'x', response: { status: 400, data: { error: 'SPLIT_NO_UPI: add your UPI ID in Split settings first' } } });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Balances' }));
    const btn = await screen.findByRole('button', { name: 'Share pay link' });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    const link = await screen.findByRole('link', { name: 'Open Split settings' });
    expect(link.getAttribute('href')).toBe('/split/settings');
    expect(screen.getByText(/Add your UPI ID in Split settings first/)).toBeTruthy();
  });

  it('remind: 409 reads as already reminded', async () => {
    seed();
    api.remind.mockRejectedValue({ isAxiosError: true, message: 'x', response: { status: 409, data: { error: 'SPLIT_ALREADY_REMINDED: nope' } } });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Balances' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Remind' }))[0]!);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Already reminded today'));
  });

  it('label chips on rows, receipt clip, and a label filter', async () => {
    seed();
    api.listLabels.mockResolvedValue([{ id: 'l1', groupId: 'g1', name: 'Food', color: '#ff0000' }, { id: 'l2', groupId: 'g1', name: 'Stay', color: '#00ff00' }]);
    const base = { groupId: 'g1', date: '2026-10-01', currency: 'INR', fxRate: '1', splitMode: 'EQUAL', createdById: 'u1', createdAt: '2026-10-01T00:00:00Z', sourceType: 'MANUAL', deletedAt: null };
    api.listExpenses.mockResolvedValue([
      { ...base, id: 'e1', description: 'Hotel', amount: '300.0000', baseAmount: '300.0000', labelIds: ['l2'], hasReceipt: false,
        payers: [{ memberId: 'a', amount: '300.0000', baseAmount: '300.0000' }], shares: [{ memberId: 'a', amount: '300.0000', baseAmount: '300.0000', rawInput: null }] },
      { ...base, id: 'e2', description: 'Dinner', amount: '60.0000', baseAmount: '60.0000', labelIds: ['l1'], hasReceipt: true,
        payers: [{ memberId: 'a', amount: '60.0000', baseAmount: '60.0000' }], shares: [{ memberId: 'a', amount: '60.0000', baseAmount: '60.0000', rawInput: null }] },
    ]);
    renderPage();
    expect(await screen.findByText('Dinner')).toBeTruthy();
    expect(screen.getByLabelText('Has receipt')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Food' }));
    expect(screen.queryByText('Hotel')).toBeNull();
    expect(screen.getByText('Dinner')).toBeTruthy();
  });

  it('payment rows say "paid you" mid-sentence', async () => {
    seed();
    api.listSettlements.mockResolvedValue([{ id: 's1', groupId: 'g1', fromMemberId: 'b', toMemberId: 'a', amount: '100.0000', baseAmount: '100.0000', currency: 'INR', method: 'CASH', date: '2026-10-02', deletedAt: null }]);
    renderPage();
    expect(await screen.findByText('Bob paid you ₹100.00')).toBeTruthy();
  });

  it('a failed payments load has its own retry line', async () => {
    seed();
    api.listSettlements.mockRejectedValue({ isAxiosError: true, message: 'x', response: { status: 500, data: {} } });
    renderPage();
    expect(await screen.findByText(/Couldn't load payments\./)).toBeTruthy();
    expect(screen.getByText('Hotel')).toBeTruthy();
  });

  it('Archive group stays disabled until balances load', async () => {
    seed();
    api.balances.mockReturnValue(new Promise(() => {}));
    renderPage();
    const tab = await screen.findByRole('tab', { name: 'Settings' });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(((await screen.findByRole('button', { name: 'Archive group' })) as HTMLButtonElement).disabled).toBe(true);
  });

  it('settings: Invite a placeholder with an email, tag linked members', async () => {
    seed();
    api.getGroup.mockResolvedValue({ ...GROUP, members: [
      GROUP.members[0], { ...GROUP.members[1], userId: 'u2', contactId: 'c2' }, { ...GROUP.members[2], contactId: 'c3' },
    ] });
    api.listContacts.mockResolvedValue([
      { id: 'c2', name: 'Bob', email: 'b@x.com', phone: null, upiId: null, linkedUserId: 'u2' },
      { id: 'c3', name: 'Chetan', email: 'c@x.com', phone: null, upiId: null, linkedUserId: null },
    ]);
    api.inviteContact.mockResolvedValue({ sent: true });
    renderPage();
    const tab = await screen.findByRole('tab', { name: 'Settings' });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByText('On EveryPaisa')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Invite Chetan' }));
    await waitFor(() => expect(api.inviteContact).toHaveBeenCalledWith('c3'));
    expect(toastSuccess).toHaveBeenCalledWith('Invite sent');
  });
});
