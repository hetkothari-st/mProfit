// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BestAndWorst } from './ReturnsWidgets';
import type { HoldingRankRow } from '@/api/analytics.api';

afterEach(() => cleanup());

function row(assetName: string, currentValue: string, pnl: string, pnlPct: number): HoldingRankRow {
  return { assetName, assetClass: 'EQUITY', totalCost: '0', currentValue, pnl, pnlPct };
}

/**
 * The bug this table replaced: two tables ranked by percentage, where a tiny
 * punt outranked a large holding losing real money.
 */
const tinyPunt = row('Tiny Punt Ltd', '3000', '-2000', -40);
const bigBleeder = row('Large Index Fund', '560000', '-40000', -6.7);
const smallWinner = row('Small Winner', '9000', '4000', 80);
const bigWinner = row('Big Compounder', '800000', '300000', 60);

describe('BestAndWorst', () => {
  it('ranks by rupees, so the biggest real loss outranks a small punt', () => {
    render(<BestAndWorst winners={[smallWinner, bigWinner]} losers={[tinyPunt, bigBleeder]} />);
    const rowText = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    const bleeder = rowText.findIndex((t) => t.includes('Large Index Fund'));
    const punt = rowText.findIndex((t) => t.includes('Tiny Punt'));
    expect(bleeder).toBeGreaterThan(-1);
    expect(bleeder).toBeLessThan(punt);
  });

  it('shows the rupee gain or loss, not only a percentage', () => {
    render(<BestAndWorst winners={[bigWinner]} losers={[bigBleeder]} />);
    expect(screen.getByText(/40,000/)).toBeTruthy();
    expect(screen.getByText(/3,00,000/)).toBeTruthy();
  });

  it('puts losses above gains — what is going wrong is the point', () => {
    render(<BestAndWorst winners={[bigWinner]} losers={[bigBleeder]} />);
    const rowText = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    const loss = rowText.findIndex((t) => t.includes('Large Index Fund'));
    const gain = rowText.findIndex((t) => t.includes('Big Compounder'));
    expect(loss).toBeLessThan(gain);
  });

  it('renders an empty state rather than an empty table', () => {
    render(<BestAndWorst winners={[]} losers={[]} />);
    expect(screen.getByText('No holdings yet')).toBeTruthy();
  });
});
