// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InsurancePolicyDTO } from '@/api/insurance.api';
import { InsuranceListPage } from './InsuranceListPage';

const api = vi.hoisted(() => ({
  listPolicies: vi.fn(),
  deletePolicy: vi.fn(),
  revealPolicyNumber: vi.fn(),
  addPremium: vi.fn(),
}));
vi.mock('@/api/insurance.api', () => ({ insuranceApi: api }));
vi.mock('@/components/reports/DownloadReportButton', () => ({ DownloadReportButton: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makePolicy(over: Partial<InsurancePolicyDTO>): InsurancePolicyDTO {
  return {
    id: 'p',
    userId: 'u1',
    portfolioId: null,
    insurer: 'LIC',
    policyNumberLast4: '2345',
    hasPolicyNumber: true,
    type: 'TERM',
    planName: 'Tech Term',
    policyHolder: 'TEST USER',
    nominees: [{ name: 'Asha', relation: 'Spouse', sharePercent: 100 }],
    contacts: null,
    sumAssured: '10000000',
    premiumAmount: '12000',
    premiumFrequency: 'ANNUAL',
    startDate: '2020-10-01',
    maturityDate: '2055-10-01',
    nextPremiumDue: '2027-10-01',
    premiumsTrackedFrom: '2026-10-01',
    gracePeriodDays: null,
    graceDays: 30,
    premiumDue: { dueDate: '2027-10-01', state: 'UPCOMING', daysUntilDue: 385, graceEndsOn: '2027-10-31', daysLeftInGrace: null },
    vehicleId: null,
    vehicle: null,
    healthCoverDetails: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function renderPage(policies: InsurancePolicyDTO[]) {
  api.listPolicies.mockResolvedValue(policies);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <InsuranceListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InsuranceListPage', () => {
  it('lists an overdue premium in Coming up with what to do', async () => {
    renderPage([
      makePolicy({ id: 'a' }),
      makePolicy({
        id: 'b',
        insurer: 'Star Health',
        type: 'HEALTH',
        planName: 'Family Optima',
        premiumAmount: '24000',
        premiumDue: { dueDate: '2026-09-01', state: 'IN_GRACE', daysUntilDue: -10, graceEndsOn: '2026-10-01', daysLeftInGrace: 20 },
      }),
    ]);

    const panel = (await screen.findByRole('heading', { name: 'Coming up' })).closest('div')!.parentElement!;
    expect(within(panel).getByText('Overdue — 20 days of grace left')).toBeTruthy();
    expect(within(panel).getByText(/Pay by 1 Oct 2026/)).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Record payment' })).toBeTruthy();
    // The upcoming LIC premium isn't urgent, so it isn't listed.
    expect(within(panel).queryByText(/Tech Term/)).toBeNull();
  });

  it('says so when nothing is due', async () => {
    renderPage([makePolicy({ id: 'a' })]);
    expect(await screen.findByText(/Nothing due in the next 30 days/)).toBeTruthy();
  });

  it('nudges about a life policy with no nominee', async () => {
    renderPage([makePolicy({ id: 'a', nominees: null })]);
    expect(await screen.findByText(/has no nominee recorded/)).toBeTruthy();
  });

  it('shows only the last 4 of the policy number', async () => {
    renderPage([makePolicy({ id: 'a' })]);
    await screen.findByText('Tech Term');
    expect(screen.getByText('2345', { exact: false })).toBeTruthy();
    expect(api.revealPolicyNumber).not.toHaveBeenCalled();
  });
});
