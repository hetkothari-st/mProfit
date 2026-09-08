/**
 * The MF findings orchestrator (`docs/mf-analytics/05-FINDINGS-ENGINE.md §7`,
 * `§8` items 4, 5, 7 and 8).
 *
 * Four guarantees are under test, and each one is invisible when it breaks:
 *
 *  4. **A broken rule is a broken rule, not a broken run.** One rule throws;
 *     the run is `PARTIAL`, every other rule's findings are still there, the
 *     error is on `ruleVersionsSnapshot`, and `missingCategories` names what is
 *     absent so the UI can say so instead of rendering a shorter page that
 *     looks complete.
 *  5. **A re-run never rewrites history.** Twice over unchanged facts: ONE
 *     verdict row. Change a finding: two rows, linked, and the first row's
 *     figures untouched.
 *  7. **RLS.** `MfFinding` / `MfFundVerdict` are invisible cross-user.
 *  8. **Replay.** A stored `factsSnapshot` runs against a newer rule version
 *     with the reference tables *deleted out from under it*. This is the
 *     reason `factsSnapshot` exists, and the strongest available proof that the
 *     replay path needs no database: the rows it would have queried are gone.
 *
 * **Every service call is inside `scope.runAs(...)`** (`CONTEXT.md §12`).
 * Without it RLS fails closed and everything returns zero rows, which looks
 * exactly like a logic bug and is not one.
 *
 * **The local database is shared with other agents.** Every row this file
 * creates is namespaced with `FX`, and `afterAll` deletes only rows matching
 * that prefix or belonging to users this file created. No unscoped
 * `deleteMany` anywhere, deliberately.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serializeRatio } from '@portfolioos/shared';
import type { MfFinding } from '@portfolioos/shared';

import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import {
  evaluateRules,
  replayAnalysis,
  runMfAnalysis,
  sameReasonSet,
} from '../../../src/services/mfAnalytics/mfAnalysisEngine.service.js';
import { MF_RULES } from '../../../src/services/mfAnalytics/rules/registry.js';
import { makeFinding, type MfAnalysisFacts, type MfRule } from '../../../src/services/mfAnalytics/types.js';
import { createTestScope, type TestScope } from '../../helpers/db.js';

// ---------------------------------------------------------------------------
// Fixture namespace
// ---------------------------------------------------------------------------

const FX = 'TSTMFENG';

/** Fixed, so what the engine picks up is a property of the fixture and not of
 *  the day the suite happens to run. */
const AS_OF = new Date(Date.UTC(2026, 5, 30));
const SCORE_AS_OF = new Date(Date.UTC(2026, 4, 31));

/** Held by `owner`. Rated 5 stars, so its verdict is driven entirely by the
 *  findings a test injects and never by a middling rating. */
const S_MAIN = `${FX}-MAIN`;
/** Held by `replayUser`. Its reference rows are deleted by the replay test. */
const S_REPLAY = `${FX}-REPLAY`;

const UNIVERSE_KEY = 'Large Cap Fund|DIRECT';

let owner: TestScope;
let stranger: TestScope;
let replayUser: TestScope;
const scopes: TestScope[] = [];

const fundIdByScheme = new Map<string, string>();

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

async function seedScheme(schemeCode: string): Promise<string> {
  const master = await prisma.mutualFundMaster.create({
    data: {
      schemeCode,
      schemeName: `${schemeCode} Fund`,
      amcName: `${FX} AMC`,
      category: 'EQUITY',
    },
  });
  await prisma.mfSchemeMeta.create({
    data: {
      schemeCode,
      schemeName: `${schemeCode} Fund`,
      amcCode: `${FX}AMC`,
      amcName: `${FX} AMC`,
      sebiCategory: 'EQUITY',
      sebiSubCategory: 'Large Cap Fund',
      planType: 'DIRECT',
      optionType: 'GROWTH',
      benchmarkIndexCode: null,
      inceptionDate: new Date(Date.UTC(2014, 0, 1)),
      status: 'ACTIVE',
      sourceHash: `${schemeCode}:meta`,
      fetchedAt: AS_OF,
    },
  });
  await prisma.mfSchemeScore.create({
    data: {
      schemeCode,
      asOf: SCORE_AS_OF,
      methodologyVersion: 'score-test-v1',
      modelKey: 'ACTIVE_EQUITY',
      ratingStatus: 'RATED',
      composite: '85.000000',
      rating: 5,
      pillars: {},
      universeKey: UNIVERSE_KEY,
      universeSize: 20,
    },
  });
  fundIdByScheme.set(schemeCode, master.id);
  return master.id;
}

