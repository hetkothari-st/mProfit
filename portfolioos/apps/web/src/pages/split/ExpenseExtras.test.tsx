// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { ExpenseExtras } from './ExpenseExtras';

const api = vi.hoisted(() => ({
  listLabels: vi.fn(), createLabel: vi.fn(), setExpenseLabels: vi.fn(),
  listComments: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn(),
  uploadReceipt: vi.fn(), fetchReceipt: vi.fn(), deleteReceipt: vi.fn(),
  getShareLink: vi.fn(), setShareLink: vi.fn(), getSettings: vi.fn(),
}));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/components/common/PortfolioSelect', () => ({
  PortfolioSelect: ({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) => (
    <select aria-label="Portfolio" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
      <option value="">None</option><option value="p1">One</option>
    </select>
  ),
}));

const origCreate = URL.createObjectURL;
const origRevoke = URL.revokeObjectURL;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  api.listLabels.mockResolvedValue([{ id: 'l-food', groupId: 'g1', name: 'Food', color: '#16a34a' }, { id: 'l-fun', groupId: 'g1', name: 'Fun', color: '#2563eb' }]);
  api.listComments.mockResolvedValue([]);
  api.getShareLink.mockResolvedValue({ expenseId: 'e1', enabled: false, portfolioId: null, cashFlowId: null, myShare: '500.0000', currency: 'INR' });
  api.getSettings.mockResolvedValue({ upiId: null, homeCurrency: 'INR', defaultPortfolioId: null, emailOnActivity: false, weeklyDigest: false });
});
afterEach(() => { cleanup(); URL.createObjectURL = origCreate; URL.revokeObjectURL = origRevoke; vi.clearAllMocks(); });

const GROUP = { id: 'g1', name: 'Goa', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, myNet: '0.0000', members: [] };
const EXP = { id: 'e1', groupId: 'g1', description: 'Dinner', amount: '100.00', currency: 'INR', fxRate: '1', baseAmount: '100.0000', date: '2026-10-01T00:00:00.000Z',
  splitMode: 'EQUAL', createdById: 'u1', createdAt: '2026-10-01T10:00:00.000Z', sourceType: 'MANUAL', deletedAt: null, payers: [], shares: [], labelIds: [], hasReceipt: false };
const render = (over = {}) => renderWithProviders(<ExpenseExtras expense={{ ...EXP, ...over } as never} group={GROUP as never} />);
const file = (name: string, type: string, size = 10) => { const f = new File(['x'], name, { type }); Object.defineProperty(f, 'size', { value: size }); return f; };

