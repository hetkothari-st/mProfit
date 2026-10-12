// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { CalculateTab } from './CalculateTab';
import { CARRIED_FORWARD_LABEL, computeCalc, defaultCalcState, money, type CalcState } from './emiState';

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
  it('TENURE mode: an EMI that takes over 40 years shows its error on the EMI field', async () => {
    render(<Harness initial={{ mode: 'TENURE', emi: '7,200' }} />);
    await waitFor(() => expect(document.getElementById('emi-emi-err')?.textContent).toBe('This EMI takes longer than 40 years to repay'));
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

describe('CalculateTab sliders, tax table and layout', () => {
  it('moving the loan amount slider updates the field and the EMI', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Loan amount slider'), { target: { value: '2000000' } });
    expect((screen.getByLabelText('Loan amount (Rs.)') as HTMLInputElement).value).toBe('20,00,000');
    await waitFor(() => expect(screen.getByTestId('emi-value').textContent).toContain('17,357'));
  });

  it('the rate slider follows the field and a typed value outside its range is kept', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Rate slider'), { target: { value: '9' } });
    await waitFor(() => expect(screen.getByTestId('emi-value').textContent).toContain('8,998'));
    fireEvent.change(screen.getByLabelText(/interest rate/i), { target: { value: '25' } });
    expect((screen.getByLabelText(/interest rate/i) as HTMLInputElement).value).toBe('25');
    expect((screen.getByLabelText('Rate slider') as HTMLInputElement).value).toBe('20');
  });

  it('the tenure slider range follows the unit toggle', () => {
    render(<Harness />);
    expect((screen.getByLabelText('Tenure slider (years)') as HTMLInputElement).max).toBe('30');
    fireEvent.click(screen.getByRole('radio', { name: 'Months' }));
    expect((screen.getByLabelText('Tenure slider (months)') as HTMLInputElement).max).toBe('360');
  });

  it('EMI slider appears in max-loan mode', () => {
    render(<Harness initial={{ mode: 'MAX_LOAN', emi: '8679' }} />);
    expect(screen.getByLabelText('EMI slider')).toBeTruthy();
  });

  it('a new prepayment row starts at Rs. 1,00,000 so the saving shows at once', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
    fireEvent.click(screen.getByRole('button', { name: /add prepayment/i }));
    expect((within(screen.getByTestId('prepayment-0')).getByLabelText(/amount/i) as HTMLInputElement).value).toBe('1,00,000');
    await waitFor(() => expect(screen.getByTestId('interest-saved')).toBeTruthy());
  });

  it('shows a per-FY tax table, with the carried-forward column for a let-out home', async () => {
    render(<Harness initial={{ principal: '50,00,000', ratePct: '9', taxOn: true, loanKind: 'HOME_LET_OUT' }} />);
    const table = await screen.findByTestId('tax-table');
    expect(table.textContent).toContain('Tax benefit by year');
    expect(table.textContent).toContain('FY 2026-27');
    expect(table.textContent).toContain(CARRIED_FORWARD_LABEL);
  });

  it('self-occupied tax table has no carried-forward column; no table without tax', async () => {
    render(<Harness initial={{ taxOn: true, loanKind: 'HOME_SELF' }} />);
    const table = await screen.findByTestId('tax-table');
    expect(table.textContent).not.toContain(CARRIED_FORWARD_LABEL);
    cleanup();
    render(<Harness />);
    await screen.findByTestId('emi-value');
    expect(screen.queryByTestId('tax-table')).toBeNull();
  });

  it('tiles carry the full value as a title and the APR shows the nominal rate', async () => {
    render(<Harness />);
    const emi = await screen.findByTestId('emi-value');
    expect(emi.getAttribute('title')).toBe(emi.textContent);
    expect(screen.getByTestId('apr-value').parentElement!.textContent).toMatch(/nominal \d+\.\d{2}% p\.a\./);
  });

  it('narrow screens get stacked schedule cards and no sideways-scroll container', async () => {
    render(<Harness />);
    const card = await screen.findByTestId('schedule-card');
    expect(within(card).getByTestId('schedule-cards')).toBeTruthy();
    expect(card.querySelector('.overflow-x-auto, table')).toBeNull();
  });

  it('wide screens get a whole-rupee table', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      render(<Harness />);
      const table = await screen.findByTestId('schedule-table');
      expect(table.textContent).not.toMatch(/\.\d{2}\b/);
      expect(table.closest('[data-testid="schedule-card"]')!.querySelector('.overflow-x-auto')).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });
});
