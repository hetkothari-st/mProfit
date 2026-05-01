/**
 * §6.7 / §6.9 per-email pipeline.
 *
 * One Gmail message in, zero-or-more CanonicalEvent rows out. The
 * pipeline has four escape hatches that together uphold the §3
 * invariants without ever crashing the outer poll loop (§3.5):
 *
 *   1. **Idempotency short-circuit** — if a CanonicalEvent with this
 *      `sourceHash` already exists, we return immediately. Re-polling
 *      the same sender after a service restart must never duplicate.
 *      (§3.3, BUG-003.)
 *
 *   2. **LLM-gate refusal** — if `ENABLE_LLM_PARSER` or
 *      `ANTHROPIC_API_KEY` is missing we write one `IngestionFailure`
 *      with reason "llm_gate_closed" and stop. The user then sees the
 *      message in the DLQ UI and can flip the flag without losing
 *      data. This is §16 Gate G5 code-enforced.
 *
 *   3. **Budget-capped archive** — if the user is over their monthly
 *      LLM cap, we *still* create a CanonicalEvent row, but with
 *      `status = ARCHIVED` and the raw (redacted) body stored in
 *      `metadata.archivedBody`. A maintenance job in a future phase
 *      can sweep these once the next month's budget resets. (§6.11,
 *      §9 decision.)
 *
 *   4. **Parse failure** — anything else that goes wrong downstream of
 *      a live LLM call (API error, Zod validation drift,
 *      no_tool_use) lands in `IngestionFailure` with the full reason.
 *      The per-email handler returns its outcome as a discriminated
 *      union so the poller can count successes without re-inspecting
 *      the DB.
 */

import type { gmail_v1 } from 'googleapis';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import {
  bodyStructureHash,
  eventWithinSourceHash,
  gmailSourceHash,
} from '../hash.js';
import { redactForLlm } from '../pii.js';
import {
  checkLlmGate,
  parseEmailWithLlm,
  type LlmParseResult,
} from '../llm/client.js';
import { extractEmailBody } from './bodyExtract.js';
import type { ParsedEvent } from '../llm/schema.js';
import { projectCanonicalEvent } from '../projection.js';
import {
  applyRecipe,
  findPromotedTemplate,
  recordRecipeMiss,
  recordSample,
} from '../templates.js';

/**
 * Adapter identifiers. §3.4 / BUG-007: every CanonicalEvent carries
 * both so we can later re-parse by adapter+version or invalidate a
 * specific generation when a parser drifts.
 */
export const GMAIL_LLM_ADAPTER_ID = 'gmail.generic.v1';
export const GMAIL_LLM_ADAPTER_VER = '1';

/**
 * Separate adapter id for deterministic (§6.4) template-recipe-produced
 * events. Keeping this distinct from the LLM adapter lets analytics and
 * re-parse jobs filter on provenance: "how many events were extracted
 * without an LLM call?" / "if this recipe is buggy, which events need
 * re-parsing?"
 */
export const GMAIL_TEMPLATE_ADAPTER_ID = 'gmail.template.v1';

/**
 * Outcome of processing one email. Tests and the poller both consume
 * this discriminated union — `kind` tells the caller what happened
 * without a separate "status" string to keep in sync.
 */
export type ProcessEmailOutcome =
  | { kind: 'skipped_duplicate'; sourceHash: string }
  | { kind: 'skipped_empty_body' }
  | { kind: 'gate_closed'; reason: string }
  | { kind: 'archived_over_budget'; eventId: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'created'; eventIds: string[] };

export interface ProcessEmailInput {
  /** The MonitoredSender row this email came from — used for auto-commit rules. */
  userId: string;
  senderAddress: string;
  autoCommitEnabled: boolean;
  /** Gmail message id — enough to round-trip to the original email. */
  messageId: string;
  /** Full message with payload — caller is responsible for fetching format:'full'. */
  message: gmail_v1.Schema$Message;
}

/**
 * Map a ParsedEvent (from the LLM) to the column values we want to
 * persist as a CanonicalEvent. Kept narrow: we don't try to project
 * into Transaction/CashFlow here; §6.9 projection is a separate step
 * driven by the Review UI approval flow.
 */