describe('ExpenseExtras', () => {
  it('lists comments, posts, and deletes only mine after confirm', async () => {
    api.listComments.mockResolvedValue([
      { id: 'c1', expenseId: 'e1', authorUserId: 'u1', authorName: 'Alice', body: 'Paid by card', createdAt: '2026-10-01T10:00:00.000Z', mine: true },
      { id: 'c2', expenseId: 'e1', authorUserId: 'u2', authorName: 'Bob', body: 'ok', createdAt: '2026-10-01T10:00:00.000Z', mine: false },
    ]);
    api.addComment.mockResolvedValue({});
    api.deleteComment.mockResolvedValue(undefined);
    render();
    expect(await screen.findByText('Paid by card')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Add a comment'), { target: { value: 'Thanks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(api.addComment).toHaveBeenCalledWith('e1', 'Thanks'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith('c1'));
  });

  it('toggles labels', async () => {
    api.setExpenseLabels.mockResolvedValue(['l-food']);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Food' }));
    await waitFor(() => expect(api.setExpenseLabels).toHaveBeenCalledWith('e1', ['l-food']));
  });

  it('marks an applied label pressed', async () => {
    render({ labelIds: ['l-fun'] });
    expect((await screen.findByRole('button', { name: 'Fun' })).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Food' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the receipt image from an object URL', async () => {
    api.fetchReceipt.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    render({ hasReceipt: true });
    const img = await screen.findByAltText('Receipt');
    expect(img.getAttribute('src')).toBe('blob:x');
    expect(api.fetchReceipt).toHaveBeenCalledWith('e1');
  });

  it('replacing a receipt refetches the image, revokes the old URL and refreshes the list', async () => {
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    api.fetchReceipt.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    api.uploadReceipt.mockResolvedValue({ hasReceipt: true, mime: 'image/png' });
    const { container, queryClient } = render({ hasReceipt: true });
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    expect((await screen.findByAltText('Receipt')).getAttribute('src')).toBe('blob:1');
    fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [file('n.png', 'image/png')] } });
    await waitFor(() => expect(screen.getByAltText('Receipt').getAttribute('src')).toBe('blob:2'));
    expect(api.fetchReceipt).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['split', 'group', 'g1', 'expenses'] });
  });

  it('a failed fetch after Replace shows Retry, not a revoked image', async () => {
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    api.fetchReceipt.mockResolvedValueOnce(new Blob(['x'], { type: 'image/png' }))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    api.uploadReceipt.mockResolvedValue({ hasReceipt: true, mime: 'image/png' });
    const { container } = render({ hasReceipt: true });
    expect((await screen.findByAltText('Receipt')).getAttribute('src')).toBe('blob:1');
    fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [file('n.png', 'image/png')] } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByAltText('Receipt')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect((await screen.findByAltText('Receipt')).getAttribute('src')).toBe('blob:2');
  });

  it('label change and share toggle invalidate the group list and cashflow keys', async () => {
    api.setExpenseLabels.mockResolvedValue(['l-food']);
    api.setShareLink.mockResolvedValue({});
    const { queryClient } = render();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    fireEvent.click(await screen.findByRole('button', { name: 'Food' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['split', 'group', 'g1', 'expenses'] }));
    spy.mockClear();
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.change(await screen.findByLabelText('Portfolio'), { target: { value: 'p1' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['cashflows'] }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['bank-account-cashflows'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['cashflow-forecast'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['split', 'group', 'g1', 'expenses'] });
  });

  it('receipt fetch failure shows the error with Retry', async () => {
    api.fetchReceipt.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    render({ hasReceipt: true });
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByAltText('Receipt')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('comments and labels show load errors, not empty text', async () => {
    api.listComments.mockRejectedValue(new Error('x'));
    api.listLabels.mockRejectedValue(new Error('x'));
    render();
    expect(await screen.findByText(/Couldn't load comments\./)).toBeTruthy();
    expect(await screen.findByText(/Couldn't load labels\./)).toBeTruthy();
    expect(screen.queryByText('No comments yet.')).toBeNull();
    expect(screen.queryByText('No labels yet.')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2);
  });

  it('rejects an 11 MB receipt and uploads a PNG', async () => {
    api.uploadReceipt.mockResolvedValue({ hasReceipt: true, mime: 'image/png' });
    const { container } = render();
    await screen.findByText('Add receipt');
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp,application/pdf');
    fireEvent.change(input, { target: { files: [file('big.png', 'image/png', 11 * 1024 * 1024)] } });
    expect(await screen.findByText('Receipts must be under 10 MB')).toBeTruthy();
    expect(api.uploadReceipt).not.toHaveBeenCalled();
    const ok = file('r.png', 'image/png');
    fireEvent.change(input, { target: { files: [ok] } });
    await waitFor(() => expect(api.uploadReceipt).toHaveBeenCalledWith('e1', ok));
  });

  it('Cash Activity: shows my share and asks for a portfolio when none is set', async () => {
    api.setShareLink.mockResolvedValue({});
    render();
    const sw = await screen.findByRole('switch', { name: 'Add my share (₹500.00) to Cash Activity' });
    fireEvent.click(sw);
    fireEvent.change(await screen.findByLabelText('Portfolio'), { target: { value: 'p1' } });
    await waitFor(() => expect(api.setShareLink).toHaveBeenCalledWith('e1', { enabled: true, portfolioId: 'p1' }));
  });

  it('Cash Activity: a load error offers Retry', async () => {
    api.getShareLink.mockRejectedValueOnce({ isAxiosError: true, message: 'x', response: { status: 500, data: { error: 'boom' } } });
    render();
    expect(await screen.findByText(/Couldn't load Cash Activity\./)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' }).at(-1)!);
    expect(await screen.findByRole('switch', { name: 'Add my share (₹500.00) to Cash Activity' })).toBeTruthy();
  });

  it('Cash Activity: not part of this split when my share is 0', async () => {
    api.getShareLink.mockResolvedValue({ expenseId: 'e1', enabled: false, portfolioId: null, cashFlowId: null, myShare: '0.0000', currency: 'INR' });
    render();
    expect(await screen.findByText('Not part of this split')).toBeTruthy();
  });

  it('deleted expense is read-only', async () => {
    const { container } = render({ deletedAt: '2026-10-02T00:00:00.000Z' });
    await screen.findByText('Receipt');
    expect(screen.queryByRole('button', { name: 'Post' })).toBeNull();
    expect(container.querySelector('input[type=file]')).toBeNull();
  });
});
