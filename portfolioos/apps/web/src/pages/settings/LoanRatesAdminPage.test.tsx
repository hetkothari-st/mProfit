// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import type { AdminLoanRateSourceWire, AuthUser, LoanRateReadingWire } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { useAuthStore } from '@/stores/auth.store';
import { loanRatesAdminApi } from '@/api/loanRates.api';
import { LoanRatesAdminPage } from './LoanRatesAdminPage';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/loanRates.api', () => ({
  loanRatesAdminApi: { list: vi.fn(), setManual: vi.fn(), clearManual: vi.fn(), approve: vi.fn(), reject: vi.fn(), run: vi.fn() },
}));

function makeUser(role: AuthUser['role']): AuthUser {
  return { id: 'u1', email: 'a@b.com', name: 'Admin', role, plan: 'FREE', isActive: true, createdAt: new Date().toISOString() };
}

const reading = (over: Partial<LoanRateReadingWire>): LoanRateReadingWire => ({
  id: 'r1', sourceId: 'hdfc.home', basis: 'REPO_LINKED', tenor: null, minRatePct: '8.00', maxRatePct: '13.45', effectiveDate: null,
  fetchedAt: '2026-10-12T02:00:00.000Z', origin: 'AUTO', status: 'ACTIVE', note: null, sourceAdapter: 'hdfc.home', sourceAdapterVer: '1', ...over,
});

const SOURCES: AdminLoanRateSourceWire[] = [
  {
    id: 'hdfc.home', lender: 'HDFC Bank', loanType: 'HOME', url: 'https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates',
    mode: 'AUTO', adapter: 'hdfc.home', adapterVer: '1', lastSuccessAt: '2026-10-12T02:00:00.000Z', lastErrorAt: null, lastError: null, stale: false,
    keys: [{
      tenor: null,
      effective: reading({ id: 'm1', origin: 'MANUAL', minRatePct: '7.95', maxRatePct: null, note: 'Branch confirmed' }),
      latestAuto: reading({}),
      manual: reading({ id: 'm1', origin: 'MANUAL', minRatePct: '7.95', maxRatePct: null, note: 'Branch confirmed' }),
      differs: true,
    }],
    suspects: [reading({ id: 's1', minRatePct: '11.00', status: 'SUSPECT', note: 'JUMP' })],
  },
  {
    id: 'sbi.mclr', lender: 'SBI', loanType: 'MCLR', url: 'https://sbi.bank.in/web/interest-rates/interest-rates/mclr',
    mode: 'AUTO', adapter: 'sbi.rates', adapterVer: '1', lastSuccessAt: null, lastErrorAt: '2026-10-12T02:00:00.000Z', lastError: 'No reading for sbi.mclr', stale: true,
    keys: [], suspects: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loanRatesAdminApi.list).mockResolvedValue(SOURCES);
  useAuthStore.setState({ user: makeUser('ADMIN') });
});
afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
});

