/**
 * §6.4 template promotion LLM→regex.
 *
 * After the LLM parses an email successfully, we bucket the (sender,
 * bodyStructureHash) pair and remember what it extracted. Once we've
 * seen N agreeing samples, we synthesise a deterministic recipe: a tiny
 * JSON blob saying "for this template, `amount` is AMT slot 2,
 * `event_date` is DATE slot 0, `event_type` is always UPI_CREDIT".
 * Subsequent emails with the same structure hash hit
 * {@link applyRecipe} and never reach the LLM — zero cost, zero
 * latency, zero variance.
 *
 * Why not ship seeded recipes? We don't have real user samples at
 * migration time. The §6.10 seed directory hands us institution
 * *metadata* (display label, kind) but no recipe; recipes are earned
 * per-user, per-template from live samples, exactly as the LLM parses
 * them. That lets us adapt to format tweaks ("HDFC added a tax line
 * in Q3") without a code release.
 *
 * Storage shape. We reuse `LearnedTemplate.extractionRecipe` as a
 * discriminated union:
 *
 *   state=sampling  → {samples: StoredSample[]}. Accumulating.
 *   state=promoted  → {fields: RecipeFields}. Deterministic.
 *
 * A template starts `sampling` on first sight and transitions once at
 * sample #{@link TEMPLATE_SAMPLE_THRESHOLD}. If synthesis fails at that
 * point (samples disagree on slot positions for required fields), we
 * drop the samples and let the counter start over — the row stays but
 * keeps collecting, betting that more samples will converge.
 *
 * Scope decisions for this commit:
 *   - Recipe fields supported: `event_type`, `event_date`, `amount`,
 *     `quantity`, `price`, `confidence`, `currency`. Everything else
 *     (counterparty, instrument names, account_last4, notes) stays
 *     null in recipe-generated events. The user still sees them in
 *     the Review UI; they just aren't deterministically extracted.
 *     Counterparty-as-regex is a future refinement.
 *   - Multi-event emails (statements with N rows) are NOT promoted:
 *     the slot-index mapping isn't stable across variable row counts.
 *     Single-event emails — the overwhelming majority of financial
 *     alerts — are what we optimise for.
 */

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { extractTemplateSlots, type SlotKind } from './hash.js';
import { ParsedEventSchema, type ParsedEvent } from './llm/schema.js';

/** Promote after N sample agreements. §6.4: "when sampleCount >= 10". */
export const TEMPLATE_SAMPLE_THRESHOLD = 10;

/**
 * Recipe field slots — what a promoted recipe says to do for one output
 * field. `slot` references extracted slots by (kind, within-kind index);
 * `static` is a literal the LLM returned identically across all samples;
 * `null` marks a field the LLM consistently returned null for.
 */
export type RecipeSlotRef =
  | { kind: 'slot'; slot: SlotKind; index: number }
  | { kind: 'static'; value: string | number }
  | { kind: 'null' };

/** Fields a recipe can populate. Mirror of {@link ParsedEvent}. */
export type RecipeFieldName =
  | 'event_type'
  | 'event_date'
  | 'amount'
  | 'quantity'
  | 'price'
  | 'counterparty'
  | 'instrument_isin'
  | 'instrument_symbol'
  | 'instrument_name'
  | 'account_last4'
  | 'currency'
  | 'confidence'
  | 'notes';

export type RecipeFields = Partial<Record<RecipeFieldName, RecipeSlotRef>>;

/** Discriminated union persisted in `LearnedTemplate.extractionRecipe`. */
export type TemplateRecipe =
  | { state: 'sampling'; samples: StoredSample[] }
  | { state: 'promoted'; fields: RecipeFields; promotedAt: string };

/**
 * Minimal sample captured after an LLM parse. We store the LLM-redacted
 * body (NOT the raw body — §15.9 defence-in-depth) plus the ParsedEvents
 * the LLM returned; synthesis later locates each field's value within
 * the body's slot enumeration.
 */
