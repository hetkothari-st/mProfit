/**
 * Bank brand lookup: which bank a free-text label names, and that bank's
 * committed logo + measured brand colour (from `bankBrands.generated.ts`).
 *
 * Used wherever a bank shows up as a tile — bank accounts, FDs, RDs — so every
 * surface agrees on what "HDFC" looks like. The colour helpers keep text
 * readable whatever the brand colour is: a lemon-yellow logo still has to carry
 * white text on its tile, and a navy one still has to read on a dark theme.
 */
import { BANK_BRAND_ASSETS } from '@/data/bankBrands.generated';
import { INDIAN_BANKS, bankSlug, type IndianBank } from '@/data/indianBanks';

export interface BankBrand {
  name: string;
  slug: string;
  logo: string | null;
  color: string | null;
  accent: string | null;
  /** Width / height of the trimmed mark — wordmarks run 3–8, icons ~1. */
  aspect: number;
}

// ── Matching ────────────────────────────────────────────────────────────────

/** Lower-case words separated by single spaces, padded for whole-word search. */
function normalise(s: string): string {
  return ` ${s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

/**
 * First words that name a bank on their own ("HDFC", "Kotak") are usable
 * aliases; these are not — they're states, common words or shared prefixes
 * ("Karnataka Gramin Bank" is not Karnataka Bank, "Yes" is not Yes Bank).
 */
const GENERIC_FIRST_WORDS = new Set([
  'state', 'punjab', 'indian', 'india', 'central', 'union', 'city', 'south',
  'jammu', 'standard', 'bank', 'yes', 'karnataka', 'tamilnad',
]);

const TERMS: Array<{ bank: IndianBank; term: string }> = INDIAN_BANKS.flatMap((bank) => {
  const terms = [bank.name, ...(bank.keywords ?? [])];
  const first = bank.name.split(/\s+/)[0]!.toLowerCase();
  if (first.length >= 3 && !GENERIC_FIRST_WORDS.has(first)) terms.push(first);
  return terms.map((t) => ({ bank, term: normalise(t) }));
});

/**
 * The bank a label names — "HDFC Bank", "SBI", "hdfc fd 2025", "J&K Bank".
 * Whole-word matches only, longest term wins, so "Central Bank of India" isn't
 * read as "Bank of India".
 */
export function resolveBank(label: string | null | undefined): IndianBank | undefined {
  if (!label?.trim()) return undefined;
  const hay = normalise(label);
  let best: { bank: IndianBank; len: number } | undefined;
  for (const { bank, term } of TERMS) {
    if (hay.includes(term) && (!best || term.length > best.len)) best = { bank, len: term.length };
  }
  return best?.bank;
}

export function bankBrandFor(label: string | null | undefined): BankBrand | null {
  const bank = resolveBank(label);
  if (!bank) return null;
  const slug = bankSlug(bank.name);
  const asset = BANK_BRAND_ASSETS[slug];
  return {
    name: bank.name,
    slug,
    logo: asset?.logo ?? null,
    color: asset?.color ?? null,
    accent: asset?.accent ?? null,
    aspect: asset?.aspect ?? 1,
  };
}

// ── Colour ──────────────────────────────────────────────────────────────────

type Rgb = [number, number, number];
type Hsl = [number, number, number]; // h 0–360, s 0–1, l 0–1

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl([r, g, b]: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
    : max === gn ? ((bn - rn) / d + 2) * 60
    : ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Step lightness in `dir` (keeping hue/saturation) until `min` contrast with `against`. */
function untilContrast(h: number, s: number, l: number, against: string, min: number, dir: 1 | -1): string {
  for (let light = l; light >= 0 && light <= 1; light += dir * 0.01) {
    const c = hslToHex(h, s, light);
    if (contrastRatio(c, against) >= min) return c;
  }
  return dir < 0 ? '#000000' : '#ffffff';
}

export interface TileSurface {
  /** The brand colour the tile was built from. */
  base: string;
  /** Gradient stops, light → dark; each carries white text at ≥ 4.5:1. */
  from: string;
  via: string;
  to: string;
  /** Secondary brand colour for decorative glows. */
  glow: string;
}

/**
 * A tile background in the bank's colour that white text can sit on. A light
 * brand colour (yellow, sky blue) gives way to its darker second colour when
 * the mark has one, then deepens until white clears WCAG AA.
 */
export function tileSurface(color: string, accent: string | null): TileSurface {
  const base =
    accent && relativeLuminance(color) > 0.4 && relativeLuminance(accent) < relativeLuminance(color)
      ? accent
      : color;
  const [h, s0, l] = rgbToHsl(hexToRgb(base));
  const s = Math.min(s0, 0.85);
  const via = untilContrast(h, s, l, '#ffffff', 4.8, -1);
  const lv = rgbToHsl(hexToRgb(via))[2];
  const from = untilContrast(h, s, Math.min(lv + 0.08, 1), '#ffffff', 4.5, -1);
  const to = hslToHex(h, s, Math.max(lv - 0.14, 0.04));
  return { base, from, via, to, glow: accent && accent !== base ? accent : color };
}

/**
 * The brand colour as an accent (rings, headings, borders) on the app's card
 * surface: lightened for the dark theme, deepened for the light one, until it
 * reads at ≥ 4.5:1.
 */
export function brandAccent(color: string, dark: boolean): string {
  const [h, s, l] = rgbToHsl(hexToRgb(color));
  const sat = Math.min(s, 0.9);
  return dark
    ? untilContrast(h, sat, Math.max(l, 0.55), '#0a0a0a', 4.6, 1)
    : untilContrast(h, sat, Math.min(l, 0.45), '#ffffff', 4.6, -1);
}
