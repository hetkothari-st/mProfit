// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HoldingRow, TransactionDTO } from '@portfolioos/shared';
import { FixedDepositsPage } from './FixedDepositsPage';

const api = vi.hoisted(() => ({
  portfolios: vi.fn(),
  holdings: vi.fn(),
  transactions: vi.fn(),
}));
vi.mock('@/api/portfolios.api', () => ({
  portfoliosApi: { list: api.portfolios, holdings: api.holdings },
}));
vi.mock('@/api/transactions.api', () => ({
  transactionsApi: { list: api.transactions, create: vi.fn(), update: vi.fn() },
}));
vi.mock('@/components/reports/DownloadReportButton', () => ({ DownloadReportButton: () => null }));

const HOLDING = {
  id: 'h1',
  assetClass: 'FIXED_DEPOSIT',
  assetName: 'Kotak',
  isin: null,
  quantity: '1',
  avgCostPrice: '100000',
  totalCost: '100000',
  currentValue: '102364.38',
  unrealisedPnL: '2364.38',
} as unknown as HoldingRow;

const TXN = {
  id: 't1',
  portfolioId: 'p1',
  assetClass: 'FIXED_DEPOSIT',
  assetName: 'Kotak',
  isin: null,
  transactionType: 'DEPOSIT',
  tradeDate: '2026-05-01',
  maturityDate: '2027-11-10',
  interestRate: '6.5',
  interestFrequency: 'QUARTERLY',
  price: '100000',
  quantity: '1',
} as unknown as TransactionDTO;

beforeEach(() => {
  api.portfolios.mockResolvedValue([{ id: 'p1', name: 'Tony Stark' }]);
  api.holdings.mockResolvedValue([HOLDING]);
  api.transactions.mockResolvedValue({ items: [TXN], total: 1, page: 1, pageSize: 500 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/fds']}>
        <Routes>
          <Route path="/fds" element={<FixedDepositsPage />} />
          <Route path="/fds/:id" element={<div>FD DETAIL</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const findCard = () => screen.findByRole('link', { name: 'Kotak fixed deposit' });

describe('FD card', () => {
  it("is printed in the issuing bank's brand with its logo", async () => {
    renderPage();
    const card = await findCard();
    expect(within(card).getByRole('img', { name: 'Kotak Mahindra Bank logo' })).toBeTruthy();
  });

  it('leads with what the deposit becomes', async () => {
    renderPage();
    const card = await findCard();
    expect(within(card).getByText(/grows to/)).toBeTruthy();
    // ₹1,00,000 at 6.5% compounded quarterly for 18 months.
    expect(within(card).getByText(/1,10,154\.78/)).toBeTruthy();
  });

  it('has no coloured strip along its top edge', async () => {
    renderPage();
    const card = await findCard();
    expect(card.querySelector('[style*="border-top"]')).toBeNull();
  });

  it('opens from the keyboard', async () => {
    renderPage();
    fireEvent.keyDown(await findCard(), { key: 'Enter' });
    expect(await screen.findByText('FD DETAIL')).toBeTruthy();
  });

  it('editing does not open the deposit', async () => {
    renderPage();
    const card = await findCard();
    fireEvent.click(within(card).getByRole('button', { name: 'Edit deposit' }));
    expect(screen.queryByText('FD DETAIL')).toBeNull();
  });
});
