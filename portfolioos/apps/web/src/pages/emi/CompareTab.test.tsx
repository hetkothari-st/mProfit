// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { CompareTab } from './CompareTab';
import { computeCompare, defaultCompareState, money, type CompareState } from './emiState';

function Harness() {
  const [s, setS] = useState<CompareState>(defaultCompareState());
  return <CompareTab state={s} firstEmiDate="2026-11-05" onChange={setS} />;
}

afterEach(cleanup);

describe('CompareTab', () => {
  it('shows a result column per offer and marks the cheapest', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getAllByTestId(/^offer-result-/)).toHaveLength(2));
    expect(screen.getAllByText(/cheapest/i).length).toBeGreaterThan(0);
  });

  it('adds a third offer and no more', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /add offer/i }));
    await waitFor(() => expect(screen.getAllByTestId(/^offer-result-/)).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /add offer/i })).toBeNull();
  });

  it('removing keeps at least two offers', async () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /remove offer/i })).toBeNull();
  });

  it('shows the field error inside the offer that has it', async () => {
    render(<Harness />);
    const first = screen.getByTestId('offer-input-0');
    fireEvent.change(within(first).getByLabelText(/interest rate/i), { target: { value: 'abc' } });
    await waitFor(() => expect(within(first).getByText(/between 0% and 50%/i)).toBeTruthy());
  });
});

describe('CompareTab controls', () => {
  it('a 30-month offer works via the Months toggle', async () => {
    render(<Harness />);
    const first = screen.getByTestId('offer-input-0');
    fireEvent.click(within(first).getByRole('radio', { name: 'Months' }));
    fireEvent.change(within(first).getByLabelText(/tenure \(months\)/i), { target: { value: '30' } });
    const expected = computeCompare({ offers: [{ ...defaultCompareState().offers[0]!, tenure: '30', tenureUnit: 'M' }, defaultCompareState().offers[1]!] }, '2026-11-05');
    if (!expected.ok) throw new Error('fixture invalid');
    expect(expected.result.offers[0]!.months).toBe(30);
    await waitFor(() => expect(within(screen.getByTestId('offer-result-0')).getByText(money(expected.result.offers[0]!.emi))).toBeTruthy());
  });

  it('the fee type select switches the fee to a fixed amount', () => {
    render(<Harness />);
    const first = screen.getByTestId('offer-input-0');
    fireEvent.change(within(first).getByLabelText('Fee type'), { target: { value: 'AMOUNT' } });
    expect(within(first).getByLabelText('Processing fee (Rs.)')).toBeTruthy();
  });

  it('says where the first EMI date and tax settings come from', () => {
    render(<Harness />);
    expect(screen.getByText('Uses the first EMI date and tax settings from the Calculate tab.')).toBeTruthy();
  });

  it('lists errors for fields not shown on this tab', async () => {
    render(<CompareTab state={defaultCompareState()} firstEmiDate="2026-02-30" onChange={() => {}} />);
    const card = await screen.findByTestId('compare-errors');
    expect(card.textContent).toContain('Pick a valid first EMI date');
  });

  it('marks every tied offer as cheapest', async () => {
    const s = defaultCompareState();
    render(<CompareTab state={{ offers: [s.offers[0]!, { ...s.offers[0]!, label: 'Twin' }] }} firstEmiDate="2026-11-05" onChange={() => {}} />);
    await waitFor(() => expect(screen.getAllByText('Cheapest overall')).toHaveLength(2));
  });
});
