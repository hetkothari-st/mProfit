// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthUser, MfFundAnalyticsDto } from '@portfolioos/shared';
import { MF_ANALYTICS_DISCLAIMER } from '@portfolioos/shared';
import { useAuthStore } from '@/stores/auth.store';
import {
  benchmarkUnavailableFixture,
  categoryTooSmallFixture,
  insufficientHistoryFixture,
  noProfileFixture,
  ratedFixture,
  staleHoldingsFixture,
  unscoredFixture,
} from './__fixtures__/fundAnalytics';
import { FundDetailPage } from './FundDetailPage';

/**
 * Render tests for the `06-QUALITY-COMPLIANCE.md §6` honesty states.
 *
 * The last test in this file is the one that matters most and it is written as
 * an invariant rather than as an assertion about any particular metric: across
 * every fixture state, **no rendered metric whose status is not `OK` may
 * contain a digit**. That catches `{value ?? 0}`, `{value ?? '-'}` followed by a
 * unit, a `toFixed` on a null coerced to 0, and every other way a future edit
 * could quietly turn "we do not know" into a number the reader will trust. A
 * per-metric assertion would only cover the metrics someone remembered to
 * assert on.
 */

vi.mock('@/api/mfAnalytics.api', () => ({
  mfAnalyticsApi: {
    analytics: vi.fn(),
    meta: vi.fn(),
    metrics: vi.fn(),
    score: vi.fn(),
    peers: vi.fn(),
    holdings: vi.fn(),
  },
}));

// Imported after the mock factory so we get the mocked module object.
const { mfAnalyticsApi } = await import('@/api/mfAnalytics.api');
const analyticsMock = vi.mocked(mfAnalyticsApi.analytics);

function plusUser(): AuthUser {
  return {
    id: 'u1',
    email: 'a@b.com',
    name: 'Test User',
    role: 'INVESTOR',
    // MF_ANALYTICS is a PLUS feature (`06 §4`). Below this tier the page shows
    // the upgrade card instead, which is covered by its own test.
    plan: 'PLUS',
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  useAuthStore.setState({ user: plusUser() });
});

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
  vi.clearAllMocks();
});

