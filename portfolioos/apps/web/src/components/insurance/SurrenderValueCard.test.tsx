// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { premiumDueOn } from '@everypaisa/shared';
import type { InsurancePolicyDTO } from '@/api/insurance.api';
import { SurrenderValueCard } from './SurrenderValueCard';

const api = vi.hoisted(() => ({ updatePolicy: vi.fn() }));
vi.mock('@/api/insurance.api', () => ({ insuranceApi: api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makePolicy(over: Partial<InsurancePolicyDTO> = {}): InsurancePolicyDTO {
  return {
    id: 'pol1',
    userId: 'u1',
    portfolioId: null,
    insurer: 'LIC',
    policyNumberLast4: '4321',
    hasPolicyNumber: true,
    type: 'ENDOWMENT',
    planName: 'Jeevan Anand',
    policyHolder: 'Het Kothari',
    nominees: null,
    contacts: null,
    sumAssured: '1000000',
    premiumAmount: '100000',
    premiumFrequency: 'ANNUAL',
    startDate: '2024-08-01',
    maturityDate: null,
    nextPremiumDue: '2026-08-01',
    premiumsTrackedFrom: '2024-08-01',
    gracePeriodDays: null,
    graceDays: 30,
    premiumDue: premiumDueOn('2026-08-01', { today: '2026-09-11', graceDays: 30 }),
    vehicleId: null,
    healthCoverDetails: null,
    taxBucket: null,
    seniorCitizen: null,
    surrenderValue: '150000',
    surrenderValueAsOf: '2026-09-01',
    status: 'ACTIVE',
    createdAt: '2024-08-01T00:00:00.000Z',
    premiumHistory: [
      { id: 'p1', policyId: 'pol1', paidOn: '2024-08-01', amount: '100000', periodFrom: '2024-08-01', periodTo: '2025-08-01', canonicalEventId: null },
      { id: 'p2', policyId: 'pol1', paidOn: '2025-08-01', amount: '100000', periodFrom: '2025-08-01', periodTo: '2026-08-01', canonicalEventId: null },
    ],
    ...over,
  };
}

function renderCard(policy: InsurancePolicyDTO) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SurrenderValueCard policy={policy} today="2026-09-11" />
    </QueryClientProvider>,
  );
}

describe('SurrenderValueCard', () => {
  it('shows what surrendering would lose against the premiums paid', () => {
    renderCard(makePolicy());
    expect(screen.getByText('₹2,00,000')).toBeTruthy();
    expect(screen.getByText('You’d lose')).toBeTruthy();
    expect(screen.getByText('₹50,000')).toBeTruthy();
    expect(screen.getByText('(25.0%)')).toBeTruthy();
  });

  it('quotes the 7-day payout rule with its IRDAI source', () => {
    renderCard(makePolicy());
    expect(screen.getByText(/within 7 days of receiving your request/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /IRDAI, page 15/ }).length).toBeGreaterThan(0);
  });

  it('saves a new quote', async () => {
    api.updatePolicy.mockResolvedValue({});
    renderCard(makePolicy());
    fireEvent.click(screen.getByRole('button', { name: 'Update quote' }));
    fireEvent.change(screen.getByLabelText('Quoted value (₹)'), { target: { value: '1,60,000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.updatePolicy).toHaveBeenCalledWith('pol1', { surrenderValue: '160000', surrenderValueAsOf: '2026-09-01' }),
    );
  });

  it('warns about the lock-in on a young ULIP', () => {
    renderCard(makePolicy({ type: 'ULIP' }));
    expect(screen.getByText(/In its lock-in until 1 Aug 2029/)).toBeTruthy();
  });

  it('is not shown for a term plan', () => {
    const { container } = renderCard(makePolicy({ type: 'TERM' }));
    expect(container.textContent).toBe('');
  });
});
