// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LoanDTO, LoanSummaryDTO } from '@/api/loans.api';
import { LoanListPage } from './LoanListPage';

const api = vi.hoisted(() => ({ list: vi.fn(), getSummary: vi.fn(), remove: vi.fn() }));
vi.mock('@/api/loans.api', () => ({
  loansApi: { list: api.list, getSummary: api.getSummary, remove: api.remove, create: vi.fn(), update: vi.fn() },
}));
vi.mock('@/components/reports/DownloadReportButton', () => ({ DownloadReportButton: () => null }));
const givenApi = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/api/loansGiven.api', () => ({
  loansGivenApi: { list: givenApi.list },
  LOANS_GIVEN_KEYS: [['loans-given'], ['dashboard']],
}));
const scrollIntoView = vi.hoisted(() => vi.fn());
Element.prototype.scrollIntoView = scrollIntoView;

const GIVEN = {
  id: 'g1',
  borrowerName: 'Rahul Yadav',
  borrowerContact: null,
  relationship: 'FRIEND',
  principalAmount: '100000.0000',
  lentOn: '2026-08-01',
  interestRate: '0',
  dueDate: null,
  repaymentMode: 'EMI',
  emiAmount: '10000.0000',
  tenureMonths: 10,
  firstEmiDate: '2026-09-01',
  status: 'ACTIVE',
  closedOn: null,
  notes: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  entries: [],
  schedule: null,
  summary: {
    principalLent: '100000.0000',
    repaid: '10000.0000',
    waived: '0.0000',
    interestReceived: '0.0000',
    totalReceived: '10000.0000',
    outstandingPrincipal: '90000.0000',
    interestAccrued: null,
    interestDue: null,
    nextDue: { date: '2026-10-01', amount: '10000.0000' },
    overdueDays: 0,
    emi: { installmentsTotal: 10, installmentsPaid: 1, expectedTotal: '100000.0000', remainingToReceive: '90000.0000' },
  },
};

// ₹50L home loan from HDFC, 20 years, first EMI 5 Jun 2024; 28 EMIs paid.
const LOAN: LoanDTO = {
  id: 'loan1',
  userId: 'u1',
  portfolioId: null,
  lenderName: 'HDFC Bank',
  accountNumber: '660012345678',
  loanType: 'HOME',
  borrowerName: 'Het Kothari',
  principalAmount: '5000000',
  interestRate: '8.5',
  tenureMonths: 240,
  emiAmount: '43391.16',
  emiDueDay: 5,
  disbursementDate: '2024-05-10',
  firstEmiDate: '2024-06-05',
  prepaymentOption: 'REDUCE_TENURE',
  vehicleId: null,
  rentalPropertyId: null,
  taxBenefitSection: '80C+24B',
  status: 'ACTIVE',
  closedDate: null,
  payments: Array.from({ length: 28 }, (_, i) => ({
    id: `p${i}`,
    loanId: 'loan1',
    paymentType: 'EMI',
    paidOn: '2024-06-05',
    amount: '43391.16',
    principalPart: null,
    interestPart: null,
    forMonth: null,
    notes: null,
  })),
  createdAt: '2024-05-10T00:00:00.000Z',
};

