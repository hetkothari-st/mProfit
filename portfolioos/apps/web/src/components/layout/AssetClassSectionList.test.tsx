// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AssetSectionPref } from '@everypaisa/shared';

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('@/api/userPreferences.api', () => ({ userPreferencesApi: api }));

import { AssetClassSectionList } from './AssetClassSectionList';
import { ASSET_CLASS_ITEMS } from './navItems';
import { useAssetSectionsStore } from '@/stores/assetSections.store';

// Bonds, crypto, forex, post office and NPS are optional: not in the sidebar
// until the user adds them.

const core: AssetSectionPref[] = [
  { key: '/stocks', visible: true, order: 0 },
  { key: '/mutual-funds', visible: true, order: 1 },
];

function setSections(sections: AssetSectionPref[]) {
  useAssetSectionsStore.setState({
    sections,
    editingSections: [],
    isEditing: false,
    isSaving: false,
    saveError: null,
  });
}

function renderList() {
  render(
    <MemoryRouter>
      <AssetClassSectionList items={ASSET_CLASS_ITEMS} collapsed={false} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.update.mockImplementation(async (prefs: { assetSections: AssetSectionPref[] }) => prefs);
  setSections(core);
});
afterEach(() => cleanup());

describe('optional asset classes in the sidebar', () => {
  it('are not shown until added', () => {
    renderList();
    expect(screen.getByRole('link', { name: 'Stocks' })).toBeTruthy();
    for (const name of ['Bonds', 'Crypto', 'Forex', 'NPS', 'Post Office']) {
      expect(screen.queryByRole('link', { name }), name).toBeNull();
    }
  });

  it('are offered from "Add asset class", and the one picked is added and saved', async () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /add asset class/i }));
    const menu = screen.getByRole('group', { name: /optional asset classes/i });
    expect(within(menu).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Bonds',
      'Crypto',
      'Forex',
      'NPS',
      'Post Office',
    ]);

    fireEvent.click(within(menu).getByRole('button', { name: 'Crypto' }));
    expect(await screen.findByRole('link', { name: 'Crypto' })).toBeTruthy();
    expect(api.update).toHaveBeenCalledWith({
      assetSections: [...core, { key: '/crypto', visible: true, order: 2 }],
    });
  });

  it('stop being offered once all five are added', () => {
    setSections([
      ...core,
      ...['/bonds', '/crypto', '/forex', '/nps', '/post-office'].map((key, i) => ({ key, visible: true, order: i + 2 })),
    ]);
    renderList();
    expect(screen.queryByRole('button', { name: /add asset class/i })).toBeNull();
  });

  it('can be removed again in edit mode — a core class cannot', async () => {
    setSections([...core, { key: '/crypto', visible: true, order: 2 }]);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('button', { name: 'Remove Stocks' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Crypto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await vi.waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update).toHaveBeenCalledWith({ assetSections: core });
  });
});
