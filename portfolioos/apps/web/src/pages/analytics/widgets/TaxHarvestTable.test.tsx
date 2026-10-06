// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TaxHarvestTable } from './TaxWidgets';
import { ConcentrationCard } from './ReturnsWidgets';
import type { TaxHarvestSummary, ConcentrationRow } from '@/api/analytics.api';

afterEach(() => cleanup());

function summary(over: Partial<TaxHarvestSummary> = {}): TaxHarvestSummary {
  return {
    unrealisedLoss: '64100',
    stcgLossAvailable: '38200',
    ltcgLossAvailable: '25900',
    realisedStcgInFy: '0',
    realisedLtcgInFy: '0',
    savings: {
      taxBefore: '0', taxAfter: '0', taxSaved: '0',
      applied: { stclVsStcg: '0', stclVsLtcg: '0', ltclVsLtcg: '0' },
      lossUtilised: '0', lossUnused: '0', stcgRatePct: 20, ltcgRatePct: 12.5, ltcgExemption: '125000',
    },
    candidates: [
      { portfolioName: 'Long Term', assetName: 'Tata Motors Ltd', assetClass: 'EQUITY', unrealisedPnL: '-31200', classification: 'STCG_LOSS' },
    ],
    ...over,
  } as TaxHarvestSummary;
}

describe('TaxHarvestTable headline', () => {
  it('leads with the rupee saving when there is one', () => {
    render(<TaxHarvestTable data={summary({
      realisedStcgInFy: '80000', realisedLtcgInFy: '0',
      savings: { ...summary().savings, taxSaved: '7640' },
    })} />);
    expect(screen.getByText(/could reduce this year/)).toBeTruthy();
    expect(screen.getByText(/7,640/)).toBeTruthy();
  });

  // The bug this covers: with gains booked but already untaxed (long-term
  // inside the exemption), the card claimed "you have no gains this year",
  // contradicting the Taxable gains tile directly beneath it.
  it('does not claim there are no gains when gains were booked but are untaxed', () => {
    render(<TaxHarvestTable data={summary({ realisedStcgInFy: '-5000', realisedLtcgInFy: '14600' })} />);
    expect(screen.queryByText(/no gains this year/)).toBeNull();
    expect(screen.getByText(/already untaxed/)).toBeTruthy();
  });

  it('says there are no gains only when none were booked', () => {
    render(<TaxHarvestTable data={summary()} />);
    expect(screen.getByText(/no gains this year/)).toBeTruthy();
  });

  it('says there is nothing to harvest when no holding is down', () => {
    render(<TaxHarvestTable data={summary({ candidates: [] })} />);
    expect(screen.getByText(/Nothing to harvest/)).toBeTruthy();
  });
});

function conc(rows: Array<[string, number, number]>): ConcentrationRow[] {
  return rows.map(([assetName, pct, cumulativePct]) => ({
    assetName, assetClass: 'EQUITY', value: '1', pct, cumulativePct,
  }));
}

describe('ConcentrationCard headline', () => {
  // "Your top 8 holdings are 100% of everything you own" is true and useless.
  it('leads with the largest holding when the list is the whole portfolio', () => {
    render(<ConcentrationCard rows={conc([['Fixed Deposit', 39.8, 39.8], ['HDFC Bank', 14.1, 53.9], ['TCS', 46.1, 100]])} />);
    expect(screen.getByText(/Your biggest holding is/)).toBeTruthy();
    expect(screen.queryByText(/Your top 3 holdings/)).toBeNull();
  });

  it('gives the cumulative share when the list is a subset', () => {
    render(<ConcentrationCard rows={conc([['Reliance', 30, 30], ['TCS', 18, 48], ['Infosys', 12, 60]])} />);
    expect(screen.getByText(/Your top 3 holdings are/)).toBeTruthy();
  });
});