const SUMMARY: LoanSummaryDTO = {
  outstandingBalance: '4523000.12',
  totalPrincipalPaid: '476999.88',
  totalInterestPaid: '738000.00',
  nextEmiDate: '2026-10-05',
  nextEmiAmount: '43391.16',
  paidEmiCount: 28,
  scheduledEmiCount: 240,
  remainingEmiCount: 212,
  remainingTenureMonths: 212,
  totalInterestPayable: '5413878.40',
  effectiveEndDate: '2044-05-05',
  prepaymentSavings: null,
  taxBenefit: null,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-10T06:00:00Z') });
  api.list.mockResolvedValue([LOAN]);
  api.getSummary.mockResolvedValue(SUMMARY);
  givenApi.list.mockResolvedValue([GIVEN]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(path = '/loans') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <Routes>
          <Route path="/loans" element={<LoanListPage />} />
          <Route path="/loans/:id" element={<div>LOAN DETAIL</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const findCard = () => screen.findByRole('link', { name: 'HDFC Bank home loan' });

function figure(card: HTMLElement, label: string): string {
  return within(card).getByText(label).nextElementSibling?.textContent ?? '';
}

describe('Loan card', () => {
  it("carries the lender's brand, logo, loan type and rate on its stub", async () => {
    renderPage();
    const card = await findCard();
    expect(within(card).getByRole('img', { name: 'HDFC Bank logo' })).toBeTruthy();
    expect(within(card).getByText('8.5')).toBeTruthy();
    expect(within(card).getByText('Home loan')).toBeTruthy();
    expect(within(card).getByText('Het Kothari, a/c ending 5678')).toBeTruthy();
  });

  it('leads with the outstanding balance and how much is repaid', async () => {
    renderPage();
    const card = await findCard();
    expect(within(card).getByText('Outstanding')).toBeTruthy();
    expect(await within(card).findByText(/45,23,000\.12/)).toBeTruthy();
    // 28 of the 240 scheduled EMIs paid.
    expect(within(card).getByRole('img', { name: '12% repaid' })).toBeTruthy();
  });

  it('tracks a 20-year loan in yearly blocks with an instalments-done bar', async () => {
    renderPage();
    const card = await findCard();
    await within(card).findByText(/45,23,000\.12/);
    expect(within(card).getByRole('img', { name: '12% repaid' }).children).toHaveLength(20);
    expect(within(card).getByText('Each block = 1 year')).toBeTruthy();
    const bar = within(card).getByRole('progressbar', { name: 'Instalments done' });
    expect(bar.getAttribute('aria-valuetext')).toBe('28 of 240 instalments done');
  });

  it('shows principal, tenure, EMI, next EMI, EMIs left and paid so far', async () => {
    renderPage();
    const card = await findCard();
    await within(card).findByText(/45,23,000\.12/);
    expect(figure(card, 'Principal')).toMatch(/50,00,000\.00/);
    expect(figure(card, 'Tenure')).toBe('240 months');
    expect(figure(card, 'EMI')).toMatch(/43,391\.16/);
    expect(figure(card, 'Next EMI')).toMatch(/05 Oct 2026/);
    expect(figure(card, 'EMIs left')).toBe('212');
    // Principal + interest paid to date, from the loan summary.
    expect(figure(card, 'Paid so far')).toMatch(/12,14,999\.88/);
  });

  it('has no coloured strip along its top edge', async () => {
    renderPage();
    const card = await findCard();
    expect(card.querySelector('[style*="border-top"]')).toBeNull();
  });

  it('opens from the keyboard', async () => {
    renderPage();
    fireEvent.keyDown(await findCard(), { key: 'Enter' });
    expect(await screen.findByText('LOAN DETAIL')).toBeTruthy();
  });

  it('delete asks for confirmation instead of opening the loan', async () => {
    renderPage();
    const card = await findCard();
    fireEvent.click(within(card).getByRole('button', { name: 'Delete loan' }));
    expect(screen.queryByText('LOAN DETAIL')).toBeNull();
    expect(screen.getByText('Delete "HDFC Bank" loan?')).toBeTruthy();
  });
});

describe('Loans page: taken and given together', () => {
  it('shows both sections, with an overview of each side', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: /Loans taken/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Loans given/ })).toBeTruthy();
    await findCard();
    expect(await screen.findByText('Rahul Yadav')).toBeTruthy();
    const owe = screen.getByRole('button', { name: /You owe/ });
    expect(await within(owe).findByText(/45,23,000.12/)).toBeTruthy();
    const owed = screen.getByRole('button', { name: /Owed to you/ });
    expect(within(owed).getByText(/90,000.00/)).toBeTruthy();
    expect(within(owed).getByText(/10,000.00/)).toBeTruthy();
  });

  it('jumps to the given section from the sticky switcher and remembers it in the URL', async () => {
    renderPage();
    await screen.findByText('Rahul Yadav');
    const nav = screen.getByRole('navigation', { name: 'Loan sections' });
    fireEvent.click(within(nav).getByRole('button', { name: /Given/ }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(document.getElementById('loans-given'));
    expect(within(nav).getByRole('button', { name: /Given/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('location').textContent).toBe('/loans?view=given');

    fireEvent.click(within(nav).getByRole('button', { name: /Taken/ }));
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(document.getElementById('loans-taken'));
    expect(screen.getByTestId('location').textContent).toBe('/loans');
  });

  it('opens on the given section for ?view=given links', async () => {
    renderPage('/loans?view=given');
    await screen.findByText('Rahul Yadav');
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(scrollIntoView.mock.contexts).toContain(document.getElementById('loans-given'));
    const nav = screen.getByRole('navigation', { name: 'Loan sections' });
    expect(within(nav).getByRole('button', { name: /Given/ }).getAttribute('aria-current')).toBe('true');
  });
});
