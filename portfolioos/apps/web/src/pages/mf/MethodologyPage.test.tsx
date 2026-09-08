// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthUser } from '@portfolioos/shared';
import { MF_ANALYTICS_DISCLAIMER } from '@portfolioos/shared';
import { useAuthStore } from '@/stores/auth.store';
import type { MfMethodologyPayload } from '@/api/mfMethodology.api';
import { MethodologyPage } from './MethodologyPage';

/**
 * Tests for `/methodology/mf-score`.
 *
 * The first describe block is the one the acceptance criterion asks for: *"a
 * weight change in `activeEquity.ts` shows on the page with no other edit"*.
 * A browser test cannot import `activeEquity.ts` — it is server-side, which is
 * the whole reason the weights travel over the wire — so the criterion is
 * tested at the boundary that IS observable from here: render the page twice
 * with different weights in the payload and assert the output tracks it. That
 * proves the page is a projection of the constants rather than a transcription
 * of them, which is the property the criterion is really about. The other half
 * of the chain — that the endpoint reads `MF_SCORING_MODELS` rather than a
 * literal of its own — is visible in
 * `packages/api/src/controllers/mfPortfolio.controller.ts`, which imports the
 * registry and maps it.
 *
 * The negative assertion matters as much as the positive one: with a payload
 * saying 33, the page must contain no 30. A page that hardcoded the documented
 * weights would pass a "renders 30" test forever, including after the scorer
 * stopped using 30.
 */

vi.mock('@/api/mfMethodology.api', () => ({
  mfMethodologyApi: { get: vi.fn() },
}));

const { mfMethodologyApi } = await import('@/api/mfMethodology.api');
const getMock = vi.mocked(mfMethodologyApi.get);

function user(): AuthUser {
  return {
    id: 'u1',
    email: 'a@b.com',
    name: 'Test User',
    role: 'INVESTOR',
    // Deliberately FREE: the methodology page is not entitlement-gated (`06 §5`
    // calls it public), so a FREE user must see the whole thing. If this ever
    // starts failing because the page grew a `LockedFeature`, the fix is to
    // remove the gate, not to raise the plan here.
    plan: 'FREE',
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * A payload shaped exactly like the endpoint's, with a single `ACTIVE_EQUITY`
 * model whose PERFORMANCE weight the tests vary.
 */
function payload(performanceWeight: number): MfMethodologyPayload {
  return {
    mathVersion: '1.0.0',
    minRatingHistoryMonths: 36,
    minUniverseSize: 10,
    ratingRequiredPillars: ['PERFORMANCE', 'CONSISTENCY'],
    horizonBlend: [
      { horizonYears: 3, baseWeight: 20 },
      { horizonYears: 5, baseWeight: 30 },
      { horizonYears: 10, baseWeight: 50 },
    ],
    ratingBuckets: [
      { rating: 5, shareOfUniverse: '0.100000', fromTopCumulative: '0.000000' },
      { rating: 4, shareOfUniverse: '0.225000', fromTopCumulative: '0.100000' },
      { rating: 3, shareOfUniverse: '0.350000', fromTopCumulative: '0.325000' },
      { rating: 2, shareOfUniverse: '0.225000', fromTopCumulative: '0.675000' },
      { rating: 1, shareOfUniverse: '0.100000', fromTopCumulative: '0.900000' },
    ],
    models: [
      {
        modelKey: 'ACTIVE_EQUITY',
        methodologyVersion: 'score-active-equity-v1',
        pillars: [
          {
            key: 'PERFORMANCE',
            weight: performanceWeight,
            inputs: [
              { metric: 'sortino', weight: 40, direction: 'HIGHER_IS_BETTER' },
              { metric: 'informationRatio', weight: 30, direction: 'HIGHER_IS_BETTER' },
              // A metric with no direction entry: a scoring-layer bug the page
              // must surface rather than default to a flattering reading.
              { metric: 'mysteryMetric', weight: 30, direction: null },
            ],
          },
          {
            key: 'COST',
            weight: 15,
            inputs: [{ metric: 'terPercentile', weight: 100, direction: 'LOWER_IS_BETTER' }],
          },
        ],
      },
    ],
    changelogPath: 'docs/mf-analytics/METHODOLOGY-CHANGELOG.md',
    backtestDirPath: 'docs/mf-analytics/backtests/',
  };
}

beforeEach(() => {
  useAuthStore.setState({ user: user() });
});

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
  vi.clearAllMocks();
});

