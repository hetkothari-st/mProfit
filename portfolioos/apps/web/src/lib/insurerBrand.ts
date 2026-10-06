/**
 * Insurer brand lookup — the insurance twin of `bankBrand.ts`: which insurer a
 * label names, and its committed logo + measured colour.
 */
import { INSURER_BRAND_ASSETS } from '@/data/insurerBrands.generated';
import { INDIAN_INSURERS, insurerSlug, type IndianInsurer } from '@/data/indianInsurers';
import type { BankBrand } from '@/lib/bankBrand';

/** Lower-case words separated by single spaces, padded for whole-word search. */
function normalise(s: string): string {
  return ` ${s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

const TERMS = INDIAN_INSURERS.flatMap((insurer) =>
  [insurer.name, ...(insurer.keywords ?? [])].map((t) => ({ insurer, term: normalise(t) })),
);

/**
 * The insurer a label names. Whole-word matches, longest term wins — so
 * "Bajaj Allianz Life" is the life company, not "Bajaj Allianz" general.
 */
export function resolveInsurer(label: string | null | undefined): IndianInsurer | undefined {
  if (!label?.trim()) return undefined;
  const hay = normalise(label);
  let best: { insurer: IndianInsurer; len: number } | undefined;
  for (const { insurer, term } of TERMS) {
    if (hay.includes(term) && (!best || term.length > best.len)) best = { insurer, len: term.length };
  }
  return best?.insurer;
}

/** Same shape as a bank's brand, so the logo plate and tile helpers take either. */
export function insurerBrandFor(label: string | null | undefined): BankBrand | null {
  const insurer = resolveInsurer(label);
  if (!insurer) return null;
  const slug = insurerSlug(insurer.name);
  const asset = INSURER_BRAND_ASSETS[slug];
  return {
    name: insurer.name,
    slug,
    logo: asset?.logo ?? null,
    color: asset?.color ?? null,
    accent: asset?.accent ?? null,
    aspect: asset?.aspect ?? 1,
  };
}

/** "HDFC ERGO" → "HE", "Star Health" → "SH", "LIC" → "LI". */
export function insurerInitials(name: string): string {
  const words = name
    .replace(/\b(insurance|assurance|company|general|life|of|the|ltd|limited)\b/gi, ' ')
    .split(/[\s\-.&]+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? name).slice(0, 3).toUpperCase() || '—';
}
