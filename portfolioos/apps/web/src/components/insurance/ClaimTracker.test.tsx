// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { claimProgress } from '@portfolioos/shared';
import type { InsuranceClaimDTO } from '@/api/insurance.api';
import { ClaimTracker } from './ClaimTracker';

const api = vi.hoisted(() => ({ updateClaim: vi.fn(), removeClaim: vi.fn() }));
vi.mock('@/api/insurance.api', () => ({ insuranceApi: api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeClaim(over: Partial<InsuranceClaimDTO>): InsuranceClaimDTO {
  const base: Omit<InsuranceClaimDTO, 'progress'> = {
    id: 'c1',
    policyId: 'pol1',
    claimNumber: 'CLM-77',
    claimDate: '2026-08-01',
    claimType: 'Hospitalisation',
    claimedAmount: '100000',
    settledAmount: null,
    status: 'REJECTED',
    settledOn: '2026-08-20',
    documents: null,
    kind: 'HEALTH_REIMBURSEMENT',
    documentsCompletedOn: '2026-08-01',
    surveyorAllocatedOn: null,
    checklist: null,
    timeline: [{ on: '2026-08-05', note: 'Sent the bills by courier' }],
    rejectionReason: 'Pre-existing disease',
    grievanceFiledOn: null,
    grievanceRef: null,
    ombudsmanFiledOn: null,
    ombudsmanRef: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...over,
  };
  return { ...base, progress: claimProgress(base, '2026-09-11') };
}

function renderTracker(claim: InsuranceClaimDTO) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClaimTracker claim={claim} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ClaimTracker', () => {
  it('after a rejection, says to complain and shows where', () => {
    renderTracker(makeClaim({}));
    expect(screen.getByText('Next: raise a complaint')).toBeTruthy();
    expect(screen.getByText('Pre-existing disease')).toBeTruthy();
    expect(screen.getByRole('link', { name: '155255' }).getAttribute('href')).toBe('tel:155255');
    expect(screen.getByRole('link', { name: 'cioins.co.in' })).toBeTruthy();
  });

  it('saves a ticked-off document', async () => {
    api.updateClaim.mockResolvedValue({});
    renderTracker(makeClaim({ status: 'SUBMITTED', settledOn: null, rejectionReason: null }));

    fireEvent.click(screen.getByRole('checkbox', { name: /claim form, signed/i }));

    await waitFor(() => expect(api.updateClaim).toHaveBeenCalledWith('c1', { checklist: { claim_form: true } }));
  });

  it('adds a note to the log, keeping the earlier ones', async () => {
    api.updateClaim.mockResolvedValue({});
    renderTracker(makeClaim({}));

    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Called the TPA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => expect(api.updateClaim).toHaveBeenCalled());
    const [, input] = api.updateClaim.mock.calls[0]!;
    expect(input.timeline).toEqual([
      { on: '2026-08-05', note: 'Sent the bills by courier' },
      expect.objectContaining({ note: 'Called the TPA' }),
    ]);
  });

  it('once settled in full, has nothing more to do', () => {
    renderTracker(makeClaim({ status: 'SETTLED', settledAmount: '100000', rejectionReason: null }));
    expect(screen.getByText('Settled in full.')).toBeTruthy();
    expect(screen.queryByText(/Bima Bharosa/)).toBeNull();
  });
});
