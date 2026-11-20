/**
 * Policy check prose narration job.
 *
 * Mirrors mfProseJob.ts exactly in structure:
 *  - In-process coalescing queue (Map keyed by checkId).
 *  - LLM narrates findings + score + verdict.
 *  - Every numeric token in prose must appear in the findings (prose verifier).
 *  - Failed narration → proseVerified=false, deterministic headlines shown,
 *    no error to the user.
 *  - Enqueued AFTER the analysis commit, never inside it.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { Decimal } from '@everypaisa/shared';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { ANTHROPIC_CLIENT_OPTIONS } from '../lib/anthropicOptions.js';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { runAsUser } from '../lib/requestContext.js';
import { checkBudget } from '../ingestion/llm/budget.js';
import { recordSpend } from '../ingestion/llm/client.js';
import { verifyProseNumbers } from '../services/advisor/proseConsistency.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROSE_PURPOSE = 'policy_check_prose';
const PROSE_MAX_CHARS = 500;
const PROSE_VERIFICATION_FAILED_PREFIX = 'PROSE_VERIFICATION_FAILED';

const USD_PER_MTOK_INPUT = new Decimal('3.00');
const USD_PER_MTOK_OUTPUT = new Decimal('15.00');
const FX_DEFAULT = new Decimal('90');

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export function isPolicyProseEnabled(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) && env.ENABLE_LLM_ADVISOR_PROSE === 'true';
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

const ProseSchema = z.object({ prose: z.string().min(1).max(PROSE_MAX_CHARS) });

async function readFx(): Promise<Decimal> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: 'llm.usd_inr_fx' } });
    if (row && (typeof row.value === 'number' || typeof row.value === 'string')) {
      return new Decimal(row.value as string | number);
    }
  } catch (err) {
    logger.warn({ err }, '[policyProse] FX rate lookup failed — using default');
  }
  return FX_DEFAULT;
}

function estimateCost(input: number, output: number, fx: Decimal): Decimal {
  return USD_PER_MTOK_INPUT.mul(input)
    .plus(USD_PER_MTOK_OUTPUT.mul(output))
    .dividedBy(1_000_000)
    .mul(fx);
}

// ---------------------------------------------------------------------------
// One check narration
// ---------------------------------------------------------------------------

async function narrateCheck(userId: string, checkId: string): Promise<void> {
  const check = await prisma.policyHealthCheck.findFirst({
    where: { id: checkId, userId },
    select: { id: true, status: true, scoreSnapshot: true, policy: { select: { type: true } } },
  });

  if (!check || !['COMPLETED', 'PARTIAL'].includes(check.status)) return;

  const verdict = await prisma.policyVerdict.findFirst({
    where: { checkId, userId, supersededById: null, prose: null },
    select: { id: true, verdict: true, reasons: true, score: true },
  });

  if (!verdict) return;

  const findings = await prisma.policyFinding.findMany({
    where: { checkId, userId },
    select: { code: true, severity: true, headline: true, confidence: true },
    orderBy: { severity: 'asc' },
    take: 10,
  });

  if (findings.length === 0) return;

  const budget = await checkBudget(userId);
  if (budget.status === 'capped') {
    logger.info({ checkId, userId }, '[policyCheckProse] budget capped — skipping');
    return;
  }

  const scoreSnapshot = check.scoreSnapshot as Record<string, unknown> | null;
  const ratingCategory = scoreSnapshot?.['ratingCategory'] as string | null;
  const overall = verdict.score?.toString() ?? null;

  const kind =
    check.policy.type === 'TERM'
      ? 'term life'
      : check.policy.type === 'ULIP'
        ? 'unit-linked (ULIP)'
        : check.policy.type === 'ENDOWMENT' || check.policy.type === 'WHOLE_LIFE'
          ? 'savings-type life'
          : check.policy.type === 'MOTOR'
            ? 'motor'
            : check.policy.type === 'HOME'
              ? 'home'
              : check.policy.type === 'PERSONAL_ACCIDENT'
                ? 'personal accident'
                : 'health';
  const userMessage = [
    `Policy ${kind} check verdict: ${verdict.verdict}`,
    `Score: ${overall ?? 'N/A'}${ratingCategory ? ` (${ratingCategory})` : ''}`,
    '',
    'Key Findings:',
    ...findings.map((f) => `- [${f.severity}] ${f.headline}`),
  ].join('\n');

  const systemPrompt =
    `You are a ${kind} insurance policy analyst. Write a concise, factual summary ` +
    `(2-3 sentences, max 500 characters) of the key findings from this ${kind} policy check. ` +
    'Only mention numbers that appear in the findings list. Do not give investment advice or ' +
    'tell the user to "switch" or "buy" a specific policy. Use plain language.';

  const model = env.LLM_ADVISOR_MODEL ?? 'claude-sonnet-4-6';
  const fx = await readFx();

  let inputTokens = 0;
  let outputTokens = 0;
  let prose: string | null = null;

  try {
    const res = await getClient().messages.create({
      model,
      max_tokens: 300,
      system: systemPrompt,
      tools: [
        {
          name: 'write_prose',
          description: 'Write a brief policy health summary.',
          input_schema: {
            type: 'object' as const,
            required: ['prose'],
            properties: { prose: { type: 'string', maxLength: PROSE_MAX_CHARS } },
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'write_prose' },
      messages: [{ role: 'user', content: userMessage }],
    });

    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'write_prose',
    );
    if (block) {
      const parsed = ProseSchema.safeParse(block.input);
      if (parsed.success) prose = parsed.data.prose.trim();
    }
  } catch (err) {
    logger.error({ err, checkId }, '[policyCheckProse] LLM call failed');
  }

  const costInr = estimateCost(inputTokens, outputTokens, fx);

  if (!prose) {
    await recordSpend({
      userId,
      model,
      inputTokens,
      outputTokens,
      costInr,
      purpose: PROSE_PURPOSE,
      sourceRef: verdict.id,
      success: false,
      errorMessage: 'No prose produced',
    });
    return;
  }

  // Verify no invented numbers
  const check2 = verifyProseNumbers({ allowed: [userMessage], prose });
  if (!check2.ok) {
    logger.warn({ checkId, offending: check2.offending }, '[policyCheckProse] prose rejected — invented numbers');
    await recordSpend({
      userId,
      model,
      inputTokens,
      outputTokens,
      costInr,
      purpose: PROSE_PURPOSE,
      sourceRef: verdict.id,
      success: false,
      errorMessage: `${PROSE_VERIFICATION_FAILED_PREFIX}: ${check2.offending.join(', ')}`,
    });
    return;
  }

  await recordSpend({ userId, model, inputTokens, outputTokens, costInr, purpose: PROSE_PURPOSE, sourceRef: verdict.id, success: true });

  await runInTransaction((tx) =>
    tx.policyVerdict.update({
      where: { id: verdict.id },
      data: { prose, proseModel: model, proseVerified: true },
    }),
  );
}

// ---------------------------------------------------------------------------
// Coalescing queue
// ---------------------------------------------------------------------------

const pending = new Map<string, string>(); // checkId → userId
let started = false;
let draining = false;

export function enqueuePolicyProse(userId: string, checkId: string): void {
  if (!isPolicyProseEnabled()) return;
  pending.set(checkId, userId);
  if (started && !draining) void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (pending.size > 0) {
      const [checkId, userId] = pending.entries().next().value as [string, string];
      pending.delete(checkId);
      try {
        await runAsUser(userId, () => narrateCheck(userId, checkId));
      } catch (err) {
        logger.error({ err, checkId, userId }, '[policyCheckProse] narration failed');
      }
    }
  } finally {
    draining = false;
  }
}

export function startPolicyProseJob(): void {
  started = true;
  if (pending.size > 0) void drainQueue();
  logger.info('[policyCheckProse] prose job started');
}