function canonicalRowFromParsed(
  base: {
    userId: string;
    sourceAdapter: string;
    sourceAdapterVer: string;
    sourceRef: string;
    sourceHash: string;
    senderAddress: string;
    autoCommitEnabled: boolean;
  },
  ev: ParsedEvent,
): Prisma.CanonicalEventCreateInput {
  // F&O event metadata is forwarded via the JSON `metadata` column so the
  // projection step (ingestion/projection.ts projectFnoTrade) can rebuild
  // the contract identity (underlying, type, strike, expiry, side).
  const fnoMetadata =
    ev.event_type === 'FNO_TRADE'
      ? {
          fno_trading_symbol: ev.fno_trading_symbol ?? null,
          fno_underlying: ev.fno_underlying ?? null,
          fno_instrument_type: ev.fno_instrument_type ?? null,
          fno_strike_price: ev.fno_strike_price ?? null,
          fno_expiry_date: ev.fno_expiry_date ?? null,
          fno_lot_size: ev.fno_lot_size ?? null,
          fno_quantity_contracts: ev.fno_quantity_contracts ?? null,
          fno_side: ev.fno_side ?? null,
        }
      : undefined;
  return {
    user: { connect: { id: base.userId } },
    sourceAdapter: base.sourceAdapter,
    sourceAdapterVer: base.sourceAdapterVer,
    sourceRef: base.sourceRef,
    sourceHash: base.sourceHash,
    senderAddress: base.senderAddress.toLowerCase(),
    eventType: ev.event_type,
    eventDate: new Date(`${ev.event_date}T00:00:00.000Z`),
    amount: ev.amount ?? null,
    quantity: ev.quantity ?? null,
    price: ev.price ?? null,
    counterparty: ev.counterparty,
    instrumentIsin: ev.instrument_isin,
    instrumentSymbol: ev.instrument_symbol,
    instrumentName: ev.instrument_name,
    accountLast4: ev.account_last4,
    currency: ev.currency,
    confidence: ev.confidence,
    parserNotes: ev.notes,
    metadata: fnoMetadata as Prisma.InputJsonValue | undefined,
    // Auto-commit means "trust future events from this sender". A
    // confirmed auto-commit sender skips the review step and lands
    // directly in PARSED; otherwise the event waits for manual
    // approval in the Review UI. (§12 decision — 5-event threshold
    // handled upstream before the flag flips.)
    status: base.autoCommitEnabled ? 'PARSED' : 'PENDING_REVIEW',
  };
}

async function writeIngestionFailure(opts: {
  userId: string;
  sourceRef: string;
  errorMessage: string;
  errorStack?: string;
  rawPayload?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.ingestionFailure.create({
      data: {
        userId: opts.userId,
        sourceAdapter: GMAIL_LLM_ADAPTER_ID,
        adapterVersion: GMAIL_LLM_ADAPTER_VER,
        sourceRef: opts.sourceRef,
        errorMessage: opts.errorMessage,
        errorStack: opts.errorStack,
        rawPayload: opts.rawPayload,
      },
    });
  } catch (err) {
    // DLQ write failing is bad, but we already have a bigger problem
    // to report above — log and swallow so the caller still gets a
    // clean outcome back.
    logger.error(
      { err, userId: opts.userId, sourceRef: opts.sourceRef },
      'gmail.pipeline.dlq_write_failed',
    );
  }
}

export interface ProcessEmailDeps {
  /** Override the LLM caller for tests. Real callers use the default. */
  parseEmail?: typeof parseEmailWithLlm;
  /** Override the gate for tests. */
  checkGate?: typeof checkLlmGate;
}

/**
 * Run one Gmail message through the pipeline. Never throws — every
 * failure path either writes an IngestionFailure row or returns an
 * outcome the poller can react to.
 */