describe('LoanRatesAdminPage', () => {
  it('non-admins see a notice and nothing is requested', () => {
    useAuthStore.setState({ user: makeUser('INVESTOR') });
    renderWithProviders(<LoanRatesAdminPage />);
    expect(screen.getByText('Admins only.')).toBeTruthy();
    expect(loanRatesAdminApi.list).not.toHaveBeenCalled();
  });

  it('shows the override beside the bank figure, flags the difference, the stale source and its error', async () => {
    renderWithProviders(<LoanRatesAdminPage />);
    const key = await screen.findByTestId('key-hdfc.home-none');
    expect(key.textContent).toContain('7.95');
    expect(key.textContent).toContain('8.00% - 13.45%');
    expect(key.textContent).toContain('Differs from the bank page');
    const sbi = screen.getByTestId('source-sbi.mclr');
    expect(within(sbi).getByText('Stale')).toBeTruthy();
    expect(sbi.textContent).toContain('No reading for sbi.mclr');
    expect(sbi.textContent).toContain('never');
  });

  it('approves and rejects suspect readings', async () => {
    vi.mocked(loanRatesAdminApi.approve).mockResolvedValue(reading({ id: 's1', status: 'ACTIVE' }));
    renderWithProviders(<LoanRatesAdminPage />);
    const suspect = await screen.findByTestId('suspect-s1');
    fireEvent.click(within(suspect).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(loanRatesAdminApi.approve).toHaveBeenCalledWith('s1'));
    fireEvent.click(within(suspect).getByRole('button', { name: 'Reject' }));
    expect(loanRatesAdminApi.reject).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(loanRatesAdminApi.reject).toHaveBeenCalledWith('s1'));
  });

  it('sets an MCLR rate with its tenor, clears an override, and runs one source', async () => {
    vi.mocked(loanRatesAdminApi.setManual).mockResolvedValue(reading({ origin: 'MANUAL' }));
    vi.mocked(loanRatesAdminApi.clearManual).mockResolvedValue(1);
    vi.mocked(loanRatesAdminApi.run).mockResolvedValue(undefined);
    renderWithProviders(<LoanRatesAdminPage />);

    const sbi = await screen.findByTestId('source-sbi.mclr');
    fireEvent.click(within(sbi).getByRole('button', { name: 'Set rate' }));
    const form = screen.getByTestId('manual-form-sbi.mclr');
    fireEvent.change(within(form).getByLabelText('Tenor'), { target: { value: '6M' } });
    fireEvent.change(within(form).getByLabelText('From (% p.a.)'), { target: { value: '8.60' } });
    fireEvent.change(within(form).getByLabelText('With effect from (optional)'), { target: { value: '2026-09-15' } });
    fireEvent.change(within(form).getByLabelText('Note (where this rate comes from)'), { target: { value: 'SBI MCLR notice' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save rate' }));
    await waitFor(() => expect(loanRatesAdminApi.setManual).toHaveBeenCalledWith('sbi.mclr', {
      basis: 'MCLR', tenor: '6M', minRatePct: '8.60', maxRatePct: null, effectiveDate: '2026-09-15', note: 'SBI MCLR notice',
    }));

    fireEvent.click(within(screen.getByTestId('key-hdfc.home-none')).getByRole('button', { name: 'Clear override' }));
    expect(loanRatesAdminApi.clearManual).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Clear override' }));
    await waitFor(() => expect(loanRatesAdminApi.clearManual).toHaveBeenCalledWith('hdfc.home', null));

    fireEvent.click(within(screen.getByTestId('source-hdfc.home')).getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(loanRatesAdminApi.run).toHaveBeenCalledWith('hdfc.home'));
  });

  it('Approve and Reject are both disabled while an approval is pending', async () => {
    vi.mocked(loanRatesAdminApi.approve).mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<LoanRatesAdminPage />);
    const suspect = await screen.findByTestId('suspect-s1');
    const approve = within(suspect).getByRole('button', { name: 'Approve' }) as HTMLButtonElement;
    const reject = within(suspect).getByRole('button', { name: 'Reject' }) as HTMLButtonElement;
    expect(approve.disabled || reject.disabled).toBe(false);
    fireEvent.click(approve);
    await waitFor(() => expect(approve.disabled).toBe(true));
    expect(reject.disabled).toBe(true);
  });

  it("a pending Run now disables only that source's button", async () => {
    vi.mocked(loanRatesAdminApi.run).mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<LoanRatesAdminPage />);
    const runOf = (id: string) => within(screen.getByTestId(`source-${id}`)).getByRole('button', { name: 'Run now' }) as HTMLButtonElement;
    await screen.findByTestId('source-hdfc.home');
    fireEvent.click(runOf('hdfc.home'));
    await waitFor(() => expect(runOf('hdfc.home').disabled).toBe(true));
    expect(runOf('sbi.mclr').disabled).toBe(false);
    expect((screen.getByRole('button', { name: /run all now/i }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(runOf('sbi.mclr'));
    await waitFor(() => expect(runOf('sbi.mclr').disabled).toBe(true));
    expect(loanRatesAdminApi.run).toHaveBeenCalledTimes(2);
  });

  it('shows the server message when the session lacks the second factor', async () => {
    vi.mocked(loanRatesAdminApi.list).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 403'), {
        isAxiosError: true,
        response: { status: 403, data: { success: false, error: 'Sign out and sign in again with your authenticator code to use admin tools.', code: 'TWO_FACTOR_REQUIRED' } },
      }),
    );
    renderWithProviders(<LoanRatesAdminPage />);
    expect((await screen.findByTestId('admin-error')).textContent).toContain('authenticator code');
  });
});
