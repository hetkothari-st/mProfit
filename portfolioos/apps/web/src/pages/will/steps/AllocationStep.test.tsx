// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { runWillRules, type WillPayload } from '@everypaisa/shared';
import { AllocationStep } from './AllocationStep';
import type { WillStepProps } from './types';
import { fullPayload, TODAY } from '../willTestData';

vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 200, height: 160 }}>{children}</div> };
});

afterEach(cleanup);

function setup(payload: WillPayload = fullPayload()) {
  const p: WillStepProps = {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide: true, update: vi.fn(),
    refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(),
  };
  render(<AllocationStep {...p} />);
  return p;
}
const lastAllocation = (p: WillStepProps) => vi.mocked(p.update).mock.calls.filter((c) => c[0] === 'allocation').at(-1)![1] as WillPayload['allocation'];

describe('AllocationStep', () => {
  it('shows the live total, and the blocker when it is not 100%', () => {
    const payload = fullPayload();
    payload.allocation.residuary[0]!.sharePct = '50';
    setup(payload);
    expect(screen.getByTestId('residuary-total').textContent).toContain('90.00%');
    expect(screen.getByText(/adds up to 90\.00%/)).toBeTruthy();
  });

  it('splits equally to exactly 100', () => {
    const payload = fullPayload();
    payload.allocation.residuary.push({ personId: 'p-trust', sharePct: '10' });
    const p = setup(payload);
    fireEvent.click(screen.getByRole('button', { name: /split equally/i }));
    expect(lastAllocation(p).residuary.map((r) => r.sharePct)).toEqual(['33.34', '33.33', '33.33']);
  });

  it('only saves valid percentages', () => {
    const p = setup();
    const input = screen.getByLabelText('Share for Sunita Verma');
    fireEvent.change(input, { target: { value: '55.555' } });
    expect(p.update).not.toHaveBeenCalled();
    expect(screen.getByText(/like 25 or 33\.33/)).toBeTruthy();
    fireEvent.change(input, { target: { value: '55.5' } });
    expect(lastAllocation(p).residuary[0]).toEqual({ personId: 'p-spouse', sharePct: '55.5' });
  });

  it('adds a person with the share still left', () => {
    const payload = fullPayload();
    payload.allocation.residuary = [{ personId: 'p-spouse', sharePct: '60' }];
    const p = setup(payload);
    fireEvent.change(screen.getByLabelText(/add someone to the split/i), { target: { value: 'p-son' } });
    expect(lastAllocation(p).residuary).toEqual([{ personId: 'p-spouse', sharePct: '60' }, { personId: 'p-son', sharePct: '40.00' }]);
  });

  it('adds a specific gift and a fixed amount', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('tab', { name: /specific gifts/i }));
    fireEvent.change(screen.getByLabelText(/^asset$/i), { target: { value: 'bank:b1' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'p-spouse' } });
    fireEvent.click(screen.getByRole('button', { name: /add gift/i }));
    expect(lastAllocation(p).specificGifts.at(-1)).toEqual({ itemId: 'bank:b1', personId: 'p-spouse', sharePct: '100' });

    fireEvent.click(screen.getByRole('tab', { name: /fixed amounts/i }));
    fireEvent.change(screen.getByLabelText(/^person$/i), { target: { value: 'p-son' } });
    fireEvent.change(screen.getByLabelText(/^amount$/i), { target: { value: '1,00,000' } });
    fireEvent.click(screen.getByRole('button', { name: /add amount/i }));
    expect(lastAllocation(p).fixedGifts.at(-1)).toEqual({ personId: 'p-son', amount: '100000' });
  });

  it('does not offer excluded assets or liabilities as gifts', () => {
    const payload = fullPayload();
    payload.estate.items[0]!.review = 'EXCLUDED';
    setup(payload);
    fireEvent.click(screen.getByRole('tab', { name: /specific gifts/i }));
    const options = Array.from((screen.getByLabelText(/^asset$/i) as HTMLSelectElement).options).map((o) => o.textContent ?? '');
    expect(options.some((o) => o.includes('HDFC'))).toBe(false);
    expect(options.some((o) => o.includes('Home loan'))).toBe(false);
  });
});