/** A position in a scheme: the transaction that produced it plus the
 *  `HoldingProjection` row it projects to (`CONTEXT.md §3.2`). */
async function seedPosition(scope: TestScope, schemeCode: string): Promise<void> {
  const fundId = fundIdByScheme.get(schemeCode)!;
  const assetKey = `fund:${fundId}`;
  await prisma.transaction.create({
    data: {
      portfolioId: scope.portfolioId,
      assetClass: 'MUTUAL_FUND',
      transactionType: 'BUY',
      fundId,
      assetName: schemeCode,
      tradeDate: new Date(Date.UTC(2024, 0, 10)),
      quantity: '1000.000000',
      price: '100.0000',
      grossAmount: '100000.0000',
      netAmount: '100000.0000',
      assetKey,
    },
  });
  await prisma.holdingProjection.create({
    data: {
      portfolioId: scope.portfolioId,
      assetKey,
      assetClass: 'MUTUAL_FUND',
      fundId,
      assetName: schemeCode,
      quantity: '1000.000000',
      avgCostPrice: '100.0000',
      totalCost: '100000.0000',
      currentValue: '120000.0000',
      unrealisedPnL: '20000.0000',
      sourceTxCount: 1,
    },
  });
}

// ---------------------------------------------------------------------------
// Test rules
// ---------------------------------------------------------------------------

/**
 * A FUND rule that always emits one WARNING with the given code.
 *
 * Built through `makeFinding` rather than as a literal so the fixture obeys the
 * same invariants a production finding does — a test rule that could emit a
 * finding the engine would have refused to construct proves nothing.
 */
function emittingRule(id: string, code: string, version = '1.0.0'): MfRule {
  return {
    id,
    version,
    scope: 'FUND',
    category: 'PERFORMANCE',
    evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
      return [
        makeFinding(facts, {
          ruleId: id,
          ruleVersion: version,
          schemeCode: schemeCode ?? null,
          code,
          category: 'PERFORMANCE',
          severity: 'WARNING',
          confidence: serializeRatio('0.900000'),
          headline: `${code} fired for ${schemeCode ?? 'portfolio'}`,
          evidence: [
            { metric: 'test.metric', label: 'Test', value: serializeRatio('1'), unit: 'ratio' },
          ],
          whatWouldChangeThis: `Would clear when ${code} no longer holds.`,
        }),
      ];
    },
  };
}

/** A FUND rule that runs, finds nothing, and must still appear in the snapshot. */
const silentRule: MfRule = {
  id: 'mf.test.silent',
  version: '1.0.0',
  scope: 'FUND',
  category: 'DATA',
  evaluate: () => [],
};

