/**
 * LLM-driven structured data extraction from policy documents.
 *
 * Uses Claude via tool_use to extract structured fields from policy text.
 * Mirrors the ingestion/llm/client.ts pattern:
 *  1. Check LLM gate (ANTHROPIC_API_KEY + ENABLE_LLM_PARSER).
 *  2. Check budget before calling.
 *  3. Force tool_use to get structured JSON output.
 *  4. Re-validate with Zod.
 *  5. Record spend (success or failure).
 *  6. Save ExtractedPolicyData row.
 *
 * Page-level chunking: rather than sending the entire document at once,
 * we send page sections in batches of MAX_PAGES_PER_CHUNK pages. This
 * keeps context windows manageable and allows partial extraction.
 *
 * SYSTEM PROMPT instruction: "Never invent data. If a field is not present
 * in the document, set it null with status NOT_FOUND."
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { Decimal } from '@everypaisa/shared';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { ANTHROPIC_CLIENT_OPTIONS } from '../../lib/anthropicOptions.js';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import {
  checkBudget,
  estimateCostInr,
  HAIKU_USD_PER_MTOK_INPUT,
  HAIKU_USD_PER_MTOK_OUTPUT,
  FX_USD_INR_DEFAULT as BUDGET_FX_DEFAULT,
} from '../../ingestion/llm/budget.js';
import { recordSpend } from '../../ingestion/llm/client.js';
import { redactForLlm } from '../../ingestion/pii.js';
import { PAGE_BREAK } from './textExtraction.service.js';
import { mergeWithProvenance, type ChunkExtraction } from './fieldMerge.js';
import { asProductType, getExtractionSpec, type ExtractionSpec } from './extractionSpecs.js';
import type { PolicyDocClassification, PolicyFieldConflict } from '@everypaisa/shared';
import { Prisma } from '@prisma/client';
import {
} from './extractionSchema.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PAGES_PER_CHUNK = 10;
const EXTRACTION_PURPOSE = 'policy_extraction';

// Pricing constants for this extraction surface (Haiku, same as email parser)
// Use HAIKU constants from budget.ts so prices change in one place.


// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export function isExtractionEnabled(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) && env.ENABLE_LLM_PARSER === 'true';
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...ANTHROPIC_CLIENT_OPTIONS });
  return _client;
}

interface PageChunk {
  docId: string;
  startPage: number;
  endPage: number;
  text: string;
}

async function readFx(): Promise<Decimal> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'llm.usd_inr_fx' } });
  if (row && (typeof row.value === 'number' || typeof row.value === 'string')) {
    return new Decimal(row.value as string | number);
  }
  return BUDGET_FX_DEFAULT;
}

/**
 * Split extracted text into page chunks for the LLM. Pages are separated by
 * PAGE_BREAK (written by textExtraction), so page numbers are exact.
 * Each page is prefixed with a "=== PAGE n ===" marker the model cites.
 */
export function chunkPages(docs: Array<{ id: string; extractedText: string; pageCount: number }>): PageChunk[] {
  const chunks: PageChunk[] = [];

  for (const doc of docs) {
    const pages = doc.extractedText.split(PAGE_BREAK);
    // A trailing PAGE_BREAK leaves an empty last element — drop it.
    if (pages.length > 1 && pages[pages.length - 1]!.trim() === '') pages.pop();
    for (let start = 0; start < pages.length; start += MAX_PAGES_PER_CHUNK) {
      const slice = pages.slice(start, start + MAX_PAGES_PER_CHUNK);
      const text = slice
        .map((pg, i) => `=== PAGE ${start + i + 1} ===\n${pg.trim()}`)
        .join('\n\n');
      chunks.push({
        docId: doc.id,
        startPage: start + 1,
        endPage: start + slice.length,
        text,
      });
    }
  }

  return chunks;
}

/**
 * Call the LLM with one chunk. Returns the parsed extraction or null on failure.
 */
