// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { connectApi } from '@/api/connect.api';
import { useAuthStore } from '@/stores/auth.store';
import { AiConnectorsPage } from './AiConnectorsPage';

vi.mock('@/api/connect.api', () => ({ connectApi: { connections: vi.fn(), revoke: vi.fn(), getFamilyOptIn: vi.fn(), setFamilyOptIn: vi.fn(), update: vi.fn(), activity: vi.fn(), people: vi.fn() } }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));
const open = vi.fn();
const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  window.open = open as never;
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  useAuthStore.setState({ user: { id: 'u1', plan: 'PLUS' } as never });
  vi.mocked(connectApi.getFamilyOptIn).mockResolvedValue(false);
  vi.mocked(connectApi.setFamilyOptIn).mockImplementation(async (v: boolean) => v);
});
afterEach(cleanup);

const conn = { id: 'g1', clientName: 'Claude', connectedOn: '14/10/2026', lastUsedAt: null, areas: ['investments', 'retirement'], memberUserIds: [] };

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

  it('family opt-in switch saves the new value', async () => {
    vi.mocked(connectApi.connections).mockResolvedValue([]);
    renderWithProviders(<AiConnectorsPage />);
    const sw = (await screen.findByRole('checkbox', { name: /Allow family to include me/ })) as HTMLInputElement;
    await waitFor(() => expect(sw.disabled).toBe(false));
    expect(sw.checked).toBe(false);
    fireEvent.click(sw);
    await waitFor(() => expect(connectApi.setFamilyOptIn).toHaveBeenCalledWith(true));
    await waitFor(() => expect(sw.checked).toBe(true));
  });

  it('Edit sharing saves the new areas', async () => {
    vi.mocked(connectApi.connections).mockResolvedValue([conn as never]);
    vi.mocked(connectApi.people).mockResolvedValue([]);
    vi.mocked(connectApi.update).mockResolvedValue({ ...conn, areas: ['investments'] } as never);
    renderWithProviders(<AiConnectorsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit sharing' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Retirement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(connectApi.update).toHaveBeenCalledWith('g1', ['investments'], []));
  });

  it('Recent activity lists the lookups', async () => {
    vi.mocked(connectApi.connections).mockResolvedValue([conn as never]);
    vi.mocked(connectApi.activity).mockResolvedValue([{ tool: 'list_loans', area: 'loans', people: 1, rows: 3, ok: true, at: '2026-10-14T05:12:00.000Z' }]);
    renderWithProviders(<AiConnectorsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Recent activity' }));
    expect(await screen.findByText(/list_loans/)).toBeTruthy();
    expect(screen.getByText(/3 rows/)).toBeTruthy();
  });
});
