// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { runWillRules, type WillPayload } from '@everypaisa/shared';
import { EstateStep } from './EstateStep';
import type { WillStepProps } from './types';
import { fullPayload, item, TODAY } from '../willTestData';

afterEach(cleanup);

function setup(payload: WillPayload = fullPayload(), wide = true) {
  const p: WillStepProps = {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide, update: vi.fn(),
    refreshEstate: vi.fn(async () => undefined), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(),
  };
  render(<EstateStep {...p} />);
  return p;
}

const lastEstate = (p: WillStepProps) => vi.mocked(p.update).mock.calls.filter((c) => c[0] === 'estate').at(-1)![1] as WillPayload['estate'];

describe('EstateStep', () => {
  it('fetches the estate on first open, once', () => {
    const payload = fullPayload();
    payload.estate.asOf = null;
    const p = setup(payload);
    expect(p.refreshEstate).toHaveBeenCalledTimes(1);
  });

  it('does not refetch an estate it already has, but refreshes on request', () => {
    const p = setup();
    expect(p.refreshEstate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /refresh from my accounts/i }));
    expect(p.refreshEstate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/as of 12\/10\/2026/i)).toBeTruthy();
  });

  it('shows totals and the items as a table when wide, as cards when narrow', () => {
    setup();
    expect(screen.getByTestId('estate-net').textContent).toContain('13,50,000');
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    cleanup();
    setup(fullPayload(), false);
    expect(screen.queryAllByRole('table')).toHaveLength(0);
    expect(screen.getByTestId('estate-item-bank:b1')).toBeTruthy();
  });

  it('confirms, excludes and changes ownership', () => {
    const payload = fullPayload();
    payload.estate.items[0]!.review = 'NEEDS_REVIEW';
    const p = setup(payload, false);
    const row = screen.getByTestId('estate-item-bank:b1');
    fireEvent.click(within(row).getByRole('button', { name: /confirm/i }));
    expect(lastEstate(p).items[0]!.review).toBe('CONFIRMED');
    fireEvent.click(within(row).getByRole('button', { name: /exclude/i }));
    expect(lastEstate(p).items[0]!.review).toBe('EXCLUDED');
    fireEvent.change(within(row).getByLabelText(/ownership/i), { target: { value: 'JOINT' } });
    expect(lastEstate(p).items[0]!).toMatchObject({ ownership: { type: 'JOINT', sharePct: '50' }, userEdited: true });
  });

  it('adds a manual asset', () => {
    const p = setup(fullPayload(), false);
    fireEvent.click(screen.getByRole('button', { name: /add an asset or liability/i }));
    fireEvent.change(screen.getByLabelText(/^what is it/i), { target: { value: 'Gold coins' } });
    fireEvent.change(screen.getByLabelText(/^value/i), { target: { value: '75,000' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    const added = lastEstate(p).items.at(-1)!;
    expect(added).toMatchObject({ label: 'Gold coins', value: '75000', kind: 'OTHER_ASSET', side: 'ASSET', review: 'CONFIRMED', userEdited: true });
    expect(added.sourceKey.startsWith('manual:')).toBe(true);
  });

  it('removing a manual item also removes gifts of it', () => {
    const payload = fullPayload();
    payload.estate.items.push(item({ sourceKey: 'manual:x', kind: 'OTHER_ASSET', label: 'Painting', value: '5000' }));
    payload.allocation.specificGifts.push({ itemId: 'manual:x', personId: 'p-son', sharePct: '100' });
    const p = setup(payload, false);
    fireEvent.click(within(screen.getByTestId('estate-item-manual:x')).getByRole('button', { name: /remove/i }));
    expect(lastEstate(p).items.some((i) => i.sourceKey === 'manual:x')).toBe(false);
    const allocation = vi.mocked(p.update).mock.calls.find((c) => c[0] === 'allocation')![1] as WillPayload['allocation'];
    expect(allocation.specificGifts.some((g) => g.itemId === 'manual:x')).toBe(false);
  });
});