async function renderPage(dto: MfFundAnalyticsDto) {
  analyticsMock.mockResolvedValue(dto);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/mutual-funds/120503']}>
        <Routes>
          <Route path="/mutual-funds/:schemeCode" element={<FundDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Everything below the score card waits on the same query.
  await screen.findByTestId('mf-score-card');
}

/** Every metric the page rendered, paired with the status it claimed. */
function renderedMetrics(): Array<{ status: string; text: string }> {
  return Array.from(document.querySelectorAll('[data-metric-value]')).map((el) => ({
    status: el.getAttribute('data-status') ?? '',
    text: el.textContent ?? '',
  }));
}

describe('FundDetailPage — rated state', () => {
  it('renders the composite, the star rating, the risk-o-meter and the disclaimer', async () => {
    await renderPage(ratedFixture());

    expect(screen.getByText('78.4')).toBeTruthy();
    expect(screen.getByRole('img', { name: /4 out of 5 stars/i })).toBeTruthy();

    // `06 §4`: the risk-o-meter must sit alongside the score.
    expect(screen.getByText('Risk-o-meter')).toBeTruthy();
    expect(document.querySelector('[data-riskometer="Very High"]')).toBeTruthy();

    // The disclaimer text comes from the shared constant, never retyped.
    expect(screen.getByTestId('mf-disclaimer').textContent).toContain(
      MF_ANALYTICS_DISCLAIMER.slice(0, 80),
    );
  });

  it('shows the pillar breakdown down to inputs, universe medians and percentiles', async () => {
    await renderPage(ratedFixture());

    const breakdown = screen.getByTestId('mf-pillar-breakdown');
    const pillar = within(breakdown).getByText(/^Risk Adjusted Return$/i);
    fireEvent.click(pillar.closest('button')!);

    // `03 §10`: value, category median, percentile, per-horizon blend.
    expect(within(breakdown).getByText('1.12')).toBeTruthy();
    expect(within(breakdown).getByText('0.87')).toBeTruthy();
    expect(within(breakdown).getByText('78th')).toBeTruthy();
    expect(within(breakdown).getByText('3y')).toBeTruthy();
  });

  it('renders a pillar with no usable input as "Not scored", never as zero', async () => {
    await renderPage(ratedFixture());
    const costPillar = document.querySelector('[data-pillar="cost"]')!;
    expect(costPillar.textContent).toContain('Not scored');
    expect(costPillar.querySelector('[data-metric-value][data-status="OK"]')).toBeNull();
  });
});

describe('FundDetailPage — NOT_APPLICABLE', () => {
  it('reads as "Not applicable", distinctly from a missing measurement', async () => {
    await renderPage(ratedFixture());

    const notApplicable = Array.from(
      document.querySelectorAll('[data-metric-value][data-status="NOT_APPLICABLE"]'),
    );
    // Treynor and Calmar in the metrics grid, plus Treynor inside the pillar.
    expect(notApplicable.length).toBeGreaterThan(0);
    for (const el of notApplicable) {
      expect(el.textContent).toBe('Not applicable');
      // The wording must NOT be the "we lack data" wording.
      expect(el.textContent).not.toContain('Not available');
    }

    // And the reason it is undefined by construction is on the page.
    expect(
      screen.getByText(/beta is too close to zero/i),
    ).toBeTruthy();
  });
});

describe('FundDetailPage — INSUFFICIENT_HISTORY', () => {
  it('renders "Unrated — {N} months of history (rated from {date})"', async () => {
    await renderPage(insufficientHistoryFixture());
    const card = screen.getByTestId('mf-score-card');
    expect(card.querySelector('[data-rating-status="INSUFFICIENT_HISTORY"]')).toBeTruthy();
    expect(card.textContent).toContain('Unrated');
    expect(card.textContent).toContain('18 months of history');
    expect(card.textContent).toContain('rated from');
    // No composite is invented for an unrated fund.
    expect(card.textContent).not.toContain('/ 100');
  });
});

describe('FundDetailPage — CATEGORY_TOO_SMALL', () => {
  it('renders "Unrated — only {n} peers in category"', async () => {
    await renderPage(categoryTooSmallFixture());
    const card = screen.getByTestId('mf-score-card');
    expect(card.querySelector('[data-rating-status="CATEGORY_TOO_SMALL"]')).toBeTruthy();
    expect(card.textContent).toContain('only 6 peers in category');
  });
});

describe('FundDetailPage — unscored', () => {
  it('distinguishes "no score has been computed" from every unrated state', async () => {
    await renderPage(unscoredFixture());
    const card = screen.getByTestId('mf-score-card');
    expect(card.querySelector('[data-rating-status="NOT_SCORED"]')).toBeTruthy();
    expect(card.textContent).toContain('Not scored');
  });
});

describe('FundDetailPage — stale holdings', () => {
  it('badges a snapshot older than 60 days in amber with its date', async () => {
    await renderPage(staleHoldingsFixture());
    const badge = document.querySelector('[data-holdings-freshness="stale"]');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain('Portfolio as of');
  });

  it('does not badge a normal ~35-day disclosure lag', async () => {
    await renderPage(ratedFixture());
    expect(document.querySelector('[data-holdings-freshness="stale"]')).toBeNull();
    expect(document.querySelector('[data-holdings-freshness="fresh"]')).toBeTruthy();
  });
});

describe('FundDetailPage — BENCHMARK_UNAVAILABLE', () => {
  it('drops the relative metrics while the absolute ones still render', async () => {
    await renderPage(benchmarkUnavailableFixture());

    const unavailable = document.querySelector(
      '[data-section-unavailable][data-status="BENCHMARK_UNAVAILABLE"]',
    );
    expect(unavailable).toBeTruthy();
    expect(unavailable!.textContent).toContain('no usable Total Return Index benchmark');

    // Absolute return and risk survive: CAGR and std deviation still show.
    expect(screen.getByText('+18.43%')).toBeTruthy();
    expect(screen.getByText('14.20%')).toBeTruthy();
  });
});

describe('FundDetailPage — category rank', () => {
  it('renders the peer percentile and category median for the selected horizon', async () => {
    await renderPage(ratedFixture());
    const peers = screen.getByTestId('mf-peers');
    expect(within(peers).getByText('78th')).toBeTruthy();
    expect(within(peers).getByText('0.87')).toBeTruthy();
  });

  it('says a horizon was not ranked rather than showing a zeroth percentile', async () => {
    // The fixture ranks only the 3y horizon; the 5y tab has metrics but no peers.
    await renderPage(ratedFixture());
    fireEvent.click(screen.getByRole('tab', { name: '5Y' }));
    expect(await screen.findByText('No category ranking at this horizon')).toBeTruthy();
  });
});

describe('FundDetailPage — missing sections', () => {
  it('says a portfolio disclosure is absent rather than showing an empty portfolio', async () => {
    await renderPage(noProfileFixture());
    expect(screen.getByText('No portfolio disclosure on file')).toBeTruthy();
  });

  it('says a horizon has no record rather than hiding the tab', async () => {
    await renderPage(benchmarkUnavailableFixture()); // only the 3y horizon exists
    fireEvent.click(screen.getByRole('tab', { name: '10Y' }));
    expect(await screen.findByText('No 10-year record')).toBeTruthy();
    expect(screen.getByText(/it is not a return of zero/i)).toBeTruthy();
  });
});

describe('FundDetailPage — entitlement gate', () => {
  it('shows the upgrade card and issues no request below PLUS', async () => {
    useAuthStore.setState({ user: { ...plusUser(), plan: 'FREE' } });
    analyticsMock.mockResolvedValue(ratedFixture());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/mutual-funds/120503']}>
          <Routes>
            <Route path="/mutual-funds/:schemeCode" element={<FundDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Fund analytics is locked/i)).toBeTruthy();
    expect(analyticsMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

describe('FundDetailPage — a zero never stands in for an unknown', () => {
  const states: Array<[string, () => MfFundAnalyticsDto]> = [
    ['rated', ratedFixture],
    ['insufficient history', insufficientHistoryFixture],
    ['category too small', categoryTooSmallFixture],
    ['stale holdings', staleHoldingsFixture],
    ['benchmark unavailable', benchmarkUnavailableFixture],
    ['unscored', unscoredFixture],
    ['no profile', noProfileFixture],
  ];

  for (const [name, fixture] of states) {
    it(`renders no digit inside any non-OK metric — ${name}`, async () => {
      await renderPage(fixture());

      const offenders = renderedMetrics().filter(
        (mv) => mv.status !== 'OK' && /\d/.test(mv.text),
      );
      expect(offenders).toEqual([]);

      // And every non-OK metric actually says why, rather than showing a bare
      // dash — the other half of the `06 §6` rule.
      const reasonless = renderedMetrics().filter(
        (mv) =>
          mv.status !== 'OK' &&
          mv.status !== 'NOT_APPLICABLE' &&
          !/not available\s*—/i.test(mv.text) &&
          !/^not (ranked|scored)$/i.test(mv.text.trim()),
      );
      expect(reasonless).toEqual([]);
    });
  }
});
