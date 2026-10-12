// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
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
      total: 2, unreadCount: 2, page: 1, limit: 30,
    });
    renderWithProviders(<AlertsPage />);
    expect(await screen.findByText('Home loan with HDFC Bank at 9.10%; market from 8.35%')).toBeTruthy();
    // Once on the row, once in the type filter.
    expect(screen.getAllByText('Loan refinance')).toHaveLength(2);
    expect(screen.getAllByText('Loan rate change')).toHaveLength(2);
  });
});
