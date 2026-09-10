// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LoanDTO, LoanSummaryDTO } from '@/api/loans.api';
import { LoanListPage } from './LoanListPage';

const api = vi.hoisted(() => ({ list: vi.fn(), getSummary: vi.fn(), remove: vi.fn() }));
vi.mock('@/api/loans.api', () => ({
  loansApi: { list: api.list, getSummary: api.getSummary, remove: api.remove, create: vi.fn(), update: vi.fn() },
}));
vi.mock('@/components/reports/DownloadReportButton', () => ({ DownloadReportButton: () => null }));

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
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/loans']}>
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
    // 28 paid of 28 + 212 remaining.
    expect(within(card).getByRole('img', { name: '12% repaid' })).toBeTruthy();
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
