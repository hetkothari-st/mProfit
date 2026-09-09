import { z } from 'zod';

/**
 * Shared colour palette for every PDF/XLSX report this app generates.
 *
 * Two first-class themes: `dark` (the app's own black-and-lime skin) and
 * `light` (ink-on-paper — white ground, near-black text, no decorative
 * accent bars). Neither is "the real one" — a report should be able to
 * match whatever the viewer was looking at in the app, or be forced to
 * print-friendly light regardless. `themeFor` decides which; every
 * renderer reads its colours from the `PdfTheme` it returns rather than
 * hard-coding either palette.
 *
 * `dark` stays the default everywhere a caller doesn't ask for a theme —
 * that is what every existing report has always rendered, and changing
 * the default silently would change output for callers that never opted
 * into anything.
 */
export interface PdfTheme {
  pageBg: string;
  headerBarBg: string;
  tableHeaderBg: string;
  ink: string;
  titleInk: string;
  accent: string;
  /** Text colour to use when painted on top of an `accent`-filled band. */
  onAccent: string;
  positive: string;
  negative: string;
  muted: string;
  headerBg: string;
  rowAlt: string;
  border: string;
  white: string;
  /** Draws the 3px vertical accent bar on cards and section bands. */
  accentBar: boolean;
  /** Hairline under the page header, for themes with no dark header block. */
  headerRule: boolean;
  /** Categorical palette for pie/bar charts, tuned for contrast on `pageBg`. */
  chartColors: readonly string[];
}

export type ThemeName = 'light' | 'dark';

// Dark — matches the app's own editorial colour scheme (black ground, lime
// accent). Categorical chart colours here are bright/saturated so they read
// against near-black.
export const DARK_THEME: PdfTheme = {
  pageBg: '#0D0D0D',
  headerBarBg: '#171717',
  tableHeaderBg: '#232323',
  ink: '#F0F0F0',
  titleInk: '#FFFFFF',
  accent: '#E2FE53',
  onAccent: '#0D0D0D',
  positive: '#A1E444',
  negative: '#F0574C',
  muted: '#9E9E9E',
  headerBg: '#20240F',
  rowAlt: '#171717',
  border: '#333333',
  white: '#FFFFFF',
  accentBar: true,
  headerRule: false,
  chartColors: [
    '#E2FE53', '#E0E0E0', '#F0574C', '#3FC6C0',
    '#B79EF0', '#F5B93D', '#5CA8F5', '#EF87C0',
    '#5CC98B', '#EB8C4C', '#C595E8', '#5CC4D6',
  ],
};

// Light — ink on paper. A statement someone prints, files, or emails a
// tenant/accountant gets white ground, near-black text, hairline rules, and
// no decorative accent bars. Categorical chart colours are dark/saturated
// hues chosen for real contrast against white — none of the dark theme's
// bright pastels survive that trip (`#E0E0E0` in particular is invisible on
// white).
export const LIGHT_THEME: PdfTheme = {
  pageBg: '#FFFFFF',
  headerBarBg: '#FFFFFF',
  tableHeaderBg: '#EDEDED',
  ink: '#1A1A1A',
  titleInk: '#1A1A1A',
  accent: '#1A1A1A',
  onAccent: '#FFFFFF',
  positive: '#1A1A1A',
  negative: '#B3261E',
  muted: '#5C5C5C',
  headerBg: '#F5F5F5',
  rowAlt: '#F7F7F7',
  border: '#C8C8C8',
  white: '#FFFFFF',
  accentBar: false,
  headerRule: true,
  chartColors: [
    '#1F6FEB', '#B3261E', '#0F766E', '#7C3AED',
    '#B45309', '#0369A1', '#BE185D', '#15803D',
    '#9333EA', '#0891B2', '#CA8A04', '#4B5563',
  ],
};

/** `dark` on anything falsy/unrecognised — see the module doc for why. */
export function themeFor(t?: string | null): PdfTheme {
  return t === 'light' ? LIGHT_THEME : DARK_THEME;
}

// `.catch()` rather than `.parse()` failing: a `?theme=` typo or stray value
// should render the report (dark, same as no param at all), never 400 a
// download over a cosmetic query param.
const themeQuerySchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.toLowerCase() : v),
  z.enum(['light', 'dark']),
).catch('dark');

/** Reads `req.query.theme` (or any raw value) down to a validated ThemeName. */
export function parseThemeQuery(raw: unknown): ThemeName {
  return themeQuerySchema.parse(raw);
}

/** `#RRGGBB` → ExcelJS's `AARRGGBB` argb string, opaque. */
export function hexToArgb(hex: string): string {
  return 'FF' + hex.replace('#', '').toUpperCase();
}
