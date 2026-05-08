import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PrivacyState {
  hideSensitive: boolean;
  toggleHideSensitive: () => void;
  setHideSensitive: (value: boolean) => void;
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      hideSensitive: false,
      toggleHideSensitive: () => set((s) => ({ hideSensitive: !s.hideSensitive })),
      setHideSensitive: (value: boolean) => set({ hideSensitive: value }),
    }),
    {
      name: 'portfolioos.privacy',
    },
  ),
);