export async function processEmail(
  input: ProcessEmailInput,
  deps: ProcessEmailDeps = {},
): Promise<ProcessEmailOutcome> {
  const parseEmail = deps.parseEmail ?? parseEmailWithLlm;
  const checkGate = deps.checkGate ?? checkLlmGate;

  const sourceHash = gmailSourceHash(input.messageId);

  // 1. Idempotency short-circuit.
  const already = await prisma.canonicalEvent.findUnique({
    where: { userId_sourceHash: { userId: input.userId, sourceHash } },
    select: { id: true },
  });
  if (already) return { kind: 'skipped_duplicate', sourceHash };

  // 2. Body extract.
  const body = extractEmailBody(input.message);
  if (!body.trim()) return { kind: 'skipped_empty_body' };

  // 3. LLM gate. We fail *before* redacting to keep the DLQ entry
  //    free of the body itself — if the gate is closed for policy
  //    reasons we don't want to persist the message at all.
  const gate = checkGate();
  if (!gate.ok) {
    await writeIngestionFailure({
      userId: input.userId,
      sourceRef: input.messageId,
      errorMessage: `llm_gate_closed: ${gate.reason} — ${gate.message}`,
    });
    return { kind: 'gate_closed', reason: gate.reason };
  }

  // 4. Template-cache lookup (§6.4). If an active promoted recipe
  //    exists for this (sender, structure-hash) triple, apply it
  //    deterministically and never call the LLM. On a miss we decay
  //    the template's confidence; two consecutive misses deactivate
  //    the recipe and the next email falls through to learning mode.
  const structureHash = bodyStructureHash(body);

  const promoted = await findPromotedTemplate({
    userId: input.userId,
    senderAddress: input.senderAddress,
    bodyStructureHash: structureHash,
  });
  if (promoted) {
    const recipeEvent = applyRecipe(promoted.fields, body);
    if (recipeEvent) {
      const persisted = await persistEvents({
        input,
        sourceHash,
        events: [recipeEvent],
        sourceAdapter: GMAIL_TEMPLATE_ADAPTER_ID,
        sourceAdapterVer: String(promoted.version),
        metadata: {
          template: { id: promoted.templateId, version: promoted.version },
        },
      });
      await maybeAutoProject(persisted, input);
      return persisted;
    }
    await recordRecipeMiss({ userId: input.userId, templateId: promoted.templateId });
    logger.info(
      {
        userId: input.userId,
        messageId: input.messageId,
        templateId: promoted.templateId,
        structureHash,
      },
      'gmail.pipeline.recipe_miss_falling_back_to_llm',
    );
  }

  // 5. LLM call.
  const llm = await parseEmail({
    userId: input.userId,
    emailBody: body,
    sourceRef: input.messageId,
    purpose: 'gmail_parse',
  });

  if (!llm.ok) return handleLlmFailure(llm, input, body);

  if (llm.events.length === 0) {
    // No events is a legitimate outcome (marketing mail the model
    // correctly rejected). Nothing to persist; nothing to fail.
    logger.info(
      {
        userId: input.userId,
        messageId: input.messageId,
        isMarketing: llm.isMarketing,
        structureHash,
      },
      'gmail.pipeline.no_events',
    );
    return { kind: 'created', eventIds: [] };
  }

  // 6. Persist one CanonicalEvent per parsed event.
  const outcome = await persistEvents({
    input,
    sourceHash,
    events: llm.events,
    sourceAdapter: GMAIL_LLM_ADAPTER_ID,
    sourceAdapterVer: GMAIL_LLM_ADAPTER_VER,
  });

  // 6b. Phase B auto-project: when sender is trusted (autoCommitEnabled),
  // events skip the manual review queue and project straight into
  // Transaction/CashFlow rows.
  await maybeAutoProject(outcome, input);

  // 7. Feed the template learner. We only learn from successful,
  //    single-event LLM parses — the sample threshold (§6.4) will
  //    eventually promote a recipe that replaces the LLM entirely.
  //    Fire-and-forget: `recordSample` never throws.
  if (outcome.kind === 'created' && outcome.eventIds.length > 0) {
    await recordSample({
      userId: input.userId,
      senderAddress: input.senderAddress,
      bodyStructureHash: structureHash,
      messageId: input.messageId,
      redactedBody: redactForLlm(body).text,
      events: llm.events,
    });
  }

  return outcome;
}

/**
 * Write one CanonicalEvent per parsed event. Multi-event messages
 * (e.g. a statement listing 10 lines) get per-event hashes via
 * `eventWithinSourceHash` so even within one message each row has its
 * own idempotency key. Extracted so the deterministic recipe path and
 * the LLM path share the same persistence + race-handling behaviour.
 */
async function persistEvents(opts: {
  input: ProcessEmailInput;
  sourceHash: string;
  events: ParsedEvent[];
  sourceAdapter: string;
  sourceAdapterVer: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<ProcessEmailOutcome> {
  const { input, sourceHash, events, sourceAdapter, sourceAdapterVer, metadata } = opts;
  const eventIds: string[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const eventHash =
      events.length === 1
        ? sourceHash
        : eventWithinSourceHash({
            sourceHash,
            index: i,
            amount: ev.amount ?? '',
            eventDate: ev.event_date,
          });

    try {
      const data = canonicalRowFromParsed(
        {
          userId: input.userId,
          sourceAdapter,
          sourceAdapterVer,
          sourceRef: input.messageId,
          sourceHash: eventHash,
          senderAddress: input.senderAddress,
          autoCommitEnabled: input.autoCommitEnabled,
        },
        ev,
      );
      if (metadata !== undefined) data.metadata = metadata;
      const row = await prisma.canonicalEvent.create({
        data,
        select: { id: true },
      });
      eventIds.push(row.id);
    } catch (err) {
      // Most likely a race where a concurrent poll inserted the same
      // eventHash. P2002 means the unique constraint fired — that's
      // the idempotency guarantee working, not a real failure.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        logger.info(
          { userId: input.userId, sourceHash: eventHash },
          'gmail.pipeline.race_duplicate',
        );
        continue;
      }
      await writeIngestionFailure({
        userId: input.userId,
        sourceRef: input.messageId,
        errorMessage: `canonical_event_create_failed: ${(err as Error).message}`,
        errorStack: (err as Error).stack,
      });
      return { kind: 'failed', reason: 'canonical_event_create_failed' };
    }
  }
  return { kind: 'created', eventIds };
}

