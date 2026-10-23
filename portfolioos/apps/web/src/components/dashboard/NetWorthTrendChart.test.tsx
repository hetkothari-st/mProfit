// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePrivacyStore } from '@/stores/privacy.store';
import { NetWorthTrendChart } from './NetWorthTrendChart';

// jsdom has no layout: give recharts' ResponsiveContainer a no-op observer.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

vi.mock('@/api/intelligence.api', () => ({
  intelligenceApi: {
    netWorthHistory: vi.fn(async () => ({
      points: [
        { asOf: '2026-01-01', netWorthAfterLiabilities: '1000000.0000', estimated: false },
        { asOf: '2026-06-01', netWorthAfterLiabilities: '1250000.0000', estimated: false },
      ],
      summary: { changeAbsolute: '250000.0000', changePct: 25, estimatedPointCount: 0 },
    })),
  },
}));

afterEach(() => {
  cleanup();
  usePrivacyStore.getState().setHideSensitive(false);
});

function renderChart() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NetWorthTrendChart />
    </QueryClientProvider>,
  );
}

describe('NetWorthTrendChart with Hide values', () => {
  it('shows the change amount normally', async () => {
    renderChart();
    expect(await screen.findByText(/2,50,000/)).toBeTruthy();
  });

  it('masks the change amount when values are hidden', async () => {
    usePrivacyStore.getState().setHideSensitive(true);
    renderChart();
    await screen.findByText(/this/i);
    expect(screen.queryByText(/2,50,000/)).toBeNull();
  });
});
