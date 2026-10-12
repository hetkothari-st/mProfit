// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { runWillRules, type WillFinding, type WillPayload } from '@everypaisa/shared';
import { ReviewStep } from './ReviewStep';
import type { WillStepProps } from './types';
import { fullPayload, TODAY } from '../willTestData';

afterEach(cleanup);

function setup(payload: WillPayload) {
  const goTo = vi.fn();
  const p: WillStepProps = {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide: true, update: vi.fn(),
    refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 0, goTo,
  };
  render(<ReviewStep {...p} />);
  return goTo;
}

describe('ReviewStep', () => {
  it('a complete will is ready, with every check OK and the legal-review box', () => {
    setup(fullPayload());
    expect(screen.getByText(/ready to preview/i)).toBeTruthy();
    expect(screen.getByTestId('check-RESIDUARY_SUMS_100').textContent).toContain('OK');
    expect(screen.getByTestId('check-EXECUTOR_APPOINTED').textContent).toContain('OK');
    expect(screen.getByText(/legal review recommended/i)).toBeTruthy();
    expect(screen.getByText(/not legal advice/i)).toBeTruthy();
    expect(screen.getByTestId('review-net').textContent).toContain('13,50,000');
  });

  it('lists blockers with a link to the step that fixes them', () => {
    const payload = fullPayload();
    payload.roles.executorId = null;
    const goTo = setup(payload);
    expect(screen.getByText(/1 thing to fix before you can preview/i)).toBeTruthy();
    const row = screen.getByTestId('check-EXECUTOR_APPOINTED');
    expect(row.textContent).toContain('Choose an executor');
    fireEvent.click(within(row).getByRole('button', { name: /fix/i }));
    expect(goTo).toHaveBeenCalledWith(3);
  });

  it('shows a finding from an unknown rule id and counts it as a blocker', () => {
    const goTo = vi.fn();
    const payload = fullPayload();
    const findings: WillFinding[] = [{ ruleId: 'RULE_ERROR', severity: 'BLOCKER', step: 2, message: 'A check could not run', refs: [] }];
    render(<ReviewStep willId="w1" payload={payload} findings={findings} today={TODAY} wide update={vi.fn()}
      refreshEstate={vi.fn()} flush={vi.fn(async () => true)} getRevision={() => 0} goTo={goTo} />);
    expect(screen.getByText(/1 thing to fix/i)).toBeTruthy();
    const row = screen.getByTestId('check-RULE_ERROR');
    expect(row.textContent).toContain('A check could not run');
    fireEvent.click(within(row).getByRole('button', { name: /fix/i }));
    expect(goTo).toHaveBeenCalledWith(2);
  });

  it('colours a check by the severity of its actual hits, not the rule default', () => {
    const payload = fullPayload();
    const findings: WillFinding[] = [
      { ruleId: 'ESTATE_STALE', severity: 'BLOCKER', step: 4, message: 'Out of date', refs: [] },
      { ruleId: 'MYSTERY_RULE', severity: 'WARNING', step: 4, message: 'Odd', refs: [] },
    ];
    render(<ReviewStep willId="w1" payload={payload} findings={findings} today={TODAY} wide update={vi.fn()}
      refreshEstate={vi.fn()} flush={vi.fn(async () => true)} getRevision={() => 0} goTo={vi.fn()} />);
    expect(screen.getByTestId('check-ESTATE_STALE').querySelector('svg')!.getAttribute('class')).toContain('text-negative');
    const unknownIcon = screen.getByTestId('check-MYSTERY_RULE').querySelector('svg')!;
    expect(unknownIcon.getAttribute('class')).toContain('text-warning');
    expect(unknownIcon.getAttribute('class')).toContain('lucide-triangle-alert');
  });
});
