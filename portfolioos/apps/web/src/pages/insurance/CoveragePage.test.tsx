// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defaultAssumptions, type CoverageFacts, type CoverageResponse } from '@everypaisa/shared';
import { CoveragePage } from './CoveragePage';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/api/insuranceCoverage.api', () => ({ insuranceCoverageApi: api }));
// The add-policy form has its own tests; here it only needs to open.
vi.mock('@/components/insurance/PolicyFormDialog', () => ({
  PolicyFormDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">Add policy form</div> : null),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function response(over: Partial<CoverageFacts> = {}): CoverageResponse {
  const facts: CoverageFacts = {
    asOf: '2026-09-11',
    figures: {
      monthlyIncome: '150000.0000',
      monthlyExpenses: '60000.0000',
      loansOutstanding: '3500000.0000',
      liquidAssets: '400000.0000',
      otherInvestments: '2000000.0000',
      lifeCover: '10000000.0000',
      healthCover: '500000.0000',
    },
    lifePolicyCount: 1,
    goals: [{ id: 'g1', name: 'College', category: 'CHILD_EDUCATION', remaining: '2500000.0000' }],
    healthPolicies: [
      { id: 'h1', insurer: 'Star Health', planName: 'Family Optima', sumAssured: '500000.0000', members: ['Self'], roomRent: null, coPay: null },
    ],
    vehicles: [
      { id: 'v2', label: 'Activa', registrationNo: 'MH01AB1234', insuranceExpiry: '2026-05-01', motorPolicy: null },
    ],
    properties: [],
    homePolicies: [],
    lapsed: [],
    ...over,
  };
  return { ...facts, defaults: defaultAssumptions(facts) };
}

function renderPage(data: CoverageResponse | Error = response()) {
  if (data instanceof Error) api.get.mockRejectedValue(data);
  else api.get.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CoveragePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const area = async (name: string) => screen.findByRole('region', { name });

describe('CoveragePage', () => {
  it('gives a verdict for each area', async () => {
    renderPage();
    expect(within(await area('Life cover')).getByText('Short')).toBeTruthy();
    expect(within(await area('Health cover')).getByText('Short')).toBeTruthy();
    expect(within(await area('Vehicles')).getByText('Missing')).toBeTruthy();
    expect(within(await area('Home')).getByText('Nothing to cover')).toBeTruthy();
  });

  it('shows the rule of thumb beside the needs-based estimate, labelled as one', async () => {
    renderPage();
    const life = await area('Life cover');
    expect(within(life).getByRole('heading', { name: 'Rule of thumb' })).toBeTruthy();
    expect(within(life).getByRole('heading', { name: 'Based on your needs' })).toBeTruthy();
    expect(within(life).getByText(/common rule of thumb, not a rule/)).toBeTruthy();
  });

  it('recomputes straight away when an assumption changes', async () => {
    renderPage();
    const life = await area('Life cover');
    fireEvent.change(within(life).getByLabelText('Years your family would need support'), { target: { value: '5' } });
    expect(within(life).getByText('Covered')).toBeTruthy();
  });

  it('says what to fix when an amount is not a number', async () => {
    renderPage();
    const life = await area('Life cover');
    fireEvent.change(within(life).getByLabelText('Loans outstanding'), { target: { value: 'lots' } });
    expect(within(life).getByText(/Enter an amount in rupees/)).toBeTruthy();
  });

  it('cites the law for vehicle insurance', async () => {
    renderPage();
    const vehicles = await area('Vehicles');
    expect(within(vehicles).getByText(/Registration records show its insurance ran out/)).toBeTruthy();
    const link = within(vehicles).getByRole('link', { name: /section 146/ });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.indiacode\.nic\.in\//);
  });

  it('asks about parents rather than assuming', async () => {
    renderPage();
    const health = await area('Health cover');
    expect(within(health).getByText(/Do your parents rely on you/)).toBeTruthy();
    fireEvent.click(within(health).getByRole('radio', { name: 'Yes' }));
    expect(within(health).getByText(/none of your health policies list a parent/)).toBeTruthy();
  });

  it('opens the add-policy form from a next step', async () => {
    renderPage();
    const life = await area('Life cover');
    fireEvent.click(within(life).getByRole('button', { name: 'Add a term policy' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('tells the user what to do when it cannot load', async () => {
    renderPage(new Error('Network down'));
    expect(await screen.findByText(/Couldn’t load your coverage/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
