/**
 * CarDekho new-car catalog crawler.
 *
 * Strategy: fetch + regex on SSR HTML. CarDekho serves variant cards in
 * `<div class="variantDtlhead">` containers on
 * `/{brand}/{model}/price-in-new-delhi` pages. Each card has trim name,
 * fuel type, and ex-showroom price.
 *
 * Polite: 1.2s gap between requests, single concurrency, resumable
 * via `cardekho-checkpoint.json` written to cwd.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

const BASE = 'https://www.cardekho.com';
const CHECKPOINT = resolve(process.cwd(), 'cardekho-checkpoint.json');
const REQ_GAP_MS = 1200;
const FETCH_TIMEOUT_MS = 20_000;

const UA =
  'Mozilla/5.0 (Linux; Android 12; SM-A526B) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36';

const BRAND_SLUGS = [
  'maruti', 'maruti-suzuki',
  'hyundai', 'tata', 'mahindra', 'kia', 'toyota', 'honda',
  'mg', 'skoda', 'volkswagen', 'renault', 'nissan', 'jeep',
  'ford', 'datsun', 'chevrolet', 'fiat',
  'bmw', 'mercedes-benz', 'audi', 'jaguar', 'land-rover', 'volvo',
  'lexus', 'mini', 'porsche', 'rolls-royce', 'bentley', 'ferrari',
  'lamborghini', 'maserati', 'aston-martin', 'bugatti',
  'isuzu', 'force', 'premier', 'hindustan-motors',
  'byd', 'citroen', 'lotus', 'mclaren',
];

interface Variant {
  trim: string;
  baseMsrp: string | null;
  fuelType: string | null;
  bodyType: string | null;
  displacement: number | null;
  seatingCap: number | null;
}

interface ModelRecord {
  brand: string;
  model: string;
  url: string;
  category: string | null;
  variants: Variant[];
}

interface Checkpoint {
  doneBrands: string[];
  models: ModelRecord[];
}

export interface CardekhoCrawlOptions {
  brand?: string;
  resume?: boolean;
  dry?: boolean;
  limit?: number;
}

function loadCheckpoint(): Checkpoint {
  if (!existsSync(CHECKPOINT)) return { doneBrands: [], models: [] };
  try { return JSON.parse(readFileSync(CHECKPOINT, 'utf8')); }
  catch { return { doneBrands: [], models: [] }; }
}

function saveCheckpoint(cp: Checkpoint) {
  writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN,en;q=0.9' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) {
      logger.debug({ url, status: res.status }, 'fetch non-200');
      return null;
    }
    const html = await res.text();
    await sleep(REQ_GAP_MS);
    return html;
  } catch (err) {
    logger.warn({ url, err: err instanceof Error ? err.message : String(err) }, 'fetch failed');
    return null;
  }
}

function stripStyleScript(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
}

function listModelsFromBrandPage(html: string, brand: string): { model: string; url: string }[] {
  const stripped = stripStyleScript(html);
  const out = new Map<string, string>();
  const re = new RegExp(`href="(/${brand}/([a-z0-9][a-z0-9\\-]*?))(?:[/"#?]|$)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const path = m[1]!;
    const slug = m[2]!;
    if (
      slug === 'user-reviews' ||
      slug === 'gallery' ||
      slug === 'specifications' ||
      slug === 'price-in-new-delhi' ||
      slug.length < 2 ||
      slug.length > 60
    ) continue;
    if (!out.has(slug)) out.set(slug, `${BASE}${path}`);
  }
  return Array.from(out.entries()).map(([model, url]) => ({ model, url }));
}

function parseModelSummary(html: string): { bodyType: string | null; displacement: number | null; seatingCap: number | null } {
  let bodyType: string | null = null;
  let displacement: number | null = null;
  let seatingCap: number | null = null;
  const ldMatches = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of ldMatches) {
    const m = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!m) continue;
    let data: unknown;
    try { data = JSON.parse(m[1]!); } catch { continue; }
    const stack: unknown[] = [data];
    while (stack.length) {
      const o = stack.pop();
      if (Array.isArray(o)) stack.push(...o);
      else if (o && typeof o === 'object') {
        const x = o as Record<string, unknown>;
        if (x['@type'] === 'Car' || x['@type'] === 'Vehicle') {
          if (typeof x['bodyType'] === 'string') bodyType ??= x['bodyType'];
          const eng = x['vehicleEngine'];
          if (Array.isArray(eng) && eng.length > 0 && typeof eng[0] === 'object') {
            const e0 = eng[0] as Record<string, unknown>;
            const ed = e0['engineDisplacement'] as { value?: string | number } | undefined;
            if (ed && ed.value != null) displacement ??= Number(String(ed.value).replace(/[^\d.]/g, '')) || null;
          } else if (eng && typeof eng === 'object') {
            const ed = (eng as Record<string, unknown>)['engineDisplacement'] as { value?: string | number } | undefined;
            if (ed && ed.value != null) displacement ??= Number(String(ed.value).replace(/[^\d.]/g, '')) || null;
          }
          const seat = x['seatingCapacity'];
          if (seat != null) seatingCap ??= Number(seat) || null;
        }
        for (const v of Object.values(x)) if (v && typeof v === 'object') stack.push(v);
      }
    }
  }
  return { bodyType, displacement, seatingCap };
}

function parseVariantsFromPricePage(html: string, modelSlug: string): Variant[] {
  const stripped = stripStyleScript(html);
  const matches = Array.from(stripped.matchAll(/<div[^>]*class="[^"]*variantDtlhead[^"]*"[^>]*>/gi));
  const variants: Variant[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.index!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : Math.min(start + 8000, stripped.length);
    const chunk = stripped.slice(start, end).replace(/\s+/g, ' ');

    const trimMatch = chunk.match(/([A-Za-z][A-Za-z0-9 +\-/\.]{1,79})<span class="varfueltype">\s*\(([^)]+)\)/);
    if (!trimMatch) continue;
    let trim = trimMatch[1]!.trim();
    const fuel = trimMatch[2]!.trim().toUpperCase();

    const modelPrefix = modelSlug.replace(/-/g, ' ').toLowerCase();
    if (trim.toLowerCase().startsWith(modelPrefix + ' ')) {
      trim = trim.slice(modelPrefix.length + 1).trim();
    }
    if (!trim || trim.length < 1 || trim.length > 60) continue;

    const priceMatch = chunk.match(/Ex-Showroom Price[\s\S]{0,300}?Rs\.<\/i>\s*([\d,]+)/);
    const baseMsrp = priceMatch ? priceMatch[1]!.replace(/,/g, '') : null;

    variants.push({
      trim,
      baseMsrp,
      fuelType: fuel,
      bodyType: null,
      displacement: null,
      seatingCap: null,
    });
  }
  return variants;
}

function inferCategory(bodyType: string | null): string {
  if (!bodyType) return 'Other';
  const b = bodyType.toLowerCase();
  if (b.includes('hatch')) return 'Hatchback';
  if (b.includes('sedan')) return 'Sedan';
  if (b.includes('suv')) return 'SUV';
  if (b.includes('muv') || b.includes('mpv')) return 'MUV';
  if (b.includes('coupe')) return 'Coupe';
  if (b.includes('convertible')) return 'Convertible';
  if (b.includes('bike') || b.includes('motorcycle')) return 'Bike';
  if (b.includes('scooter')) return 'Scooter';
  return 'Other';
}

async function upsertModel(rec: ModelRecord) {
  const currentYear = new Date().getFullYear();
  const make = rec.brand.toUpperCase();
  const model = rec.model.toUpperCase();
  for (const v of rec.variants) {
    if (!v.trim || !v.baseMsrp) continue;
    const category = rec.category ?? inferCategory(v.bodyType);
    await prisma.vehicleCatalog.upsert({
      where: {
        make_model_trim_yearFrom: { make, model, trim: v.trim, yearFrom: currentYear },
      },
      update: {
        category,
        baseMsrp: v.baseMsrp,
        fuelType: v.fuelType,
        bodyType: v.bodyType,
        displacement: v.displacement,
        seatingCap: v.seatingCap,
        catalogSource: 'cardekho-crawl',
        lastSyncedAt: new Date(),
      },
      create: {
        category,
        make,
        model,
        yearFrom: currentYear,
        yearTo: null,
        trim: v.trim,
        baseMsrp: v.baseMsrp,
        fuelType: v.fuelType,
        bodyType: v.bodyType,
        displacement: v.displacement,
        seatingCap: v.seatingCap,
        catalogSource: 'cardekho-crawl',
      },
    });
  }
}

async function crawlBrand(brand: string, opts: CardekhoCrawlOptions, cp: Checkpoint): Promise<number> {
  console.log(`[crawl] brand=${brand}`);
  const brandUrls = [
    `${BASE}/${brand}-cars`,
    `${BASE}/cars/${brand[0]!.toUpperCase()}${brand.slice(1)}`,
  ];
  let html: string | null = null;
  for (const url of brandUrls) {
    html = await fetchHtml(url);
    if (html) break;
  }
  if (!html) {
    console.log(`[crawl]   ${brand}: brand page unavailable`);
    return 0;
  }
  const models = listModelsFromBrandPage(html, brand);
  console.log(`[crawl]   ${brand}: ${models.length} models`);
  let totalVariants = 0;
  for (const m of models) {
    if (opts.limit && cp.models.length >= opts.limit) break;
    const priceUrl = `${m.url}/price-in-new-delhi`;
    const modelHtml = await fetchHtml(priceUrl);
    if (!modelHtml) continue;
    const summary = parseModelSummary(modelHtml);
    const variants = parseVariantsFromPricePage(modelHtml, m.model);
    const rec: ModelRecord = {
      brand,
      model: m.model,
      url: m.url,
      category: inferCategory(summary.bodyType),
      variants: variants.map((v) => ({
        ...v,
        bodyType: v.bodyType ?? summary.bodyType,
        displacement: v.displacement ?? summary.displacement,
        seatingCap: v.seatingCap ?? summary.seatingCap,
      })),
    };
    console.log(`[crawl]     ${brand}/${m.model} → ${rec.variants.length} variants`);
    totalVariants += rec.variants.length;
    if (!opts.dry && rec.variants.length > 0) await upsertModel(rec);
  }
  return totalVariants;
}

export async function crawlCardekhoCatalog(opts: CardekhoCrawlOptions = {}): Promise<{ variants: number; brands: number }> {
  const cp: Checkpoint = opts.resume ? loadCheckpoint() : { doneBrands: [], models: [] };
  let totalVariants = 0;
  for (const brand of BRAND_SLUGS) {
    if (opts.brand && brand !== opts.brand) continue;
    if (opts.resume && cp.doneBrands.includes(brand)) continue;
    const n = await crawlBrand(brand, opts, cp);
    totalVariants += n;
    cp.doneBrands.push(brand);
    saveCheckpoint(cp);
    if (opts.limit && cp.models.length >= opts.limit) break;
  }
  return { variants: totalVariants, brands: cp.doneBrands.length };
}