async function renderPage(data: MfMethodologyPayload) {
  getMock.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MethodologyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByTestId('mf-methodology-models');
}

describe('MethodologyPage — the tables come from the constants', () => {
  it('renders the pillar weight the scorer reports, not a literal', async () => {
    await renderPage(payload(30));
    expect(document.querySelector('[data-pillar-weight="PERFORMANCE"]')!.textContent).toBe('30');
  });

  it('changes when the weight changes, with no edit to the page', async () => {
    await renderPage(payload(33));
    // The negative half, scoped to the pillar-weight cells. A hardcoded table
    // would pass a "renders 33" assertion only by coincidence and would keep
    // passing "renders 30" forever, including after the scorer stopped
    // agreeing with it — so the assertion is on the FULL set of weights the
    // page rendered, which contains no 30 at all.
    const weights = Array.from(document.querySelectorAll('[data-pillar-weight]')).map(
      (el) => el.textContent,
    );
    expect(weights).toEqual(['33', '15']);
  });

  it('renders every input weight from the payload too', async () => {
    await renderPage(payload(30));
    expect(document.querySelector('[data-input-weight="sortino"]')!.textContent).toBe('40');
    expect(document.querySelector('[data-input-weight="terPercentile"]')!.textContent).toBe('100');
  });

  it('shows the methodology version each model declares', async () => {
    await renderPage(payload(30));
    expect(document.querySelector('[data-methodology-version]')!.textContent).toBe(
      'score-active-equity-v1',
    );
  });

  it('labels an unrecognised metric rather than dropping it', async () => {
    await renderPage(payload(30));
    // `humanizeKey`, not a hardcoded label map: a brand-new input must stay
    // legible instead of rendering as a blank cell.
    expect(screen.getByText('Mystery Metric')).toBeTruthy();
  });

  it('refuses to assume a direction it was not given', async () => {
    await renderPage(payload(30));
    const row = document.querySelector('[data-input="mysteryMetric"]')!;
    expect(row.textContent).toMatch(/not declared/i);
    expect(row.textContent).not.toMatch(/higher is better/i);
  });
});

describe('MethodologyPage — rating buckets', () => {
  it('renders the bell without IEEE-754 residue', async () => {
    await renderPage(payload(30));
    const buckets = screen.getByTestId('mf-methodology-buckets');
    // 0.225 → 22.5%. The server subtracts cumulative cut-offs in Decimal
    // precisely so this does not read "22.499999999999998%".
    expect(buckets.textContent).toContain('22.5%');
    expect(buckets.textContent).toContain('35.0%');
    expect(buckets.textContent).not.toMatch(/22\.49999/);
  });
});

describe('MethodologyPage — thresholds and blend', () => {
  it('states the history and universe minimums from the payload', async () => {
    await renderPage(payload(30));
    const overview = screen.getByTestId('mf-methodology-overview');
    expect(overview.textContent).toContain('36 months');
    expect(overview.textContent).toContain('10 schemes');
  });

  it('renders the horizon blend weights', async () => {
    await renderPage(payload(30));
    const horizons = screen.getByTestId('mf-methodology-horizons');
    expect(horizons.querySelector('[data-horizon="10"]')!.textContent).toContain('50');
  });
});

describe('MethodologyPage — changelog', () => {
  it('links to the changelog rather than mirroring it', async () => {
    await renderPage(payload(30));
    const changelog = screen.getByTestId('mf-methodology-changelog');
    expect(changelog.textContent).toContain('docs/mf-analytics/METHODOLOGY-CHANGELOG.md');
    expect(changelog.textContent).toContain('docs/mf-analytics/backtests/');
  });

  it('carries the mandatory disclaimer from the shared constant', async () => {
    await renderPage(payload(30));
    expect(screen.getByTestId('mf-disclaimer').textContent).toContain(
      MF_ANALYTICS_DISCLAIMER.slice(0, 80),
    );
  });
});

describe('MethodologyPage — a shape it does not understand', () => {
  it('says so rather than rendering a partial table', async () => {
    getMock.mockRejectedValue(new Error('methodology payload failed validation'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MethodologyPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // A page that misstates how funds are scored is worse than a page that
    // admits it cannot show it.
    expect(await screen.findByText('Could not load the scoring methodology')).toBeTruthy();
    expect(screen.queryByTestId('mf-methodology-models')).toBeNull();
  });
});
