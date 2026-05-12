import { create } from 'zustand';
import type { AssetSectionPref } from '@portfolioos/shared';
import { userPreferencesApi } from '@/api/userPreferences.api';

interface AssetSectionsState {
  sections: AssetSectionPref[];
  editingSections: AssetSectionPref[];
  isEditing: boolean;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;

  fetchPreferences: () => Promise<void>;
  enterEdit: () => void;
  cancelEdit: () => void;
  reorder: (activeKey: string, overKey: string) => void;
  toggleVisibility: (key: string) => void;
  saveEdit: () => Promise<void>;
}

export const useAssetSectionsStore = create<AssetSectionsState>()((set, get) => ({
  sections: [],
  editingSections: [],
  isEditing: false,
  isLoading: false,
  isSaving: false,
  saveError: null,

  fetchPreferences: async () => {
    set({ isLoading: true });
    try {
      const prefs = await userPreferencesApi.get();
      set({ sections: prefs.assetSections, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  enterEdit: () => {
    set({ isEditing: true, editingSections: [...get().sections], saveError: null });
  },

  cancelEdit: () => {
    set({ isEditing: false, editingSections: [], saveError: null });
  },

  reorder: (activeKey, overKey) => {
    const items = [...get().editingSections];
    const oldIndex = items.findIndex((s) => s.key === activeKey);
    const newIndex = items.findIndex((s) => s.key === overKey);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = [...items];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved!);
    set({ editingSections: reordered.map((s, i) => ({ ...s, order: i })) });
  },

  toggleVisibility: (key) => {
    set({
      editingSections: get().editingSections.map((s) =>
        s.key === key ? { ...s, visible: !s.visible } : s,
      ),
    });
  },

  saveEdit: async () => {
    set({ isSaving: true, saveError: null });
    try {
      const saved = await userPreferencesApi.update({ assetSections: get().editingSections });
      set({ sections: saved.assetSections, isEditing: false, editingSections: [], isSaving: false });
    } catch (err) {
      set({
        isSaving: false,
        saveError: err instanceof Error ? err.message : 'Failed to save',
      });
    }
  },
}));
