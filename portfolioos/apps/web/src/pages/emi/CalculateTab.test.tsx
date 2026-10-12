// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { CalculateTab } from './CalculateTab';
import { computeCalc, defaultCalcState, money, type CalcState } from './emiState';

vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

function Harness({ initial }: { initial?: Partial<CalcState> }) {
  const [s, setS] = useState<CalcState>({ ...defaultCalcState(new Date(2026, 9, 12)), principal: '10,00,000', ratePct: '8.5', tenure: '20', ...initial });
  return <CalculateTab state={s} onChange={setS} />;
}

afterEach(cleanup);

describe('CalculateTab', () => {
  it('shows the EMI for the default inputs', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('emi-value').textContent).toContain('8,679'));
  });

  it('recomputes when the rate changes', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/interest rate/i), { target: { value: '9' } });
    await waitFor(() => expect(screen.getByTestId('emi-value').textContent).toContain('8,998'));
  });

  it('shows a field error and keeps the last good result hidden', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/interest rate/i), { target: { value: '70' } });
    await waitFor(() => expect(screen.getByText(/between 0% and 50%/i)).toBeTruthy());
    expect(screen.queryByTestId('emi-value')).toBeNull();
  });

  it('max-loan mode shows the loan amount as the result', async () => {
    render(<Harness initial={{ mode: 'MAX_LOAN', emi: '8679' }} />);
    await waitFor(() => expect(screen.getByTestId('max-loan-value').textContent).toContain('10,00,088'));
  });

  it('adding a prepayment shows interest saved', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
    fireEvent.click(screen.getByRole('button', { name: /add prepayment/i }));
    const row = screen.getByTestId('prepayment-0');
    fireEvent.change(within(row).getByLabelText(/month/i), { target: { value: '12' } });
    fireEvent.change(within(row).getByLabelText(/amount/i), { target: { value: '1,00,000' } });
    await waitFor(() => expect(screen.getByTestId('interest-saved')).toBeTruthy());
  });

  it('schedule groups by FY and expands to months', async () => {
    render(<Harness />);
    const fy = await screen.findByRole('button', { name: /FY 2026-27/ });
    fireEvent.click(fy);
    expect(await screen.findByText('05/11/2026')).toBeTruthy();
  });
});

describe('CalculateTab error surfacing and baseline', () => {
  it('shows a visible message for a hidden tenure error in TENURE mode', async () => {
    render(<Harness initial={{ mode: 'TENURE', emi: '7,200' }} />);
    await waitFor(() => expect(screen.getByText(/tenure outside the allowed range/i)).toBeTruthy());
  });

  it('opens Advanced and shows a prepayment error raised while collapsed', async () => {
    function Injector() {
      const [s, setS] = useState<CalcState>({ ...defaultCalcState(new Date(2026, 9, 12)), principal: '10,00,000', ratePct: '8.5', tenure: '20' });
      return (
        <>
          <button type="button" onClick={() => setS({ ...s, prepayments: [{ id: 'x1', month: '0', amount: '1000', recurrence: 'ONCE', mode: 'REDUCE_TENURE' }] })}>inject</button>
          <CalculateTab state={s} onChange={setS} />
        </>
      );
    }
    render(<Injector />);
    expect(screen.queryByTestId('prepayment-0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'inject' }));
    await waitFor(() => expect(screen.getByTestId('prepayment-0')).toBeTruthy());
    const row = screen.getByTestId('prepayment-0');
    expect(row.querySelector('p.text-destructive')).not.toBeNull();
  });

  it('interest saved is measured against the baseline that keeps rate changes', async () => {
    const base = { ...defaultCalcState(new Date(2026, 9, 12)), principal: '10,00,000', ratePct: '8.5', tenure: '20' };
    const rateChanges = [{ id: 'r1', fromMonth: '13', ratePct: '10', mode: 'REDUCE_TENURE' as const }];
    const prepayments = [{ id: 'p1', month: '24', amount: '1,00,000', recurrence: 'ONCE' as const, mode: 'REDUCE_TENURE' as const }];
    const withBoth = computeCalc({ ...base, rateChanges, prepayments });
    const rcOnly = computeCalc({ ...base, rateChanges });
    if (!withBoth.ok || !rcOnly.ok) throw new Error('fixture invalid');
    const expected = money(rcOnly.summary.totalInterest.minus(withBoth.summary.totalInterest));
    render(<Harness initial={{ rateChanges, prepayments }} />);
    await waitFor(() => expect(screen.getByTestId('interest-saved').textContent).toBe(expected));
  });
});
