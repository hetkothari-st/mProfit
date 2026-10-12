// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { useActingAsStore } from '@/stores/actingAs.store';
import { willApi } from '@/api/will.api';
import { WillOverviewPage } from './WillOverviewPage';
import { draftWire, overview, resetStores, signIn } from './willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { overview: vi.fn(), createDraft: vi.fn(), discard: vi.fn(), downloadPdf: vi.fn() },
  willDraftExistsId: vi.fn(() => null),
}));

const api = vi.mocked(willApi);

beforeEach(() => {
  vi.clearAllMocks();
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
