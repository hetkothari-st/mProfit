/**
 * Fonts for will PDFs (packages/api/assets/fonts, see its README).
 * The same relative path works from src/services/will (tsx, vitest) and from
 * dist/services/will (production); the Dockerfile copies packages/api/assets.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_DIR = fileURLToPath(new URL('../../../assets/fonts/', import.meta.url));

export const WILL_FONTS = {
  regular: join(FONT_DIR, 'NotoSans-Regular.ttf'),
  bold: join(FONT_DIR, 'NotoSans-Bold.ttf'),
  deva: join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf'),
  devaBold: join(FONT_DIR, 'NotoSansDevanagari-Bold.ttf'),
} as const;

export interface ScriptRun {
  text: string;
  deva: boolean;
}

// Devanagari script (incl. Devanagari Extended, Vedic Extensions) plus the shared danda marks.
const DEVANAGARI = /\p{Script_Extensions=Devanagari}/u;
// Characters both fonts have; they stay with the run they follow so a run is never split by a space.
const NEUTRAL = /[\s\d.,;:!?()'"/&%+*-]/;

/**
 * Split text into runs that one font can draw. Noto Sans has Latin and the
 * rupee sign; Noto Sans Devanagari has Devanagari. pdfkit draws each run with
 * `continued: true` so the line reads as one.
 */
export function scriptRuns(text: string): ScriptRun[] {
  const runs: ScriptRun[] = [];
  let pending = '';
  for (const ch of text) {
    if (NEUTRAL.test(ch)) {
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