/** A FUND rule that throws. Its category is what `missingCategories` must name. */
const throwingRule: MfRule = {
  id: 'mf.test.throws',
  version: '3.1.4',
  scope: 'FUND',
  category: 'RISK',
  evaluate(): MfFinding[] {
    throw new Error('deliberate rule failure');
  },
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function newScope(label: string): Promise<TestScope> {
  const s = await createTestScope(`mfeng-${label}`);
  scopes.push(s);
  return s;
}

beforeAll(async () => {
  owner = await newScope('owner');
  stranger = await newScope('stranger');
  replayUser = await newScope('replay');

  await runAsSystem(async () => {
    await seedScheme(S_MAIN);
    await seedScheme(S_REPLAY);
    await seedPosition(owner, S_MAIN);
    await seedPosition(replayUser, S_REPLAY);
  });
}, 180_000);

afterAll(async () => {
  await runAsSystem(async () => {
    const userIds = scopes.map((s) => s.userId);
    // Verdicts first, then runs. `MfFundVerdict.run` is `onDelete: Restrict` on
    // purpose (a verdict is the record of advice given and outlives its run),
    // so a run — and therefore the user, which cascades to runs — cannot be
    // deleted while a verdict points at it.
    await prisma.mfFundVerdict.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.mfAnalysisRun.deleteMany({ where: { userId: { in: userIds } } });
  });

  for (const s of scopes) await s.cleanup();

  await runAsSystem(async () => {
    await prisma.mfSchemeScore.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mfSchemeMetrics.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mfPeerRank.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mutualFundMaster.deleteMany({ where: { schemeCode: { startsWith: FX } } });
  });
}, 180_000);

// ---------------------------------------------------------------------------
// 1. A complete run, against the real registry
// ---------------------------------------------------------------------------

describe('a complete run', () => {
  it('records every registered rule, including the silent ones', async () => {
    const result = await owner.runAs(() =>
      runMfAnalysis(owner.userId, { asOf: AS_OF, triggeredBy: 'HOLDINGS_CHANGE' }),
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.missingCategories).toEqual([]);

    // Guarantee 2: silence is evidence. Every rule in the registry has an
    // entry whether or not it emitted anything, so "why was X not flagged?"
    // is answerable from the row rather than from a rerun.
    expect(result.ruleVersionsSnapshot).toHaveLength(MF_RULES.length);
    const ids = result.ruleVersionsSnapshot.map((r) => r.ruleId).sort();
    expect(ids).toEqual(MF_RULES.map((r) => r.id).sort());
    expect(result.ruleVersionsSnapshot.some((r) => r.ran && r.emitted === 0)).toBe(true);
    expect(result.ruleVersionsSnapshot.every((r) => r.error === undefined)).toBe(true);

    const run = await owner.runAs(() =>
      prisma.mfAnalysisRun.findUniqueOrThrow({ where: { id: result.runId } }),
    );
    expect(run.status).toBe('COMPLETED');
    expect(run.triggeredBy).toBe('HOLDINGS_CHANGE');
    expect(run.completedAt).not.toBeNull();
    // The snapshot is the run's whole reason for being replayable.
    expect((run.factsSnapshot as { funds: Record<string, unknown> }).funds).toHaveProperty(S_MAIN);

    // One verdict per held fund, always — HOLD is a conclusion too, and an
    // append-only advice record with gaps is not an audit trail.
    const verdicts = await owner.runAs(() =>
      prisma.mfFundVerdict.findMany({ where: { runId: result.runId } }),
    );
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.schemeCode).toBe(S_MAIN);
  });
});

// ---------------------------------------------------------------------------
// 2. A broken rule is a broken rule, not a broken run  (`05 §8.4`)
// ---------------------------------------------------------------------------

describe('a rule that throws', () => {
  it('yields PARTIAL, keeps every other finding, and records the error', async () => {
    const good = emittingRule('mf.test.good', 'GOOD_CODE');

    const result = await owner.runAs(() =>
      runMfAnalysis(owner.userId, {
        asOf: AS_OF,
        triggeredBy: 'SCHEDULE',
        rules: [good, throwingRule, silentRule],
      }),
    );

    expect(result.status).toBe('PARTIAL');

    // The other rules still produced advice.
    expect(result.findings.map((f) => f.code)).toEqual(['GOOD_CODE']);

    const broken = result.ruleVersionsSnapshot.find((r) => r.ruleId === throwingRule.id);
    expect(broken).toBeDefined();
    expect(broken!.ran).toBe(true);
    expect(broken!.emitted).toBe(0);
    // The message is preserved verbatim, prefixed with the scheme it failed
    // for: a rule that fails for one fund and succeeds for eleven is a
    // different diagnosis from one that fails for all of them.
    expect(broken!.error).toContain('deliberate rule failure');
    expect(broken!.error).toContain(S_MAIN);
    expect(broken!.version).toBe('3.1.4');

    // The silent rule is still on the record as having run and said nothing —
    // which is not the same as the broken one having said nothing.
    const silent = result.ruleVersionsSnapshot.find((r) => r.ruleId === silentRule.id);
    expect(silent).toMatchObject({ ran: true, emitted: 0 });
    expect(silent!.error).toBeUndefined();

    // `PARTIAL` carries what is missing so the UI can name the absent section
    // rather than silently omitting it.
    expect(result.missingCategories).toEqual(['RISK']);

    const run = await owner.runAs(() =>
      prisma.mfAnalysisRun.findUniqueOrThrow({ where: { id: result.runId } }),
    );
    expect(run.status).toBe('PARTIAL');
    expect(JSON.stringify(run.ruleVersionsSnapshot)).toContain('deliberate rule failure');
  });
});