export interface StoredSample {
  /** Gmail message id for traceability; not used by synthesis. */
  messageId: string;
  /** Redacted body — what the LLM saw. */
  redactedBody: string;
  /** The single event the LLM returned for this body (multi-event bodies are skipped). */
  event: ParsedEvent;
}

/* -------------------------------------------------------------------------- */
/*  Recipe application                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Apply a promoted recipe to a body. Returns the reconstructed
 * ParsedEvent or `null` if any required slot is missing or the
 * reconstructed shape fails Zod validation (e.g. amount isn't a decimal
 * string any more because the bank changed the layout).
 *
 * A null return is the caller's cue to fall back to the LLM path *and*
 * call {@link onRecipeFailure} so the template's confidence decays —
 * consistent drift across multiple emails eventually deactivates the
 * recipe and re-enters learning.
 */
export function applyRecipe(fields: RecipeFields, body: string): ParsedEvent | null {
  const slots = extractTemplateSlots(body);
  const byKind = {
    AMT: slots.filter((s) => s.slot === 'AMT'),
    DATE: slots.filter((s) => s.slot === 'DATE'),
    NUM: slots.filter((s) => s.slot === 'NUM'),
  };

  const resolve = (ref: RecipeSlotRef | undefined): string | number | null => {
    if (!ref) return null;
    if (ref.kind === 'null') return null;
    if (ref.kind === 'static') return ref.value;
    // slot ref
    const pool = byKind[ref.slot];
    const cell = pool[ref.index];
    if (!cell) return null;
    return cell.normalized;
  };

  const resolveStr = (ref: RecipeSlotRef | undefined): string | null => {
    const v = resolve(ref);
    if (v === null) return null;
    return typeof v === 'number' ? String(v) : v;
  };

  const event_type = resolveStr(fields.event_type);
  const event_date = resolveStr(fields.event_date);
  if (!event_type || !event_date) return null;

  const confidence = (() => {
    const v = resolve(fields.confidence);
    return typeof v === 'number' ? v : 0.7;
  })();

  // Assemble a candidate event and let Zod tell us if anything's wrong
  // (e.g. event_date pattern mismatch, amount empty string, bad enum).
  const candidate: Record<string, unknown> = {
    event_type,
    event_date,
    amount: resolveStr(fields.amount),
    quantity: resolveStr(fields.quantity),
    price: resolveStr(fields.price),
    counterparty: resolveStr(fields.counterparty),
    instrument_isin: resolveStr(fields.instrument_isin),
    instrument_symbol: resolveStr(fields.instrument_symbol),
    instrument_name: resolveStr(fields.instrument_name),
    account_last4: resolveStr(fields.account_last4),
    currency: resolveStr(fields.currency) ?? 'INR',
    confidence,
    notes: resolveStr(fields.notes),
  };

  const parsed = ParsedEventSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/* -------------------------------------------------------------------------- */
/*  Recipe synthesis                                                          */
/* -------------------------------------------------------------------------- */

/** Numeric-equality fallback for amount comparisons (tolerate trailing zeros). */
function amountsEqual(a: string, b: string): boolean {
  const n = Number.parseFloat(a);
  const m = Number.parseFloat(b);
  if (Number.isNaN(n) || Number.isNaN(m)) return a === b;
  return Math.abs(n - m) < 1e-6;
}

/** Does the given ParsedEvent field value match the normalised slot value? */
function slotMatchesField(
  fieldKind: 'amount' | 'date' | 'raw',
  slotNormalized: string | null,
  extractedValue: string,
): boolean {
  if (slotNormalized === null) return false;
  switch (fieldKind) {
    case 'amount': return amountsEqual(slotNormalized, extractedValue);
    case 'date': return slotNormalized === extractedValue;
    case 'raw': return slotNormalized === extractedValue;
  }
}

/**
 * Try to map an extracted field value to a stable slot index across all
 * samples. Returns the slot index if every sample agrees, else null.
 */
function synthesizeNumericField(
  samples: StoredSample[],
  field: 'amount' | 'quantity' | 'price',
  slotKind: 'AMT',
): RecipeSlotRef | null {
  let candidateIndex: number | null = null;
  for (const sample of samples) {
    const raw = sample.event[field];
    if (raw === null || raw === undefined) {
      // Absent value (null or omitted) — handled separately by the
      // caller. Mixed null/value across samples = inconsistent → bail.
      return null;
    }
    const slots = extractTemplateSlots(sample.redactedBody).filter(
      (s) => s.slot === slotKind,
    );
    const matchIdx = slots.findIndex((s) =>
      slotMatchesField('amount', s.normalized, raw),
    );
    if (matchIdx < 0) return null;
    if (candidateIndex === null) candidateIndex = matchIdx;
    else if (candidateIndex !== matchIdx) return null;
  }
  if (candidateIndex === null) return null;
  return { kind: 'slot', slot: slotKind, index: candidateIndex };
}

function synthesizeDateField(samples: StoredSample[]): RecipeSlotRef | null {
  let candidateIndex: number | null = null;
  for (const sample of samples) {
    const slots = extractTemplateSlots(sample.redactedBody).filter(
      (s) => s.slot === 'DATE',
    );
    const matchIdx = slots.findIndex((s) =>
      slotMatchesField('date', s.normalized, sample.event.event_date),
    );
    if (matchIdx < 0) return null;
    if (candidateIndex === null) candidateIndex = matchIdx;
    else if (candidateIndex !== matchIdx) return null;
  }
  if (candidateIndex === null) return null;
  return { kind: 'slot', slot: 'DATE', index: candidateIndex };
}

/** Static if every sample returned the same value (including null). */
function synthesizeStaticField<K extends RecipeFieldName>(
  samples: StoredSample[],
  field: K & keyof ParsedEvent,
): RecipeSlotRef | null {
  const values = samples.map((s) => s.event[field]);
  const first = values[0];
  const allSame = values.every((v) => v === first);
  if (!allSame) return null;
  if (first === null || first === undefined) return { kind: 'null' };
  if (typeof first === 'string' || typeof first === 'number') {
    return { kind: 'static', value: first };
  }
  return null;
}

/**
 * Try to synthesise a recipe from the accumulated samples. Returns null
 * if required fields (event_type, event_date, confidence) can't be
 * mapped consistently — caller should drop samples and keep learning.
 */
export function synthesizeRecipe(samples: StoredSample[]): RecipeFields | null {
  if (samples.length < TEMPLATE_SAMPLE_THRESHOLD) return null;

  // event_type is almost always a static ("UPI_CREDIT" from hdfcbank).
  // Refuse to promote if it varies — the template hash is supposed to
  // uniquely identify a class of emails; if the type drifts, the hash
  // is lying.
  const event_type = synthesizeStaticField(samples, 'event_type');
  if (!event_type || event_type.kind === 'null') return null;

  const event_date = synthesizeDateField(samples);
  if (!event_date) return null;

  const fields: RecipeFields = {
    event_type,
    event_date,
    confidence: synthesizeStaticField(samples, 'confidence') ?? {
      kind: 'static',
      value: 0.85,
    },
    currency: synthesizeStaticField(samples, 'currency') ?? {
      kind: 'static',
      value: 'INR',
    },
  };

  // Optional fields — try each; fall back to null if no stable mapping.
  const amountRef =
    synthesizeStaticField(samples, 'amount') ??
    synthesizeNumericField(samples, 'amount', 'AMT');
  if (amountRef) fields.amount = amountRef;

  const quantityRef =
    synthesizeStaticField(samples, 'quantity') ??
    synthesizeNumericField(samples, 'quantity', 'AMT');
  if (quantityRef) fields.quantity = quantityRef;

  const priceRef =
    synthesizeStaticField(samples, 'price') ??
    synthesizeNumericField(samples, 'price', 'AMT');
  if (priceRef) fields.price = priceRef;

  // The purely-static fields: if they're consistent, lock them in so
  // recipe-generated events carry them. Otherwise leave blank.
  for (const f of [
    'counterparty',
    'instrument_isin',
    'instrument_symbol',
    'instrument_name',
    'account_last4',
    'notes',
  ] as const) {
    const stat = synthesizeStaticField(samples, f);
    if (stat) fields[f] = stat;
  }

  return fields;
}

/* -------------------------------------------------------------------------- */
/*  DB layer                                                                  */
/* -------------------------------------------------------------------------- */

// Not annotated with `z.ZodType<StoredSample>` — the ParsedEvent
// sub-schema has defaults (currency → 'INR') which make Zod's input
// type diverge from the inferred output type, and an explicit
// annotation forces input=output. The runtime shape is still enforced
// via the `.safeParse` call in `parseStoredRecipe`.
const StoredSampleSchema = z.object({
  messageId: z.string(),
  redactedBody: z.string(),
  event: ParsedEventSchema,
});

const SlotRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('slot'),
    slot: z.enum(['AMT', 'DATE', 'NUM']),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('static'),
    value: z.union([z.string(), z.number()]),
  }),
  z.object({ kind: z.literal('null') }),
]);

