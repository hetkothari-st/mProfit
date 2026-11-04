// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { alertsApi } from '@/api/alerts.api';
import { AlertsPage } from './AlertsPage';

vi.mock('@/api/alerts.api', () => ({
  alertsApi: { list: vi.fn(), markRead: vi.fn(), delete: vi.fn(), markAllRead: vi.fn(), triggerScan: vi.fn(), createCustom: vi.fn(), getUnreadCount: vi.fn() },
}));

afterEach(cleanup);

describe('AlertsPage - loan check alerts', () => {
  it('labels refinance and rate-change alerts and offers them as filters', async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(alertsApi.list).mockResolvedValue({
      alerts: [
        { id: 'a1', type: 'LOAN_REFINANCE', title: 'Home loan with HDFC Bank at 9.10%; market from 8.35%', description: 'Switching could save ≈ ₹2.1 lakh after switching costs (lowest: SBI). Open the loan to compare.', triggerDate: today, isRead: false, metadata: { key: 'loan:refi:l1:2026-10' }, createdAt: `${today}T03:00:00.000Z` },
        { id: 'a2', type: 'LOAN_BENCHMARK_CHANGE', title: 'RBI cut the repo rate by 0.25% on 08/10/2026', description: null, triggerDate: today, isRead: false, metadata: { key: 'loan:bench:l2:REPO:2026-10-08' }, createdAt: `${today}T03:00:00.000Z` },
      ],
      total: 2, unreadCount: 2, page: 1, limit: 30, counts: { all: 2, overdue: 0, soon: 2, unread: 2 },
    });
    renderWithProviders(<AlertsPage />);
    expect(await screen.findByText('Home loan with HDFC Bank at 9.10%; market from 8.35%')).toBeTruthy();
    // Once on the row, once in the type filter.
    expect(screen.getAllByText('Loan refinance')).toHaveLength(2);
    expect(screen.getAllByText('Loan rate change')).toHaveLength(2);
  });

  it('loan-check alerts are news: never in the red Overdue band, and they link to their loan', async () => {
    const ago = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    vi.mocked(alertsApi.list).mockResolvedValue({
      alerts: [
        { id: 'a1', type: 'LOAN_REFINANCE', title: 'Refinance HDFC', description: null, triggerDate: ago, isRead: false, metadata: { key: 'k1', loanId: 'loan-1' }, createdAt: `${ago}T03:00:00.000Z` },
        { id: 'a2', type: 'LOAN_BENCHMARK_CHANGE', title: 'Repo cut', description: null, triggerDate: ago, isRead: false, metadata: { key: 'k2', loanId: 'loan-2' }, createdAt: `${ago}T03:00:00.000Z` },
      ],
      total: 2, unreadCount: 2, page: 1, limit: 30, counts: { all: 2, overdue: 0, soon: 2, unread: 2 },
    });
    renderWithProviders(<AlertsPage />);
    const refi = await screen.findByText('Refinance HDFC');
    expect(screen.queryByText('past their date')).toBeNull();
    expect(screen.getByText('next 7 days')).toBeTruthy();
    expect(screen.getAllByText('3d ago')).toHaveLength(2);
    expect(screen.queryByText('3d late')).toBeNull();
    expect(refi.closest('a')?.getAttribute('href')).toBe('/loans/loan-1');
    expect(screen.getByText('Repo cut').closest('a')?.getAttribute('href')).toBe('/loans/loan-2');
    // The Overdue filter chip counts none of them.
    const chip = screen.getAllByRole('button').find((b) => /^Overdue/.test(b.textContent ?? ''))!;
    expect(within(chip).queryByText('2')).toBeNull();
  });

  it('a past custom reminder is still overdue and has no loan link', async () => {
    const ago = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    vi.mocked(alertsApi.list).mockResolvedValue({
      alerts: [
        { id: 'c1', type: 'CUSTOM', title: 'Pay the society bill', description: null, triggerDate: ago, isRead: false, metadata: null, createdAt: `${ago}T03:00:00.000Z` },
      ],
      total: 1, unreadCount: 1, page: 1, limit: 30, counts: { all: 1, overdue: 1, soon: 0, unread: 1 },
    });
    renderWithProviders(<AlertsPage />);
    const title = await screen.findByText('Pay the society bill');
    expect(screen.getByText('past their date')).toBeTruthy();
    expect(screen.getByText('3d late')).toBeTruthy();
    expect(title.closest('a')).toBeNull();
  });
  // The chips used to count only the 30 alerts on the loaded page, so the page
  // under-counted against the bell. They now show the server's
  // inbox-wide counts, and choosing one asks the server for that lens.
  it('chip counts are inbox-wide and a chip filters on the server', async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    vi.mocked(alertsApi.list).mockResolvedValue({
      alerts: [
        { id: 'u1', type: 'CUSTOM', title: 'Renew passport', description: null, triggerDate: soon, isRead: false, metadata: null, createdAt: `${soon}T03:00:00.000Z` },
      ],
      total: 64, unreadCount: 52, page: 1, limit: 30, counts: { all: 64, overdue: 18, soon: 5, unread: 52 },
    });
    renderWithProviders(<AlertsPage />);
    await screen.findByText('Renew passport');
    const chip = (label: RegExp) => screen.getAllByRole('button').find((b) => label.test(b.textContent ?? ''))!;
    expect(within(chip(/^Unread/)).getByText('52')).toBeTruthy();
    expect(within(chip(/^All/)).getByText('64')).toBeTruthy();
    expect(within(chip(/^Overdue/)).getByText('18')).toBeTruthy();
    fireEvent.click(chip(/^Overdue/));
    await waitFor(() =>
      expect(vi.mocked(alertsApi.list)).toHaveBeenLastCalledWith(expect.objectContaining({ lens: 'overdue', page: 1 })),
    );
  });
});
