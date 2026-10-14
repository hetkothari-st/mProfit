// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { connectApi } from '@/api/connect.api';
import { useAuthStore } from '@/stores/auth.store';
import { AiConnectorsPage } from './AiConnectorsPage';

vi.mock('@/api/connect.api', () => ({ connectApi: { connections: vi.fn(), revoke: vi.fn() } }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));
const open = vi.fn();
const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  window.open = open as never;
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  useAuthStore.setState({ user: { id: 'u1', plan: 'PLUS' } as never });
});
afterEach(cleanup);

const conn = { id: 'g1', clientName: 'Claude', connectedOn: '14/10/2026', lastUsedAt: null, areas: ['investments', 'retirement'] };

describe('AiConnectorsPage', () => {
  it('Connect ChatGPT copies the URL and opens ChatGPT settings', async () => {
    vi.mocked(connectApi.connections).mockResolvedValue([]);
    renderWithProviders(<AiConnectorsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Connect ChatGPT' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/mcp$/)));
    expect(open).toHaveBeenCalledWith(expect.stringContaining('chatgpt.com'), '_blank', 'noopener,noreferrer');
    expect(await screen.findByText(/Paste the address/)).toBeTruthy();
  });

  it('lists connections with their areas and revokes after confirming', async () => {
    vi.mocked(connectApi.connections).mockResolvedValueOnce([conn as never]).mockResolvedValue([]);
    vi.mocked(connectApi.revoke).mockResolvedValue();
    renderWithProviders(<AiConnectorsPage />);
    expect(await screen.findByText('Claude')).toBeTruthy();
    expect(screen.getByText('Investments')).toBeTruthy();
    expect(screen.getByText(/Connected 14\/10\/2026/)).toBeTruthy();
    expect(screen.getByText(/Not used yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke access' }));
    await waitFor(() => expect(connectApi.revoke).toHaveBeenCalledWith('g1'));
    await waitFor(() => expect(screen.queryByText('Claude')).toBeNull());
  });

  it('a FREE user still sees and can revoke existing connections, but not connect new ones', async () => {
    useAuthStore.setState({ user: { id: 'u1', plan: 'FREE' } as never });
    vi.mocked(connectApi.connections).mockResolvedValue([conn as never]);
    renderWithProviders(<AiConnectorsPage />);
    expect(await screen.findByText('Claude')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
    expect(screen.getAllByText(/Plus/).length).toBeGreaterThan(0);
  });
});
