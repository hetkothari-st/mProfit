/**
 * The MF verdict prose pipeline
 * (`docs/mf-analytics/05-FINDINGS-ENGINE.md §6`, `§8` item 6, `06 §4`, `06 §7`).
 *
 * The headline test in this file is the one `05 §8.6` asks for: **a stubbed
 * model returning a number that is not in the evidence must produce
 * `proseVerified: false`, discard the prose, and leave the deterministic
 * headlines to be shown instead.** Everything else here exists to make that
 * guarantee trustworthy rather than merely present:
 *
 *  - a *near miss* (a figure differing only in the last decimal), because that
 *    is the shape a real hallucination takes when a model copies from a
 *    payload full of numbers;
 *  - a legitimate *rounding*, because a guard that rejects honest narration
 *    gets switched off by the first person it inconveniences;
 *  - the two gates (`ENABLE_LLM_ADVISOR_PROSE`, the per-user budget), because
 *    `05 §6` says the pipeline is skipped entirely and the findings still
 *    shown — absence of prose is never an error to the user;
 *  - the RIA branch of `06 §4`, in both directions;
 *  - and `05 §7`'s "failures never affect the run status".
 *
 * **No test here ever reaches a real model.** The transport is replaced with a
 * stub via `__setMfProseTransportForTests`, which is also how a test asserts
 * things about the *prompt* — the RIA prohibition is a property of the string
 * that was sent, not of the reply.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import { env } from '../../../src/config/env.js';
import { createTestScope, type TestScope } from '../../helpers/db.js';
import {
  MF_PROSE_PURPOSE,
  PROSE_VERIFICATION_FAILED_PREFIX,
  PROSE_VERIFICATION_MIN_SAMPLE,
  checkMfProseVerificationFailureRate,
  drainMfProseQueue,
  enqueueMfProse,
  generateProseForRun,
  isMfProseEnabled,
  stopMfProseJob,
  __setMfProseTransportForTests,
  type MfProseTransportRequest,
} from '../../../src/jobs/mfProseJob.js';
import { makeFacts } from './rules/_facts.fixture.js';

// ---------------------------------------------------------------------------
// Env control
// ---------------------------------------------------------------------------

/**
 * `env` is a plain object produced by a Zod parse at import time, so a test
 * mutates it directly rather than re-importing the module under a different
 * `process.env`. Restored in `afterEach`; a leaked flag here would silently
 * change the behaviour of every later file in a suite that runs sequentially
 * by design (`CONTEXT.md §12`).
 */
const mutableEnv = env as unknown as Record<string, string | undefined>;
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'ENABLE_LLM_ADVISOR_PROSE', 'RIA_VERDICTS_ENABLED'] as const;
let savedEnv: Record<string, string | undefined> = {};

function enableProse(opts: { ria?: boolean } = {}): void {
  mutableEnv.ANTHROPIC_API_KEY = 'test-key-never-used';
  mutableEnv.ENABLE_LLM_ADVISOR_PROSE = 'true';
  mutableEnv.RIA_VERDICTS_ENABLED = opts.ria === true ? 'true' : 'false';
}

// ---------------------------------------------------------------------------
// Transport stub
// ---------------------------------------------------------------------------

interface StubCall {
  request: MfProseTransportRequest;
}

let calls: StubCall[] = [];

/** A model that replies with exactly this text, once per call. */
function stubReplying(prose: string): void {
  __setMfProseTransportForTests(async (request) => {
    calls.push({ request });
    return Promise.resolve({ inputTokens: 900, outputTokens: 120, prose, stopReason: 'tool_use' });
  });
}

function stubThrowing(message: string): void {
  __setMfProseTransportForTests((request) => {
    calls.push({ request });
    return Promise.reject(new Error(message));
  });
}

// ---------------------------------------------------------------------------
// Fixture: one completed run, one WARNING finding, one REVIEW verdict
// ---------------------------------------------------------------------------

const HEADLINE = 'Captured 118% of benchmark losses (category median 96%)';
const COUNTERFACTUAL = 'Would clear at a down-capture of 1.10 or lower';

/** The evidence values the narration is allowed to quote, and nothing else. */
const DOWN_CAPTURE = '1.184321';
const CATEGORY_MEDIAN = '0.960000';

interface SeededRun {
  runId: string;
  verdictId: string;
  schemeCode: string;
}