const RecipeFieldsSchema = z
  .record(z.string(), SlotRefSchema)
  .transform((raw) => {
    // Narrow to known field names; drop unknowns rather than fail —
    // forward-compat with future recipe fields written by a newer code
    // version that an older version is reading back.
    const allowed: RecipeFieldName[] = [
      'event_type', 'event_date', 'amount', 'quantity', 'price',
      'counterparty', 'instrument_isin', 'instrument_symbol',
      'instrument_name', 'account_last4', 'currency', 'confidence',
      'notes',
    ];
    const out: RecipeFields = {};
    for (const k of allowed) if (raw[k]) out[k] = raw[k];
    return out;
  });

const TemplateRecipeSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('sampling'),
    samples: z.array(StoredSampleSchema),
  }),
  z.object({
    state: z.literal('promoted'),
    fields: RecipeFieldsSchema,
    promotedAt: z.string(),
  }),
]);

function parseStoredRecipe(raw: unknown): TemplateRecipe | null {
  const parsed = TemplateRecipeSchema.safeParse(raw);
  if (!parsed.success) return null;
  // Cast is safe: RecipeFieldsSchema.transform returns RecipeFields and
  // ParsedEventSchema's output satisfies ParsedEvent. Zod's inferred
  // union just carries extra `input` baggage we don't care about here.
  return parsed.data as unknown as TemplateRecipe;
}

