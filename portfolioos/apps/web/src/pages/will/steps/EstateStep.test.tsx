// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { runWillRules, type WillPayload } from '@everypaisa/shared';
import { EstateStep } from './EstateStep';
import type { WillStepProps } from './types';
import { fullPayload, item, TODAY } from '../willTestData';

afterEach(cleanup);

function setup(payload: WillPayload = fullPayload(), wide = true, refreshOk = true) {
  const p: WillStepProps = {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide, update: vi.fn(),
    refreshEstate: vi.fn(async (): Promise<boolean | undefined> => (refreshOk ? undefined : false)), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(),
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

  it('leaves excluded items out of the totals and lists nominee-only money separately', () => {
    const payload = fullPayload();
    payload.estate.items[0]!.review = 'EXCLUDED';
    payload.estate.items.push(item({ sourceKey: 'ins:1', kind: 'INSURANCE', label: 'Term cover', value: '300000.00', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } }));
    setup(payload);
    expect(screen.getByTestId('estate-net').textContent).toContain('11,00,000');
    expect(screen.getByText(/paid to nominees and not counted: .*3,00,000/i)).toBeTruthy();
  });

  it('names the sources that could not be read', () => {
    const payload = fullPayload();
    payload.estate.failedSources = ['bankAccounts', 'loans'];
    setup(payload);
    expect(screen.getByText(/could not read your bank accounts, loans/i)).toBeTruthy();
  });

  it('can include an excluded item again and confirm a stale one', () => {
    const payload = fullPayload();
    payload.estate.items[0]!.review = 'EXCLUDED';
    payload.estate.items[1]!.review = 'STALE';
    const p = setup(payload, false);
    fireEvent.click(within(screen.getByTestId('estate-item-bank:b1')).getByRole('button', { name: /include/i }));
    expect(lastEstate(p).items[0]!.review).toBe('CONFIRMED');
    fireEvent.click(within(screen.getByTestId('estate-item-holdings:pf1:EQUITY')).getByRole('button', { name: /confirm/i }));
    expect(lastEstate(p).items[1]!.review).toBe('CONFIRMED');
  });

  it('offers a retry when the first fetch fails', async () => {
    const payload = fullPayload();
    payload.estate.asOf = null;
    const p = setup(payload, true, false);
    expect(await screen.findByText(/could not fetch your assets\. try again/i)).toBeTruthy();
    expect(screen.queryByText(/fetching your assets/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
    await waitFor(() => expect(p.refreshEstate).toHaveBeenCalledTimes(2));
  });

  it('shows the owned share of a joint item, and warns when excluding an item that has gifts', () => {
    const payload = fullPayload();
    payload.estate.items[0] = { ...payload.estate.items[0]!, ownership: { type: 'JOINT', sharePct: '50' } };
    payload.estate.items[1]!.review = 'EXCLUDED';
    setup(payload, false);
    expect(within(screen.getByTestId('estate-item-bank:b1')).getByText(/50% share of .*2,50,000/)).toBeTruthy();
    expect(within(screen.getByTestId('estate-item-holdings:pf1:EQUITY')).getByText(/has gifts in step 5/i)).toBeTruthy();
  });

  it('edits the value of a manual item, and rejects zero', () => {
    const payload = fullPayload();
    payload.estate.items.push(item({ sourceKey: 'manual:x', kind: 'OTHER_ASSET', label: 'Painting', value: '5000' }));
    const p = setup(payload, false);
    fireEvent.click(within(screen.getByTestId('estate-item-manual:x')).getByRole('button', { name: /edit value/i }));
    const input = screen.getByLabelText(/value of painting/i);
    fireEvent.change(input, { target: { value: '0' } });
    expect(vi.mocked(p.update)).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '7500' } });
    expect(lastEstate(p).items.find((i) => i.sourceKey === 'manual:x')!.value).toBe('7500');
  });
});