/**
 * Translate a negative LlmParseResult into the right outcome + DB
 * side-effect. Extracted so `processEmail` reads linearly.
 */
async function handleLlmFailure(
  llm: Extract<LlmParseResult, { ok: false }>,
  input: ProcessEmailInput,
  body: string,
): Promise<ProcessEmailOutcome> {
  if (llm.reason === 'budget_capped') {
    // §6.11 archive path: we still create a CanonicalEvent so the
    // email isn't lost; downstream replay picks it up when budget
    // resets. Body is *redacted* before we persist it — we must not
    // write PAN/Aadhaar into metadata even if the LLM never saw it.
    const redacted = redactForLlm(body);
    const row = await prisma.canonicalEvent.create({
      data: {
        user: { connect: { id: input.userId } },
        sourceAdapter: GMAIL_LLM_ADAPTER_ID,
        sourceAdapterVer: GMAIL_LLM_ADAPTER_VER,
        sourceRef: input.messageId,
        sourceHash: gmailSourceHash(input.messageId),
        senderAddress: input.senderAddress.toLowerCase(),
        eventType: 'OTHER',
        eventDate: new Date(),
        amount: null,
        quantity: null,
        price: null,
        counterparty: null,
        instrumentIsin: null,
        instrumentSymbol: null,
        instrumentName: null,
        accountLast4: null,
        currency: 'INR',
        confidence: 0,
        parserNotes: 'Archived: LLM budget capped at parse time.',
        status: 'ARCHIVED',
        metadata: { archivedBody: redacted.text },
      },
      select: { id: true },
    });
    return { kind: 'archived_over_budget', eventId: row.id };
  }

  // All other failure reasons (api_error, no_tool_use, validation_error)
  // go straight to the DLQ. The raw body is *not* included — we don't
  // want one bad parser fire to persistently store a PAN even through
  // the redactor, and the message id is enough to re-fetch from Gmail.
  await writeIngestionFailure({
    userId: input.userId,
    sourceRef: input.messageId,
    errorMessage: `llm_${llm.reason}: ${llm.message}`,
    rawPayload: {
      reason: llm.reason,
      usage: llm.usage
        ? {
            inputTokens: llm.usage.inputTokens,
            outputTokens: llm.usage.outputTokens,
          }
        : null,
    } satisfies Prisma.InputJsonValue,
  });
  return { kind: 'failed', reason: llm.reason };
}

/**
 * Phase B: when the sender has autoCommitEnabled, immediately flip newly
 * persisted events from PARSED → CONFIRMED and project them into
 * Transaction/CashFlow rows. This is the "approve sender once → fully auto"
 * UX. Skips review queue entirely.
 */
async function maybeAutoProject(
  outcome: ProcessEmailOutcome,
  input: ProcessEmailInput,
): Promise<void> {
  if (!input.autoCommitEnabled) return;
  if (outcome.kind !== 'created' || outcome.eventIds.length === 0) return;

  for (const id of outcome.eventIds) {
    try {
      await prisma.canonicalEvent.update({
        where: { id },
        data: { status: 'CONFIRMED', reviewedAt: new Date(), reviewedById: input.userId },
      });
      const result = await projectCanonicalEvent(id);
      if (result.kind === 'failed') {
        logger.warn(
          { userId: input.userId, eventId: id, reason: result.reason, message: result.message },
          'gmail.pipeline.auto_project_failed',
        );
        // Roll back to PENDING_REVIEW so the user can manually approve/edit.
        await prisma.canonicalEvent
          .update({
            where: { id },
            data: { status: 'PENDING_REVIEW', reviewedAt: null, reviewedById: null },
          })
          .catch(() => undefined);
      }
    } catch (err) {
      logger.warn(
        { err, userId: input.userId, eventId: id },
        'gmail.pipeline.auto_project_threw',
      );
    }
  }
}
