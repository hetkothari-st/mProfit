// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { serializeMoney, type SplitGroupDto, type SplitExpenseDto } from '@everypaisa/shared';
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

  it('foreign currency: blank rate is allowed and sent as null', async () => {
    api.createExpense.mockResolvedValue({});
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Snorkel' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });
    const fx = screen.getByLabelText('1 USD in INR') as HTMLInputElement;
    expect(fx.placeholder).toBe('');
    expect(screen.getByText('Leave blank to use the latest rate')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    await waitFor(() => expect(api.createExpense).toHaveBeenCalledWith(expect.objectContaining({ currency: 'USD', fxRate: null })));
  });

  it('foreign currency: a junk rate is rejected', async () => {
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Snorkel' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });
    fireEvent.change(screen.getByLabelText('1 USD in INR'), { target: { value: 'abc' } });
    expect(screen.getByRole('alert').textContent).toContain('Enter a valid exchange rate or leave it blank');
  });

  it('switching split mode clears typed values; Shares seeds 1 each', async () => {
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Exact' }));
    fireEvent.change(screen.getByLabelText('Exact amount for You'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Percent' }));
    expect((screen.getByLabelText('Percent for You') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('tab', { name: 'Shares' }));
    expect((screen.getByLabelText('Shares for You') as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText('Shares for Bob') as HTMLInputElement).value).toBe('1');
  });

  it('server error stays in the dialog', async () => {
    // apiErrorMessage reads response.data.error as a string.
    api.createExpense.mockRejectedValue({ isAxiosError: true, message: 'Request failed', response: { data: { error: 'SPLIT_SUM_MISMATCH: shares add to 99' } } });
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(await screen.findByText('Shares add to 99')).toBeTruthy();
    expect(screen.queryByText(/SPLIT_SUM_MISMATCH/)).toBeNull();
  });

  const expenseOf = (over: Partial<SplitExpenseDto>): SplitExpenseDto => ({
    id: 'e1', groupId: 'g1', description: 'Old', date: '2026-08-01', amount: serializeMoney('100'), currency: 'INR',
    fxRate: '1', baseAmount: serializeMoney('100'), splitMode: 'EQUAL', createdById: 'u1', createdAt: '2026-08-01T00:00:00Z',
    sourceType: 'MANUAL', deletedAt: null, labelIds: [], hasReceipt: false,
    payers: [{ memberId: 'a', amount: serializeMoney('100'), baseAmount: serializeMoney('100') }],
    shares: [{ memberId: 'a', amount: serializeMoney('50'), baseAmount: serializeMoney('50'), rawInput: null },
      { memberId: 'b', amount: serializeMoney('50'), baseAmount: serializeMoney('50'), rawInput: null }],
    ...over,
  });

  it('keeps typed input when the group prop gets a new identity', () => {
    function Harness() {
      const [g, setG] = useState(group);
      return (<>
        <button type="button" onClick={() => setG({ ...g, members: [...g.members] })}>refresh</button>
        <AddExpenseDialog open onOpenChange={() => {}} group={g} />
      </>);
    }
    renderWithProviders(<Harness />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'refresh', hidden: true }));
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Typed');
  });

  it('edit: a payer who left is shown and blocks save', () => {
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group}
      expense={expenseOf({ payers: [{ memberId: 'z', amount: serializeMoney('100'), baseAmount: serializeMoney('100') }] })} />);
    const sel = screen.getByLabelText('Payer') as HTMLSelectElement;
    expect(sel.options[sel.selectedIndex]!.textContent).toBe('Zed (left the group)');
    expect((screen.getByRole('button', { name: 'Save expense' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('edit: a currency outside the list is preserved', () => {
    renderWithProviders(<AddExpenseDialog open onOpenChange={() => {}} group={group}
      expense={expenseOf({ currency: 'CHF', fxRate: '95' })} />);
    expect((screen.getByLabelText('Currency') as HTMLSelectElement).value).toBe('CHF');
  });
});
