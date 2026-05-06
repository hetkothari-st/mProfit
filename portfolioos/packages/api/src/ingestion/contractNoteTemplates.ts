/**
 * Contract-note recipe cache.
 *
 * Email templates (`templates.ts`) cover single-event bodies — one alert per
 * email, recipe maps slot positions to fields. Contract notes are
 * multi-event: one PDF, N trade rows. The recipe shape here is therefore
 * different — it captures the COLUMN LAYOUT of trade rows, plus a regex
 * that identifies which lines are trade rows.
 *
 * Storage: reuses `LearnedTemplate`. Email recipes use the actual sender
 * address (e.g. "alerts@hdfcbank.net"); contract-note recipes prefix the
 * `senderAddress` field with `cn:<brokerId>` so the two recipe families
 * never collide on the unique index.
 *
 * Lifecycle:
 *   1. First eligible PDF for (user, broker, structureHash) → LLM parse,
 *      sample stored under `cn-sampling`.
 *   2. After {@link CN_SAMPLE_THRESHOLD} same-hash samples land, synthesis
 *      runs. If column positions are consistent across all samples,
 *      promote to `cn-promoted` and stop calling the LLM for that
 *      (broker, hash). If positions disagree, drop samples and keep
 *      collecting — LLM keeps running.
 *   3. Once promoted, every PDF with the same hash extracts via regex.
 *      A miss (Zod-validation fail on extracted trades) bumps
 *      `confidenceScore` down. Two consecutive misses deactivate the
 *      recipe; the next sample creates a v+1 row.
 *
 * Scope of v1:
 *   - Equity rows only. F&O contract notes have varied multi-line
 *     formats (BANKNIFTY26NOV24500CE on one line, qty + price on next)
 *     that don't fit a single-row column model. They keep going through
 *     the LLM until a richer recipe shape lands.
 *   - One sample per upload, regardless of trade count. We learn
 *     column positions from the trades inside one sample — multiple
 *     trades inside one PDF give us cross-row consistency for free.
 */

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Decimal } from '@portfolioos/shared';
import type { AssetClass, Exchange, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { bodyStructureHash } from './hash.js';
import type { ParsedTransaction } from '../services/imports/parsers/types.js';
import { redactForLlm } from './pii.js';
import type { BrokerDescriptor } from '../data/brokers.js';

/** Promote after N agreeing samples. Lower than email's 10 because per-broker
 *  contract-note volume is much sparser than per-sender email volume. */
export const CN_SAMPLE_THRESHOLD = 3;

const ISIN_RE = /\b(IN[EF][0-9A-Z]{9})\b/;

/* -------------------------------------------------------------------------- */
/*  Recipe shape                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Trade as stored on a sample. Subset of ParsedTransaction — only the
 * fields we use for column locating + recipe validation. Stored alongside
 * the redacted PDF text so synthesis can re-locate the values inside the
 * source.
 */
export interface CnSampleTrade {
  isin: string | null;
  symbol: string | null;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
}

export interface CnSample {
  /** Filename (debug only). */
  fileName: string;
  /** Redacted PDF text — what synthesis works against (PII-safe per §15.9). */
  pdfText: string;
  /** Trades the LLM extracted from this PDF. Required ≥1. */
  trades: CnSampleTrade[];
}

/**
 * Column tuple for a single trade row. Each value is a 0-based index into
 * the whitespace-split tokens of a matching line, or `null` if the field
 * isn't present in this broker's layout.
 */
export interface CnColumns {
  isin: number | null;
  symbol: number | null;
  side: number | null;
  quantity: number;
  price: number;
}

export type CnRecipe =
  | { state: 'cn-sampling'; brokerId: string; samples: CnSample[] }
  | {
      state: 'cn-promoted';
      brokerId: string;
      /** Regex source (no flags) applied to each line. Matching lines are trade rows. */
      tradeLinePattern: string;
      columns: CnColumns;
      promotedAt: string;
    };

const CnSampleTradeSchema = z.object({
  isin: z.string().nullable(),
  symbol: z.string().nullable(),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.string(),
  price: z.string(),
});

const CnSampleSchema = z.object({
  fileName: z.string(),
  pdfText: z.string(),
  trades: z.array(CnSampleTradeSchema),
});

const CnColumnsSchema = z.object({
  isin: z.number().int().nonnegative().nullable(),
  symbol: z.number().int().nonnegative().nullable(),
  side: z.number().int().nonnegative().nullable(),
  quantity: z.number().int().nonnegative(),
  price: z.number().int().nonnegative(),
});

const CnRecipeSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('cn-sampling'),
    brokerId: z.string(),
    samples: z.array(CnSampleSchema),
  }),
  z.object({
    state: z.literal('cn-promoted'),
    brokerId: z.string(),
    tradeLinePattern: z.string(),
    columns: CnColumnsSchema,
    promotedAt: z.string(),
  }),
]);

