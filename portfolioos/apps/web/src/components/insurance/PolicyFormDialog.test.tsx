// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InsurancePolicyDTO } from '@/api/insurance/insurance.api';
import { PolicyFormDialog } from './PolicyFormDialog';

const api = vi.hoisted(() => ({ updatePolicy: vi.fn(), createPolicy: vi.fn(), approveDocument: vi.fn() }));
vi.mock('@/api/insurance/insurance.api', () => ({ insuranceApi: api }));
vi.mock('@/api/documents.api', () => ({ documentsApi: { upload: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const policy = {
  id: 'pol1',
  userId: 'u1',
  portfolioId: null,
  insurer: 'LIC',
  policyNumberLast4: '5678',
  hasPolicyNumber: true,
  type: 'ENDOWMENT',
  planName: null,
  policyHolder: 'Test Holder',
  nominees: null,
  contacts: null,
  sumAssured: '500000',
  premiumAmount: '24000',
  premiumFrequency: 'ANNUAL',
  startDate: '2010-04-10T00:00:00.000Z',
  maturityDate: null,
  nextPremiumDue: null,
  premiumsTrackedFrom: null,
  gracePeriodDays: null,
  graceDays: 30,
  premiumDue: { dueDate: null } as unknown as InsurancePolicyDTO['premiumDue'],
  vehicleId: null,
  healthCoverDetails: null,
  status: 'ACTIVE',
  createdAt: '2024-01-01T00:00:00.000Z',
} as InsurancePolicyDTO;

describe('PolicyFormDialog status', () => {
  it('lets an existing policy be marked matured, and saves it', async () => {
    api.updatePolicy.mockResolvedValue({ ...policy, status: 'MATURED' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PolicyFormDialog open onOpenChange={() => {}} initial={policy} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'MATURED' } });
    expect(screen.getByText(/No premium reminders/)).toBeTruthy();
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalled());
    expect(api.updatePolicy.mock.calls[0]![1]).toMatchObject({ status: 'MATURED' });
  });
});
