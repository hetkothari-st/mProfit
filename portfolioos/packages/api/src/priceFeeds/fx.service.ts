import { Decimal } from 'decimal.js';
import { request } from 'undici';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { yahooQuoteRaw } from './yahooClient.js';

// ─── Pair config ────────────────────────────────────────────────────
//
// PRIMARY_INR_PAIRS — currencies for which RBI publishes a daily reference
// rate (USD, EUR, GBP, JPY are the canonical four; the rest fall back to
// Yahoo automatically). All are stored with quoteCcy = "INR".
//
// CROSS_PAIRS — non-INR pairs (e.g. EUR/USD) that traders need for FX-pair
// trading. RBI does not publish these; we fetch from Yahoo directly.

interface InrPair {
  base: string;
  quote: 'INR';
  yahooSymbol: string;
}

const PRIMARY_INR_PAIRS: InrPair[] = [
  { base: 'USD', quote: 'INR', yahooSymbol: 'USDINR=X' },
  { base: 'EUR', quote: 'INR', yahooSymbol: 'EURINR=X' },
  { base: 'GBP', quote: 'INR', yahooSymbol: 'GBPINR=X' },
  { base: 'JPY', quote: 'INR', yahooSymbol: 'JPYINR=X' },
  { base: 'AED', quote: 'INR', yahooSymbol: 'AEDINR=X' },
  { base: 'SGD', quote: 'INR', yahooSymbol: 'SGDINR=X' },
  { base: 'AUD', quote: 'INR', yahooSymbol: 'AUDINR=X' },
  { base: 'CAD', quote: 'INR', yahooSymbol: 'CADINR=X' },
  { base: 'CHF', quote: 'INR', yahooSymbol: 'CHFINR=X' },
  { base: 'HKD', quote: 'INR', yahooSymbol: 'HKDINR=X' },
  { base: 'CNY', quote: 'INR', yahooSymbol: 'CNYINR=X' },
];

interface CrossPair {
  base: string;
  quote: string;
  yahooSymbol: string;
}

const CROSS_PAIRS: CrossPair[] = [
  { base: 'EUR', quote: 'USD', yahooSymbol: 'EURUSD=X' },
  { base: 'GBP', quote: 'USD', yahooSymbol: 'GBPUSD=X' },
  { base: 'USD', quote: 'JPY', yahooSymbol: 'USDJPY=X' },
  { base: 'AUD', quote: 'USD', yahooSymbol: 'AUDUSD=X' },
  { base: 'USD', quote: 'CAD', yahooSymbol: 'USDCAD=X' },
  { base: 'USD', quote: 'CHF', yahooSymbol: 'USDCHF=X' },
];

// RBI reference-rate currencies. RBI's daily reference rate covers exactly
// these four; everything else must go through Yahoo.
const RBI_SUPPORTED = new Set(['USD', 'EUR', 'GBP', 'JPY']);

export interface FxSyncResult {
  updated: number;
  skipped: number;
  bySource: { rbi: number; frankfurter: number; yahoo: number; derived: number };
}

// ─── Frankfurter adapter ────────────────────────────────────────────
//
// Frankfurter mirrors ECB / RBI / BoE daily reference rates with a simple
// JSON API, no auth, no rate limit. Already battle-tested in
// commodity.service.ts for USD/INR. Used as the secondary adapter after RBI
// HTML scrape: when RBI's homepage widget can't be parsed (markup changes,
// JS-rendered table, etc) and before falling through to Yahoo (which is
// rate-limited on Railway IPs).
async function fetchFrankfurterRates(bases: string[]): Promise<Map<string, Decimal>> {
  const out = new Map<string, Decimal>();
  await Promise.all(
    bases.map(async (base) => {
      try {
        const url = `https://api.frankfurter.app/latest?from=${base}&to=INR`;
        const res = await request(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          bodyTimeout: 8_000,
          headersTimeout: 4_000,
        });
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        const body = (await res.body.json()) as { rates?: Record<string, number> };
        const rate = body?.rates?.INR;
        if (typeof rate === 'number' && rate > 0) {
          out.set(base, new Decimal(rate));
        }
      } catch {
        // swallow — fall through to next adapter
      }
    }),
  );
  if (out.size > 0) logger.info({ count: out.size }, '[fx] Frankfurter rates parsed');
  return out;
}

// ─── RBI adapter ────────────────────────────────────────────────────
//
// RBI publishes a daily reference rate at the URL below as an HTML widget
// that exposes USD/EUR/GBP/JPY/INR. Format is plain HTML; we scrape the
// numeric values. The endpoint is best-effort: on any non-2xx or parse
// failure we fall through to Yahoo and tag those rows with source='YAHOO'.
//
// If the URL or markup changes, the parse silently returns null — never
// throws — so a price-sync run with stale RBI markup still completes via
// the Yahoo fallback. The `source` column on FXRate records which adapter
// won so a future audit can spot persistent RBI failures.

const RBI_REFERENCE_RATE_URL = 'https://www.rbi.org.in/';