function parseStoredRecipe(raw: unknown): CnRecipe | null {
  const parsed = CnRecipeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/* -------------------------------------------------------------------------- */
/*  Synthesis                                                                 */
/* -------------------------------------------------------------------------- */

/** Side aliases that may appear in a tokenised PDF row. */
const SIDE_ALIASES = new Set([
  'B', 'S', 'BUY', 'SELL', 'BOUGHT', 'SOLD',
]);

function isSideToken(t: string): 'BUY' | 'SELL' | null {
  const u = t.toUpperCase();
  if (u === 'B' || u === 'BUY' || u === 'BOUGHT') return 'BUY';
  if (u === 'S' || u === 'SELL' || u === 'SOLD') return 'SELL';
  return null;
}

/** Numeric-equality fallback so trailing zero / formatting diffs don't break match. */
function numericMatch(token: string, expected: string): boolean {
  try {
    const a = new Decimal(token.replace(/,/g, ''));
    const b = new Decimal(expected);
    return a.equals(b);
  } catch {
    return false;
  }
}

/**
 * For one sample: try to locate every trade inside the PDF lines and find
 * a single (isin, symbol, side, quantity, price) column tuple consistent
 * across all rows. Returns the tuple + the line indices that matched, or
 * null if any trade can't be located or columns disagree row-to-row.
 */
function locateColumnsInSample(
  sample: CnSample,
): { columns: CnColumns; matchedLines: string[] } | null {
  if (sample.trades.length === 0) return null;
  const lines = sample.pdfText.split(/\r?\n/);

  let agreed: CnColumns | null = null;
  const matchedLines: string[] = [];

  for (const trade of sample.trades) {
    let foundForTrade: CnColumns | null = null;
    let foundLine: string | null = null;

    for (const line of lines) {
      const tokens = line.split(/\s+/).filter((t) => t.length > 0);
      if (tokens.length < 3) continue;

      // Candidate row must contain trade's ISIN if known, else its symbol.
      const isinIdx = trade.isin
        ? tokens.findIndex((t) => t.toUpperCase() === trade.isin!.toUpperCase())
        : -1;
      const symbolIdx = trade.symbol
        ? tokens.findIndex((t) => t.toUpperCase() === trade.symbol!.toUpperCase())
        : -1;

      if (trade.isin && isinIdx < 0) continue;
      if (!trade.isin && trade.symbol && symbolIdx < 0) continue;

      const sideIdx = tokens.findIndex((t) => {
        const s = isSideToken(t);
        return s !== null && s === trade.side;
      });
      if (sideIdx < 0) continue;

      const qtyIdx = tokens.findIndex((t, i) => {
        if (i === sideIdx || i === isinIdx || i === symbolIdx) return false;
        return numericMatch(t, trade.quantity);
      });
      if (qtyIdx < 0) continue;

      const priceIdx = tokens.findIndex((t, i) => {
        if (i === sideIdx || i === isinIdx || i === symbolIdx || i === qtyIdx) return false;
        return numericMatch(t, trade.price);
      });
      if (priceIdx < 0) continue;

      foundForTrade = {
        isin: isinIdx >= 0 ? isinIdx : null,
        symbol: symbolIdx >= 0 ? symbolIdx : null,
        side: sideIdx,
        quantity: qtyIdx,
        price: priceIdx,
      };
      foundLine = line;
      break;
    }

    if (!foundForTrade || !foundLine) return null;

    if (agreed === null) agreed = foundForTrade;
    else if (
      agreed.isin !== foundForTrade.isin ||
      agreed.symbol !== foundForTrade.symbol ||
      agreed.side !== foundForTrade.side ||
      agreed.quantity !== foundForTrade.quantity ||
      agreed.price !== foundForTrade.price
    ) {
      // Column positions disagree across rows in the same sample — this
      // sample is unsuitable for column-based extraction.
      return null;
    }
    matchedLines.push(foundLine);
  }

  if (!agreed) return null;
  return { columns: agreed, matchedLines };
}

/**
 * Try to synthesise a recipe from accumulated samples. Returns null when
 * column positions disagree across samples (caller drops samples and keeps
 * learning).
 */
export function synthesizeContractNoteRecipe(
  brokerId: string,
  samples: CnSample[],
): { tradeLinePattern: string; columns: CnColumns } | null {
  if (samples.length < CN_SAMPLE_THRESHOLD) return null;

  let agreed: CnColumns | null = null;
  for (const sample of samples) {
    const located = locateColumnsInSample(sample);
    if (!located) return null;
    if (agreed === null) {
      agreed = located.columns;
    } else if (
      agreed.isin !== located.columns.isin ||
      agreed.symbol !== located.columns.symbol ||
      agreed.side !== located.columns.side ||
      agreed.quantity !== located.columns.quantity ||
      agreed.price !== located.columns.price
    ) {
      return null;
    }
  }

  if (!agreed) return null;

  // Trade-line pattern. If the layout has an ISIN column, the most reliable
  // discriminator is the ISIN regex itself — header lines never contain it.
  // For ISIN-less layouts, fall back to a side-token discriminator (less
  // accurate but better than nothing).
  const tradeLinePattern = agreed.isin !== null
    ? ISIN_RE.source
    : '\\b(?:BUY|SELL|BOUGHT|SOLD)\\b';

  return { tradeLinePattern, columns: agreed };
}

/* -------------------------------------------------------------------------- */
/*  Application                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Apply a promoted recipe to a PDF text. Returns the extracted trades or
 * null if no row matches / Zod validation fails on any row. Caller must
 * call {@link recordRecipeMiss} on null and fall back to LLM.
 */
export function applyContractNoteRecipe(opts: {
  recipe: Extract<CnRecipe, { state: 'cn-promoted' }>;
  broker: BrokerDescriptor;
  pdfText: string;
  tradeDate: string; // YYYY-MM-DD — the LLM's typical detection still needed; caller provides
}): ParsedTransaction[] | null {
  const re = new RegExp(opts.recipe.tradeLinePattern);
  const lines = opts.pdfText.split(/\r?\n/);
  const out: ParsedTransaction[] = [];

  for (const line of lines) {
    if (!re.test(line)) continue;
    const tokens = line.split(/\s+/).filter((t) => t.length > 0);
    const cols = opts.recipe.columns;
    if (tokens.length <= cols.quantity || tokens.length <= cols.price) continue;

    const isin = cols.isin !== null ? tokens[cols.isin] ?? null : null;
    const symbol = cols.symbol !== null ? tokens[cols.symbol] ?? null : null;
    const sideToken = cols.side !== null ? tokens[cols.side] ?? null : null;
    const qtyRaw = tokens[cols.quantity];
    const priceRaw = tokens[cols.price];

    if (!qtyRaw || !priceRaw) continue;

    const side = sideToken ? isSideToken(sideToken) : null;
    if (!side) continue;

    if (isin && !ISIN_RE.test(isin)) continue;

    let qty: Decimal;
    let price: Decimal;
    try {
      qty = new Decimal(qtyRaw.replace(/,/g, ''));
      price = new Decimal(priceRaw.replace(/,/g, ''));
    } catch {
      continue;
    }
    if (!qty.isFinite() || !price.isFinite() || qty.isZero()) continue;

    const exchange = pickExchange(opts.broker);

    out.push({
      assetClass: 'EQUITY' as AssetClass,
      transactionType: side as TransactionType,
      symbol: symbol?.toUpperCase() ?? undefined,
      isin: isin ?? undefined,
      exchange,
      tradeDate: opts.tradeDate,
      quantity: qty.abs().toString(),
      price: price.abs().toString(),
      broker: opts.broker.label,
    });
  }

  return out.length > 0 ? out : null;
}

function pickExchange(broker: BrokerDescriptor): Exchange | undefined {
  if (broker.exchanges.includes('NSE')) return 'NSE' as Exchange;
  if (broker.exchanges.includes('BSE')) return 'BSE' as Exchange;
  return undefined;
}

/* -------------------------------------------------------------------------- */
/*  DB layer                                                                  */
/* -------------------------------------------------------------------------- */

function senderAddressFor(brokerId: string): string {
  return `cn:${brokerId.toLowerCase()}`;
}

/** Look up the active promoted recipe for (user, broker, structureHash). */
export async function findActiveContractNoteRecipe(opts: {
  userId: string;
  brokerId: string;
  structureHash: string;
}): Promise<{
  templateId: string;
  version: number;
  recipe: Extract<CnRecipe, { state: 'cn-promoted' }>;
} | null> {
  const senderAddress = senderAddressFor(opts.brokerId);
  const row = await prisma.learnedTemplate.findFirst({
    where: {
      userId: opts.userId,
      senderAddress,
      bodyStructureHash: opts.structureHash,
      isActive: true,
    },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, extractionRecipe: true },
  });
  if (!row) return null;
  const recipe = parseStoredRecipe(row.extractionRecipe);
  if (!recipe || recipe.state !== 'cn-promoted') return null;
  return { templateId: row.id, version: row.version, recipe };
}

