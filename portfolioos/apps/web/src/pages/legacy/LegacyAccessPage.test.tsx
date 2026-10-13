// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import type { LegacyViewDTO } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { legacyPublic } from '@/api/legacyPublic.api';
import { LegacyAccessPage } from './LegacyAccessPage';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/legacyPublic.api', () => ({ legacyPublic: { view: vi.fn() } }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

const TOKEN = 'tok-1234567890abcdef';

describe('LegacyAccessPage documents', () => {
  it('labels a replaced will so the nominee does not take it for the valid one', async () => {
    const view: LegacyViewDTO = {
      ownerName: 'Asha', nomineeName: 'Ravi', releasedAt: '2026-10-12T00:00:00.000Z', showAmounts: false, netWorth: null,
      sections: [], letter: null,
      documents: [
        { id: 'd1', fileName: 'deed.pdf', category: null },
        { id: 'd2', fileName: 'will-v1-signed.png', category: 'executed', will: { current: false, label: 'Replaced by a later will' } },
        { id: 'd3', fileName: 'will-v2.pdf', category: 'will', will: { current: true, label: 'Your will (version 2)' } },
      ],
    };
    vi.mocked(legacyPublic.view).mockResolvedValue(view);
    sessionStorage.setItem(`legacy.session.${TOKEN.slice(0, 12)}`, 'sess');
    renderWithProviders(<LegacyAccessPage />, { route: `/legacy/access/${TOKEN}`, path: '/legacy/access/:token' });
    expect(await screen.findByText('will-v1-signed.png')).toBeTruthy();
    expect(screen.getByTestId('legacy-doc-d2').textContent).toContain('Replaced by a later will');
    expect(screen.getByTestId('legacy-doc-d3').textContent).toContain('Your will (version 2)');
    expect(screen.getByTestId('legacy-doc-d1').textContent).not.toContain('will');
  });
});
