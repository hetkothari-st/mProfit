/**
 * Which card a saved credit card is, and how to draw it.
 *
 * A card in the catalog (data/creditCardCatalog) is drawn as that card. Any
 * other card is drawn in its tier's finish — "Platinum" in brushed silver,
 * "Metal" in black metal, "Signature" deep and matte — in the issuer's brand
 * colours, so an unlisted card still looks like the kind of card it is.
 */
import {
  CARD_CATALOG,
  CARD_ISSUERS,
  type CardDesign,
  type CardNetwork,
  type CardTier,
  type CatalogCard,
} from '@/data/creditCardCatalog';
import { bankBrandFor, brandAccent, resolveBank, tileSurface } from '@/lib/bankBrand';

export interface ResolvedCard {
  /** Catalog id, or null when drawn from the tier fallback. */
  catalogId: string | null;
  /** Stable key for the design: the catalog id or `tier:<tier>`. */
  designKey: string;
  /** Canonical issuer name (a bank from the bank list, or e.g. "American Express"). */
  issuer: string;
  /** Product name to print on the card. */
  product: string;
  tier: CardTier;
  network: CardNetwork | null;
  design: CardDesign;
}

/** Lower-case words separated by single spaces, padded for whole-word search. */
function normalise(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

const compact = (s: string) => s.replace(/\s+/g, '');

/** Card-only brand names that stand for a bank ("BOBCARD" is Bank of Baroda's card arm). */
const CARD_ARM_ALIASES: Array<{ term: string; issuer: string }> = [
  { term: 'bobcard', issuer: 'Bank of Baroda' },
  { term: 'bob card', issuer: 'Bank of Baroda' },
  { term: 'bob financial', issuer: 'Bank of Baroda' },
  { term: 'onecard', issuer: 'Bank of Baroda' },
  { term: 'one card', issuer: 'Bank of Baroda' },
];

const ISSUER_TERMS = [
  ...CARD_ISSUERS.flatMap((i) => [i.name, ...i.aliases].map((t) => ({ term: normalise(t), issuer: i.name }))),
  ...CARD_ARM_ALIASES.map((a) => ({ term: normalise(a.term), issuer: a.issuer })),
];

/** "HDFC" → "HDFC Bank", "SBI Card" → "State Bank of India", "Amex" → "American Express". */
export function resolveCardIssuer(label: string | null | undefined): string {
  const raw = label?.trim() ?? '';
  if (!raw) return '';
  const hay = normalise(raw);
  let best: { issuer: string; len: number } | undefined;
  for (const { term, issuer } of ISSUER_TERMS) {
    if (hay.includes(term) && (!best || term.length > best.len)) best = { issuer, len: term.length };
  }
  if (best) return best.issuer;
  return resolveBank(raw)?.name ?? raw;
}

/** Catalog cards from an issuer, for the add-card picker. Blank issuer → every card. */
export function cardProductsFor(issuerLabel: string | null | undefined): CatalogCard[] {
  const issuer = resolveCardIssuer(issuerLabel);
  return issuer ? CARD_CATALOG.filter((c) => c.issuer === issuer) : CARD_CATALOG;
}

/** The issuer's catalog card named in `cardName` — longest whole-word name or alias wins. */
function matchCatalog(issuer: string, cardName: string): CatalogCard | undefined {
  const hay = normalise(cardName);
  let best: { card: CatalogCard; len: number } | undefined;
  for (const card of CARD_CATALOG) {
    if (card.issuer !== issuer) continue;
    for (const name of [card.product, ...(card.aliases ?? [])]) {
      const term = normalise(name);
      // Whole words ("Regalia Gold"), or the same letters run together ("Simplyclick").
      const hit = hay.includes(term) || compact(hay) === compact(term);
      if (hit && (!best || term.length > best.len)) best = { card, len: term.length };
    }
  }
  return best?.card;
}

// ── Tier fallback ───────────────────────────────────────────────────────────

/** Most specific first: "World Elite Metal" is a metal card, "Platinum Gold" a platinum one. */
const TIER_WORDS: Array<[CardTier, RegExp]> = [
  ['metal', /\bmetal\b/],
  ['infinite', /\binfinite\b/],
  ['black', /\bblack\b/],
  ['world', /\bworld\b/],
  ['signature', /\bsignature\b/],
  ['platinum', /\bplatinum\b/],
  ['titanium', /\btitanium\b/],
  ['gold', /\bgold\b/],
];

export function tierFromName(cardName: string): CardTier {
  const n = cardName.toLowerCase();
  return TIER_WORDS.find(([, re]) => re.test(n))?.[0] ?? 'classic';
}

const lg = (deg: number, ...stops: string[]) => `linear-gradient(${deg}deg, ${stops.join(', ')})`;
const FALLBACK_BRAND = '#3b4a63';

function tierDesign(tier: CardTier, color: string | null, accent: string | null): CardDesign {
  const surface = tileSurface(color ?? FALLBACK_BRAND, color ? accent : null);
  const light = color ? brandAccent(color, true) : '#cbd5e1';
  const base = { chip: 'gold', orientation: 'horizontal', ink: 'light' } as const;
  switch (tier) {
    case 'platinum':
      return { ...base, background: lg(135, '#eef0f3', '#c6cbd2 45%', '#98a0a9'), finish: 'metal',
        pattern: 'lines', patternColor: 'rgba(0,0,0,0.10)', ink: 'dark', chip: 'silver' };
    case 'gold':
      return { ...base, background: lg(135, '#f1d98f', '#d0a954 45%', '#9b7430'), finish: 'metal',
        pattern: 'lines', patternColor: 'rgba(80,55,15,0.12)', ink: 'dark' };
    case 'titanium':
      return { ...base, background: lg(135, '#7d848d', '#555b63 50%', '#34383e'), finish: 'metal',
        pattern: 'lines', patternColor: 'rgba(255,255,255,0.06)', chip: 'silver' };
    case 'metal':
      return { ...base, background: lg(135, '#26262b', '#121215 55%', '#050506'), finish: 'metal',
        pattern: 'lines', patternColor: 'rgba(255,255,255,0.05)', accent: light };
    case 'black':
      return { ...base, background: lg(135, '#1f1f23', '#09090b'), finish: 'matte',
        pattern: 'lines', patternColor: 'rgba(255,255,255,0.05)', accent: light };
    case 'infinite':
    case 'world':
      return { ...base, background: lg(135, surface.to, '#0a0a0d 75%'), finish: 'matte',
        pattern: 'topo', patternColor: 'rgba(255,255,255,0.10)', accent: '#d6c79c' };
    case 'signature':
      return { ...base, background: lg(135, surface.via, surface.to, '#0b0b0f'), finish: 'matte',
        pattern: 'lines', patternColor: 'rgba(255,255,255,0.07)', accent: '#dcc28c' };
    case 'classic':
      return { ...base, background: lg(135, surface.from, `${surface.via} 55%`, surface.to), finish: 'glossy',
        pattern: 'waves', patternColor: 'rgba(255,255,255,0.14)' };
  }
}

function asNetwork(n: string | null | undefined): CardNetwork | null {
  return n === 'VISA' || n === 'MASTERCARD' || n === 'AMEX' || n === 'RUPAY' || n === 'DINERS' ? n : null;
}

export function resolveCardDesign(card: {
  issuerBank: string;
  cardName: string;
  network: string | null;
}): ResolvedCard {
  const issuer = resolveCardIssuer(card.issuerBank);
  const hit = matchCatalog(issuer, card.cardName);
  if (hit) {
    return {
      catalogId: hit.id,
      designKey: hit.id,
      issuer,
      product: hit.product,
      tier: hit.tier,
      network: asNetwork(card.network) ?? hit.network,
      design: hit.design,
    };
  }
  const tier = tierFromName(card.cardName);
  const brand = bankBrandFor(issuer);
  const color = brand?.color ?? CARD_ISSUERS.find((i) => i.name === issuer)?.color ?? null;
  return {
    catalogId: null,
    designKey: `tier:${tier}`,
    issuer,
    product: card.cardName.trim(),
    tier,
    network: asNetwork(card.network) ?? (issuer === 'American Express' ? 'AMEX' : null),
    design: tierDesign(tier, color, brand?.accent ?? null),
  };
}
