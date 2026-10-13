// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { runWillRules, type WillPayload } from '@everypaisa/shared';
import { AllocationStep } from './AllocationStep';
import type { WillStepProps } from './types';
import { fullPayload, item, TODAY } from '../willTestData';

vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 200, height: 160 }}>{children}</div> };
});

afterEach(cleanup);

function setup(payload: WillPayload = fullPayload()) {
  const p: WillStepProps = {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide: true, update: vi.fn(),
    refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(), reload: vi.fn(async () => undefined),
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
    expect(lastAllocation(p).specificGifts.at(-1)).toEqual({ itemId: 'bank:b1', personId: 'p-spouse', sharePct: '100.00' });

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

  it('shows what is left of each asset, disables fully gifted ones and defaults the share', () => {
    const payload = fullPayload();
    payload.allocation.specificGifts = [
      { itemId: 'holdings:pf1:EQUITY', personId: 'p-son', sharePct: '100' },
      { itemId: 'bank:b1', personId: 'p-son', sharePct: '60' },
    ];
    const p = setup(payload);
    fireEvent.click(screen.getByRole('tab', { name: /specific gifts/i }));
    const options = Array.from((screen.getByLabelText(/^asset$/i) as HTMLSelectElement).options);
    const bank = options.find((o) => o.value === 'bank:b1')!;
    const equity = options.find((o) => o.value === 'holdings:pf1:EQUITY')!;
    expect(bank.textContent).toContain('40% left');
    expect(equity.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^asset$/i), { target: { value: 'bank:b1' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'p-spouse' } });
    fireEvent.click(screen.getByRole('button', { name: /add gift/i }));
    expect(lastAllocation(p).specificGifts.at(-1)).toEqual({ itemId: 'bank:b1', personId: 'p-spouse', sharePct: '40.00' });
  });

  it('blocks adding the same asset to the same person twice', () => {
    const payload = fullPayload();
    payload.allocation.specificGifts = [{ itemId: 'bank:b1', personId: 'p-son', sharePct: '30' }];
    setup(payload);
    fireEvent.click(screen.getByRole('tab', { name: /specific gifts/i }));
    fireEvent.change(screen.getByLabelText(/^asset$/i), { target: { value: 'bank:b1' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'p-son' } });
    expect((screen.getByRole('button', { name: /add gift/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/already has a share of this asset/i)).toBeTruthy();
  });

  it('does not offer nominee-only items, and marks stale ones', () => {
    const payload = fullPayload();
    payload.estate.items.push(
      item({ sourceKey: 'ins:1', kind: 'INSURANCE', label: 'Term cover', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } }),
      item({ sourceKey: 'bank:old', label: 'Old savings', review: 'STALE' }),
    );
    setup(payload);
    fireEvent.click(screen.getByRole('tab', { name: /specific gifts/i }));
    const options = Array.from((screen.getByLabelText(/^asset$/i) as HTMLSelectElement).options).map((o) => o.textContent ?? '');
    expect(options.some((o) => o.includes('Term cover'))).toBe(false);
    expect(options.some((o) => o.includes('Old savings') && o.includes('not found in latest refresh'))).toBe(true);
  });

  it('rejects a zero fixed amount and shows paise when present', () => {
    const payload = fullPayload();
    payload.allocation.fixedGifts = [{ personId: 'p-trust', amount: '50000.50' }];
    setup(payload);
    fireEvent.click(screen.getByRole('tab', { name: /fixed amounts/i }));
    expect(screen.getByText(/50,000\.50/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^person$/i), { target: { value: 'p-son' } });
    fireEvent.change(screen.getByLabelText(/^amount$/i), { target: { value: '0' } });
    expect((screen.getByRole('button', { name: /add amount/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables Add gift when the chosen asset has nothing left, and the split add when nothing is left', () => {
    const p = setup();
    expect(p).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /specific gifts/i }));
    fireEvent.change(screen.getByLabelText(/^asset$/i), { target: { value: 'holdings:pf1:EQUITY' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'p-spouse' } });
    expect((screen.getByRole('button', { name: /add gift/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('will not add someone to a split that is already at 100%', () => {
    const payload = fullPayload();
    payload.allocation.residuary = [{ personId: 'p-spouse', sharePct: '100' }];
    const p = setup(payload);
    const select = screen.getByLabelText(/add someone to the split/i) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.getByText(/lower someone's share first/i)).toBeTruthy();
    expect(p.update).not.toHaveBeenCalled();
  });

  it('labels the donut with a legend in distinct chart colours, and wraps the tab bar on narrow screens', () => {
    const payload = fullPayload();
    payload.allocation.residuary = [
      { personId: payload.people[0]!.id, sharePct: '50' },
      { personId: payload.people[1]!.id, sharePct: '30' },
    ];
    setup(payload);
    const legend = screen.getByTestId('donut-legend');
    const rows = Array.from(legend.querySelectorAll('li'));
    expect(rows.map((r) => r.textContent)).toEqual([
      `${payload.people[0]!.name}50.00%`, `${payload.people[1]!.name}30.00%`, 'Not shared yet20.00%',
    ]);
    const colours = rows.map((r) => r.querySelector('[data-colour]')!.getAttribute('data-colour'));
    expect(new Set(colours).size).toBe(3);
    expect(colours.slice(0, 2).every((c) => /--chart-\d/.test(c ?? ''))).toBe(true);
    expect(screen.getByRole('tablist').className).toContain('flex-wrap');
  });
});
