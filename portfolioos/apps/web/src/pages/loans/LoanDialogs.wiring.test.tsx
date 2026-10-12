// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LoanDTO } from '@/api/loans.api';
import { loansApi } from '@/api/loans.api';
import { CreateLoanDialog } from './LoanListPage';
import { EditLoanDialog } from './LoanDetailPage';

vi.mock('@/api/loans.api', () => ({ loansApi: { create: vi.fn(), update: vi.fn() } }));
vi.mock('@/components/common/InstitutionField', () => ({
  InstitutionField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Lender" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('@/components/common/PortfolioSelect', () => ({ PortfolioSelect: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const LOAN = {
  id: 'loan1', userId: 'u1', portfolioId: null, lenderName: 'HDFC Bank', accountNumber: null, loanType: 'HOME',
  borrowerName: 'Test Borrower', principalAmount: '3000000', interestRate: '9.10', tenureMonths: 180, emiAmount: '30607',
  emiDueDay: 5, disbursementDate: '2026-10-01', firstEmiDate: '2026-11-05', prepaymentOption: 'REDUCE_TENURE',
  vehicleId: null, rentalPropertyId: null, taxBenefitSection: null, status: 'ACTIVE', closedDate: null, payments: [],
  createdAt: '2026-10-01T00:00:00.000Z', rateType: 'UNKNOWN', rateBenchmark: null, nextRateResetDate: null,
} as unknown as LoanDTO;

function pickFloatingRepo(resetDate: string) {
  fireEvent.change(screen.getByLabelText('Rate type'), { target: { value: 'FLOATING' } });
  fireEvent.change(screen.getByLabelText('Linked to'), { target: { value: 'REPO' } });
  fireEvent.change(screen.getByLabelText('Next rate reset (optional)'), { target: { value: resetDate } });
}

const typed = (placeholder: string, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

describe('loan dialogs send the rate fields (final review)', () => {
  it('Add loan: create carries rateType, rateBenchmark and nextRateResetDate', async () => {
    vi.mocked(loansApi.create).mockResolvedValue(LOAN);
    wrap(<CreateLoanDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Lender'), { target: { value: 'HDFC Bank' } });
    typed('Full name', 'Test Borrower');
    typed('1000000', '3000000');
    typed('8.50', '9.10');
    typed('240', '180');
    typed('9000', '30607');
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(dates[0]!, { target: { value: '2026-10-01' } });
    fireEvent.change(dates[1]!, { target: { value: '2026-11-05' } });
    pickFloatingRepo('2027-01-01');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(loansApi.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(loansApi.create).mock.calls[0]![0]).toMatchObject({
      lenderName: 'HDFC Bank', rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01',
    });
  });

  it('Edit from the loan list: update carries the rate fields', async () => {
    vi.mocked(loansApi.update).mockResolvedValue(LOAN);
    wrap(<CreateLoanDialog open onOpenChange={() => {}} initial={LOAN} />);
    pickFloatingRepo('2027-02-01');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(loansApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(loansApi.update).mock.calls[0]![0]).toBe('loan1');
    expect(vi.mocked(loansApi.update).mock.calls[0]![1]).toMatchObject({
      rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-02-01',
    });
  });

  it('Edit on the loan page: update carries the rate fields; switching to Fixed sends nulls', async () => {
    vi.mocked(loansApi.update).mockResolvedValue(LOAN);
    const floating = { ...LOAN, rateType: 'FLOATING', rateBenchmark: 'MCLR', nextRateResetDate: '2027-04-01' } as unknown as LoanDTO;
    wrap(<EditLoanDialog open onOpenChange={() => {}} loan={floating} />);
    fireEvent.change(screen.getByLabelText('Rate type'), { target: { value: 'FIXED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(loansApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(loansApi.update).mock.calls[0]![1]).toMatchObject({
      rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null,
    });
  });

  it('Edit on the loan page: floating with a benchmark and reset date', async () => {
    vi.mocked(loansApi.update).mockResolvedValue(LOAN);
    wrap(<EditLoanDialog open onOpenChange={() => {}} loan={LOAN} />);
    pickFloatingRepo('2027-03-01');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(loansApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(loansApi.update).mock.calls[0]![1]).toMatchObject({
      rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-03-01',
    });
  });
});