/**
 * Append one (pdfText, trades) sample to the bucket. If the threshold is
 * crossed and synthesis succeeds, flips the row to `cn-promoted`.
 *
 * Never throws — template learning is strictly a side-effect of the parse
 * path. A failed write here must not fail the outer ImportJob.
 */
export async function recordContractNoteSample(opts: {
  userId: string;
  brokerId: string;
  fileName: string;
  pdfText: string;
  trades: CnSampleTrade[];
}): Promise<void> {
  if (opts.trades.length === 0) return;
  const senderAddress = senderAddressFor(opts.brokerId);
  // Hash the *normalised* text via the email body-hasher; works fine for
  // PDFs because the same normaliser semantics apply (numbers/dates/amounts
  // collapse to placeholders, leaving structure).
  const structureHash = bodyStructureHash(opts.pdfText);
  // Redact PII before persisting — recipes are user-scoped (RLS) but we
  // still don't want raw PANs / account numbers in the recipe blob.
  const redactedText = redactForLlm(opts.pdfText).text;

  const sample: CnSample = {
    fileName: opts.fileName,
    pdfText: redactedText,
    trades: opts.trades,
  };

  try {
    const existing = await prisma.learnedTemplate.findFirst({
      where: {
        userId: opts.userId,
        senderAddress,
        bodyStructureHash: structureHash,
        isActive: true,
      },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, extractionRecipe: true, sampleCount: true },
    });

    if (!existing) {
      const initial: CnRecipe = {
        state: 'cn-sampling',
        brokerId: opts.brokerId,
        samples: [sample],
      };
      await prisma.learnedTemplate.create({
        data: {
          userId: opts.userId,
          senderAddress,
          bodyStructureHash: structureHash,
          extractionRecipe: initial as unknown as Prisma.InputJsonValue,
          sampleCount: 1,
          confidenceScore: new Prisma.Decimal(0),
          version: 1,
          isActive: true,
          lastUsedAt: new Date(),
        },
      });
      return;
    }

    const current = parseStoredRecipe(existing.extractionRecipe);
    if (!current) return;
    if (current.state === 'cn-promoted') return; // already learned

    const nextSamples = [...current.samples, sample];

    if (nextSamples.length >= CN_SAMPLE_THRESHOLD) {
      const synth = synthesizeContractNoteRecipe(opts.brokerId, nextSamples);
      if (synth) {
        const promoted: CnRecipe = {
          state: 'cn-promoted',
          brokerId: opts.brokerId,
          tradeLinePattern: synth.tradeLinePattern,
          columns: synth.columns,
          promotedAt: new Date().toISOString(),
        };
        await prisma.learnedTemplate.update({
          where: { id: existing.id },
          data: {
            extractionRecipe: promoted as unknown as Prisma.InputJsonValue,
            sampleCount: nextSamples.length,
            confidenceScore: new Prisma.Decimal(1),
            lastUsedAt: new Date(),
          },
        });
        logger.info(
          {
            userId: opts.userId,
            templateId: existing.id,
            brokerId: opts.brokerId,
            structureHash,
            sampleCount: nextSamples.length,
          },
          'cn_template.promoted',
        );
        return;
      }
      // Synthesis disagreed — drop samples, keep collecting.
      const reset: CnRecipe = {
        state: 'cn-sampling',
        brokerId: opts.brokerId,
        samples: [],
      };
      await prisma.learnedTemplate.update({
        where: { id: existing.id },
        data: {
          extractionRecipe: reset as unknown as Prisma.InputJsonValue,
          sampleCount: 0,
          lastUsedAt: new Date(),
        },
      });
      logger.warn(
        {
          userId: opts.userId,
          templateId: existing.id,
          brokerId: opts.brokerId,
          sampleCount: nextSamples.length,
        },
        'cn_template.synthesis_disagreed_reset_samples',
      );
      return;
    }

    const next: CnRecipe = {
      state: 'cn-sampling',
      brokerId: opts.brokerId,
      samples: nextSamples,
    };
    await prisma.learnedTemplate.update({
      where: { id: existing.id },
      data: {
        extractionRecipe: next as unknown as Prisma.InputJsonValue,
        sampleCount: nextSamples.length,
        lastUsedAt: new Date(),
      },
    });
  } catch (err) {
    logger.warn(
      { err, userId: opts.userId, brokerId: opts.brokerId },
      'cn_template.record_sample_failed',
    );
  }
}

/**
 * One miss → halve confidence. Two consecutive misses → deactivate. Caller
 * passes the templateId returned by {@link findActiveContractNoteRecipe}.
 */
export async function recordContractNoteRecipeMiss(opts: {
  userId: string;
  templateId: string;
}): Promise<void> {
  try {
    const row = await prisma.learnedTemplate.findFirst({
      where: { id: opts.templateId, userId: opts.userId },
      select: { confidenceScore: true, isActive: true },
    });
    if (!row || !row.isActive) return;
    const current = row.confidenceScore.toNumber();
    if (current > 0.5) {
      await prisma.learnedTemplate.update({
        where: { id: opts.templateId },
        data: { confidenceScore: new Prisma.Decimal(0.5) },
      });
    } else {
      await prisma.learnedTemplate.update({
        where: { id: opts.templateId },
        data: {
          confidenceScore: new Prisma.Decimal(0),
          isActive: false,
        },
      });
      logger.warn(
        { userId: opts.userId, templateId: opts.templateId },
        'cn_template.deactivated_after_repeated_miss',
      );
    }
  } catch (err) {
    logger.warn(
      { err, userId: opts.userId, templateId: opts.templateId },
      'cn_template.recipe_miss_update_failed',
    );
  }
}
