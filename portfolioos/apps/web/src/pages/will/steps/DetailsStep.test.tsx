// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { emptyWillPayload, runWillRules } from '@everypaisa/shared';
import { DetailsStep } from './DetailsStep';
import type { WillStepProps } from './types';
import { TODAY } from '../willTestData';

afterEach(cleanup);

function props(over: Partial<WillStepProps> = {}): WillStepProps {
  const payload = over.payload ?? emptyWillPayload();
  return {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide: true,
    update: vi.fn(), refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(), ...over,
  };
}

describe('DetailsStep', () => {
  it('updates the details section as the user types', () => {
    const p = props();
    render(<DetailsStep {...p} />);
    fireEvent.change(screen.getByLabelText(/full legal name/i), { target: { value: 'Asha Rao' } });
    expect(p.update).toHaveBeenCalledWith('details', expect.objectContaining({ legalName: 'Asha Rao' }));
    fireEvent.change(screen.getByLabelText(/children/i), { target: { value: 'yes' } });
    expect(p.update).toHaveBeenLastCalledWith('details', expect.objectContaining({ hasChildren: true }));
  });

  it('explains Muslim personal law and other countries', () => {
    const payload = emptyWillPayload();
    payload.details.personalLaw = 'MUSLIM';
    payload.details.jurisdiction = 'OTHER';
    render(<DetailsStep {...props({ payload })} />);
    expect(screen.getAllByText(/one-third of the estate/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/under Indian law only/i).length).toBeGreaterThan(0);
  });

  it('lists what is still missing', () => {
    render(<DetailsStep {...props()} />);
    expect(screen.getByText(/fill in your full legal name/i)).toBeTruthy();
  });
});
