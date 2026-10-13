// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { useActingAsStore } from '@/stores/actingAs.store';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { willApi, willDraftExists } from '@/api/will.api';
import { WillOverviewPage } from './WillOverviewPage';
import { draftWire, historyEntry, overview, resetStores, signIn } from './willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { overview: vi.fn(), createDraft: vi.fn(), discard: vi.fn(), downloadPdf: vi.fn() },
  willDraftExists: vi.fn(() => null),
}));

const api = vi.mocked(willApi);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(willDraftExists).mockReturnValue(null);
  signIn('PLUS');
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('WillOverviewPage', () => {
  it('shows status, estate totals, what to prepare and the disclaimer; creates a draft', async () => {
    api.overview.mockResolvedValue(overview());
    api.createDraft.mockResolvedValue(draftWire({ id: 'w9' }));
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(await screen.findByText('Not created')).toBeTruthy();
    expect(screen.getByTestId('will-estate-assets').textContent).toContain('17,50,000');
    expect(screen.getByTestId('will-estate-net').textContent).toContain('13,50,000');
    expect(screen.getByText(/two adult witnesses/i)).toBeTruthy();
    expect(screen.getByText(/not legal advice/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /create my will/i }));
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledWith(undefined));
    expect(await screen.findByTestId('navigated')).toBeTruthy();
  });

  it('offers to continue or discard a draft', async () => {
    api.overview.mockResolvedValue(overview({ status: 'DRAFT', draft: { id: 'w1', version: 1, currentStep: 4, updatedAt: '2026-10-12T05:00:00.000Z' } }));
    api.discard.mockResolvedValue(undefined);
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(await screen.findByRole('button', { name: /continue/i })).toBeTruthy();
    expect(screen.getByText(/12\/10\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /discard draft/i }));
    expect(await screen.findByText(/discard this draft\?/i)).toBeTruthy();
    expect(screen.getByText(/you can't get it back/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByText(/discard this draft\?/i)).toBeNull());
    expect(api.discard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /discard draft/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^discard$/i }));
    await waitFor(() => expect(api.discard).toHaveBeenCalledWith('w1'));
  });

  it('downloads a generated version and starts a new one from it', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'GENERATED',
      versions: [{ id: 'v1', willId: 'w1', versionNo: 1, status: 'GENERATED', generatedOn: '2026-10-12', templateId: 'isa-hindu', templateVersion: 1 }],
    }));
    api.downloadPdf.mockResolvedValue(undefined);
    api.createDraft.mockResolvedValue(draftWire({ id: 'w2', version: 2 }));
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(await screen.findByText('Generated')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /download pdf/i })[0]!);
    await waitFor(() => expect(api.downloadPdf).toHaveBeenCalledWith('v1', 1));
    fireEvent.click(screen.getByRole('button', { name: /start a new version/i }));
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledWith('w1'));
  });

  it('a draft-exists conflict opens that draft at its saved step', async () => {
    api.overview.mockResolvedValue(overview());
    api.createDraft.mockRejectedValue(new Error('409'));
    vi.mocked(willDraftExists).mockReturnValue({ id: 'w5', currentStep: 5 });
    function Where() {
      return <div data-testid="where">{useLocation().pathname}</div>;
    }
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
        <MemoryRouter initialEntries={['/will']}>
          <Routes>
            <Route path="/will" element={<WillOverviewPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /create my will/i }));
    expect((await screen.findByTestId('where')).textContent).toBe('/will/w5/allocation');
  });

  it('blocks other history downloads while one version is downloading', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'GENERATED',
      versions: [
        { id: 'v2', willId: 'w2', versionNo: 2, status: 'GENERATED', generatedOn: '2026-10-12', templateId: 'isa-hindu', templateVersion: 1 },
        { id: 'v1', willId: 'w1', versionNo: 1, status: 'SUPERSEDED', generatedOn: '2026-10-11', templateId: 'isa-hindu', templateVersion: 1 },
      ],
      history: [
        historyEntry({ willId: 'w2', version: 2, versionId: 'v2' }),
        historyEntry({ willId: 'w1', version: 1, status: 'SUPERSEDED', versionId: 'v1', supersededByVersion: 2 }),
      ],
    }));
    api.downloadPdf.mockReturnValue(new Promise<void>(() => undefined));
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    const card = await screen.findByTestId('will-history');
    const one = within(card).getByRole('button', { name: 'Download version 1 PDF' }) as HTMLButtonElement;
    const two = within(card).getByRole('button', { name: 'Download version 2 PDF' }) as HTMLButtonElement;
    fireEvent.click(one);
    await waitFor(() => expect(api.downloadPdf).toHaveBeenCalledWith('v1', 1));
    await waitFor(() => expect(two.disabled).toBe(true));
    expect(one.disabled).toBe(true);
    expect(one.textContent).toMatch(/downloading/i);
    expect(two.textContent).not.toMatch(/downloading/i);
  });

  it('shows the nominee-only amount like the tiles, and drops the time estimate once a will is generated', async () => {
    api.overview.mockResolvedValue(overview({ estate: { assets: '1750000.0000', liabilities: '400000.0000', net: '1350000.0000', nomineeOnly: '300000.0000' } }));
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(await screen.findByText(/insurance paid to nominees \(₹3,00,000\) is not counted/i)).toBeTruthy();
    expect(screen.getByText(/about 15-20 minutes/i)).toBeTruthy();
    cleanup();
    api.overview.mockResolvedValue(overview({
      status: 'GENERATED',
      versions: [{ id: 'v1', willId: 'w1', versionNo: 1, status: 'GENERATED', generatedOn: '2026-10-12', templateId: 'isa-hindu', templateVersion: 1 }],
    }));
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(await screen.findByText(/insurance paid to nominees \(₹0\) is not counted/i)).toBeTruthy();
    expect(screen.queryByText(/about 15-20 minutes/i)).toBeNull();
  });

  it('is locked on the Free plan and does not call the API', async () => {
    signIn('FREE');
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(screen.getByText(/will maker is locked/i)).toBeTruthy();
    expect(api.overview).not.toHaveBeenCalled();
  });

  it('refuses while managing a family member', () => {
    useActingAsStore.setState({ profile: { id: 'p1', name: 'Dadaji', managerId: 'u1' } });
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(screen.getByText(/your own account only/i)).toBeTruthy();
    expect(api.overview).not.toHaveBeenCalled();
  });
});