async function extractChunk(
  chunk: PageChunk,
  userId: string,
  checkId: string,
  _fx: Decimal,
  spec: ExtractionSpec,
): Promise<{ extraction: object | null; costInr: Decimal; inputTokens: number; outputTokens: number }> {
  // PII is masked before any text leaves the server (same redactor as email ingestion).
  const userMessage =
    `[Document ID: ${chunk.docId}] [Pages ${chunk.startPage} to ${chunk.endPage}]\n\n` +
    `<document>\n${redactForLlm(chunk.text).text}\n</document>`;

  let inputTokens = 0;
  let outputTokens = 0;
  let extraction: object | null = null;

  try {
    const res = await getClient().messages.create({
      model: env.LLM_MODEL ?? 'claude-haiku-4-5',
      max_tokens: 4096,
      system: spec.systemPrompt,
      tools: [
        {
          name: spec.toolName,
          description: spec.toolDescription,
          input_schema: spec.jsonSchema as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: spec.toolName },
      messages: [{ role: 'user', content: userMessage }],
    });

    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;

    const toolBlock = res.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === spec.toolName,
    );

    if (toolBlock) {
      const parsed = spec.schema.safeParse(toolBlock.input);
      if (parsed.success) {
        extraction = parsed.data as object;
      } else {
        logger.warn(
          { checkId, docId: chunk.docId, errors: parsed.error.flatten() },
          '[policyExtract] Zod validation failed on LLM output',
        );
      }
    }
  } catch (err) {
    logger.error({ err, checkId, docId: chunk.docId }, '[policyExtract] LLM call failed');
  }

  const costInr = await estimateCostInr({
    inputTokens,
    outputTokens,
  });

  return { extraction, costInr, inputTokens, outputTokens };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export type ExtractionOutcome =
  | { ok: true; dataId: string }
  | { ok: false; error: string; gateReason?: 'disabled' | 'budget_capped' };

/**
 * Run LLM extraction for a health check.
 *
 * Must be called inside the check owner's RLS context (runAsUser).
 */
export async function extractPolicyData(
  checkId: string,
  userId: string,
): Promise<ExtractionOutcome> {
  if (!isExtractionEnabled()) {
    return { ok: false, error: 'LLM extraction gate is closed (ENABLE_LLM_PARSER or ANTHROPIC_API_KEY missing)', gateReason: 'disabled' };
  }

  const budget = await checkBudget(userId);
  if (budget.status === 'capped') {
    return {
      ok: false,
      error: `Monthly LLM budget exhausted (₹${budget.spent.toFixed(2)} / ₹${budget.cap.toFixed(2)})`,
      gateReason: 'budget_capped',
    };
  }

  // What kind of policy is this? Decided by the insurance record, never by extracted text.
  const owner = await prisma.policyHealthCheck.findFirst({
    where: { id: checkId, userId },
    select: { policy: { select: { type: true } } },
  });
  const productType = owner ? asProductType(owner.policy.type) : null;
  if (!productType) return { ok: false, error: 'This policy type is not supported for extraction' };
  const spec = getExtractionSpec(productType);

  // Load extraction docs for this check
  const docs = await prisma.policyExtractionDoc.findMany({
    where: { checkId },
    select: { id: true, extractedText: true, pageCount: true, classification: true },
  });

  if (docs.length === 0) {
    return { ok: false, error: 'No extraction documents found for this check' };
  }

  const fx = new Decimal(0); // unused; estimateCostInr handles FX internally
  const chunks = chunkPages(docs);
  const successfulExtractions: ChunkExtraction<object>[] = [];
  const classByDoc = new Map(docs.map((d) => [d.id, d.classification as PolicyDocClassification]));
  let totalCostInr = new Decimal(0);
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const chunk of chunks) {
    // Re-check budget before each chunk
    const chunkBudget = await checkBudget(userId);
    if (chunkBudget.status === 'capped') {
      logger.info(
        { checkId, userId, spent: chunkBudget.spent.toString() },
        '[policyExtract] budget capped mid-extraction',
      );
      break;
    }

    const result = await extractChunk(chunk, userId, checkId, fx, spec);
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;
    totalCostInr = totalCostInr.plus(result.costInr);

    if (result.extraction) {
      successfulExtractions.push({
        docId: chunk.docId,
        classification: classByDoc.get(chunk.docId) ?? 'OTHER',
        extraction: result.extraction,
      });
    }
  }

  // Record spend
  await recordSpend({
    userId,
    model: env.LLM_MODEL ?? 'claude-haiku-4-5',
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    costInr: totalCostInr,
    purpose: EXTRACTION_PURPOSE,
    sourceRef: checkId,
    success: successfulExtractions.length > 0,
    errorMessage: successfulExtractions.length === 0 ? 'All chunks failed extraction' : undefined,
  });

  if (successfulExtractions.length === 0) {
    return { ok: false, error: 'LLM extraction produced no valid results' };
  }

  const { merged, conflicts: mergedConflicts } = mergeWithProvenance(successfulExtractions);
  let conflicts: PolicyFieldConflict[] = mergedConflicts;

  // Check for existing ExtractedPolicyData (upsert on the unique checkId)
  const existingData = await prisma.extractedPolicyData.findUnique({
    where: { checkId },
    select: { id: true, version: true, fields: true },
  });

  // Never overwrite a value the user corrected by hand.
  if (existingData) {
    const prior = existingData.fields as Record<string, { status?: string }>;
    for (const [key, field] of Object.entries(prior)) {
      if (field && field.status === 'USER_EDITED') {
        (merged as Record<string, unknown>)[key] = field;
        // The user decided this field — it is no longer in dispute.
        conflicts = conflicts.filter((c) => c.field !== key && !c.field.startsWith(key + '.'));
      }
    }
  }
  const conflictsJson = conflicts as unknown as Prisma.InputJsonValue;

  let dataId: string;

  if (existingData) {
    await runInTransaction((tx) =>
      tx.extractedPolicyData.update({
        where: { checkId },
        data: {
          fields: merged as unknown as Parameters<typeof tx.extractedPolicyData.update>[0]['data']['fields'],
          version: existingData.version + 1,
          conflicts: conflicts.length > 0 ? conflictsJson : Prisma.DbNull,
        },
      }),
    );
    dataId = existingData.id;
  } else {
    const created = await runInTransaction((tx) =>
      tx.extractedPolicyData.create({
        data: {
          checkId,
          fields: merged as unknown as Parameters<typeof tx.extractedPolicyData.create>[0]['data']['fields'],
          conflicts: conflicts.length > 0 ? conflictsJson : Prisma.DbNull,
        },
        select: { id: true },
      }),
    );
    dataId = created.id;
  }

  // Update check status to EXTRACTED → (will be VERIFIED once user reviews)
  await runInTransaction((tx) =>
    tx.policyHealthCheck.update({
      where: { id: checkId },
      data: {
        status: 'EXTRACTED',
        llmSpendInr: totalCostInr.toFixed(4),
      },
    }),
  );

  logger.info(
    {
      checkId,
      userId,
      chunks: chunks.length,
      successfulChunks: successfulExtractions.length,
      costInr: totalCostInr.toFixed(4),
    },
    '[policyExtract] extraction complete',
  );

  return { ok: true, dataId };
}
