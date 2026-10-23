// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { legacyApi } from '@/api/legacy/legacy.api';
import { useActingAsStore } from '@/stores/actingAs.store';
import { LegacyPage } from './LegacyPage';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/legacy/legacy.api', () => ({
  LEGACY_KEYS: { overview: ['legacy', 'overview'] },
  legacyApi: { overview: vi.fn(() => new Promise(() => {})) },
}));

afterEach(() => {
  cleanup();
  useActingAsStore.getState().leave();
  vi.mocked(legacyApi.overview).mockClear();
});

/**
 * While managing a relative the server refuses /api/legacy; the page used to
 * ask anyway and show the raw refusal. Will Maker already had this guard.
 */
describe('Succession while managing a relative', () => {
  it('says it works on your own account only, and never asks the server', () => {
    useActingAsStore.getState().enter({ id: 'nani', name: 'Nani', managerId: 'me' });
    renderWithProviders(<LegacyPage />, { route: '/legacy', path: '/legacy' });
    expect(screen.getByText(/Succession works on your own account only/)).toBeTruthy();
    expect(legacyApi.overview).not.toHaveBeenCalled();
  });

  it('loads normally on your own account', () => {
    renderWithProviders(<LegacyPage />, { route: '/legacy', path: '/legacy' });
    expect(screen.queryByText(/works on your own account only/)).toBeNull();
    expect(legacyApi.overview).toHaveBeenCalled();
  });
});
