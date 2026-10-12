// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { renderWithProviders } from '@/pages/split/testUtils';
import { EmiCalculatorPage } from './EmiCalculatorPage';
import { encodeEmiUrl } from './emiUrl';
import { defaultCalcState, defaultCompareState } from './emiState';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/loanRates.api', () => ({
  loanRatesApi: {
    list: vi.fn().mockResolvedValue({
      loanType: 'HOME',
      repo: null,
      rows: [{ sourceId: 'hdfc.home', lender: 'HDFC Bank', loanType: 'HOME', basis: 'REPO_LINKED', minRatePct: '8.00', maxRatePct: '13.45', effectiveDate: null, asOf: '2026-10-12T02:00:00.000Z', stale: false, sourceUrl: 'https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates', origin: 'AUTO' }],
    }),
  },
}));
vi.mock('@/api/emi.api', () => ({ emiApi: { export: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('EmiCalculatorPage', () => {
  it('"Use this rate" fills the rate and returns to Calculate', async () => {
    renderWithProviders(<EmiCalculatorPage />, { route: '/emi', path: '/emi' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /live rates/i }));
    fireEvent.click(screen.getByRole('tab', { name: /live rates/i }));
    const row = await screen.findByTestId('rate-row-hdfc.home');
    fireEvent.click(within(row).getByRole('button', { name: /use this rate/i }));
    await waitFor(() => expect((document.getElementById('emi-rate') as HTMLInputElement).value).toBe('8.00'));
    expect(screen.getByRole('tab', { name: /calculate/i }).getAttribute('aria-selected')).toBe('true');
    expect(toast.success).toHaveBeenCalledWith('Using HDFC Bank 8.00% - check it against your own offer');
  });

  it('restores state from a share URL', async () => {
    const calc = { ...defaultCalcState(new Date(2026, 9, 12)), principal: '10,00,000', ratePct: '8.5', tenure: '20' };
    renderWithProviders(<EmiCalculatorPage />, { route: `/emi?${encodeEmiUrl('calculate', calc, defaultCompareState())}`, path: '/emi' });
    await waitFor(() => expect(screen.getByTestId('emi-value').textContent).toContain('8,679'));
  });

  it('a broken share URL shows a toast and the default loan', async () => {
    renderWithProviders(<EmiCalculatorPage />, { route: '/emi?v=1&s=%%%bad', path: '/emi' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/couldn't be opened/i)));
    expect(await screen.findByTestId('emi-value')).toBeTruthy();
  });

  it('shows the Tools eyebrow', () => {
    renderWithProviders(<EmiCalculatorPage />, { route: '/emi', path: '/emi' });
    expect(screen.getByText('Tools')).toBeTruthy();
  });

  it('switches to the compare tab', async () => {
    renderWithProviders(<EmiCalculatorPage />, { route: '/emi', path: '/emi' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /compare/i }));
    fireEvent.click(screen.getByRole('tab', { name: /compare/i }));
    expect(await screen.findByTestId('offer-input-0')).toBeTruthy();
  });

  it('export calls the API with the validated wire input', async () => {
    const { emiApi } = await import('@/api/emi.api');
    renderWithProviders(<EmiCalculatorPage />, { route: '/emi', path: '/emi' });
    await screen.findByTestId('emi-value');
    const btn = screen.getByRole('button', { name: /excel/i });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(emiApi.export).toHaveBeenCalledWith('xlsx', expect.objectContaining({ input: expect.objectContaining({ tenureMonths: 240 }) })));
  });
});
