import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  dark: boolean;
  toggle: () => void;
}

function applyClass(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0d0d0d' : '#fafafa');
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: true,
      toggle: () =>
        set((s) => {
          const next = !s.dark;
          applyClass(next);
          return { dark: next };
        }),
    }),
    {
      name: 'portfolioos.theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyClass(state.dark);
      },
    },
  ),
);
