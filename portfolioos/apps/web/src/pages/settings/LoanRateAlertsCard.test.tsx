// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { notificationsApi } from '@/api/notifications.api';
import { LoanRateAlertsCard } from './LoanRateAlertsCard';

vi.mock('@/api/notifications.api', () => ({ notificationsApi: { getPrefs: vi.fn(), setPrefs: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const box = () => screen.getByRole('checkbox', { name: /refinancing/i }) as HTMLInputElement;

describe('LoanRateAlertsCard', () => {
  it('shows the saved flag and saves a change', async () => {
    vi.mocked(notificationsApi.getPrefs).mockResolvedValue({ loanRateAlerts: true });
    vi.mocked(notificationsApi.setPrefs).mockResolvedValue({ loanRateAlerts: false });
    renderWithProviders(<LoanRateAlertsCard />);
    await waitFor(() => expect(box().checked).toBe(true));
    fireEvent.click(box());
    await waitFor(() => expect(notificationsApi.setPrefs).toHaveBeenCalledWith({ loanRateAlerts: false }));
    await waitFor(() => expect(box().checked).toBe(false));
  });

  it('a load error offers Try again', async () => {
    vi.mocked(notificationsApi.getPrefs).mockRejectedValueOnce(new Error('down')).mockResolvedValue({ loanRateAlerts: true });
    renderWithProviders(<LoanRateAlertsCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(box().checked).toBe(true));
  });
});
