import { useThemeStore } from '@/stores/theme.store';

/**
 * The app's current theme, in the shape every report download endpoint
 * expects (`?theme=light|dark`).
 *
 * Reads the zustand store outside React (`getState()`), so this works from
 * plain `*.api.ts` URL builders and one-off download handlers alike, not
 * just components. Matching the app's theme is the default for every
 * download; `DownloadReportButton` is the one place that also offers an
 * explicit override for a single download.
 */
export function currentReportTheme(): 'light' | 'dark' {
  return useThemeStore.getState().dark ? 'dark' : 'light';
}