// ---------------------------------------------------------------------------
// 3. A re-run never rewrites history  (`05 §8.5`)
// ---------------------------------------------------------------------------

describe('verdict supersede', () => {
  it('writes ONE row across two identical runs, and links a changed one', async () => {
    const ruleA = emittingRule('mf.test.super', 'REASON_A');

    // -- run 1 -------------------------------------------------------------
    const first = await owner.runAs(() =>
      runMfAnalysis(owner.userId, { asOf: AS_OF, rules: [ruleA] }),
    );
    expect(first.verdictsCreated).toBe(1);
    expect(first.verdicts[0]!.reasons).toEqual(['REASON_A']);

    const afterFirst = await owner.runAs(() =>
      prisma.mfFundVerdict.findMany({
        where: { userId: owner.userId, schemeCode: S_MAIN },
        orderBy: { createdAt: 'asc' },
      }),
    );
    // A prior test in this file already produced a verdict for S_MAIN, so the
    // count is relative rather than absolute — the invariant under test is
    // "an unchanged re-run adds nothing", not "the table has exactly one row".
    const baseline = afterFirst.length;
    const head = afterFirst[afterFirst.length - 1]!;

    // -- run 2, identical --------------------------------------------------
    const second = await owner.runAs(() =>
      runMfAnalysis(owner.userId, { asOf: AS_OF, rules: [ruleA] }),
    );
    expect(second.verdictsCreated).toBe(0);
    expect(second.verdictsSuperseded).toBe(0);
    expect(second.verdictsUnchanged).toBe(1);

    const afterSecond = await owner.runAs(() =>
      prisma.mfFundVerdict.findMany({
        where: { userId: owner.userId, schemeCode: S_MAIN },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(afterSecond).toHaveLength(baseline);
    // "Touch nothing" is literal: not the run id, not a timestamp. The row
    // keeps pointing at the run that produced the figures the user was shown.
    expect(afterSecond[afterSecond.length - 1]).toEqual(head);

    // -- run 3, a different reason ----------------------------------------
    const ruleB = emittingRule('mf.test.super', 'REASON_B');
    const third = await owner.runAs(() =>
      runMfAnalysis(owner.userId, { asOf: AS_OF, rules: [ruleB] }),
    );
    expect(third.verdictsCreated).toBe(1);
    expect(third.verdictsSuperseded).toBe(1);

    const afterThird = await owner.runAs(() =>
      prisma.mfFundVerdict.findMany({
        where: { userId: owner.userId, schemeCode: S_MAIN },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(afterThird).toHaveLength(baseline + 1);

    const oldRow = afterThird.find((v) => v.id === head.id)!;
    const newRow = afterThird[afterThird.length - 1]!;

    expect(oldRow.supersededById).toBe(newRow.id);
    expect(newRow.reasons).toEqual(['REASON_B']);
    expect(newRow.supersededById).toBeNull();

    // Byte-identical apart from the forward pointer. Every figure the user was
    // shown — verdict, reasons, replacement, switch cost, the run it came from
    // and when — is exactly as it was. The pointer is the only thing a
    // supersede is allowed to add.
    const { supersededById: _dropOld, ...oldFigures } = oldRow;
    const { supersededById: _dropHead, ...headFigures } = head;
    expect(oldFigures).toEqual(headFigures);
  });

  it('compares reasons as a set, not as a sequence', () => {
    // Order is an artefact of which decision-table row matched and how the
    // findings sorted; two runs that concluded the same thing for the same
    // reasons have not produced new advice.
    expect(sameReasonSet(['A', 'B'], ['B', 'A'])).toBe(true);
    expect(sameReasonSet(['A', 'A', 'B'], ['B', 'A'])).toBe(true);
    expect(sameReasonSet(['A'], ['A', 'B'])).toBe(false);
    expect(sameReasonSet([], [])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. RLS  (`05 §8.7`)
// ---------------------------------------------------------------------------

describe('row-level security', () => {
  it('hides findings, verdicts and the run itself from another user', async () => {
    const result = await owner.runAs(() =>
      runMfAnalysis(owner.userId, {
        asOf: AS_OF,
        rules: [emittingRule('mf.test.rls', 'RLS_CODE')],
      }),
    );
    expect(result.findings.length).toBeGreaterThan(0);

    // The owner sees their own rows …
    const mine = await owner.runAs(() =>
      prisma.mfFinding.findMany({ where: { runId: result.runId } }),
    );
    expect(mine.length).toBe(result.findings.length);

    // … and a stranger, querying by the very same id, sees nothing. Not a 403
    // from application code — zero rows from the policy, which is the
    // fail-closed guarantee (`CONTEXT.md §3.4`).
    const theirs = await stranger.runAs(async () => ({
      findings: await prisma.mfFinding.findMany({ where: { runId: result.runId } }),
      verdicts: await prisma.mfFundVerdict.findMany({ where: { runId: result.runId } }),
      run: await prisma.mfAnalysisRun.findUnique({ where: { id: result.runId } }),
    }));

    expect(theirs.findings).toEqual([]);
    expect(theirs.verdicts).toEqual([]);
    expect(theirs.run).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Replay  (`05 §8.8`) — must be last: it deletes reference rows
// ---------------------------------------------------------------------------

describe('replay from a stored factsSnapshot', () => {
  it('runs a newer rule version with the reference tables deleted', async () => {
    const v1 = emittingRule('mf.test.replay', 'REPLAY_CODE', '1.0.0');

    const original = await replayUser.runAs(() =>
      runMfAnalysis(replayUser.userId, { asOf: AS_OF, rules: [v1] }),
    );
    expect(original.findings.map((f) => f.ruleVersion)).toEqual(['1.0.0']);

    const stored = await replayUser.runAs(() =>
      prisma.mfAnalysisRun.findUniqueOrThrow({
        where: { id: original.runId },
        select: { factsSnapshot: true },
      }),
    );

    // Delete every reference row the facts were built from. Anything that
    // reached for the database now would come back empty — which is precisely
    // what makes this a proof rather than an assertion of intent.
    await runAsSystem(async () => {
      await prisma.mfSchemeScore.deleteMany({ where: { schemeCode: S_REPLAY } });
      await prisma.mfSchemeMetrics.deleteMany({ where: { schemeCode: S_REPLAY } });
      await prisma.mfPeerRank.deleteMany({ where: { schemeCode: S_REPLAY } });
      await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: S_REPLAY } });
    });
    const gone = await runAsSystem(() =>
      prisma.mfSchemeMeta.findUnique({ where: { schemeCode: S_REPLAY } }),
    );
    expect(gone).toBeNull();

    // The replay itself: a value in, findings out. No `runAs`, no transaction,
    // no client. This is how a threshold change is tested against real
    // historical runs before it ships.
    const facts = stored.factsSnapshot as unknown as MfAnalysisFacts;
    const v2 = emittingRule('mf.test.replay', 'REPLAY_CODE', '2.0.0');
    const replayed = replayAnalysis(facts, [v2]);

    expect(replayed.status).toBe('COMPLETED');
    expect(replayed.findings).toHaveLength(1);
    expect(replayed.findings[0]!.code).toBe('REPLAY_CODE');
    // Stamped with the NEW version — the whole point is seeing what the new
    // rule would have said about the old facts.
    expect(replayed.findings[0]!.ruleVersion).toBe('2.0.0');
    expect(replayed.findings[0]!.schemeCode).toBe(S_REPLAY);
    expect(replayed.verdicts.map((v) => v.schemeCode)).toEqual([S_REPLAY]);

    // And the snapshot survives a JSON round trip, because in a real replay it
    // arrives as text out of a file or an export rather than as a Prisma value.
    const roundTripped = JSON.parse(JSON.stringify(facts)) as MfAnalysisFacts;
    expect(evaluateRules(roundTripped, [v2]).findings).toEqual(replayed.findings);
  });
});
