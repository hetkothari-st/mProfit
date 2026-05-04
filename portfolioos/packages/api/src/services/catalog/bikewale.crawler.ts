/**
 * BikeWale new-bike catalog crawler.
 *
 * Variant tables on `/{brand}-bikes/{model}/price-in-delhi/` use semantic
 * markers (`Ex-showroom`/`<strong>` price pairs) and variant-name spans.
 * CSS classes are obfuscated/build-dependent — we anchor on stable strings.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

const BASE = 'https://www.bikewale.com';
const CHECKPOINT = resolve(process.cwd(), 'bikewale-checkpoint.json');
const REQ_GAP_MS = 1200;
const FETCH_TIMEOUT_MS = 20_000;

const UA =
  'Mozilla/5.0 (Linux; Android 12; SM-A526B) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36';

const BRAND_SLUGS = [
  'bajaj', 'hero', 'honda', 'tvs', 'royal-enfield', 'yamaha',
  'suzuki', 'ktm', 'kawasaki', 'bmw', 'ducati', 'harley-davidson',
  'benelli', 'aprilia', 'triumph', 'mv-agusta', 'ather',
  'ola-electric', 'ampere', 'bgauss', 'evolet', 'okinawa', 'pure-ev',
  'simple-energy', 'revolt', 'ultraviolette', 'lambretta', 'piaggio',
  'vespa', 'jawa', 'mahindra', 'hero-electric', 'okaya', 'odysse',
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
  category: string;
  variants: Variant[];
}

interface Checkpoint {
  doneBrands: string[];
  models: ModelRecord[];
}

export interface BikewaleCrawlOptions {
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
    if (!res.ok) return null;
    const html = await res.text();
    await sleep(REQ_GAP_MS);
    return html;
  } catch (err) {
    logger.warn({ url, err: err instanceof Error ? err.message : String(err) }, 'fetch failed');
    return null;
  }
}

function stripAndCollapse(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\s+/g, ' ');
}

function listModelsFromBrandPage(html: string, brand: string): { model: string; url: string }[] {
  const out = new Map<string, string>();
  const re = new RegExp(`href="(/${brand}-bikes/([a-z0-9][a-z0-9\\-]*?))/`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const path = m[1]!;
    const slug = m[2]!;
    if (slug.length < 2 || slug.length > 60) continue;
    if (!out.has(slug)) out.set(slug, `${BASE}${path}`);
  }
  return Array.from(out.entries()).map(([model, url]) => ({ model, url }));
}

function inferCategoryFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('scooter') || /\b(activa|jupiter|access|dio|burgman|pep|maestro|fascino|ntorq)\b/.test(n)) return 'Scooter';
  return 'Bike';
}

function inferFuelFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('electric') || /\b(ev|zero|chetak|iq|ola|s1|ather|450|gen|impulse)\b/.test(n)) return 'ELECTRIC';
  return 'PETROL';
}

function parseVariants(html: string, modelSlug: string, modelDisplayName: string): Variant[] {
  const stripped = stripAndCollapse(html);
  const variants = new Map<string, Variant>();
  const priceMatches = Array.from(
    stripped.matchAll(/Ex-showroom\s*<\/strong>[\s\S]{0,400}?<strong[^>]*>₹\s*([\d,]+)/gi),
  );
  for (const m of priceMatches) {
    const price = m[1]!.replace(/,/g, '');
    const back = stripped.slice(Math.max(0, m.index! - 4500), m.index!);
    const nameMatches = Array.from(
      back.matchAll(/<span[^>]*>([A-Z][A-Za-z0-9 +\-/.,()]{4,80}?)<\/span>\s*<\/div>/g),
    );
    let trim: string | null = null;
    if (nameMatches.length > 0) {
      const last = nameMatches[nameMatches.length - 1]!;
      trim = last[1]!.trim();
    }
    if (!trim) continue;
    const prefix = modelDisplayName.toLowerCase();
    if (trim.toLowerCase().startsWith(prefix + ' ')) {
      trim = trim.slice(prefix.length + 1).trim();
    } else if (trim.toLowerCase().startsWith(modelSlug.replace(/-/g, ' '))) {
      trim = trim.slice(modelSlug.replace(/-/g, ' ').length).trim();
    }
    if (!trim || trim.length < 1 || trim.length > 80) continue;
    if (!variants.has(trim)) {
      variants.set(trim, {
        trim,
        baseMsrp: price,
        fuelType: inferFuelFromName(modelDisplayName + ' ' + trim),
        bodyType: null,
        displacement: null,
        seatingCap: 2,
      });
    }
  }
  return Array.from(variants.values());
}

function parseModelDisplayName(html: string, fallback: string): string {
  const ldBlocks = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const block of ldBlocks) {
    const inner = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/, '');
    try {
      const data = JSON.parse(inner);
      const stack: unknown[] = [data];
      while (stack.length) {
        const o = stack.pop();
        if (Array.isArray(o)) stack.push(...o);
        else if (o && typeof o === 'object') {
          const x = o as Record<string, unknown>;
          if (x['@type'] === 'Product' && typeof x['name'] === 'string') {
            return String(x['name']);
          }
          for (const v of Object.values(x)) if (v && typeof v === 'object') stack.push(v);
        }
      }
    } catch { /* skip */ }
  }
  return fallback;
}

