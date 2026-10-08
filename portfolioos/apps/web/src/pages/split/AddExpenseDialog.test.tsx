// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { serializeMoney, type SplitGroupDto } from '@everypaisa/shared';
import { renderWithProviders } from './testUtils';
import { AddExpenseDialog } from './AddExpenseDialog';

const api = vi.hoisted(() => ({ createExpense: vi.fn(), updateExpense: vi.fn() }));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const group: SplitGroupDto = {
  id: 'g1', name: 'Goa', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, myNet: serializeMoney('0'),
  members: [
    { id: 'a', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null },
    { id: 'b', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null },
    { id: 'z', displayName: 'Zed', userId: null, contactId: 'c9', isMe: false, leftAt: '2026-09-01T00:00:00Z' },
  ],
};

describe('AddExpenseDialog', () => {
  it('equal split: shows per-person preview and saves', async () => {
    api.createExpense.mockResolvedValue({});
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Dinner' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1,001' } });
    expect(screen.getByTestId('share-a').textContent).toContain('₹500.50');
    expect(screen.getByTestId('share-b').textContent).toContain('₹500.50');
    expect(screen.queryByText('Zed')).toBeNull(); // left members are not offered
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    await waitFor(() => expect(api.createExpense).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 'g1', description: 'Dinner', amount: '1001', splitMode: 'EQUAL',
      payers: [{ memberId: 'a', amount: '1001' }], shares: [{ memberId: 'a' }, { memberId: 'b' }],
    })));
  });

  it('exact split shows what is left and blocks save', async () => {
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Cab' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Exact' }));
    fireEvent.change(screen.getByLabelText('Exact amount for You'), { target: { value: '60' } });
    expect(screen.getByRole('alert').textContent).toContain('₹40.00 left to assign');
    expect((screen.getByRole('button', { name: 'Save expense' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('foreign currency asks for a rate', async () => {
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Snorkel' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });
    expect(screen.getByLabelText('1 USD in INR')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Enter the USD → INR exchange rate');
  });

  it('server error stays in the dialog', async () => {
    // apiErrorMessage reads response.data.error as a string.
    api.createExpense.mockRejectedValue({ isAxiosError: true, message: 'Request failed', response: { data: { error: 'SPLIT_SUM_MISMATCH: shares add to 99' } } });
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(await screen.findByText(/SPLIT_SUM_MISMATCH/)).toBeTruthy();
  });
});
