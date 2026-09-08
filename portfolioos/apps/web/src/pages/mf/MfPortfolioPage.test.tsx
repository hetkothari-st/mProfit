// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthUser, MfPortfolioAnalysisDto } from '@portfolioos/shared';
import { MF_ANALYTICS_DISCLAIMER } from '@portfolioos/shared';
import { useAuthStore } from '@/stores/auth.store';
import {
  emptyFixture,
  fundsWithoutHoldingsFixture,
  nullTerFixture,
  partialScopeFixture,
  populatedFixture,
} from './__fixtures__/portfolioAnalysis';
import { MfPortfolioPage } from './MfPortfolioPage';

/**
 * Render tests for the portfolio analysis page.
 *
 * The last describe block is the keystone and it is the same invariant the fund
 * page carries, extended to this page rather than replaced by a weaker check:
 * across every fixture state, **no rendered metric whose status is not `OK` may
 * contain a digit**. That catches `{value ?? 0}`, `{value ?? '-'}` followed by a
 * unit, a `toFixed` on a null coerced to 0, and every other way a future edit
 * could quietly turn "we do not know" into a number the reader will trust. A
 * per-metric assertion would only ever cover the metrics somebody remembered.
 *
 * The tests above it target the states where a zero would not merely be missing
 * information but an actively false and reassuring claim: a portfolio with no
 * disclosed expense ratio rendered as free, a look-through missing a fund's
 * holdings rendered as a complete picture, a capped household view rendered as
 * a total.
 */

vi.mock('@/api/mfAnalytics.api', () => ({
  mfAnalyticsApi: {
    analytics: vi.fn(),
    meta: vi.fn(),
    metrics: vi.fn(),
    score: vi.fn(),
    peers: vi.fn(),
    holdings: vi.fn(),
    portfolio: vi.fn(),
  },
}));

const { mfAnalyticsApi } = await import('@/api/mfAnalytics.api');
const portfolioMock = vi.mocked(mfAnalyticsApi.portfolio);

