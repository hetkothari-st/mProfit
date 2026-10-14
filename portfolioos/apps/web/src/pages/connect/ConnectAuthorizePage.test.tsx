// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { connectApi } from '@/api/connect.api';
import { useAuthStore } from '@/stores/auth.store';
import { leaveForChatbot } from './leaveForChatbot';
import { ConnectAuthorizePage } from './ConnectAuthorizePage';

vi.mock('@/api/connect.api', () => ({ connectApi: { getRequest: vi.fn(), decide: vi.fn() } }));
vi.mock('./leaveForChatbot', () => ({ leaveForChatbot: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u1', plan: 'PLUS' } as never });
});
afterEach(cleanup);

const request = { reqId: 'r1', clientName: 'ChatGPT', redirectHost: 'chatgpt.com', expiresAt: '2099-01-01T00:00:00Z', currentAreas: null };
const route = '/connect/authorize?req=r1';

describe('ConnectAuthorizePage', () => {
  it('shows the client, defaults will and documents off, and approves the ticked areas', async () => {
    vi.mocked(connectApi.getRequest).mockResolvedValue(request);
    vi.mocked(connectApi.decide).mockResolvedValue({ redirectTo: 'https://chatgpt.com/cb?code=x' });
    renderWithProviders(<ConnectAuthorizePage />, { route });
    expect(await screen.findByText(/ChatGPT wants read-only access/)).toBeTruthy();
    expect(screen.getByText('chatgpt.com')).toBeTruthy();
    const will = screen.getByRole('checkbox', { name: /Will and succession/ }) as HTMLInputElement;
    const docs = screen.getByRole('checkbox', { name: /Documents/ }) as HTMLInputElement;
    const loans = screen.getByRole('checkbox', { name: /Loans/ }) as HTMLInputElement;
    expect(will.checked).toBe(false);
    expect(docs.checked).toBe(false);
    expect(loans.checked).toBe(true);
    fireEvent.click(loans);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(connectApi.decide).toHaveBeenCalledWith('r1', true, ['investments', 'retirement', 'banking', 'insurance', 'property', 'vehicles', 'goals_tax', 'split']));
    await waitFor(() => expect(leaveForChatbot).toHaveBeenCalledWith('https://chatgpt.com/cb?code=x'));
  });

  it('Cancel sends a denial', async () => {
    vi.mocked(connectApi.getRequest).mockResolvedValue(request);
    vi.mocked(connectApi.decide).mockResolvedValue({ redirectTo: 'https://chatgpt.com/cb?error=access_denied' });
    renderWithProviders(<ConnectAuthorizePage />, { route });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(connectApi.decide).toHaveBeenCalledWith('r1', false, []));
  });

  it('expired request shows error', async () => {
    vi.mocked(connectApi.getRequest).mockRejectedValue(new Error('This connection request has expired. Start again from your chatbot.'));
    renderWithProviders(<ConnectAuthorizePage />, { route });
    expect(await screen.findByText(/expired/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Settings/ })).toBeTruthy();
  });

  it('a FREE user sees the upgrade message and no Approve', async () => {
    useAuthStore.setState({ user: { id: 'u1', plan: 'FREE' } as never });
    vi.mocked(connectApi.getRequest).mockResolvedValue(request);
    renderWithProviders(<ConnectAuthorizePage />, { route });
    expect(await screen.findByText(/Plus plan/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});
