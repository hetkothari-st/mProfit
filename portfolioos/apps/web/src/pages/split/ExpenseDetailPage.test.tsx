// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { screen, cleanup, fireEvent, waitFor, render as render_ } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { ExpenseDetailPage } from './ExpenseDetailPage';

const api = vi.hoisted(() => ({ getExpense: vi.fn(), getGroup: vi.fn(), deleteExpense: vi.fn(), restoreExpense: vi.fn(), updateExpense: vi.fn(), createExpense: vi.fn() }));
const toastError = vi.hoisted(() => vi.fn());
const toastFn = vi.hoisted(() => vi.fn());
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
vi.mock('react-hot-toast', () => {
  const t = Object.assign(toastFn, { success: vi.fn(), error: toastError, dismiss: vi.fn() });
  return { default: t };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const GROUP = { id: 'g1', name: 'Goa trip', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, myNet: '0.0000',
  members: [{ id: 'a', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null }, { id: 'b', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null }] };
const EXPENSE = { id: 'e1', groupId: 'g1', description: 'Dinner', amount: '100.00', currency: 'INR', fxRate: '1', baseAmount: '100.0000',
  date: '2026-10-01T00:00:00.000Z', splitMode: 'EQUAL', deletedAt: null, createdAt: '2026-10-01T10:00:00.000Z',
  payers: [{ memberId: 'a', amount: '100.00' }], shares: [{ memberId: 'a', amount: '50.00' }, { memberId: 'b', amount: '50.00' }] };

const notFound = { isAxiosError: true, message: 'nf', response: { status: 404, data: { success: false, error: 'nope', code: 'NOT_FOUND' } } };
const route = { route: '/split/expenses/e1', path: '/split/expenses/:id' };

describe('ExpenseDetailPage', () => {
  it('shows payers and shares', async () => {
    api.getExpense.mockResolvedValue(EXPENSE);
    api.getGroup.mockResolvedValue(GROUP);
    renderWithProviders(<ExpenseDetailPage />, route);
    expect(await screen.findByText('Dinner')).toBeTruthy();
    expect(screen.getByText('Paid by')).toBeTruthy();
    expect(screen.getByText('Split between')).toBeTruthy();
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
  });

  it('404 shows the not-available message', async () => {
    api.getExpense.mockRejectedValue(notFound);
    renderWithProviders(<ExpenseDetailPage />, route);
    expect(await screen.findByText(/This expense isn.t available\./)).toBeTruthy();
  });

  it('delete failure toasts the server message', async () => {
    api.getExpense.mockResolvedValue(EXPENSE);
    api.getGroup.mockResolvedValue(GROUP);
    api.deleteExpense.mockRejectedValue({ isAxiosError: true, message: 'x', response: { status: 409, data: { success: false, error: 'SPLIT_MEMBER_LEFT: member left', code: 'CONFLICT' } } });
    renderWithProviders(<ExpenseDetailPage />, route);
    fireEvent.click(await screen.findByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0]?.[0])).toBe('Member left');
  });

  it('undo restores the expense; a failed restore toasts the server message', async () => {
    api.getExpense.mockResolvedValue(EXPENSE);
    api.getGroup.mockResolvedValue(GROUP);
    api.deleteExpense.mockResolvedValue(undefined);
    renderWithProviders(<ExpenseDetailPage />, route);
    fireEvent.click(await screen.findByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    const [render, opts] = toastFn.mock.calls[0] as [(t: { id: string }) => ReactElement, { duration: number }];
    expect(opts.duration).toBe(8000);
    api.restoreExpense.mockRejectedValue({ isAxiosError: true, message: 'x', response: { status: 409, data: { success: false, error: 'SPLIT_MEMBER_LEFT: member left', code: 'CONFLICT' } } });
    const view = render_(render({ id: 't1' }));
    fireEvent.click(view.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(api.restoreExpense).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0]?.[0])).toBe('Member left');
  });
});