async function upsertModel(rec: ModelRecord) {
  const currentYear = new Date().getFullYear();
  const make = rec.brand.toUpperCase().replace(/-/g, ' ');
  const model = rec.model.toUpperCase().replace(/-/g, ' ');
  for (const v of rec.variants) {
    if (!v.trim || !v.baseMsrp) continue;
    await prisma.vehicleCatalog.upsert({
      where: {
        make_model_trim_yearFrom: { make, model, trim: v.trim, yearFrom: currentYear },
      },
      update: {
        category: rec.category,
        baseMsrp: v.baseMsrp,
        fuelType: v.fuelType,
        bodyType: v.bodyType,
        displacement: v.displacement,
        seatingCap: v.seatingCap,
        catalogSource: 'bikewale-crawl',
        lastSyncedAt: new Date(),
      },
      create: {
        category: rec.category,
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
        catalogSource: 'bikewale-crawl',
      },
    });
  }
}

async function crawlBrand(brand: string, opts: BikewaleCrawlOptions, cp: Checkpoint): Promise<number> {
  console.log(`[crawl] brand=${brand}`);
  const html = await fetchHtml(`${BASE}/${brand}-bikes/`);
  if (!html) {
    console.log(`[crawl]   ${brand}: brand page unavailable`);
    return 0;
  }
  const models = listModelsFromBrandPage(html, brand);
  console.log(`[crawl]   ${brand}: ${models.length} models`);
  let totalVariants = 0;
  for (const m of models) {
    if (opts.limit && cp.models.length >= opts.limit) break;
    const modelHtml = await fetchHtml(`${m.url}/price-in-delhi/`);
    if (!modelHtml) continue;
    const display = parseModelDisplayName(modelHtml, m.model);
    const variants = parseVariants(modelHtml, m.model, display);
    const rec: ModelRecord = {
      brand,
      model: m.model,
      url: m.url,
      category: inferCategoryFromName(display),
      variants,
    };
    console.log(`[crawl]     ${brand}/${m.model} → ${variants.length} variants`);
    totalVariants += variants.length;
    if (!opts.dry && variants.length > 0) await upsertModel(rec);
  }
  return totalVariants;
}

export async function crawlBikewaleCatalog(opts: BikewaleCrawlOptions = {}): Promise<{ variants: number; brands: number }> {
  const cp: Checkpoint = opts.resume ? loadCheckpoint() : { doneBrands: [], models: [] };
  let total = 0;
  for (const brand of BRAND_SLUGS) {
    if (opts.brand && brand !== opts.brand) continue;
    if (opts.resume && cp.doneBrands.includes(brand)) continue;
    total += await crawlBrand(brand, opts, cp);
    cp.doneBrands.push(brand);
    saveCheckpoint(cp);
    if (opts.limit && cp.models.length >= opts.limit) break;
  }
  return { variants: total, brands: cp.doneBrands.length };
}