async function fetchRbiReferenceRates(): Promise<Map<string, Decimal>> {
  const out = new Map<string, Decimal>();
  try {
    const res = await request(RBI_REFERENCE_RATE_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; portfolioos/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      bodyTimeout: 10_000,
      headersTimeout: 5_000,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      logger.warn({ status: res.statusCode }, '[fx] RBI returned non-2xx');
      return out;
    }
    const html = await res.body.text();

    // RBI widget structure (as of late 2025) embeds the four rates in a
    // <table> whose rows look like:
    //   <td>U.S.Dollar</td><td>83.4523</td>
    //   <td>Euro</td><td>90.1234</td>
    //   <td>Pound Sterling</td><td>105.5678</td>
    //   <td>Japanese Yen</td><td>0.5612</td>
    // The Yen row is per 100 JPY on the RBI page; we normalise back to per-1.
    const grab = (label: RegExp, code: string, divisor = 1) => {
      const m = html.match(label);
      if (!m || !m[1]) return;
      const raw = m[1].replace(/,/g, '').trim();
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return;
      out.set(code, new Decimal(n).dividedBy(divisor));
    };
    grab(/U\.?S\.?\s*Dollar[^<]*<\/td>\s*<td[^>]*>([\d,.]+)/i, 'USD');
    grab(/Euro[^<]*<\/td>\s*<td[^>]*>([\d,.]+)/i, 'EUR');
    grab(/Pound\s+Sterling[^<]*<\/td>\s*<td[^>]*>([\d,.]+)/i, 'GBP');
    // JPY on RBI is quoted per 100 yen; divide to get per-1.
    grab(/Japanese\s+Yen[^<]*<\/td>\s*<td[^>]*>([\d,.]+)/i, 'JPY', 100);

    if (out.size === 0) {
      logger.warn('[fx] RBI fetch ok but no rates parsed — markup changed?');
    } else {
      logger.info({ count: out.size }, '[fx] RBI rates parsed');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, '[fx] RBI fetch failed');
  }
  return out;
}

// ─── Sync orchestration ────────────────────────────────────────────

async function upsertRate(
  baseCcy: string,
  quoteCcy: string,
  date: Date,
  rate: Decimal,
  source: 'RBI' | 'FRANKFURTER' | 'YAHOO' | 'DERIVED',
): Promise<void> {
  await prisma.fXRate.upsert({
    where: { baseCcy_quoteCcy_date: { baseCcy, quoteCcy, date } },
    update: { rate, source },
    create: { baseCcy, quoteCcy, date, rate, source },
  });
}

export async function syncFxRates(): Promise<FxSyncResult> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let updated = 0;
  let skipped = 0;
  const bySource = { rbi: 0, frankfurter: 0, yahoo: 0, derived: 0 };

  // 1) RBI primary for USD/EUR/GBP/JPY → INR (best-effort HTML scrape).
  const rbiRates = await fetchRbiReferenceRates();
  for (const [code, rate] of rbiRates) {
    await upsertRate(code, 'INR', today, rate, 'RBI');
    updated++;
    bySource.rbi++;
  }

  // 2) Frankfurter for any INR pair RBI didn't cover. Reliable, no auth,
  //    no rate limit — designed for exactly this kind of fallback.
  const needFrankfurter = PRIMARY_INR_PAIRS.filter((p) => !rbiRates.has(p.base)).map((p) => p.base);
  const frankRates = needFrankfurter.length > 0 ? await fetchFrankfurterRates(needFrankfurter) : new Map<string, Decimal>();
  for (const [code, rate] of frankRates) {
    await upsertRate(code, 'INR', today, rate, 'FRANKFURTER');
    updated++;
    bySource.frankfurter++;
  }

  // 3) Yahoo for whatever's still missing + the cross pairs (Frankfurter
  //    doesn't cover non-INR pairs).
  const covered = new Set<string>([...rbiRates.keys(), ...frankRates.keys()]);
  const yahooSymbols = [
    ...PRIMARY_INR_PAIRS.filter((p) => !covered.has(p.base)).map((p) => p.yahooSymbol),
    ...CROSS_PAIRS.map((p) => p.yahooSymbol),
  ];

  let yahooQuotes: Awaited<ReturnType<typeof yahooQuoteRaw>> = [];
  if (yahooSymbols.length > 0) {
    try {
      yahooQuotes = await yahooQuoteRaw(yahooSymbols);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, '[fx] Yahoo batch failed');
    }
  }
  const bySymbol = new Map<string, { regularMarketPrice?: number }>();
  for (const q of yahooQuotes) if (q?.symbol) bySymbol.set(q.symbol, q);

  for (const pair of PRIMARY_INR_PAIRS) {
    if (covered.has(pair.base)) continue; // already covered by RBI / Frankfurter
    const q = bySymbol.get(pair.yahooSymbol);
    if (!q || typeof q.regularMarketPrice !== 'number') {
      skipped++;
      continue;
    }
    await upsertRate(pair.base, pair.quote, today, new Decimal(q.regularMarketPrice), 'YAHOO');
    updated++;
    bySource.yahoo++;
  }

  for (const pair of CROSS_PAIRS) {
    const q = bySymbol.get(pair.yahooSymbol);
    if (!q || typeof q.regularMarketPrice !== 'number') {
      skipped++;
      continue;
    }
    await upsertRate(pair.base, pair.quote, today, new Decimal(q.regularMarketPrice), 'YAHOO');
    updated++;
    bySource.yahoo++;
  }

  // 3) Derived cross pairs for currencies not in CROSS_PAIRS but covered as
  // base→INR. Example: AED/USD = (AED→INR) / (USD→INR). Only written when
  // both legs were just written and source='DERIVED' so a future RBI/Yahoo
  // upsert can overwrite cleanly.
  const inrRates = await prisma.fXRate.findMany({
    where: { quoteCcy: 'INR', date: today },
    select: { baseCcy: true, rate: true },
  });
  const inrMap = new Map(inrRates.map((r) => [r.baseCcy, new Decimal(r.rate.toString())]));
  const usdInr = inrMap.get('USD');
  if (usdInr && !usdInr.isZero()) {
    for (const [base, rate] of inrMap) {
      if (base === 'USD') continue;
      // Skip pairs we already wrote explicitly from Yahoo (EURUSD, GBPUSD, AUDUSD).
      const alreadyWritten = CROSS_PAIRS.some(
        (p) =>
          (p.base === base && p.quote === 'USD') ||
          (p.base === 'USD' && p.quote === base),
      );
      if (alreadyWritten) continue;
      // base → USD = (base → INR) / (USD → INR)
      const derived = rate.dividedBy(usdInr);
      await upsertRate(base, 'USD', today, derived, 'DERIVED');
      updated++;
      bySource.derived++;
    }
  }

  logger.info({ updated, skipped, bySource }, '[fx] FX rates synced');
  return { updated, skipped, bySource };
}

