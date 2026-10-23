// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import type { LoanDTO, LoanSummaryDTO } from '@/api/loans/loans.api';
import { CreateLoanDialog, LoanListPage } from './LoanListPage';

const api = vi.hoisted(() => ({ list: vi.fn(), getSummary: vi.fn(), create: vi.fn() }));
vi.mock('@/api/loans/loans.api', () => ({
  loansApi: { list: api.list, getSummary: api.getSummary, remove: vi.fn(), create: api.create, update: vi.fn() },
}));
vi.mock('@/api/loans/loansGiven.api', () => ({
  loansGivenApi: { list: vi.fn().mockResolvedValue([]) },
  LOANS_GIVEN_KEYS: [['loans-given'], ['dashboard']],
}));
vi.mock('@/components/reports/DownloadReportButton', () => ({ DownloadReportButton: () => null }));
vi.mock('./given/LoansGivenSection', () => ({ LoansGivenSection: () => null }));
vi.mock('@/components/common/InstitutionField', () => ({
  InstitutionField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Lender" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('@/components/common/PortfolioSelect', () => ({ PortfolioSelect: () => null }));
Element.prototype.scrollIntoView = vi.fn();

const base = {
  userId: 'u1', portfolioId: null, accountNumber: null, loanType: 'PERSONAL', borrowerName: 'Test Borrower',
  interestRate: '12', tenureMonths: 24, emiDueDay: 5, disbursementDate: '2026-01-01', firstEmiDate: '2026-02-05',
  prepaymentOption: 'REDUCE_TENURE', vehicleId: null, rentalPropertyId: null, taxBenefitSection: null,
  closedDate: null, payments: [], createdAt: '2026-01-01T00:00:00.000Z',
};
const ACTIVE = { ...base, id: 'a1', lenderName: 'Axis Bank', principalAmount: '500000', emiAmount: '23536.74', status: 'ACTIVE' } as unknown as LoanDTO;
const DEFAULTED = { ...base, id: 'd1', lenderName: 'Kotak Bank', principalAmount: '300000', emiAmount: '14122.04', status: 'DEFAULT' } as unknown as LoanDTO;

const summary = (outstanding: string): LoanSummaryDTO => ({
  outstandingBalance: outstanding, totalPrincipalPaid: '0', totalInterestPaid: '0', nextEmiDate: '2026-11-05',
  nextEmiAmount: '0', paidEmiCount: 0, scheduledEmiCount: 24, remainingEmiCount: 15, remainingTenureMonths: 15,
  totalInterestPayable: '0', effectiveEndDate: '2028-01-05', prepaymentSavings: null, taxBenefit: null,
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.list.mockResolvedValue([ACTIVE, DEFAULTED]);
  api.getSummary.mockImplementation((id: string) => Promise.resolve(summary(id === 'd1' ? '200000.00' : '350000.00')));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('a defaulted loan is still owed on the Loans page', () => {
  it('counts in the total owed and gets its own Defaulted group, not Closed', async () => {
    wrap(<LoanListPage />);
    // ₹3,50,000 active + ₹2,00,000 defaulted.
    expect(await screen.findByText(/5,50,000\.00/)).toBeTruthy();
    expect(screen.getByText('Defaulted · still owed')).toBeTruthy();
    expect(screen.queryByText('Closed / Foreclosed')).toBeNull();
    const card = await screen.findByRole('link', { name: 'Kotak Bank personal loan' });
    expect(within(card).getByText('Defaulted')).toBeTruthy();
    expect(await within(card).findByText(/2,00,000\.00/)).toBeTruthy();
  });
});

describe('the loan form shows the server reason', () => {
  it('surfaces a 422 body instead of "Request failed with status code 422"', async () => {
    api.create.mockRejectedValue(
      new AxiosError('Request failed with status code 422', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422, statusText: 'Unprocessable', headers: {}, config: { headers: new AxiosHeaders() },
        data: { success: false, error: 'EMI cannot exceed the loan amount' },
      }),
    );
    wrap(<CreateLoanDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Lender'), { target: { value: 'HDFC Bank' } });
    const typed = (placeholder: string, value: string) =>
      fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
    typed('Full name', 'Test Borrower');
    typed('1000000', '3000000');
    typed('8.50', '9.10');
    typed('240', '180');
    typed('9000', '30607');
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(dates[0]!, { target: { value: '2026-10-01' } });
    fireEvent.change(dates[1]!, { target: { value: '2026-11-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('EMI cannot exceed the loan amount')).toBeTruthy();
    expect(screen.queryByText(/status code 422/)).toBeNull();
  });
});
