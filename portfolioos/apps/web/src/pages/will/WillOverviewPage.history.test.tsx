// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import type { WillVersionWire } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { willApi } from '@/api/will.api';
import { WillOverviewPage } from './WillOverviewPage';
import { draftWire, historyEntry, overview, resetStores, signIn } from './willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { overview: vi.fn(), createDraft: vi.fn(), discard: vi.fn(), downloadPdf: vi.fn(), markReviewed: vi.fn() },
  willDraftExists: vi.fn(() => null),
}));

const api = vi.mocked(willApi);
const render = () => renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
const version = (p: Partial<WillVersionWire> & { id: string; willId: string; versionNo: number }): WillVersionWire => ({
  status: 'GENERATED', generatedOn: '2026-10-12', templateId: 'isa-hindu', templateVersion: 1, ...p,
});
const executedEntry = historyEntry({
  willId: 'w2', version: 2, status: 'EXECUTED', generatedOn: '2026-10-12', executedOn: '2026-10-20',
  nextReviewAt: '2028-10-20', versionId: 'v2', hasSignedCopy: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  signIn('PLUS');
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('WillOverviewPage - status and history', () => {
  it('lists every version with its status and dates', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'EXECUTED',
      draft: { id: 'w3', version: 3, currentStep: 2, updatedAt: '2026-10-25T05:00:00.000Z' },
      versions: [version({ id: 'v2', willId: 'w2', versionNo: 2, status: 'EXECUTED' }), version({ id: 'v1', willId: 'w1', versionNo: 1, status: 'SUPERSEDED' })],
      history: [
        historyEntry({ willId: 'w3', version: 3, status: 'DRAFT', generatedOn: null }),
        executedEntry,
        historyEntry({
          willId: 'w1', version: 1, status: 'SUPERSEDED', generatedOn: '2025-01-05', executedOn: '2025-01-10',
          supersededByVersion: 2, versionId: 'v1', hasSignedCopy: true,
        }),
      ],
    }));
    api.downloadPdf.mockResolvedValue(undefined);
    render();
    const card = await screen.findByTestId('will-history');
    const text = card.textContent ?? '';
    expect(text).toContain('Version 3');
    expect(within(card).getByText('Draft')).toBeTruthy();
    expect(within(card).getByText('Executed')).toBeTruthy();
    expect(within(card).getByText('Superseded')).toBeTruthy();
    expect(text).toMatch(/signed 20\/10\/2026/);
    expect(text).toMatch(/next review 20\/10\/2028/);
    expect(text).toMatch(/replaced by version 2/);
    fireEvent.click(within(card).getByRole('button', { name: 'Download version 1 PDF' }));
    await waitFor(() => expect(api.downloadPdf).toHaveBeenCalledWith('v1', 1));
    expect(within(card).getAllByRole('link', { name: /signed copy/i }).map((a) => a.getAttribute('href'))).toEqual([
      '/will/w2/execute', '/will/w1/execute',
    ]);
  });

  it('a due review offers "reviewed" and "my circumstances changed"', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'EXECUTED',
      versions: [version({ id: 'v2', willId: 'w2', versionNo: 2, status: 'EXECUTED' })],
      history: [{ ...executedEntry, nextReviewAt: '2026-10-01' }],
      review: { willId: 'w2', version: 2, nextReviewAt: '2026-10-01', due: true },
    }));
    api.markReviewed.mockResolvedValue({ nextReviewAt: '2028-10-12' });
    api.createDraft.mockResolvedValue(draftWire({ id: 'w3', version: 3 }));
    render();
    const banner = await screen.findByTestId('will-review-banner');
    expect(banner.textContent).toMatch(/time to review your will/i);
    expect(banner.textContent).toContain('01/10/2026');
    fireEvent.click(within(banner).getByRole('button', { name: 'Reviewed - no changes' }));
    await waitFor(() => expect(api.markReviewed).toHaveBeenCalledWith('w2'));
    // Both buttons are disabled while "reviewed" is in flight; wait until it settles (the banner may re-render).
    const changedButton = () =>
      within(screen.getByTestId('will-review-banner')).getByRole('button', { name: 'My circumstances changed' }) as HTMLButtonElement;
    await waitFor(() => expect(changedButton().disabled).toBe(false));
    fireEvent.click(changedButton());
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledWith('w2', 'CIRCUMSTANCES_CHANGED'));
    expect(await screen.findByTestId('navigated')).toBeTruthy();
  });

  it('a generated will offers "Sign and store" and a new version', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'GENERATED',
      versions: [version({ id: 'v1', willId: 'w1', versionNo: 1 })],
      history: [historyEntry({ willId: 'w1', version: 1, versionId: 'v1' })],
    }));
    render();
    expect((await screen.findByRole('link', { name: /sign and store/i })).getAttribute('href')).toBe('/will/w1/execute');
    expect(screen.getByRole('button', { name: /start a new version/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /my circumstances changed/i })).toBeNull();
    expect(screen.queryByTestId('will-review-banner')).toBeNull();
  });

  it('an executed will shows when it was signed and the next review', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'EXECUTED',
      versions: [version({ id: 'v2', willId: 'w2', versionNo: 2, status: 'EXECUTED' })],
      history: [executedEntry],
      review: { willId: 'w2', version: 2, nextReviewAt: '2028-10-20', due: false },
    }));
    api.createDraft.mockResolvedValue(draftWire({ id: 'w3', version: 3 }));
    render();
    const line = await screen.findByTestId('will-executed-line');
    expect(line.textContent).toContain('Signed on 20/10/2026');
    expect(line.textContent).toContain('next review 20/10/2028');
    expect(screen.queryByTestId('will-review-banner')).toBeNull();
    expect(screen.queryByRole('button', { name: /start a new version/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'My circumstances changed' }));
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledWith('w2', 'CIRCUMSTANCES_CHANGED'));
  });
});
