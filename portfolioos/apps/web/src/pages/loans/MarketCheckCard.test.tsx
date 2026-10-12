// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { LoanMarketCheckWire } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { loansApi } from '@/api/loans.api';
import { MarketCheckCard } from './MarketCheckCard';

vi.mock('@/api/loans.api', () => ({ loansApi: { getMarketCheck: vi.fn(), update: vi.fn() } }));

const CHECK: LoanMarketCheckWire = {
  loanId: 'l1', status: 'ACTIVE', loanType: 'HOME', rateLoanType: 'HOME', lender: 'HDFC Bank',
  rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null, currentRatePct: '9.10',
  outstanding: '3000000.00', remainingMonths: 180, nextEmiDate: '2026-11-05',
  market: { sourceId: 'sbi.home', lender: 'SBI', minRatePct: '8.35', asOf: '2026-10-12T02:00:00.000Z', sourceUrl: 'https://sbi.bank.in/x' },
  benchmark: null,
};
const LOAN = { id: 'l1', status: 'ACTIVE' };
const text = (id: string) => screen.getByTestId(id).textContent ?? '';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('MarketCheckCard', () => {
  it('shows the market rate, new EMI, savings net of switching costs, break-even and the calculator link', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue(CHECK);
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    await screen.findByTestId('market-net');
    expect(text('market-rate')).toBe('Market from 8.35% (SBI, as of 12/10/2026)');
    expect(text('market-new-emi')).toBe('₹29,280 (now ₹30,607) over 180 months');
    expect(text('market-gross')).toBe('₹2,39,109');
    expect(text('market-costs')).toBe('₹25,000');
    expect(text('market-net')).toBe('₹2,14,109');
    expect(text('market-break-even')).toBe('Break-even in month 19');
    const link = screen.getByRole('link', { name: /open in calculator/i });
    expect(link.getAttribute('href')?.startsWith('/emi?v=1')).toBe(true);
  });

  it('switching costs are editable and recompute the result', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue(CHECK);
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    await screen.findByTestId('market-net');
    fireEvent.change(screen.getByLabelText('Processing fee (%)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Other charges (₹)'), { target: { value: '0' } });
    expect(text('market-net')).toBe('₹2,39,109');
    expect(text('market-break-even')).toBe('Break-even in month 1');
  });

  it('invalid costs show an error and hide the result and the link', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue(CHECK);
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    await screen.findByTestId('market-net');
    fireEvent.change(screen.getByLabelText('Processing fee (%)'), { target: { value: 'abc' } });
    expect(screen.getByText('Enter a processing fee between 0 and 10%')).toBeTruthy();
    expect(screen.queryByTestId('market-net')).toBeNull();
    expect(screen.queryByRole('link', { name: /open in calculator/i })).toBeNull();
  });

  it('when switching does not pay, says so', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue({ ...CHECK, outstanding: '200000.00', remainingMonths: 12, currentRatePct: '9.00', market: { ...CHECK.market!, minRatePct: '8.50' } });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('market-break-even')).textContent).toBe('Switching would not pay off at these costs');
  });

  it('asks "Fixed or floating?" for an UNKNOWN loan and saves the answer', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue({ ...CHECK, rateType: 'UNKNOWN' });
    vi.mocked(loansApi.update).mockResolvedValue({} as never);
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Floating' }));
    await waitFor(() => expect(loansApi.update).toHaveBeenCalledWith('l1', { rateType: 'FLOATING' }));
  });

  it('floating loans show their benchmark; an untracked MCLR lender is explained', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue({
      ...CHECK, rateType: 'FLOATING', rateBenchmark: 'MCLR', lender: null,
      benchmark: { kind: 'REPO', lender: null, tenor: null, ratePct: '5.25', effectiveDate: '2026-10-08', lastChange: { deltaPct: '-0.25', date: '2026-10-08' } },
    });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('benchmark-line')).textContent).toBe('RBI repo rate 5.25% - cut by 0.25% on 08/10/2026');
    expect(screen.getByText(/isn't on our MCLR list/)).toBeTruthy();
  });

  it('a floating MCLR or repo loan with no benchmark series says so (e.g. LIC Housing Finance has no MCLR)', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValueOnce({
      ...CHECK, lender: 'LIC Housing Finance', rateType: 'FLOATING', rateBenchmark: 'MCLR', benchmark: null,
    });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('benchmark-line')).textContent).toBe('No benchmark data yet.');
    cleanup();
    vi.mocked(loansApi.getMarketCheck).mockResolvedValueOnce({ ...CHECK, rateType: 'FLOATING', rateBenchmark: 'REPO', benchmark: null });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('benchmark-line')).textContent).toBe('No benchmark data yet.');
  });

  it('the result list stacks label over value below the sm breakpoint', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValue(CHECK);
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    const dl = (await screen.findByTestId('market-net')).closest('dl')!;
    expect(dl.className.split(' ')).toContain('grid-cols-1');
    expect(dl.className).toContain('sm:grid-cols-[minmax(0,1fr)_auto]');
  });

  it('empty states: no market data, rates not available, already at or below the market', async () => {
    vi.mocked(loansApi.getMarketCheck).mockResolvedValueOnce({ ...CHECK, loanType: 'OTHER', rateLoanType: null, market: null });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('market-empty')).textContent).toBe('No market data for this loan type.');
    cleanup();
    vi.mocked(loansApi.getMarketCheck).mockResolvedValueOnce({ ...CHECK, market: null });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('market-empty')).textContent).toBe('Market rates are not available yet.');
    cleanup();
    vi.mocked(loansApi.getMarketCheck).mockResolvedValueOnce({ ...CHECK, currentRatePct: '8.25' });
    renderWithProviders(<MarketCheckCard loan={LOAN} />);
    expect((await screen.findByTestId('market-empty')).textContent).toBe('Your rate is already at or below the lowest market rate.');
  });

  it('renders nothing and fetches nothing for a closed loan', () => {
    const { container } = renderWithProviders(<MarketCheckCard loan={{ id: 'l1', status: 'CLOSED' }} />);
    expect(container.textContent).toBe('');
    expect(loansApi.getMarketCheck).not.toHaveBeenCalled();
  });
});
