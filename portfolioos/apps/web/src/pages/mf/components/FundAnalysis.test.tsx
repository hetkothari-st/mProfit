// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import {
  gatedVerdictFixture,
  noFindingsFixture,
  noRunFixture,
  partialRunFixture,
  partialRunUnmappedFixture,
  ungatedSwitchFixture,
  unverifiedProseFixture,
  verifiedProseFixture,
  type AnalysisFixture,
} from '../__fixtures__/fundAnalysis';
import { FundAnalysis } from './FundAnalysis';

/**
 * Render tests for the findings / verdict section (Task 5.6).
 *
 * The last block is the one that matters and it is written as an invariant
 * rather than as an assertion about a particular cell: across every fixture
 * state, **no rendered metric whose status is not `OK` may contain a digit**.
 * It is the same walker `FundDetailPage.test.tsx` uses, extended to the new
 * components, and it catches `{value ?? 0}`, a `toFixed` on a null coerced to
 * zero, and every other way a future edit could quietly turn "we do not know"
 * into a number the reader will trust. Per-metric assertions would only cover
 * the metrics somebody remembered to assert on.
 *
 * The gate is asserted in BOTH positions. A suite that only rendered the gated
 * fixture would pass just as happily against a UI that had the condition
 * inverted — showing "analysis only" when the deployment IS registered and a
 * named replacement when it is not.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderAnalysis(
  fixture: AnalysisFixture,
  overrides: Partial<Parameters<typeof FundAnalysis>[0]> = {},
) {
  const onRefresh = vi.fn();
  render(
    <FundAnalysis
      run={fixture.run}
      findings={fixture.findings}
      verdict={fixture.verdict}
      isLoading={false}
      loadError={null}
      onRefresh={onRefresh}
      isRefreshing={false}
      refreshError={null}
      {...overrides}
    />,
  );
  return { onRefresh };
}

/** Every metric the section rendered, paired with the status it claimed. */
function renderedMetrics(): Array<{ status: string; text: string }> {
  return Array.from(document.querySelectorAll('[data-metric-value]')).map((el) => ({
    status: el.getAttribute('data-status') ?? '',
    text: el.textContent ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

describe('FundAnalysis — findings', () => {
  it('renders every finding with its severity, headline and evidence table', () => {
    renderAnalysis(verifiedProseFixture());

    const findings = screen.getAllByTestId('mf-finding');
    expect(findings).toHaveLength(2);

    const downCapture = document.querySelector('[data-finding-code="HIGH_DOWN_CAPTURE"]')!;
    expect(downCapture.getAttribute('data-severity')).toBe('WARNING');
    expect(downCapture.textContent).toContain('Captured 118.4% of benchmark losses');
    // The cited number, its category median and its percentile. The median
    // (0.996) and the benchmark (1.000000) both round to "1.00", which is
    // itself worth asserting: the table shows them as separate columns rather
    // than collapsing "the category" and "the index" into one number.
    expect(within(downCapture as HTMLElement).getByText('1.18')).toBeTruthy();
    expect(within(downCapture as HTMLElement).getAllByText('1.00')).toHaveLength(2);
    expect(within(downCapture as HTMLElement).getByText('18th')).toBeTruthy();
  });

  it('renders "what would change this" on EVERY finding — 05 §3 makes it mandatory', () => {
    renderAnalysis(verifiedProseFixture());
    const counterfactuals = screen.getAllByTestId('mf-finding-counterfactual');
    expect(counterfactuals).toHaveLength(screen.getAllByTestId('mf-finding').length);
    for (const el of counterfactuals) {
      expect(el.textContent).toContain('What would change this');
      expect(el.textContent!.replace('What would change this', '').trim().length).toBeGreaterThan(
        0,
      );
    }
  });

  it('says a structural finding cites no metric rather than showing an empty table', () => {
    renderAnalysis(verifiedProseFixture());
    const managerChange = document.querySelector('[data-finding-code="MANAGER_CHANGE"]')!;
    expect(managerChange.textContent).toContain('This finding is structural');
    expect(managerChange.querySelector('table')).toBeNull();
  });

  it('carries the rule id and version so "why was this flagged?" is answerable', () => {
    renderAnalysis(verifiedProseFixture());
    const downCapture = document.querySelector('[data-finding-code="HIGH_DOWN_CAPTURE"]')!;
    expect(downCapture.textContent).toContain('mf.risk.high-down-capture');
    expect(downCapture.textContent).toContain('v1.0.0');
  });

  it('an empty findings list states what the emptiness means, not that the fund is clean', () => {
    renderAnalysis(noFindingsFixture());
    const empty = document.querySelector('[data-section-unavailable]')!;
    expect(empty.textContent).toContain('No findings for this fund');
    expect(empty.textContent).toContain('none of its rules fired');
  });

  it('distinguishes "no run has happened" from "the run found nothing"', () => {
    renderAnalysis(noRunFixture());
    expect(screen.getByText(/This is not a clean bill of health/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Prose (`06 §6`)
// ---------------------------------------------------------------------------

describe('FundAnalysis — prose verification', () => {
  it('shows the narrative when proseVerified is true', () => {
    renderAnalysis(verifiedProseFixture());
    expect(screen.getByTestId('mf-verdict-prose').textContent).toContain(
      'fallen further than its peers',
    );
  });

  it('shows headlines and NO error when proseVerified is false', () => {
    renderAnalysis(unverifiedProseFixture());
    // No prose block at all...
    expect(screen.queryByTestId('mf-verdict-prose')).toBeNull();
    // ...and nothing telling the user something went wrong.
    expect(screen.queryByText(/narrative (unavailable|failed)/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/could not be verified/i);
    // The deterministic headline still carries the analysis.
    expect(screen.getByTestId('mf-finding').textContent).toContain('Captured 118.4%');
  });
});

// ---------------------------------------------------------------------------
// PARTIAL run (`06 §6`)
// ---------------------------------------------------------------------------

describe('FundAnalysis — PARTIAL run banner', () => {
  it('names the missing rule categories rather than silently omitting them', () => {
    renderAnalysis(partialRunFixture());
    const banner = screen.getByTestId('mf-partial-banner');
    expect(banner.textContent).toContain('This analysis is incomplete');
    expect(banner.textContent).toContain('Cost');
    expect(banner.textContent).toMatch(/unknown rather than as clear/i);
  });

  it('falls back to naming the failed rule ids when no category could be resolved', () => {
    renderAnalysis(partialRunUnmappedFixture());
    const banner = screen.getByTestId('mf-partial-banner');
    expect(banner.textContent).toContain('mf.retired.some-old-rule');
  });

  it('shows no banner on a COMPLETED run', () => {
    renderAnalysis(verifiedProseFixture());
    expect(screen.queryByTestId('mf-partial-banner')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The RIA gate — BOTH positions
// ---------------------------------------------------------------------------

describe('FundAnalysis — RIA gating (06 §4, §6)', () => {
  it('gated: the chip reads "Review", says analysis only, and names no replacement', () => {
    renderAnalysis(gatedVerdictFixture());

    const chip = document.querySelector('[data-verdict]')!;
    expect(chip.getAttribute('data-verdict')).toBe('REVIEW');
    expect(chip.getAttribute('data-advisory-gated')).toBe('true');
    expect(chip.textContent).toBe('Review');
    // The tooltip says analysis only...
    expect(chip.getAttribute('title')).toMatch(/analysis only/i);
    // ...and so does visible copy, because a hover-only disclosure is one most
    // readers never see.
    expect(screen.getByTestId('mf-verdict-gated-note').textContent).toMatch(/analysis only/i);

    expect(screen.queryByTestId('mf-verdict-replacement')).toBeNull();
    expect(document.body.textContent).not.toContain('Testwell Large Cap Fund');
  });

  it('ungated: the same conclusion renders as SWITCH_CANDIDATE and names the replacement', () => {
    renderAnalysis(ungatedSwitchFixture());

    const chip = document.querySelector('[data-verdict]')!;
    expect(chip.getAttribute('data-verdict')).toBe('SWITCH_CANDIDATE');
    expect(chip.getAttribute('data-advisory-gated')).toBe('false');
    expect(chip.textContent).toBe('Switch candidate');
    expect(chip.getAttribute('title')).not.toMatch(/analysis only/i);

    expect(screen.getByTestId('mf-verdict-replacement').textContent).toContain(
      'Testwell Large Cap Fund - Direct Growth',
    );
    expect(screen.queryByTestId('mf-verdict-gated-note')).toBeNull();
  });

  it('shows the switch cost in both positions — leaving cost is a fact, not advice', () => {
    renderAnalysis(ungatedSwitchFixture());
    const open = screen.getByTestId('mf-switch-cost');
    expect(open.textContent).toContain('1,482.50');
    expect(open.textContent).toContain('14.3');
    cleanup();

    renderAnalysis(gatedVerdictFixture());
    const shut = screen.getByTestId('mf-switch-cost');
    expect(shut.textContent).toContain('1,482.50');
    // Break-even is unknown here, and says so instead of showing a zero that
    // would read as "switching pays for itself immediately".
    expect(shut.textContent).toContain('Not available');
  });

  it('surfaces the verdict reasons so the conclusion is traceable to its evidence', () => {
    renderAnalysis(gatedVerdictFixture());
    expect(screen.getByTestId('mf-verdict').textContent).toContain(
      'PERSISTENT_UNDERPERFORMANCE, HIGH_DOWN_CAPTURE',
    );
  });

  it('says a fund has no standing verdict rather than implying a HOLD', () => {
    renderAnalysis(noRunFixture());
    expect(screen.getByText('No verdict for this fund')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

describe('FundAnalysis — refresh', () => {
  it('calls back on click and disables itself while the run is in flight', () => {
    const { onRefresh } = renderAnalysis(verifiedProseFixture());
    fireEvent.click(screen.getByTestId('mf-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    cleanup();
    renderAnalysis(verifiedProseFixture(), { isRefreshing: true });
    expect((screen.getByTestId('mf-refresh') as HTMLButtonElement).disabled).toBe(true);
  });

  it("surfaces the server's rate-limit message verbatim rather than a generic failure", () => {
    // The 1/hour limit lives on the server and its message names when the next
    // refresh is allowed. Re-deriving that deadline on the client would be a
    // second implementation of the limit, free to disagree with the first.
    renderAnalysis(verifiedProseFixture(), {
      refreshError:
        'Analysis was refreshed less than an hour ago. Next refresh available at 2026-09-01T11:00:00.000Z.',
    });
    expect(screen.getByTestId('mf-refresh-error').textContent).toContain(
      'Next refresh available at',
    );
    // Still pressable: the server, not the button, decides.
    expect((screen.getByTestId('mf-refresh') as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

describe('FundAnalysis — a zero never stands in for an unknown', () => {
  const states: Array<[string, () => AnalysisFixture]> = [
    ['verified prose', verifiedProseFixture],
    ['unverified prose', unverifiedProseFixture],
    ['partial run', partialRunFixture],
    ['partial run, unmapped rule', partialRunUnmappedFixture],
    ['gated verdict', gatedVerdictFixture],
    ['ungated switch candidate', ungatedSwitchFixture],
    ['no findings', noFindingsFixture],
    ['no run', noRunFixture],
  ];

  for (const [name, fixture] of states) {
    it(`renders no digit inside any non-OK metric — ${name}`, () => {
      renderAnalysis(fixture());

      const offenders = renderedMetrics().filter(
        (mv) => mv.status !== 'OK' && /\d/.test(mv.text),
      );
      expect(offenders).toEqual([]);

      // And every non-OK metric says why, rather than showing a bare dash.
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
