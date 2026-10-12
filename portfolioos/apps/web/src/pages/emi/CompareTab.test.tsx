// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { CompareTab } from './CompareTab';
import { defaultCompareState, type CompareState } from './emiState';

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
