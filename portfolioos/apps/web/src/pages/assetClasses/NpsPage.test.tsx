// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HoldingRow } from '@portfolioos/shared';
import { NpsPage } from './NpsPage';

// Keep API calls from hitting the network during the smoke test.
vi.mock('@/api/transactions.api', () => ({
  transactionsApi: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 }),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@/api/portfolios.api', () => ({
  portfoliosApi: {
    list: vi.fn().mockResolvedValue([{ id: 'pf-1', name: 'My Portfolio' }]),
    holdings: vi.fn().mockResolvedValue([
      {
        id: 'hold-nps-1',
        assetClass: 'NPS',
        assetName: 'NSDL Pension Fund — Tier I',
        isin: '110123456789',
        quantity: '1',
        avgCostPrice: '250000',
        totalCost: '250000',
        currentValue: null,
        unrealisedPnL: null,
      } as unknown as HoldingRow,
    ]),
  },
}));

afterEach(() => cleanup());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/nps']}>
        <NpsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NpsPage smoke', () => {
  it('renders the NPS list page without crashing', async () => {
    renderPage();
    expect(screen.getByText('NPS')).toBeTruthy();
    expect(
      screen.getByText('Track your National Pension System PRAN and scheme allocations'),
    ).toBeTruthy();
    expect(await screen.findByText('NSDL Pension Fund — Tier I')).toBeTruthy();
  });
});