export async function getLatestFxRate(
  baseCcy: string,
  quoteCcy: string,
): Promise<Decimal | null> {
  if (baseCcy === quoteCcy) return new Decimal(1);
  const row = await prisma.fXRate.findFirst({
    where: { baseCcy, quoteCcy },
    orderBy: { date: 'desc' },
  });
  if (row) return new Decimal(row.rate.toString());

  // Inverse fallback: if we have quote→base, return 1/that.
  const inv = await prisma.fXRate.findFirst({
    where: { baseCcy: quoteCcy, quoteCcy: baseCcy },
    orderBy: { date: 'desc' },
  });
  if (inv) {
    const r = new Decimal(inv.rate.toString());
    if (!r.isZero()) return new Decimal(1).dividedBy(r);
  }
  return null;
}

export async function convertToInr(amount: Decimal, fromCurrency: string): Promise<Decimal> {
  if (fromCurrency === 'INR') return amount;
  const rate = await getLatestFxRate(fromCurrency, 'INR');
  if (!rate) {
    logger.warn({ fromCurrency }, '[fx] no rate found — returning amount as-is');
    return amount;
  }
  return amount.mul(rate);
}

// ─── Live ticker helper ─────────────────────────────────────────────
//
// Used by the /forex ticker endpoint; thin wrapper over getLatestFxRate that
// returns one row per (base, quote) input pair with the persisted date so the
// UI can render "USD/INR: 83.42 (RBI · 2 min ago)".

export interface TickerRow {
  base: string;
  quote: string;
  rate: string; // serialised Decimal
  source: string;
  date: string; // YYYY-MM-DD
}

export async function getForexTicker(pairs: Array<{ base: string; quote: string }>): Promise<TickerRow[]> {
  const out: TickerRow[] = [];
  for (const p of pairs) {
    const row = await prisma.fXRate.findFirst({
      where: { baseCcy: p.base, quoteCcy: p.quote },
      orderBy: { date: 'desc' },
    });
    if (!row) continue;
    out.push({
      base: row.baseCcy,
      quote: row.quoteCcy,
      rate: row.rate.toString(),
      source: row.source,
      date: row.date.toISOString().slice(0, 10),
    });
  }
  return out;
}

export const SUPPORTED_FX_CURRENCIES: readonly string[] = [
  ...PRIMARY_INR_PAIRS.map((p) => p.base),
  // Cross pairs introduce no new currencies beyond the INR set, so this
  // is the canonical list the UI offers in currency pickers.
];

// Pairs the default ticker shows in the UI. Derived from the source-of-truth
// pair arrays so adding a new INR pair or cross pair automatically surfaces.
export const DEFAULT_TICKER_PAIRS: ReadonlyArray<{ base: string; quote: string }> = [
  ...PRIMARY_INR_PAIRS.map((p) => ({ base: p.base, quote: p.quote as string })),
  ...CROSS_PAIRS.map((p) => ({ base: p.base, quote: p.quote })),
];

export const _internal = { PRIMARY_INR_PAIRS, CROSS_PAIRS, RBI_SUPPORTED };