function plusUser(): AuthUser {
  return {
    id: 'u1',
    email: 'a@b.com',
    name: 'Test User',
    role: 'INVESTOR',
    // MF_ANALYTICS is a PLUS feature (`06 §4`).
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

async function renderPage(dto: MfPortfolioAnalysisDto) {
  portfolioMock.mockResolvedValue(dto);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/mutual-funds/analysis']}>
        <Routes>
          <Route path="/mutual-funds/analysis" element={<MfPortfolioPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByTestId('mf-portfolio-totals');
}

/** Every metric the page rendered, paired with the status it claimed. */
function renderedMetrics(): Array<{ status: string; text: string }> {
  return Array.from(document.querySelectorAll('[data-metric-value]')).map((el) => ({
    status: el.getAttribute('data-status') ?? '',
    text: el.textContent ?? '',
  }));
}

describe('MfPortfolioPage — populated', () => {
  it('renders the totals, the fund list and the disclaimer', async () => {
    await renderPage(populatedFixture());

    const totals = screen.getByTestId('mf-portfolio-totals');
    expect(totals.textContent).toContain('₹99,600.00');

    const funds = screen.getByTestId('mf-held-funds');
    expect(within(funds).getByText(/Testwell Flexi Cap Fund/)).toBeTruthy();

    expect(screen.getByTestId('mf-disclaimer').textContent).toContain(
      MF_ANALYTICS_DISCLAIMER.slice(0, 80),
    );
  });

  it('shows the user XIRR and the fund CAGR side by side', async () => {
    await renderPage(populatedFixture());
    const row = document.querySelector('[data-scheme="120503"]')!;
    // 0.1423 → 14.23%, 0.1639 → 16.39%, gap -0.0216 → -2.16%. All three are
    // `Ratio` fractions and all three go through the ×100 exactly once.
    expect(row.textContent).toContain('+14.23%');
    expect(row.textContent).toContain('+16.39%');
    expect(row.textContent).toContain('-2.16%');
  });

  it('shows the risk-o-meter beside every score', async () => {
    await renderPage(populatedFixture());
    // `06 §4`: SEBI expects the risk-o-meter wherever a scheme is presented,
    // and a score is the most prominent presentation this layer produces.
    const funds = screen.getByTestId('mf-held-funds');
    expect(funds.querySelector('[data-riskometer="Very High"]')).toBeTruthy();
    expect(funds.querySelector('[data-riskometer="Moderate"]')).toBeTruthy();
  });

  it('does not moralise the timing gap — no warning treatment on a negative one', async () => {
    await renderPage(populatedFixture());
    const row = document.querySelector('[data-scheme="120503"]')!;
    // `MfHeldFundDto.timingGap`: "Reported, never moralised". A negative gap is
    // a fact about when the user bought, not a verdict on the decision.
    expect(row.querySelector('[data-metric-value][class*="amber"]')).toBeNull();
    expect(row.textContent).not.toMatch(/poor timing|mistake|should have/i);
  });

  it('states an unconverged XIRR as the server explained it, never as zero', async () => {
    await renderPage(populatedFixture());
    const row = document.querySelector('[data-scheme="119551"]')!;
    expect(row.textContent).toContain('did not converge');
    expect(row.textContent).not.toContain('0.00%');
  });
});

/**
 * The `Pct` / `Ratio` split (`packages/shared/src/ratio.ts`). Both quantities
 * below render as a percentage and neither may use the other's formatter.
 */
describe('MfPortfolioPage — Pct and Ratio are not the same unit', () => {
  it('renders an overlap Pct without multiplying it, and a redundancy Ratio with', async () => {
    await renderPage(populatedFixture());

    // `overlapPct` is a Pct: 55.000000 IS 55%.
    const pair = document.querySelector('[data-overlap-pair]')!;
    expect(pair.textContent).toContain('55.0%');

    // `redundancyScore` is a Ratio: 0.310000 is 31%. Formatting it as a Pct
    // would render "0.3%"; the two live three lines apart on the contract.
    const totals = screen.getByTestId('mf-portfolio-totals');
    expect(totals.textContent).toContain('31.0%');
    expect(totals.textContent).not.toContain('0.3%');
  });

  it('renders effectiveFundCount as a count, not as a percentage', async () => {
    await renderPage(populatedFixture());
    const totals = screen.getByTestId('mf-portfolio-totals');
    // A Ratio that is NOT a fraction: 1.82 funds. "182%" would be the bug.
    expect(totals.textContent).toContain('1.82');
    expect(totals.textContent).not.toContain('182%');
  });
});

describe('MfPortfolioPage — empty portfolio', () => {
  it('says there is nothing to total rather than implying a failed measurement', async () => {
    await renderPage(emptyFixture());
    expect(screen.getByText('No mutual fund holdings in this view')).toBeTruthy();
    expect(screen.getByText(/not because a figure could not be measured/i)).toBeTruthy();
  });

  it('still renders every section rather than hiding the ones with no data', async () => {
    await renderPage(emptyFixture());
    // A section that vanishes reads as a section with nothing wrong in it.
    expect(screen.getByTestId('mf-overlap')).toBeTruthy();
    expect(screen.getByTestId('mf-look-through')).toBeTruthy();
    expect(screen.getByTestId('mf-cost')).toBeTruthy();
    expect(screen.getByTestId('mf-tax')).toBeTruthy();
  });
});

describe('MfPortfolioPage — null TER', () => {
  it('never renders a missing expense ratio as zero', async () => {
    await renderPage(nullTerFixture());

    // Zero is a real and excellent expense ratio. Using it for "we don't know"
    // tells the reader their portfolio is free to run.
    const totals = screen.getByTestId('mf-portfolio-totals');
    expect(totals.textContent).not.toMatch(/0\.00%/);
    expect(totals.textContent).not.toMatch(/₹0\.00/);

    const cost = screen.getByTestId('mf-cost');
    expect(cost.textContent).not.toMatch(/0\.00%/);
    expect(cost.textContent).toMatch(/no fund you hold has disclosed an expense ratio/i);
  });

  it('names the funds that did not disclose, so the headline reads as a floor', async () => {
    await renderPage(nullTerFixture());
    const note = screen.getByTestId('mf-cost-undisclosed');
    expect(note.textContent).toMatch(/floor/i);
    expect(note.textContent).toContain('Testwell Flexi Cap Fund - Direct Growth');
  });
});

describe('MfPortfolioPage — unknown exit load and unknowable tax', () => {
  it('renders a null exit load as unknown rather than as no charge', async () => {
    await renderPage(populatedFixture());
    const lot = document.querySelector('[data-lot="119551:2026-05-02"]')!;
    // `MfLotDto.exitLoadPct`: "Null means we do not know this scheme's exit
    // load, not that it is zero."
    expect(lot.textContent).toMatch(/unknown rather than nil/i);
  });

  it('renders a slab-dependent tax as unavailable rather than as ₹0', async () => {
    await renderPage(populatedFixture());
    const lot = document.querySelector('[data-lot="119551:2026-05-02"]')!;
    expect(lot.textContent).toMatch(/taxed at your income slab/i);
    expect(lot.textContent).not.toMatch(/₹0\.00/);
  });

  it('counts down to long term on a short-term lot only', async () => {
    await renderPage(populatedFixture());
    const stcg = document.querySelector('[data-days-to-ltcg="41"]')!;
    expect(stcg.textContent).toContain('41 days to long term');
    // The long-term lot has crossed; `daysToLtcg` is null there and there is no
    // countdown to render.
    const ltcgLot = document.querySelector('[data-lot="120503:2024-02-14"]')!;
    expect(ltcgLot.querySelector('[data-days-to-ltcg]')).toBeNull();
  });
});

describe('MfPortfolioPage — funds without holdings', () => {
  it('declares the look-through a floor and names the fund', async () => {
    await renderPage(fundsWithoutHoldingsFixture());
    const floor = screen.getByTestId('mf-lookthrough-floor');
    expect(floor.textContent).toMatch(/floor, not a total/i);
    expect(floor.textContent).toContain('Testwell Corporate Bond Fund - Regular Growth');
    expect(floor.textContent).toMatch(/at least what is shown/i);
  });

  it('says an uncomparable fund is missing from overlap rather than showing it as unrelated', async () => {
    await renderPage(fundsWithoutHoldingsFixture());
    const note = screen.getByTestId('mf-overlap-uncompared');
    expect(note.textContent).toMatch(/unknown, not zero/i);
  });
});

describe('MfPortfolioPage — partial family scope', () => {
  it('reuses the family layer vocabulary rather than inventing a second dialect', async () => {
    await renderPage(partialScopeFixture());
    const notice = screen.getByTestId('mf-scope-notice');
    // `ScopeRestrictedNotice`'s own wording, from
    // `pages/family/widgets/RestrictedNotice.tsx`.
    expect(notice.textContent).toMatch(/part of this member's finances/i);
    expect(notice.textContent).toMatch(/floor, not their total/i);
  });

  it('labels the hidden asset class in words, not as a raw token', async () => {
    await renderPage(partialScopeFixture());
    const notice = screen.getByTestId('mf-scope-notice');
    expect(notice.textContent).toContain('ETF');
    expect(notice.textContent).not.toContain('NET_WORTH');
  });

  it('says the share-of-net-worth columns are over-statements', async () => {
    await renderPage(partialScopeFixture());
    const notice = screen.getByTestId('mf-scope-notice');
    expect(notice.textContent).toMatch(/over-statement/i);
  });

  it('marks the headline total as partial', async () => {
    await renderPage(partialScopeFixture());
    const totals = screen.getByTestId('mf-portfolio-totals');
    expect(within(totals).getByText('Partial')).toBeTruthy();
  });

  it('renders no scope notice at all on an unrestricted view', async () => {
    await renderPage(populatedFixture());
    expect(screen.queryByTestId('mf-scope-notice')).toBeNull();
  });
});

describe('MfPortfolioPage — overlap detail', () => {
  it('expands a pair to its top shared holdings', async () => {
    await renderPage(populatedFixture());
    const pair = document.querySelector('[data-overlap-pair]')!;
    fireEvent.click(within(pair as HTMLElement).getByRole('button'));
    // Scoped to the overlap section: the same security also appears in the
    // look-through table, and a page-wide query would pass on that instead.
    const section = screen.getByTestId('mf-overlap-equity');
    expect(await within(section).findByText('Reliance Industries')).toBeTruthy();
    // Per-fund weights are Pct and stay Pct.
    expect(within(section).getByText('7.20%')).toBeTruthy();
  });
});

describe('MfPortfolioPage — entitlement gate', () => {
  it('shows the upgrade card and issues no request below PLUS', async () => {
    useAuthStore.setState({ user: { ...plusUser(), plan: 'FREE' } });
    portfolioMock.mockResolvedValue(populatedFixture());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/mutual-funds/analysis']}>
          <Routes>
            <Route path="/mutual-funds/analysis" element={<MfPortfolioPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Portfolio analytics is locked/i)).toBeTruthy();
    expect(portfolioMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

describe('MfPortfolioPage — a zero never stands in for an unknown', () => {
  const states: Array<[string, () => MfPortfolioAnalysisDto]> = [
    ['populated', populatedFixture],
    ['empty', emptyFixture],
    ['partial scope', partialScopeFixture],
    ['null TER', nullTerFixture],
    ['funds without holdings', fundsWithoutHoldingsFixture],
  ];

  for (const [name, fixture] of states) {
    it(`renders no digit inside any non-OK metric — ${name}`, async () => {
      await renderPage(fixture());

      const offenders = renderedMetrics().filter(
        (mv) => mv.status !== 'OK' && /\d/.test(mv.text),
      );
      expect(offenders).toEqual([]);

      // And every non-OK metric says why, rather than showing a bare dash —
      // the other half of the `06 §6` rule.
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
