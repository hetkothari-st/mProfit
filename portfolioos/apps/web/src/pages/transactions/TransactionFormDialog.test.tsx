// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { TransactionDTO } from '@everypaisa/shared';
import { TransactionFormDialog } from './TransactionFormDialog';

const tx = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('@/api/transactions.api', () => ({ transactionsApi: tx }));
vi.mock('@/api/portfolios.api', () => ({
  portfoliosApi: { list: vi.fn(async () => [{ id: 'p1', name: 'Main' }]) },
}));
vi.mock('@/components/common/AssetSearch', () => ({ AssetSearch: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDialog(props: Partial<Parameters<typeof TransactionFormDialog>[0]>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TransactionFormDialog open onOpenChange={() => undefined} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const duplicateError = () =>
  Object.assign(new Error('dup'), {
    isAxiosError: true,
    response: { status: 409, data: { success: false, code: 'DUPLICATE_TRANSACTION', error: 'Same trade exists' } },
  });

describe('TransactionFormDialog', () => {
  it('says why it will not save a blank trade date (opened from Reports)', async () => {
    renderDialog({
      defaultPortfolioId: 'p1',
      prefill: { portfolioId: 'p1', assetClass: 'OTHER', assetName: 'Thing', quantity: 5, onOrBefore: '2026-01-01' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /add transaction/i }));
    expect(await screen.findByText(/enter the trade date/i)).toBeTruthy();
    expect(tx.create).not.toHaveBeenCalled();
  });

  it('shows a Price error', async () => {
    renderDialog({ defaultPortfolioId: 'p1' });
    // The form resets once portfolios load; edit after that or it is wiped.
    await screen.findByRole('option', { name: 'Main' });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(await screen.findByText(/price can.t be negative/i)).toBeTruthy();
    expect(tx.create).not.toHaveBeenCalled();
  });

  it('on edit, "Record it anyway" sends the override instead of looping', async () => {
    const initial = {
      id: 't1', portfolioId: 'p1', transactionType: 'BUY', assetClass: 'OTHER',
      assetName: 'Thing', tradeDate: '2026-01-02', quantity: '1', price: '10',
    } as unknown as TransactionDTO;
    tx.update.mockRejectedValueOnce(duplicateError()).mockResolvedValueOnce(initial);
    renderDialog({ initial });
    fireEvent.click(await screen.findByRole('button', { name: /save changes/i }));
    fireEvent.click(await screen.findByRole('button', { name: /record it anyway/i }));
    await waitFor(() => expect(tx.update).toHaveBeenCalledTimes(2));
    expect(tx.update.mock.calls[0]![1].allowDuplicate).toBeUndefined();
    expect(tx.update.mock.calls[1]![1].allowDuplicate).toBe(true);
  });
});
