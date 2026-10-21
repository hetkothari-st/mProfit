// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { emptyWillPayload, runWillRules } from '@everypaisa/shared';
import { DetailsStep } from './DetailsStep';
import type { WillStepProps } from './types';
import { fullPayload, TODAY } from '../willTestData';

afterEach(cleanup);

function props(over: Partial<WillStepProps> = {}): WillStepProps {
  const payload = over.payload ?? emptyWillPayload();
  return {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide: true,
    update: vi.fn(), refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(), reload: vi.fn(async () => undefined), ...over,
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

  it('saves the optional "son of / wife of" description, and keeps the name field off until a relation is chosen', () => {
    const p = props();
    render(<DetailsStep {...p} />);
    const name = screen.getByLabelText(/father's, mother's or spouse's full name/i) as HTMLInputElement;
    expect(name.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/described as/i), { target: { value: 'DAUGHTER_OF' } });
    expect(p.update).toHaveBeenLastCalledWith('details', expect.objectContaining({ parentage: { relation: 'DAUGHTER_OF', name: '' } }));
    cleanup();
    const payload = emptyWillPayload();
    payload.details.parentage = { relation: 'SON_OF', name: '' };
    const q = props({ payload });
    render(<DetailsStep {...q} />);
    fireEvent.change(screen.getByLabelText(/father's, mother's or spouse's full name/i), { target: { value: 'Mohan Lal Verma' } });
    expect(q.update).toHaveBeenLastCalledWith('details', expect.objectContaining({ parentage: { relation: 'SON_OF', name: 'Mohan Lal Verma' } }));
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

  it('shows other step-2 findings such as the adult check, and bounds the date of birth', () => {
    const payload = fullPayloadUnder18();
    render(<DetailsStep {...props({ payload })} />);
    expect(screen.getByText(/18 or older|at least 18|under 18/i)).toBeTruthy();
    const dob = screen.getByLabelText(/date of birth/i) as HTMLInputElement;
    expect(dob.min).toBe('1900-01-01');
    expect(dob.max).toBe(TODAY);
  });
});

function fullPayloadUnder18() {
  const payload = fullPayload();
  payload.details.dob = '2015-01-01';
  return payload;
}
