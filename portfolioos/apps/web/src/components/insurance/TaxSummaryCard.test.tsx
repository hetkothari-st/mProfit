// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildTaxSummary, type TaxPolicyInput } from '@portfolioos/shared';
import { TaxSummaryCard } from './TaxSummaryCard';

const api = vi.hoisted(() => ({ taxSummary: vi.fn(), updatePolicy: vi.fn() }));
vi.mock('@/api/insurance.api', () => ({ insuranceApi: api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const base: TaxPolicyInput = {
  id: 'life',
  insurer: 'LIC',
  planName: 'Jeevan Anand',
  type: 'ENDOWMENT',
  status: 'ACTIVE',
  sumAssured: '300000',
  premiumAmount: '40000',
  premiumFrequency: 'ANNUAL',
  startDate: '2020-05-01',
  taxBucket: null,
  seniorCitizen: null,
};
const policies: TaxPolicyInput[] = [
  base,
  { ...base, id: 'h1', insurer: 'Star Health', planName: 'Family Optima', type: 'HEALTH', premiumAmount: '30000' },
];
const payments = [
  { policyId: 'life', paidOn: '2026-05-02', amount: '40000', periodFrom: '2026-05-01', periodTo: '2027-05-01' },
  { policyId: 'h1', paidOn: '2026-07-01', amount: '30000', periodFrom: '2026-07-01', periodTo: '2027-07-01' },
];

function renderCard() {
  api.taxSummary.mockImplementation(async (fy: string) => buildTaxSummary(fy, policies, payments));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaxSummaryCard today="2026-09-11" />
    </QueryClientProvider>,
  );
}

describe('TaxSummaryCard', () => {
  it('says the deductions are for the old regime only, with the source', async () => {
    renderCard();
    expect(await screen.findByText('Only if you choose the old regime.')).toBeTruthy();
    expect(api.taxSummary).toHaveBeenCalledWith('2026-27');
  });

  it('caps a life premium at 10% of the sum assured', async () => {
    renderCard();
    expect(await screen.findByText('Only ₹30,000 counts — 10% of the sum assured.')).toBeTruthy();
  });

  it('asks who a health policy covers, and saves the answer', async () => {
    api.updatePolicy.mockResolvedValue({});
    renderCard();
    expect(await screen.findByText('Say who each policy covers to count it.')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Who Star Health — Family Optima covers' }), {
      target: { value: 'PARENTS' },
    });
    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalledWith('h1', { taxBucket: 'PARENTS' }));

    fireEvent.click(screen.getByRole('checkbox', { name: /senior citizen/i }));
    await waitFor(() => expect(api.updatePolicy).toHaveBeenCalledWith('h1', { seniorCitizen: true }));
  });

  it('explains that years before 2026-27 fall under the old Act', async () => {
    renderCard();
    await screen.findByText('Only ₹30,000 counts — 10% of the sum assured.');
    fireEvent.change(screen.getByRole('combobox', { name: 'Financial year' }), { target: { value: '2025-26' } });
    expect(await screen.findByText(/Income-tax Act, 1961/)).toBeTruthy();
  });
});
