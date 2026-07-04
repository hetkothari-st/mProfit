// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HoldingRow } from '@portfolioos/shared';
import { SCHEMES, type SchemeType } from '@/lib/poSchemes';
import { PostOfficeDetailPage } from './PostOfficeDetailPage';

// Keep the txn fetch from hitting the network during the smoke test.
vi.mock('@/api/transactions.api', () => ({
  transactionsApi: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 500 }),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

afterEach(() => cleanup());

function makeHolding(scheme: SchemeType): HoldingRow & { portfolioName: string; portfolioId: string } {
  const cfg = SCHEMES[scheme];
  return {
    id: `hold-${scheme}`,
    assetClass: cfg.assetClass,
    assetName: `${cfg.label} Test Account`,
    isin: null,
    quantity: '1',
    avgCostPrice: '100000',
    totalCost: '100000',
    currentValue: '104000',
    unrealisedPnL: '4000',
    xirr: 0.072,
    holdingPeriodDays: 365,
  } as unknown as HoldingRow & { portfolioName: string; portfolioId: string };
}

function renderFor(scheme: SchemeType) {
  const holding = { ...makeHolding(scheme), portfolioName: 'My Portfolio', portfolioId: 'pf-1' };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: `/post-office/${holding.id}`, state: { holding } }]}>
        <Routes>
          <Route path="/post-office/:holdingId" element={<PostOfficeDetailPage />} />
          <Route path="/post-office" element={<div>PO Landing</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PostOfficeDetailPage smoke', () => {
  const cases: Array<[string, SchemeType]> = [
    ['LUMPSUM', 'NSC'],
    ['RECURRING', 'POST_OFFICE_RD'],
    ['PAYOUT', 'POST_OFFICE_MIS'],
    ['SAVINGS', 'POST_OFFICE_SAVINGS'],
  ];

  for (const [family, scheme] of cases) {
    it(`renders ${family} holding (${scheme}) without crashing`, () => {
      renderFor(scheme);
      expect(screen.getByText(SCHEMES[scheme].fullName)).toBeTruthy();
      // Account name shows in both the sticky nav and the hero.
      expect(screen.getAllByText(`${SCHEMES[scheme].label} Test Account`).length).toBeGreaterThan(0);
    });
  }

  it('redirects to landing when no holding is passed in navigation state', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/post-office/hold-x']}>
          <Routes>
            <Route path="/post-office/:holdingId" element={<PostOfficeDetailPage />} />
            <Route path="/post-office" element={<div>PO Landing</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('PO Landing')).toBeTruthy();
  });
});
