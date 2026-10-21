/**
 * Fonts for will PDFs (packages/api/assets/fonts, see its README).
 * The same relative path works from src/services/will (tsx, vitest) and from
 * dist/services/will (production); the Dockerfile copies packages/api/assets.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_DIR = fileURLToPath(new URL('../../../assets/fonts/', import.meta.url));

/** Serif faces for the legal text; Noto Serif carries the rupee sign. */
export const WILL_FONTS = {
  regular: join(FONT_DIR, 'NotoSerif-Regular.ttf'),
  bold: join(FONT_DIR, 'NotoSerif-Bold.ttf'),
  italic: join(FONT_DIR, 'NotoSerif-Italic.ttf'),
  deva: join(FONT_DIR, 'NotoSerifDevanagari-Regular.ttf'),
  devaBold: join(FONT_DIR, 'NotoSerifDevanagari-Bold.ttf'),
} as const;

export interface ScriptRun {
  text: string;
  deva: boolean;
}

// Devanagari script (incl. Devanagari Extended, Vedic Extensions) plus the shared danda marks.
const DEVANAGARI = /\p{Script_Extensions=Devanagari}/u;
// Characters both fonts have; they stay with the run they follow so a run is never split by a space.
const NEUTRAL = /[\s\d.,;:!?()'"/&%+*-]/;
// Zero-width non-joiner and joiner shape the letters around them (e.g. a half form), so they
// stay in the run they follow. Code points, not literals: both are invisible in source.
const JOINERS = new Set([0x200c, 0x200d]);
const isNeutral = (ch: string): boolean => NEUTRAL.test(ch) || JOINERS.has(ch.codePointAt(0) ?? 0);

/**
 * Split text into runs that one font can draw. Noto Serif has Latin and the
 * rupee sign; Noto Serif Devanagari has Devanagari. pdfkit draws each run with
 * `continued: true` so the line reads as one.
 */
export function scriptRuns(text: string): ScriptRun[] {
  const runs: ScriptRun[] = [];
  let pending = '';
  for (const ch of text) {
    if (isNeutral(ch)) {
      const last = runs[runs.length - 1];
      if (last) last.text += ch;
      else pending += ch;
      continue;
    }
    const deva = DEVANAGARI.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.deva === deva) {
      last.text += ch;
      continue;
    }
    runs.push({ text: pending + ch, deva });
    pending = '';
  }
  if (runs.length === 0 && pending) runs.push({ text: pending, deva: false });
  return runs;
}
