// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReturnCorrelationGrid } from './RiskWidget';
import type { AllocationSlice, ClassCorrelation } from '@/api/analytics.api';

afterEach(() => cleanup());

const allocation = [
  { key: 'EQUITY', label: 'Stocks', value: '600', pct: 60 },
  { key: 'MUTUAL_FUND', label: 'Mutual Funds', value: '300', pct: 30 },
  { key: 'FIXED_DEPOSIT', label: 'Fixed Deposits', value: '100', pct: 10 },
] as AllocationSlice[];

const correlation: ClassCorrelation = {
  classes: ['EQUITY', 'MUTUAL_FUND', 'FIXED_DEPOSIT'],
  matrix: [
    [1, 0.82, null],
    [0.82, 1, null],
    [null, null, null],
  ],
  observations: [
    [11, 11, 0],
    [11, 11, 0],
    [0, 0, 0],
  ],
  minObservations: 6,
};

describe('ReturnCorrelationGrid', () => {
  it('shows real coefficients between classes that have price history', () => {
    render(<ReturnCorrelationGrid correlation={correlation} loading={false} allocation={allocation} />);
    expect(screen.getAllByText('0.82')).toHaveLength(2);
    expect(screen.getByTitle('Stocks × Mutual Funds: 0.82 over 11 months')).toBeTruthy();
  });

  it('lists classes with no price history under the grid instead of as empty rows', () => {
    render(<ReturnCorrelationGrid correlation={correlation} loading={false} allocation={allocation} />);
    expect(screen.getByText(/no price history: Fixed Deposits/)).toBeTruthy();
    expect(screen.queryByRole('rowheader', { name: 'Fixed Deposits' })).toBeNull();
  });

  it('explains what is missing when fewer than two classes can be correlated', () => {
    const onlyOne: ClassCorrelation = {
      classes: ['EQUITY', 'FIXED_DEPOSIT'],
      matrix: [
        [1, null],
        [null, null],
      ],
      observations: [
        [11, 0],
        [0, 0],
      ],
      minObservations: 6,
    };
    render(<ReturnCorrelationGrid correlation={onlyOne} loading={false} allocation={allocation} />);
    expect(screen.getByText(/Needs at least two asset classes with price history/)).toBeTruthy();
  });

  it('renders without a correlation payload (older API)', () => {
    render(<ReturnCorrelationGrid correlation={undefined} loading={false} allocation={allocation} />);
    expect(screen.getByText(/Needs at least two asset classes/)).toBeTruthy();
  });
});
