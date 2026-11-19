// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TransactionsPage } from './TransactionsPage';
import { EMPTY_FILTERS, hasActiveFilters, toListParams } from './transactionFilters';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  exportCsv: vi.fn(async (_params?: Record<string, unknown>) => undefined),
}));
vi.mock('@/api/transactions.api', () => ({ transactionsApi: api }));
vi.mock('@/api/portfolios.api', () => ({
  portfoliosApi: { list: vi.fn(async () => [{ id: 'p1', name: 'Main' }]) },
}));
vi.mock('./TransactionFormDialog', () => ({ TransactionFormDialog: () => null }));
vi.mock('./DuplicatesDialog', () => ({ DuplicatesDialog: () => null }));

const row = (id: string, name: string) => ({
  id,
  portfolioId: 'p1',
  assetClass: 'EQUITY',
  transactionType: 'BUY',
  assetName: name,
  symbol: 'SYM',
  schemeCode: null,
  isin: null,
  tradeDate: '2026-02-01',
  quantity: '10',
  price: '100',
  netAmount: '1000',
  broker: null,
});

function page(items: unknown[], total = items.length) {
  return { items, pagination: { page: 1, pageSize: 50, total, totalPages: 1 } };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('transactionFilters helpers', () => {
  it('leaves blank fields out of the API params and trims the search', () => {
    expect(toListParams({ ...EMPTY_FILTERS, q: '  reliance ' }, '', 'date', 'desc')).toEqual({
      portfolioId: undefined,
      assetClass: undefined,
      transactionType: undefined,
      from: undefined,
      to: undefined,
      q: 'reliance',
      sort: 'date',
      dir: 'desc',
    });
  });

  it('reports active filters, ignoring whitespace-only search', () => {
    expect(hasActiveFilters(EMPTY_FILTERS, '')).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, q: '   ' }, '')).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, transactionType: 'SELL' }, '')).toBe(true);
    expect(hasActiveFilters(EMPTY_FILTERS, 'p1')).toBe(true);
  });
});

describe('TransactionsPage search, filter, sort, export', () => {
  it('searches on the server after a pause in typing', async () => {
    api.list.mockResolvedValue(page([row('1', 'Reliance Industries')]));
    renderPage();
    await screen.findAllByText('Reliance Industries');

    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'reliance' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'reliance', page: 1 })));
  });

  it('filters by type and clears everything with one click', async () => {
    api.list.mockResolvedValue(page([row('1', 'Reliance Industries')]));
    renderPage();
    await screen.findAllByText('Reliance Industries');

    fireEvent.change(screen.getByLabelText('Transaction type'), { target: { value: 'SELL' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ transactionType: 'SELL' })));

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ transactionType: undefined })),
    );
  });

  it('sorts by a column header, flipping direction on a second click', async () => {
    api.list.mockResolvedValue(page([row('1', 'Reliance Industries')]));
    renderPage();
    await screen.findAllByText('Reliance Industries');

    const net = screen.getByRole('button', { name: 'Net' });
    fireEvent.click(net);
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'amount', dir: 'desc' })));
    fireEvent.click(net);
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'amount', dir: 'asc' })));
    expect(net.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('exports with the active filters but without paging', async () => {
    api.list.mockResolvedValue(page([row('1', 'Reliance Industries')], 120));
    renderPage();
    await screen.findAllByText('Reliance Industries');

    fireEvent.change(screen.getByLabelText('Transaction type'), { target: { value: 'BUY' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ transactionType: 'BUY' })));
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => expect(api.exportCsv).toHaveBeenCalledTimes(1));
    const arg = api.exportCsv.mock.calls[0]![0]!;
    expect(arg).toMatchObject({ transactionType: 'BUY', sort: 'date', dir: 'desc' });
    expect(arg).not.toHaveProperty('page');
    expect(arg).not.toHaveProperty('pageSize');
  });

  it('says nothing matched, instead of "add your first transaction", when filters hide everything', async () => {
    api.list.mockResolvedValueOnce(page([row('1', 'Reliance Industries')]));
    api.list.mockResolvedValue(page([]));
    renderPage();
    await screen.findAllByText('Reliance Industries');

    fireEvent.change(screen.getByLabelText('Transaction type'), { target: { value: 'SELL' } });
    expect(await screen.findByText(/no transactions match these filters/i)).toBeTruthy();
    expect(screen.queryByText(/no transactions yet/i)).toBeNull();
  });
});