async function seedRun(
  scope: TestScope,
  opts: { verdict?: 'REVIEW' | 'SWITCH_CANDIDATE'; withFindings?: boolean } = {},
): Promise<SeededRun> {
  const facts = makeFacts();
  const schemeCode = Object.keys(facts.funds)[0]!;
  const withFindings = opts.withFindings !== false;

  return scope.runAs(async () => {
    const run = await prisma.mfAnalysisRun.create({
      data: {
        userId: scope.userId,
        asOf: new Date('2026-08-31T00:00:00.000Z'),
        status: 'COMPLETED',
        factsSnapshot: facts as unknown as Prisma.InputJsonValue,
        portfolioAnalysis: {},
        ruleVersionsSnapshot: [],
        triggeredBy: 'USER_REFRESH',
      },
      select: { id: true },
    });

    if (withFindings) {
      await prisma.mfFinding.create({
        data: {
          runId: run.id,
          userId: scope.userId,
          schemeCode,
          ruleId: 'mf.risk.high-down-capture',
          ruleVersion: '1.0.0',
          code: 'HIGH_DOWN_CAPTURE',
          category: 'RISK',
          severity: 'WARNING',
          confidence: '0.900000',
          headline: HEADLINE,
          evidence: [
            {
              metric: 'capture.down',
              label: 'Down-capture vs benchmark',
              horizonYears: 3,
              value: DOWN_CAPTURE,
              categoryMedian: CATEGORY_MEDIAN,
              unit: 'ratio',
            },
          ] as unknown as Prisma.InputJsonValue,
          whatWouldChangeThis: COUNTERFACTUAL,
        },
      });
    }

    const verdict = await prisma.mfFundVerdict.create({
      data: {
        runId: run.id,
        userId: scope.userId,
        schemeCode,
        verdict: opts.verdict ?? 'REVIEW',
        reasons: ['HIGH_DOWN_CAPTURE'] as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return { runId: run.id, verdictId: verdict.id, schemeCode };
  });
}

async function readVerdict(scope: TestScope, verdictId: string) {
  return scope.runAs(() =>
    prisma.mfFundVerdict.findUniqueOrThrow({
      where: { id: verdictId },
      select: { prose: true, proseModel: true, proseVerified: true },
    }),
  );
}

// ---------------------------------------------------------------------------

describe('MF verdict prose pipeline', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('mfprose');
  });

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.mfFundVerdict.deleteMany({ where: { userId: scope.userId } });
      await prisma.mfFinding.deleteMany({ where: { userId: scope.userId } });
      await prisma.mfAnalysisRun.deleteMany({ where: { userId: scope.userId } });
      await prisma.llmSpend.deleteMany({ where: { userId: scope.userId } });
      await prisma.alert.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, mutableEnv[k]]));
    calls = [];
    enableProse();
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) mutableEnv[k] = savedEnv[k];
    __setMfProseTransportForTests(null);
    stopMfProseJob();
    // Spend rows accumulate across cases and would otherwise let one test's
    // ledger cap the budget of the next.
    await runAsSystem(() => prisma.llmSpend.deleteMany({ where: { userId: scope.userId } }));
  });

  // -------------------------------------------------------------------------
  // `05 §8.6` — the headline test
  // -------------------------------------------------------------------------

  it('discards prose containing a figure absent from the evidence, and shows headlines instead', async () => {
    const seeded = await seedRun(scope);
    stubReplying(
      'Your fund passed on 118% of the benchmark falls against a category median of 96%. ' +
        'That cost you roughly ₹45,000 over the period. This would clear at a down-capture of 1.10 or lower.',
    );

    const result = await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    expect(result.disabled).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.outcome).toBe('rejected');
    expect(result.results[0]?.offending).toEqual(['₹45,000']);

    // The verdict row is untouched: no prose, not marked verified. `06 §6`
    // then renders the deterministic headline and says nothing to the user.
    const row = await readVerdict(scope, seeded.verdictId);
    expect(row.prose).toBeNull();
    expect(row.proseVerified).toBe(false);
    expect(row.proseModel).toBeNull();

    // The finding — the thing that IS shown — is still there and unchanged.
    const finding = await scope.runAs(() =>
      prisma.mfFinding.findFirstOrThrow({ where: { runId: seeded.runId } }),
    );
    expect(finding.headline).toBe(HEADLINE);

    // And the failure is recorded in a form `06 §7`'s alert can count.
    const spend = await scope.runAs(() =>
      prisma.llmSpend.findFirstOrThrow({ where: { userId: scope.userId, purpose: MF_PROSE_PURPOSE } }),
    );
    expect(spend.success).toBe(false);
    expect(spend.errorMessage?.startsWith(PROSE_VERIFICATION_FAILED_PREFIX)).toBe(true);
    expect(spend.errorMessage).toContain('₹45,000');
  });

  it('discards a near miss — a figure differing from a real one only in the last decimal', async () => {
    const seeded = await seedRun(scope);
    stubReplying(
      `Down-capture was 1.184322x against a category median of 0.96. ${COUNTERFACTUAL}.`,
    );

    const result = await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    expect(result.results[0]?.outcome).toBe('rejected');
    expect(result.results[0]?.offending).toEqual(['1.184322x']);
    expect((await readVerdict(scope, seeded.verdictId)).proseVerified).toBe(false);
  });

  it('ACCEPTS a legitimate rounding of an evidence figure and persists the prose', async () => {
    const seeded = await seedRun(scope);
    const prose =
      'Your fund passed on 1.18x of the benchmark falls, where the typical fund in its ' +
      'category passed on 0.96 — down-capture is how much of a market drop a fund hands ' +
      'on to you. It has 1000 units worth ₹5,20,000 today. This would clear at a ' +
      'down-capture of 1.10 or lower.';
    stubReplying(prose);

    const result = await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    expect(result.results[0]?.outcome).toBe('verified');
    const row = await readVerdict(scope, seeded.verdictId);
    expect(row.prose).toBe(prose);
    expect(row.proseVerified).toBe(true);
    expect(row.proseModel).toBe(env.LLM_ADVISOR_MODEL);

    // `05 §6.4`: "Record spend on the run."
    const run = await scope.runAs(() =>
      prisma.mfAnalysisRun.findUniqueOrThrow({
        where: { id: seeded.runId },
        select: { llmSpendInr: true, status: true },
      }),
    );
    expect(run.llmSpendInr).not.toBeNull();
    expect(Number(run.llmSpendInr?.toString())).toBeGreaterThan(0);
    expect(run.status).toBe('COMPLETED');
  });

  // -------------------------------------------------------------------------
  // Gates (`05 §6`) — absence of prose is never an error
  // -------------------------------------------------------------------------

  it('makes no call and reports no error when ENABLE_LLM_ADVISOR_PROSE is false', async () => {
    const seeded = await seedRun(scope);
    mutableEnv.ENABLE_LLM_ADVISOR_PROSE = 'false';
    stubReplying('should never be requested');

    expect(isMfProseEnabled()).toBe(false);
    const result = await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    expect(result.disabled).toBe(true);
    expect(result.results).toEqual([]);
    expect(calls).toHaveLength(0);
    expect((await readVerdict(scope, seeded.verdictId)).proseVerified).toBe(false);
  });

  it('makes no call when the per-user LLM budget is exhausted, and leaves the findings intact', async () => {
    const seeded = await seedRun(scope);
    stubReplying('should never be requested');

    // Past the ₹1000 default monthly cap (`ingestion/llm/budget.ts`).
    await scope.runAs(() =>
      prisma.llmSpend.create({
        data: {
          userId: scope.userId,
          model: 'whatever',
          inputTokens: 0,
          outputTokens: 0,
          costInr: '2000.0000',
          purpose: 'test.preexisting',
          success: true,
        },
      }),
    );

    const result = await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    expect(calls).toHaveLength(0);
    expect(result.results[0]?.outcome).toBe('capped');
    expect((await readVerdict(scope, seeded.verdictId)).prose).toBeNull();

    const findings = await scope.runAs(() =>
      prisma.mfFinding.count({ where: { runId: seeded.runId } }),
    );
    expect(findings).toBe(1);
  });

  it('skips a verdict with nothing to narrate rather than paying for padding', async () => {
    const seeded = await seedRun(scope, { withFindings: false });
    stubReplying('should never be requested');

    const result = await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    expect(calls).toHaveLength(0);
    expect(result.results[0]?.outcome).toBe('skipped');
  });

  // -------------------------------------------------------------------------
  // RIA gating (`06 §4`)
  // -------------------------------------------------------------------------

  it('forbids imperatives in the prompt, and rejects one in the output, when RIA_VERDICTS_ENABLED is false', async () => {
    const seeded = await seedRun(scope);
    stubReplying(
      `Your fund passed on 1.18x of the benchmark falls. Sell it. ${COUNTERFACTUAL}.`,
    );

    const result = await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    // The prompt said so...
    const system = calls[0]?.request.system ?? '';
    expect(system).toContain('RESEARCH, NOT ADVICE');
    expect(system).toContain('strictly forbidden');
    // ...and the output was checked against it, because a prompt constraint
    // nobody verifies is a comment.
    expect(result.results[0]?.outcome).toBe('rejected');
    expect(result.results[0]?.offending?.join(' ').toLowerCase()).toContain('sell');
    expect((await readVerdict(scope, seeded.verdictId)).prose).toBeNull();
  });

  it('permits the switch instruction only for a SWITCH_CANDIDATE under RIA_VERDICTS_ENABLED', async () => {
    // NOTE: no `SWITCH_CANDIDATE` can be produced in production today —
    // `REPLACEMENT_EXPECTED_EDGE` is null, so verdict-table row 3 cannot fire
    // and no rule emits CRITICAL for row 2. The verdict row is seeded directly
    // here so the permissive branch is nonetheless exercised: the day the
    // backtest coefficient lands, this path starts running and must already be
    // correct rather than reconstructed from memory.
    enableProse({ ria: true });
    const seeded = await seedRun(scope, { verdict: 'SWITCH_CANDIDATE' });
    stubReplying(
      `Your fund passed on 1.18x of the benchmark falls against a category median of 0.96. ` +
        `Switch out of it. ${COUNTERFACTUAL}.`,
    );

    const result = await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    const system = calls[0]?.request.system ?? '';
    expect(system).toContain('SWITCH_CANDIDATE');
    expect(system).not.toContain('RESEARCH, NOT ADVICE');
    expect(result.results[0]?.outcome).toBe('verified');
  });

  it('still forbids imperatives for a non-SWITCH_CANDIDATE even under RIA_VERDICTS_ENABLED', async () => {
    // An imperative attached to a REVIEW would be the narrator escalating a
    // conclusion the engine did not reach — the one thing a narrator must
    // never do, registration or no registration.
    enableProse({ ria: true });
    const seeded = await seedRun(scope);
    stubReplying(`Down-capture is 1.18x. You should sell this fund. ${COUNTERFACTUAL}.`);

    const result = await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    expect(calls[0]?.request.system).toContain('RESEARCH, NOT ADVICE');
    expect(result.results[0]?.outcome).toBe('rejected');
  });

  // -------------------------------------------------------------------------
  // The payload (`05 §6.1`)
  // -------------------------------------------------------------------------

  it('sends findings, verdict, pillars and the holding summary — and no NAV series', async () => {
    const seeded = await seedRun(scope);
    stubReplying(`Down-capture was 1.18x. ${COUNTERFACTUAL}.`);
    await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    const payload = JSON.parse(calls[0]?.request.userMessage ?? '{}') as Record<string, unknown>;
    expect(payload.verdict).toBe('REVIEW');
    expect(payload.reasons).toEqual(['HIGH_DOWN_CAPTURE']);
    expect(payload.pillars).toBeInstanceOf(Array);
    expect(payload.holding).toMatchObject({ currentValue: expect.any(String) });
    expect(Array.isArray(payload.findings)).toBe(true);

    // `05 §6.1`: never raw NAV series, and never another user's anything.
    const raw = calls[0]?.request.userMessage ?? '';
    expect(raw).not.toContain('navSeries');
    expect(raw).not.toContain('"nav"');
    // The AMFI scheme code is a run of digits with no meaning to a reader;
    // including it would license the model to emit it as a figure.
    expect(payload.schemeCode).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // `05 §7` — prose failures never affect the run
  // -------------------------------------------------------------------------

  it('leaves the run status untouched when the model call throws', async () => {
    const seeded = await seedRun(scope);
    stubThrowing('anthropic exploded');

    const result = await scope.runAs(() => generateProseForRun(scope.userId, seeded.runId));

    expect(result.results[0]?.outcome).toBe('failed');
    const run = await scope.runAs(() =>
      prisma.mfAnalysisRun.findUniqueOrThrow({
        where: { id: seeded.runId },
        select: { status: true },
      }),
    );
    expect(run.status).toBe('COMPLETED');
    expect((await readVerdict(scope, seeded.verdictId)).proseVerified).toBe(false);
  });

  it('drains the queue without throwing when a whole run fails', async () => {
    const seeded = await seedRun(scope);
    stubThrowing('anthropic exploded');

    enqueueMfProse(scope.userId, seeded.runId);
    await expect(drainMfProseQueue()).resolves.toBeUndefined();

    const run = await scope.runAs(() =>
      prisma.mfAnalysisRun.findUniqueOrThrow({
        where: { id: seeded.runId },
        select: { status: true },
      }),
    );
    expect(run.status).toBe('COMPLETED');
  });

  it('does not queue anything at all when the feature gate is off', async () => {
    mutableEnv.ENABLE_LLM_ADVISOR_PROSE = 'false';
    stubReplying('should never be requested');
    const seeded = await seedRun(scope);

    enqueueMfProse(scope.userId, seeded.runId);
    await drainMfProseQueue();

    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// `06 §7` — verification failure rate alert
// ---------------------------------------------------------------------------

describe('prose verification failure rate alert (06 §7)', () => {
  let scope: TestScope;
  /** A day far outside any other test's window, so the fleet-wide read cannot
   *  pick up rows another suite wrote. */
  const DAY = new Date('2001-01-05T12:00:00.000Z');

  beforeAll(async () => {
    scope = await createTestScope('mfproserate');
  });

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.llmSpend.deleteMany({ where: { userId: scope.userId } });
      await prisma.alert.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.llmSpend.deleteMany({ where: { userId: scope.userId } });
      await prisma.alert.deleteMany({ where: { userId: scope.userId } });
    });
  });

  async function seedOutcomes(counts: {
    verified: number;
    rejected: number;
    transportFailures?: number;
  }): Promise<void> {
    const rows: Prisma.LlmSpendCreateManyInput[] = [];
    for (let i = 0; i < counts.verified; i += 1) {
      rows.push({
        userId: scope.userId,
        model: 'stub',
        inputTokens: 1,
        outputTokens: 1,
        costInr: '0.0001',
        purpose: MF_PROSE_PURPOSE,
        success: true,
        createdAt: DAY,
      });
    }
    for (let i = 0; i < counts.rejected; i += 1) {
      rows.push({
        userId: scope.userId,
        model: 'stub',
        inputTokens: 1,
        outputTokens: 1,
        costInr: '0.0001',
        purpose: MF_PROSE_PURPOSE,
        success: false,
        errorMessage: `${PROSE_VERIFICATION_FAILED_PREFIX}: ₹45,000`,
        createdAt: DAY,
      });
    }
    for (let i = 0; i < (counts.transportFailures ?? 0); i += 1) {
      rows.push({
        userId: scope.userId,
        model: 'stub',
        inputTokens: 0,
        outputTokens: 0,
        costInr: '0.0000',
        purpose: MF_PROSE_PURPOSE,
        success: false,
        errorMessage: 'socket hang up',
        createdAt: DAY,
      });
    }
    await runAsSystem(() => prisma.llmSpend.createMany({ data: rows }));
  }

  it('raises an ops alert when more than 5% of narrations fail verification', async () => {
    await seedOutcomes({ verified: 27, rejected: 3 });

    const result = await checkMfProseVerificationFailureRate({ day: DAY, opsUserId: scope.userId });

    expect(result.verified).toBe(27);
    expect(result.rejected).toBe(3);
    expect(result.rate).toBe('0.1000');
    expect(result.alerted).toBe(true);

    const alert = await runAsSystem(() =>
      prisma.alert.findFirstOrThrow({ where: { userId: scope.userId, type: 'CUSTOM' } }),
    );
    expect(alert.title).toContain('MF prose verification failures');
    expect(alert.description).toContain('prompt regression');
  });

  it('raises exactly one alert however many times it runs for the same day', async () => {
    await seedOutcomes({ verified: 27, rejected: 3 });
    await checkMfProseVerificationFailureRate({ day: DAY, opsUserId: scope.userId });
    await checkMfProseVerificationFailureRate({ day: DAY, opsUserId: scope.userId });

    const count = await runAsSystem(() =>
      prisma.alert.count({ where: { userId: scope.userId, type: 'CUSTOM' } }),
    );
    expect(count).toBe(1);
  });

  it('stays quiet within the threshold', async () => {
    await seedOutcomes({ verified: 99, rejected: 1 });
    const result = await checkMfProseVerificationFailureRate({ day: DAY, opsUserId: scope.userId });
    expect(result.alerted).toBe(false);
    expect(result.reason).toBe('within threshold');
  });

  it('stays quiet below the minimum sample — a regression is a property of a population', async () => {
    await seedOutcomes({ verified: 1, rejected: 1 });
    const result = await checkMfProseVerificationFailureRate({ day: DAY, opsUserId: scope.userId });
    expect(result.alerted).toBe(false);
    expect(result.reason).toContain(`minimum sample is ${PROSE_VERIFICATION_MIN_SAMPLE}`);
  });

  it('excludes transport failures from both halves of the ratio', async () => {
    // An Anthropic outage tells an operator nothing about the prompt. Counting
    // it would make the alert fire on the wrong incident and, worse, stay
    // silent on the right one by diluting the denominator.
    await seedOutcomes({ verified: 25, rejected: 1, transportFailures: 50 });
    const result = await checkMfProseVerificationFailureRate({ day: DAY, opsUserId: scope.userId });
    expect(result.verified).toBe(25);
    expect(result.rejected).toBe(1);
    expect(result.alerted).toBe(false);
  });
});
