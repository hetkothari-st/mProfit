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

const FD_HOLDING = {
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

const FD_TXN = {
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

const RD_HOLDING = {
  ...FD_HOLDING,
  id: 'h3',
  assetClass: 'RECURRING_DEPOSIT',
  assetName: 'ICICI Bank',
  totalCost: '40000',
  currentValue: '40912.40',
} as unknown as HoldingRow;

// Eight monthly installments of ₹5,000 from 5 Jan 2026, on a 24-month plan.
const RD_TXNS = Array.from({ length: 8 }, (_, i) => ({
  ...FD_TXN,
  id: `r${i}`,
  assetClass: 'RECURRING_DEPOSIT',
  assetName: 'ICICI Bank',
  tradeDate: `2026-${String(i + 1).padStart(2, '0')}-05`,
  maturityDate: '2028-01-05',
  interestRate: '6.9',
  price: '5000',
})) as unknown as TransactionDTO[];

beforeEach(() => {
  // "Next payout" / "Next EMI" and completion depend on today's date.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-10T06:00:00Z') });
  api.portfolios.mockResolvedValue([{ id: 'p1', name: 'Tony Stark' }]);
  api.holdings.mockResolvedValue([FD_HOLDING, RD_HOLDING]);
  // Like the real endpoint, filter by the requested asset class — the page
  // asks for FD and RD transactions separately.
  api.transactions.mockImplementation(async (params?: { assetClass?: string }) => {
    const items = [FD_TXN, ...RD_TXNS].filter(
      (t) => !params?.assetClass || t.assetClass === params.assetClass,
    );
    return { items, total: items.length, page: 1, pageSize: 500 };
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

const findFd = () => screen.findByRole('link', { name: 'Kotak fixed deposit' });
const findRd = () => screen.findByRole('link', { name: 'ICICI Bank recurring deposit' });

/** The value printed under a grid label, e.g. figure(card, 'Tenure') → "18 months". */
function figure(card: HTMLElement, label: string): string {
  return within(card).getByText(label).nextElementSibling?.textContent ?? '';
}

describe('FD card', () => {
  it("is printed in the issuing bank's brand with its logo", async () => {
    renderPage();
    const card = await findFd();
    expect(within(card).getByRole('img', { name: 'Kotak Mahindra Bank logo' })).toBeTruthy();
    expect(within(card).getByText('6.5')).toBeTruthy();
  });

  it('leads with what the deposit becomes', async () => {
    renderPage();
    const card = await findFd();
    expect(within(card).getByText('At maturity')).toBeTruthy();
    // ₹1,00,000 at 6.5% compounded quarterly for 18 months.
    expect(within(card).getByText(/1,10,154\.78/)).toBeTruthy();
  });

  it('shows principal, tenure, next payout and how far along it is', async () => {
    renderPage();
    const card = await findFd();
    expect(figure(card, 'Principal')).toMatch(/1,00,000\.00/);
    expect(figure(card, 'Tenure')).toBe('18 months');
    // Quarterly from 1 May 2026: 1 Aug has passed, 1 Nov is next.
    expect(figure(card, 'Next payout')).toMatch(/01 Nov 2026/);
    // 132 of 558 days elapsed.
    expect(figure(card, 'Completed')).toBe('24%');
  });

  it('has no coloured strip along its top edge', async () => {
    renderPage();
    const card = await findFd();
    expect(card.querySelector('[style*="border-top"]')).toBeNull();
  });

  it('opens from the keyboard', async () => {
    renderPage();
    fireEvent.keyDown(await findFd(), { key: 'Enter' });
    expect(await screen.findByText('FD DETAIL')).toBeTruthy();
  });

  it('editing does not open the deposit', async () => {
    renderPage();
    const card = await findFd();
    fireEvent.click(within(card).getByRole('button', { name: 'Edit deposit' }));
    expect(screen.queryByText('FD DETAIL')).toBeNull();
  });
});

describe('RD card', () => {
  it('shows EMI, tenure, next EMI, principal and completion', async () => {
    renderPage();
    const card = await findRd();
    expect(figure(card, 'EMI')).toMatch(/5,000\.00/);
    expect(figure(card, 'Tenure')).toBe('24 months');
    // Installments 1–8 fell on the 5th of Jan–Aug; the 9th is due 5 Sep.
    expect(figure(card, 'Next EMI')).toMatch(/05 Sept? 2026/);
    // Principal is the whole plan: ₹5,000 × 24.
    expect(figure(card, 'Principal')).toMatch(/1,20,000\.00/);
    expect(figure(card, 'Completed')).toBe('33%');
    expect(within(card).getByText('6.9')).toBeTruthy();
  });
});

describe('Reminders', () => {
  it('lists an overdue RD installment under "Coming up" and on its card', async () => {
    renderPage();
    const panel = await screen.findByRole('region', { name: 'Coming up' });
    expect(within(panel).getByText('ICICI Bank RD')).toBeTruthy();
    expect(within(panel).getByText('Installment overdue by 5 days')).toBeTruthy();
    const card = await findRd();
    expect(within(card).getByRole('status').textContent).toMatch(/Installment overdue by 5 days/);
  });

  it('reminds about an FD maturing within 30 days', async () => {
    const soon = { ...FD_TXN, maturityDate: '2026-09-25' } as TransactionDTO;
    api.transactions.mockImplementation(async (params?: { assetClass?: string }) => {
      const items = [soon, ...RD_TXNS].filter((t) => !params?.assetClass || t.assetClass === params.assetClass);
      return { items, total: items.length, page: 1, pageSize: 500 };
    });
    renderPage();
    const card = await findFd();
    expect(within(card).getByRole('status').textContent).toMatch(/Matures in 15 days/);
    const panel = await screen.findByRole('region', { name: 'Coming up' });
    expect(within(panel).getByText('Kotak FD')).toBeTruthy();
  });

  it('shows nothing when no deposit needs attention', async () => {
    api.holdings.mockResolvedValue([FD_HOLDING]);
    api.transactions.mockImplementation(async (params?: { assetClass?: string }) => {
      const items = [FD_TXN].filter((t) => !params?.assetClass || t.assetClass === params.assetClass);
      return { items, total: items.length, page: 1, pageSize: 500 };
    });
    renderPage();
    const card = await findFd();
    expect(within(card).queryByRole('status')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Coming up' })).toBeNull();
  });
});
