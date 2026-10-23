// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CashFlowsPage } from './CashFlowsPage';

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/api/cashflows.api', () => ({ cashflowsApi: api }));
vi.mock('./CashflowForecastSection', () => ({ CashflowForecastSection: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Cash Activity', () => {
  it('shows a foreign-currency split settlement in its own currency, totals in rupees', async () => {
    api.list.mockResolvedValue({
      items: [
        {
          id: 'c1',
          portfolioId: 'p1',
          portfolioName: 'Main',
          date: '2026-05-01',
          type: 'OUTFLOW',
          amount: '50.0000',
          currency: 'USD',
          inrEquivalent: '4200.0000',
          description: 'Split: Dinner (Trip)',
          createdAt: '2026-05-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CashFlowsPage />
      </QueryClientProvider>,
    );
    const row = await screen.findByText('Split: Dinner (Trip)');
    const tr = row.closest('tr')!;
    expect(tr.textContent).toContain('$');
    expect(tr.textContent).not.toMatch(/₹\s?50\.00/);
    expect(tr.textContent).toMatch(/₹\s?4,200/);
  });
});