/** Active template for a (user, sender, hash) triple, if one is promoted. */
export async function findPromotedTemplate(opts: {
  userId: string;
  senderAddress: string;
  bodyStructureHash: string;
}): Promise<{
  templateId: string;
  version: number;
  fields: RecipeFields;
} | null> {
  const row = await prisma.learnedTemplate.findFirst({
    where: {
      userId: opts.userId,
      senderAddress: opts.senderAddress.toLowerCase(),
      bodyStructureHash: opts.bodyStructureHash,
      isActive: true,
    },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, extractionRecipe: true },
  });
  if (!row) return null;
  const recipe = parseStoredRecipe(row.extractionRecipe);
  if (!recipe || recipe.state !== 'promoted') return null;
  return { templateId: row.id, version: row.version, fields: recipe.fields };
}

/**
 * Record one (body, event) sample against the template bucket. If this
 * push crosses {@link TEMPLATE_SAMPLE_THRESHOLD}, attempts synthesis
 * and flips the row to `promoted`. Never throws — the pipeline treats
 * template learning as a best-effort side-effect.
 *
 * Multi-event bodies are silently skipped. We'd need a different recipe
 * shape (one fields-map per N rows) to handle statements, and the
 * single-event path is where the volume lives.
 */
export async function recordSample(opts: {
  userId: string;
  senderAddress: string;
  bodyStructureHash: string;
  messageId: string;
  redactedBody: string;
  events: ParsedEvent[];
}): Promise<void> {
  if (opts.events.length !== 1) return;
  const event = opts.events[0]!;
  const address = opts.senderAddress.toLowerCase();

  try {
    // `findFirst` + create/update rather than upsert: we need to read
    // the current recipe state to decide whether to append or ignore.
    const existing = await prisma.learnedTemplate.findFirst({
      where: {
        userId: opts.userId,
        senderAddress: address,
        bodyStructureHash: opts.bodyStructureHash,
        isActive: true,
      },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, extractionRecipe: true, sampleCount: true },
    });

    if (!existing) {
      const initialRecipe: TemplateRecipe = {
        state: 'sampling',
        samples: [{
          messageId: opts.messageId,
          redactedBody: opts.redactedBody,
          event,
        }],
      };
      await prisma.learnedTemplate.create({
        data: {
          userId: opts.userId,
          senderAddress: address,
          bodyStructureHash: opts.bodyStructureHash,
          extractionRecipe: initialRecipe as unknown as Prisma.InputJsonValue,
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
    // If the row is already promoted, nothing to learn — the recipe
    // is what's being used on subsequent emails. We don't re-enter
    // learning from an LLM-fallback path in this commit; that belongs
    // with the confidence-decay logic (future).
    if (!current || current.state === 'promoted') return;

    const nextSamples = [
      ...current.samples,
      { messageId: opts.messageId, redactedBody: opts.redactedBody, event },
    ];

    if (nextSamples.length >= TEMPLATE_SAMPLE_THRESHOLD) {
      const fields = synthesizeRecipe(nextSamples);
      if (fields) {
        const promoted: TemplateRecipe = {
          state: 'promoted',
          fields,
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
            senderAddress: address,
            bodyStructureHash: opts.bodyStructureHash,
            sampleCount: nextSamples.length,
          },
          'template.promoted',
        );
        return;
      }
      // Synthesis failed — samples disagree. Reset the sample buffer
      // and keep collecting; the row's version stays so we don't
      // hammer the unique index with a bumped version every time.
      const resetRecipe: TemplateRecipe = { state: 'sampling', samples: [] };
      await prisma.learnedTemplate.update({
        where: { id: existing.id },
        data: {
          extractionRecipe: resetRecipe as unknown as Prisma.InputJsonValue,
          sampleCount: 0,
          lastUsedAt: new Date(),
        },
      });
      logger.warn(
        {
          userId: opts.userId,
          templateId: existing.id,
          sampleCount: nextSamples.length,
        },
        'template.synthesis_disagreed_reset_samples',
      );
      return;
    }

    const nextRecipe: TemplateRecipe = { state: 'sampling', samples: nextSamples };
    await prisma.learnedTemplate.update({
      where: { id: existing.id },
      data: {
        extractionRecipe: nextRecipe as unknown as Prisma.InputJsonValue,
        sampleCount: nextSamples.length,
        lastUsedAt: new Date(),
      },
    });
  } catch (err) {
    // Template learning is strictly a side-effect. Log and swallow so a
    // learning-table hiccup never fails the outer CanonicalEvent insert.
    logger.warn(
      { err, userId: opts.userId, senderAddress: address },
      'template.record_sample_failed',
    );
  }
}

/**
 * Flip the active template's confidence / isActive after a recipe
 * application miss. This is the per-email feedback loop §6.4 refers to:
 * "lower template confidence, increment version if pattern changed".
 *
 * For this commit: first miss drops confidence to 0.5; second (already
 * <= 0.5) deactivates the row. Version bumping is deferred — when the
 * row is inactive, the next sample path creates a new row with
 * version+1 via the unique (user, sender, hash, version) constraint.
 *
 * Caller passes the templateId returned from {@link findPromotedTemplate}.
 */
export async function recordRecipeMiss(opts: {
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
        data: { confidenceScore: new Prisma.Decimal(0), isActive: false },
      });
      logger.warn(
        { userId: opts.userId, templateId: opts.templateId },
        'template.deactivated_after_repeated_miss',
      );
    }
  } catch (err) {
    logger.warn(
      { err, userId: opts.userId, templateId: opts.templateId },
      'template.recipe_miss_update_failed',
    );
  }
}
