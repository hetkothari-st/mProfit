// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnalyticsPage } from './AnalyticsPage';
import type { AnalyticsSnapshot } from '@/api/analytics.api';

// jsdom has no ResizeObserver; recharts and Radix both want one.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const api = vi.hoisted(() => ({
  snapshot: vi.fn(),
  risk: vi.fn(),
  benchmark: vi.fn(),
  insights: vi.fn(),
  insightsSpend: vi.fn(),
  deterministicInsights: vi.fn(),
  generateInsights: vi.fn(),
  whatIf: vi.fn(),
}));
vi.mock('@/api/analytics.api', () => ({ analyticsApi: api }));
vi.mock('@/api/portfolios.api', () => ({
  portfoliosApi: {
    list: vi.fn().mockResolvedValue([{ id: 'pf-1', name: 'My Portfolio' }]),
    holdings: vi.fn().mockResolvedValue([]),
  },
}));

const snapshot = {
  scope: { kind: 'user', id: 'u1' },
  period: '1Y',
  generatedAt: '2026-09-18T00:00:00.000Z',
  kpis: {
    xirrOverall: 0.14, xirr1y: 0.12, xirr3y: 0.15, xirr5y: null,
    totalCost: '1800000', currentValue: '2200000', unrealisedPnL: '400000',
    realisedYtd: '50000', incomeYtd: '20000', xirrReliable: true, xirrSpanDays: 900,
  },
  allocationByClass: [{ key: 'EQUITY', label: 'Stocks', value: '2200000', pct: 100 }],
  allocationTreemap: [],
  topWinnersLosers: { winners: [], losers: [] },
  concentrationRisk: [
    { assetName: 'One Big Stock', assetClass: 'EQUITY', value: '1100000', pct: 50, cumulativePct: 50 },
  ],
  sectorAllocation: [],
  cgByFy: [],
  incomeTrend: [],
  portfolioValueLine: [{ date: '2026-01-31', cost: '1800000', value: '2000000' }],
  costValueDrift: [],
  cashflowWaterfall: [],
  assetClassXirr: [],
  taxHarvest: {
    unrealisedLoss: '0', stcgLossAvailable: '0', ltcgLossAvailable: '0',
    realisedStcgInFy: '0', realisedLtcgInFy: '0',
    savings: {
      taxBefore: '0', taxAfter: '0', taxSaved: '0',
      applied: { stclVsStcg: '0', stclVsLtcg: '0', ltclVsLtcg: '0' },
      lossUtilised: '0', lossUnused: '0', stcgRatePct: 20, ltcgRatePct: 12.5, ltcgExemption: '125000',
    },
    candidates: [],
  },
  liabilitiesVsAssets: { assets: '2200000', liabilities: '0', netWorth: '2200000' },
  realisedVsUnrealised: { realised: '50000', unrealised: '400000' },
} as unknown as AnalyticsSnapshot;

beforeEach(() => {
  api.snapshot.mockResolvedValue(snapshot);
  api.risk.mockResolvedValue({
    volatilityPct: 12, sharpe: 0.8, maxDrawdownPct: 18, betaVsNifty: 0.9, observations: 24,
  });
  api.insights.mockResolvedValue(null);
  api.insightsSpend.mockResolvedValue({ status: 'ok', monthToDate: '0', capInr: '1000' });
  api.deterministicInsights.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage(path = '/analytics') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AnalyticsPage overview', () => {
  it('leads with what it is worth, the trend, where it sits and what March costs', async () => {
    renderPage();
    expect(await screen.findByText('Current value')).toBeTruthy();
    expect(screen.getByText('Profit if you sold today')).toBeTruthy();
    expect(screen.getByText('Annualised return')).toBeTruthy();
    expect(screen.getByText('Portfolio value over time')).toBeTruthy();
    expect(screen.getByText('Concentration')).toBeTruthy();
    expect(screen.getByText('Best and worst holdings')).toBeTruthy();
    expect(screen.getByText('Cut your tax bill')).toBeTruthy();
  });

  // Every one of these was cut: each either restated a number shown elsewhere
  // or reported the user's own deposits as market behaviour.
  it('no longer shows the sections that were cut', async () => {
    renderPage();
    await screen.findByText('Current value');
    for (const gone of [
      'Total returns',
      'Return on invested capital',
      'Portfolio vs NIFTY 50 / Sensex',
      'Allocation by holding',
      'Realised vs unrealised',
      'Sharpe ratio',
      'Beta vs NIFTY',
      'Asset class weight grid',
      'Top 10 winners',
      'Top 10 losers',
    ]) {
      expect(screen.queryByText(gone), gone).toBeNull();
    }
  });

  it('keeps the detail work off the first screen', async () => {
    renderPage();
    await screen.findByText('Current value');
    expect(screen.queryByText('Capital gains by FY')).toBeNull();
    expect(screen.queryByText('What-if: simulate a sale')).toBeNull();
    // Risk is detail-tab only, so nothing should have fetched it.
    expect(api.risk).not.toHaveBeenCalled();
  });
});

describe('AnalyticsPage detail tab', () => {
  it('opens on click and shows the deeper cards', async () => {
    renderPage();
    await screen.findByText('Current value');
    fireEvent.click(screen.getByRole('button', { name: 'Detail' }));

    expect(await screen.findByText('Capital gains by FY')).toBeTruthy();
    expect(screen.getByText('Money in and out')).toBeTruthy();
    expect(screen.getByText('What you own and owe')).toBeTruthy();
    await waitFor(() => expect(api.risk).toHaveBeenCalled());
    expect(await screen.findByText('How much it swings')).toBeTruthy();
    expect(screen.getByText('Worst fall')).toBeTruthy();
  });

  it('is linkable — ?view=detail opens there directly', async () => {
    renderPage('/analytics?view=detail');
    expect(await screen.findByText('Capital gains by FY')).toBeTruthy();
    expect(screen.queryByText('Best and worst holdings')).toBeNull();
  });

  it('drops Sharpe and beta even in the detailed view', async () => {
    renderPage('/analytics?view=detail');
    await screen.findByText('Capital gains by FY');
    expect(screen.queryByText('Sharpe ratio')).toBeNull();
    expect(screen.queryByText('Beta vs NIFTY')).toBeNull();
  });
});
