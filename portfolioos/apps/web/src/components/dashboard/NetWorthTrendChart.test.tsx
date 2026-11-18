// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePrivacyStore } from '@/stores/privacy.store';
import { NetWorthTrendChart } from './NetWorthTrendChart';
import { intelligenceApi } from '@/api/intelligence.api';

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
    await screen.findByText(/since|this/i);
    expect(screen.queryByText(/2,50,000/)).toBeNull();
  });
});

describe('NetWorthTrendChart change label', () => {
  it('says "since <date>" when history is shorter than the chosen window', async () => {
    // Default period is 1Y but the fixture only spans Jan-Jun: not "this 1Y".
    renderChart();
    expect(await screen.findByText(/since 01 Jan 2026|since 1 Jan 2026|since 01\/01\/2026/i)).toBeTruthy();
    expect(screen.queryByText(/this 1Y/)).toBeNull();
  });

  it('says "this 1Y" when the history really covers the window', async () => {
    vi.mocked(intelligenceApi.netWorthHistory).mockResolvedValueOnce({
      points: [
        { asOf: '2025-11-18', netWorthAfterLiabilities: '1000000.0000', estimated: false },
        { asOf: '2026-11-18', netWorthAfterLiabilities: '1250000.0000', estimated: false },
      ],
      summary: { changeAbsolute: '250000.0000', changePct: 25, estimatedPointCount: 0 },
    } as never);
    renderChart();
    expect(await screen.findByText(/this 1Y/)).toBeTruthy();
  });
});
