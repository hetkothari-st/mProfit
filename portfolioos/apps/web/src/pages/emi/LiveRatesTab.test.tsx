// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LoanRatesWire } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { loanRatesApi } from '@/api/loans/loanRates.api';
import { LiveRatesTab } from './LiveRatesTab';

vi.mock('@/api/loans/loanRates.api', () => ({ loanRatesApi: { list: vi.fn() } }));

const DATA: LoanRatesWire = {
  loanType: 'HOME',
  repo: { ratePct: '5.50', effectiveDate: '2026-10-08', lastChange: { deltaPct: '-0.25', date: '2026-10-08' } },
  rows: [
    { sourceId: 'kotak.home', lender: 'Kotak', loanType: 'HOME', basis: 'REPO_LINKED', minRatePct: '7.70', maxRatePct: '13.05', effectiveDate: null, asOf: '2026-10-02T02:00:00.000Z', stale: true, sourceUrl: 'https://www.kotak.bank.in/en/rates.html', origin: 'AUTO' },
    { sourceId: 'hdfc.home', lender: 'HDFC Bank', loanType: 'HOME', basis: 'REPO_LINKED', minRatePct: '8.00', maxRatePct: '13.45', effectiveDate: null, asOf: '2026-10-12T02:00:00.000Z', stale: false, sourceUrl: 'https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates', origin: 'AUTO' },
    { sourceId: 'sbi.home', lender: 'SBI', loanType: 'HOME', basis: 'REPO_LINKED', minRatePct: '8.10', maxRatePct: null, effectiveDate: '2026-04-01', asOf: '2026-10-12T02:00:00.000Z', stale: false, sourceUrl: 'https://sbi.bank.in/web/interest-rates/interest-rates/mclr', origin: 'AUTO' },
  ],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('LiveRatesTab', () => {
  it('lists lenders with range, basis, dd/mm/yyyy dates, stale badge, link and the lowest usable rate marked', async () => {
    vi.mocked(loanRatesApi.list).mockResolvedValue(DATA);
    renderWithProviders(<LiveRatesTab onUseRate={vi.fn()} />);
    const hdfc = await screen.findByTestId('rate-row-hdfc.home');
    expect(hdfc.textContent).toContain('8.00% - 13.45%');
    expect(hdfc.textContent).toContain('Repo-linked');
    expect(hdfc.textContent).toContain('12/10/2026');
    expect(within(hdfc).getByText('Lowest')).toBeTruthy();
    expect(within(screen.getByTestId('rate-row-kotak.home')).getByText('Stale')).toBeTruthy();
    expect(within(screen.getByTestId('rate-row-kotak.home')).queryByText('Lowest')).toBeNull();
    expect(screen.getByTestId('rate-row-sbi.home').textContent).toContain('w.e.f. 01/04/2026');
    const link = within(hdfc).getByRole('link', { name: /HDFC Bank rates page/i });
    expect(link.getAttribute('href')).toBe('https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByTestId('repo-line').textContent).toBe('RBI repo rate 5.50% - cut by 0.25% on 08/10/2026');
    expect(screen.getByText(/Indicative\. Your rate depends on credit score, loan amount and tenure\./)).toBeTruthy();
  });

  it('"Use this rate" hands the row to the page', async () => {
    vi.mocked(loanRatesApi.list).mockResolvedValue(DATA);
    const onUseRate = vi.fn();
    renderWithProviders(<LiveRatesTab onUseRate={onUseRate} />);
    const hdfc = await screen.findByTestId('rate-row-hdfc.home');
    fireEvent.click(within(hdfc).getByRole('button', { name: /use this rate/i }));
    expect(onUseRate).toHaveBeenCalledWith(DATA.rows[1]);
  });

  it('changing the loan type asks for that type', async () => {
    vi.mocked(loanRatesApi.list).mockResolvedValue({ loanType: 'HOME', rows: [], repo: null });
    renderWithProviders(<LiveRatesTab onUseRate={vi.fn()} />);
    await waitFor(() => expect(loanRatesApi.list).toHaveBeenCalledWith('HOME'));
    fireEvent.change(screen.getByLabelText('Loan type'), { target: { value: 'CAR' } });
    await waitFor(() => expect(loanRatesApi.list).toHaveBeenCalledWith('CAR'));
  });

  it('shows "Rates not available yet" when there are no rows', async () => {
    vi.mocked(loanRatesApi.list).mockResolvedValue({ loanType: 'HOME', rows: [], repo: null });
    renderWithProviders(<LiveRatesTab onUseRate={vi.fn()} />);
    expect((await screen.findByTestId('rates-empty')).textContent).toContain('Rates not available yet');
    expect(screen.queryByTestId('rates-error')).toBeNull();
  });

  it('an API error shows an error line with Try again, distinct from empty; Try again refetches', async () => {
    vi.mocked(loanRatesApi.list).mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce(DATA);
    renderWithProviders(<LiveRatesTab onUseRate={vi.fn()} />);
    const error = await screen.findByTestId('rates-error');
    expect(error.textContent).toContain("Couldn't load rates");
    expect(screen.queryByTestId('rates-empty')).toBeNull();
    fireEvent.click(within(error).getByRole('button', { name: /try again/i }));
    expect(await screen.findByTestId('rate-row-hdfc.home')).toBeTruthy();
    expect(loanRatesApi.list).toHaveBeenCalledTimes(2);
  });

  it('with cached data and a wide container, the first paint is already the table (no cards first)', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1000 } as DOMRect);
    try {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      qc.setQueryData(['loan-rates', 'HOME'], DATA);
      render(<QueryClientProvider client={qc}><LiveRatesTab onUseRate={vi.fn()} /></QueryClientProvider>);
      // Synchronously after the initial render: no waiting, so a measure-after-paint hook would still show cards.
      expect(screen.getByTestId('rate-row-hdfc.home').tagName).toBe('TR');
    } finally {
      rect.mockRestore();
    }
  });
});
