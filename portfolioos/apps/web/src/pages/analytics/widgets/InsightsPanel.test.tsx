// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { InsightsPanel, INSIGHTS_COLLAPSED_KEY } from './InsightsPanel';

const api = vi.hoisted(() => ({
  insights: vi.fn(),
  insightsSpend: vi.fn(),
  deterministicInsights: vi.fn(),
  generateInsights: vi.fn(),
}));
vi.mock('@/api/analytics.api', () => ({ analyticsApi: api }));

beforeEach(() => {
  localStorage.clear();
  api.insights.mockResolvedValue(null);
  api.insightsSpend.mockResolvedValue({ status: 'ok', monthToDate: '12.50', capInr: '1000' });
  api.deterministicInsights.mockResolvedValue([
    { id: 'd1', message: 'Idle cash is 18% of your portfolio.' },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <InsightsPanel portfolioId={undefined} period="1Y" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const toggle = () => screen.getByRole('button', { name: /AI Portfolio Insights/ });

describe('InsightsPanel collapse', () => {
  it('is open by default and shows its content and controls', async () => {
    renderPanel();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByText('Idle cash is 18% of your portfolio.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^(Regenerate|Generate)$/ })).toBeTruthy();
  });

  it('folds away content and header controls, and remembers it', async () => {
    renderPanel();
    await screen.findByText('Idle cash is 18% of your portfolio.');

    fireEvent.click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    const content = document.getElementById(toggle().getAttribute('aria-controls')!);
    expect(content?.hidden).toBe(true);
    expect(screen.queryByRole('button', { name: /^(Regenerate|Generate)$/ })).toBeNull();
    expect(localStorage.getItem(INSIGHTS_COLLAPSED_KEY)).toBe('1');

    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(localStorage.getItem(INSIGHTS_COLLAPSED_KEY)).toBeNull();
  });

  it('starts folded when the user left it folded, without fetching anything', async () => {
    localStorage.setItem(INSIGHTS_COLLAPSED_KEY, '1');
    renderPanel();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(api.insights).not.toHaveBeenCalled();
    expect(api.insightsSpend).not.toHaveBeenCalled();
    expect(api.deterministicInsights).not.toHaveBeenCalled();

    fireEvent.click(toggle());
    await waitFor(() => expect(api.deterministicInsights).toHaveBeenCalled());
    expect(await screen.findByText('Idle cash is 18% of your portfolio.')).toBeTruthy();
  });

  it('keeps the info button usable and separate from the toggle', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'About AI portfolio insights' })).toBeTruthy();
  });
});

// Launch review B2: a cached insight whose data has since moved must not read as current.
describe('InsightsPanel out-of-date insight', () => {
  const insight = (stale: boolean) => ({
    ok: true,
    fromCache: true,
    generatedAt: '2026-09-01T00:00:00.000Z',
    stale,
    staleReason: stale ? 'Your portfolio value has moved since it was written.' : null,
    model: 'test',
    costInr: '0',
    cards: [],
    narrative: 'Your XIRR is 9%.',
    disclaimer: 'Not advice.',
  });

  it('marks a stale insight out of date and says why', async () => {
    api.insights.mockResolvedValue(insight(true));
    renderPanel();
    expect(await screen.findByText(/Out of date — written/)).toBeTruthy();
    expect(screen.getByText(/Your portfolio value has moved since it was written\./)).toBeTruthy();
    expect(screen.getByText(/^Out of date ·/)).toBeTruthy();
    expect(screen.queryByText(/^Cached ·/)).toBeNull();
  });

  it('shows a current cached insight without the warning', async () => {
    api.insights.mockResolvedValue(insight(false));
    renderPanel();
    expect(await screen.findByText('Your XIRR is 9%.')).toBeTruthy();
    expect(screen.queryByText(/Out of date/)).toBeNull();
  });
});
