/**
 * HTTP surface for the USER-SCOPED half of the mutual-fund analytics layer
 * (`07-IMPLEMENTATION-PLAN.md` Task 5.6, `05-FINDINGS-ENGINE.md`):
 *
 *  - `GET  /api/mf-analytics/runs/latest`               — the caller's latest analysis run.
 *  - `GET  /api/mf-analytics/funds/:schemeCode/findings` — that run's findings for one fund.
 *  - `GET  /api/mf-analytics/funds/:schemeCode/verdict`  — the standing verdict for one fund.
 *  - `POST /api/mf-analytics/refresh`                    — re-run the engine, 1/hour.
 *
 * All four are mounted on `mfAnalyticsRouter`, behind that router's
 * `authenticate` + `requireFeature('MF_ANALYTICS')`.
 *
 * ---------------------------------------------------------------------------
 * Why a third controller on one router prefix
 * ---------------------------------------------------------------------------
 *
 * `mfAnalytics.controller.ts` opens by stating, as an invariant a reader is
 * meant to rely on, that every table behind it is shared market data — absent
 * from `USER_SCOPED_MODELS`, carrying no RLS policy, and therefore containing
 * "no `userId` filter and no `runAsUser` wrapper anywhere below".
 * `mfPortfolio.controller.ts` was split out rather than break that sentence,
 * and this file follows the precedent for the same reason: `MfAnalysisRun`,
 * `MfFinding` and `MfFundVerdict` ARE user data, they ARE in
 * `USER_SCOPED_MODELS`, and they DO carry RLS policies. Putting them in the
 * reference controller would make its header a lie and hand the next author the
 * wrong mental model. The ROUTES still live in `mfAnalytics.routes.ts`, which
 * is the router already mounted at `/api/mf-analytics`.
 *
 * ---------------------------------------------------------------------------
 * RLS
 * ---------------------------------------------------------------------------
 *
 * `authenticate` has already called `enterUserContext(userId)`, so the
 * `$allOperations` hook in `lib/prisma.ts` issues `set_config('app.current_user_id', …)`
 * for every read below and the policies do the isolating. **No `runAsSystem`
 * anywhere in this file**: a system-context read would return every user's
 * findings and the `where` clause would be the only thing standing between them
 * — which is precisely the single-point-of-failure RLS exists to remove
 * (CONTEXT.md §5). The explicit `userId` filters are defence in depth on top of
 * the policy, not instead of it.
 *
 * The one exception is `MfSchemeMeta`, read to name a suggested replacement. It
 * is reference data with no owner, so it passes through the hook untouched.
 *
 * ---------------------------------------------------------------------------
 * The RIA gate (`06-QUALITY-COMPLIANCE.md §4`) — the point of this file
 * ---------------------------------------------------------------------------
 *
 * SEBI's Investment Adviser Regulations separate *research* from *advice*.
 * Scores, metrics, findings and their evidence are research. A verdict that
 * says "switch out of this fund, into that one" is advice, and requires the
 * deploying entity to hold an RIA registration.
 *
 * `RIA_VERDICTS_ENABLED` (default `false`) is that switch, and it is enforced
 * **here, in the response layer, and nowhere else**:
 *
 *   - `SWITCH_CANDIDATE` is downgraded to `REVIEW`,
 *   - `suggestedReplacementSchemeCode` and its name are stripped,
 *   - `advisoryGated: true` is set so the UI can say "analysis only" instead of
 *     pretending the engine reached a milder conclusion.
 *
 * The verdict row itself is still computed and stored in full. That is
 * deliberate and is the record-keeping half of §4: what SEBI expects an adviser
 * to retain is what the engine concluded and on what inputs, not what a feature
 * flag happened to display. `mfVerdict.ts` therefore knows nothing about this
 * flag, and neither does the engine.
 *
 * `riaVerdictsEnabled()` reads `env` at call time rather than capturing a
 * module-level const, so a test can flip the flag between two requests and
 * assert BOTH states against the same fixture row. A test that only covered the
 * disabled state would pass just as happily against an inverted gate.
 */

import type { Request, Response } from 'express';
import {
  serializeRatio,
  type MfAnalysisRunDto,
  type MfAnalysisRunStatus,
  type MfEvidence,
  type MfFinding,
  type MfFindingCategory,
  type MfFindingSeverity,
  type MfFundVerdictDto,
  type MfPortfolioAnalysisDto,
  type MfRuleRunRecord,
  type MfSwitchCost,
  type MfVerdictKind,
} from '@portfolioos/shared';

import type {
  MfAnalysisRun as MfAnalysisRunRow,
  MfFinding as MfFindingRow,
  MfFundVerdict as MfFundVerdictRow,
  Prisma,
} from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/response.js';
import { AppError, UnauthorizedError } from '../lib/errors.js';
import { env } from '../config/env.js';
import { MF_RULES } from '../services/mfAnalytics/rules/registry.js';
import { requestMfAnalysisRefresh } from '../jobs/mfAnalysisJob.js';

// ---------------------------------------------------------------------------
// The RIA gate
// ---------------------------------------------------------------------------

/**
 * Read at call time, never captured. See the file header: the gate has to be
 * observable in both positions from a single test process, and a
 * `const RIA = env.… === 'true'` at module scope would freeze it at import.
 */
function riaVerdictsEnabled(): boolean {
  return env.RIA_VERDICTS_ENABLED === 'true';
}

// ---------------------------------------------------------------------------
// Row -> DTO
// ---------------------------------------------------------------------------

/**
 * `MfFinding.confidence` is `Decimal(12,6)` in Postgres and arrives as a Prisma
 * `Decimal` object. `serializeRatio` is the only thing that may turn it into a
 * wire value: `JSON.stringify` on a Prisma Decimal emits a JSON *number*, which
 * is the IEEE-754 round trip the `Ratio` brand exists to prevent (CONTEXT.md
 * §16.1). Every other numeric on a finding already lives inside the `evidence`
 * JSON column as a Decimal string, written that way by the rules, and is passed
 * through untouched — re-serialising it could only lose digits.
 */
function toFindingDto(row: MfFindingRow): MfFinding {
  return {
    id: row.id,
    runId: row.runId,
    schemeCode: row.schemeCode,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    code: row.code,
    // `category` is a plain String column (the shared union is the source of
    // truth and Postgres does not need a second copy of it as an enum).
    category: row.category as MfFindingCategory,
    severity: row.severity as MfFindingSeverity,
    confidence: serializeRatio(row.confidence),
    headline: row.headline,
    evidence: asEvidence(row.evidence),
    whatWouldChangeThis: row.whatWouldChangeThis,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The `evidence` column is written by the engine as `MfEvidence[]` with every
 * numeric already serialised. This is a shape assertion, not a parse: rebuilding
 * each row would mean re-serialising values that are already at their final
 * precision.
 *
 * A malformed column throws rather than degrading to `[]`. An empty evidence
 * array is a legitimate state (a finding whose trigger is structural — a
 * REGULAR plan, a manager change — cites no metric), so silently producing one
 * from a corrupt blob would present a writer bug as a normal finding. `06 §6`
 * keeps those two apart everywhere else; it must not merge them here.
 */
function asEvidence(raw: Prisma.JsonValue): MfEvidence[] {
  if (!Array.isArray(raw)) {
    throw new AppError('Malformed finding evidence payload', 500, 'MF_EVIDENCE_PAYLOAD_CORRUPT');
  }
  return raw as unknown as MfEvidence[];
}

/** `reasons` is a JSON array of finding codes. Non-strings are dropped rather
 *  than crashing a whole page over one bad element. */
function asReasons(raw: Prisma.JsonValue): string[] {
  return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [];
}

/**
 * `{ exitLoadInr, taxInr, breakEvenMonths }`, all Decimal strings, written by
 * `computeSwitchCost`. Shape-checked, then passed through — same reasoning as
 * `asEvidence`, except that a switch cost the engine could not compute is
 * legitimately `null`, so an unrecognisable blob degrades to `null` (unknown
 * cost) rather than throwing. Displaying nothing is honest; displaying a
 * fabricated break-even is not.
 */
function asSwitchCost(raw: Prisma.JsonValue): MfSwitchCost | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.exitLoadInr !== 'string' || typeof c.taxInr !== 'string') return null;
  if (c.breakEvenMonths !== null && typeof c.breakEvenMonths !== 'string') return null;
  return raw as unknown as MfSwitchCost;
}

/**
 * The gate itself.
 *
 * `replacementName` is resolved by the caller (batched, see
 * `replacementNamesFor`) and is passed in already `null` when the gate is shut,
 * so a name cannot leak through a code path that forgot to check.
 *
 * `advisoryGated` is set ONLY when a `SWITCH_CANDIDATE` was actually downgraded,
 * matching the field's contract on `MfFundVerdictDto`. It is not "the flag is
 * off" — a `HOLD` returned under a shut gate is exactly the `HOLD` the engine
 * reached, and flagging it would tell the user their verdict had been softened
 * when it had not.
 *
 * The replacement is stripped whenever the gate is shut, not only on the
 * downgraded row. Today the two coincide (`mfVerdict.ts` only ever sets a
 * replacement on `SWITCH_CANDIDATE`), so the wider condition costs nothing and
 * survives a future verdict kind that carries one.
 */
function toVerdictDto(row: MfFundVerdictRow, replacementName: string | null): MfFundVerdictDto {
  const gateOpen = riaVerdictsEnabled();
  const stored = row.verdict as MfVerdictKind;
  const downgraded = !gateOpen && stored === 'SWITCH_CANDIDATE';

  return {
    id: row.id,
    runId: row.runId,
    schemeCode: row.schemeCode,
    verdict: downgraded ? 'REVIEW' : stored,
    reasons: asReasons(row.reasons),
    suggestedReplacementSchemeCode: gateOpen ? row.suggestedReplacementSchemeCode : null,
    suggestedReplacementName: gateOpen ? replacementName : null,
    switchCost: row.switchCost === null ? null : asSwitchCost(row.switchCost),
    // `06 §6`: a failed narration is not a failed analysis. Unverified prose is
    // withheld silently and the deterministic headlines carry the page. The
    // verification itself belongs to `proseConsistency.ts`; this layer only
    // refuses to show what it did not certify.
    prose: row.proseVerified ? row.prose : null,
    proseModel: row.proseVerified ? row.proseModel : null,
    proseVerified: row.proseVerified,
    supersededById: row.supersededById,
    createdAt: row.createdAt.toISOString(),
    advisoryGated: downgraded,
  };
}

/**
 * Scheme code -> scheme name, for the verdicts that name a replacement.
 *
 * Returns an empty map when the gate is shut: there is no reason to query for
 * names the response layer is about to strip, and not querying makes it
 * structurally impossible for one to escape through a later edit.
 */
async function replacementNamesFor(
  rows: readonly MfFundVerdictRow[],
): Promise<Map<string, string>> {
  if (!riaVerdictsEnabled()) return new Map();
  const codes = [
    ...new Set(
      rows
        .map((r) => r.suggestedReplacementSchemeCode)
        .filter((c): c is string => c !== null && c.length > 0),
    ),
  ];
  if (codes.length === 0) return new Map();

  const metas = await prisma.mfSchemeMeta.findMany({
    where: { schemeCode: { in: codes } },
    select: { schemeCode: true, schemeName: true },
  });
  return new Map(metas.map((m) => [m.schemeCode, m.schemeName]));
}

// ---------------------------------------------------------------------------
// Run assembly
// ---------------------------------------------------------------------------

/**
 * Rule id -> the finding category it covers.
 *
 * `ruleVersionsSnapshot` records which rules errored but not what they were
 * about, because the category lives on the rule and the snapshot is a record of
 * *versions*. Joining it back against the registry here is what lets the
 * PARTIAL banner say "we could not check COST and RISK on this run" instead of
 * "something failed".
 *
 * A rule id no longer in the registry (a rule deleted after the run it appears
 * in) contributes no category, and cannot: there is nothing left to ask. The UI
 * covers that case by also naming the failed rule ids from the snapshot, so a
 * PARTIAL run is never reported as an unexplained banner.
 */
const RULE_CATEGORY: ReadonlyMap<string, MfFindingCategory> = new Map(
  MF_RULES.map((r) => [r.id, r.category]),
);

function asRuleSnapshot(raw: Prisma.JsonValue): MfRuleRunRecord[] {
  return Array.isArray(raw) ? (raw as unknown as MfRuleRunRecord[]) : [];
}

function missingCategoriesFrom(snapshot: readonly MfRuleRunRecord[]): MfFindingCategory[] {
  const out = new Set<MfFindingCategory>();
  for (const record of snapshot) {
    if (record.error === undefined || record.error === null) continue;
    const category = RULE_CATEGORY.get(record.ruleId);
    if (category !== undefined) out.add(category);
  }
  return [...out].sort();
}

/**
 * The stored `portfolioAnalysis` column IS `MfPortfolioAnalysisDto`, written by
 * the engine through `toSnapshotSafe` with every numeric already a string.
 *
 * The object guard exists because the engine creates the run row with `{}` in
 * this column before it has any facts. That placeholder must never reach a
 * client — a `MfPortfolioAnalysisDto` with no `totals` crashes the page, or
 * worse renders every aggregate as blank and reads as "you hold nothing". The
 * run loader below only ever selects COMPLETED / PARTIAL runs for that reason,
 * so this is the second line of defence rather than the first.
 */
function asPortfolioAnalysis(raw: Prisma.JsonValue, runId: string): MfPortfolioAnalysisDto {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AppError(
      `Malformed portfolioAnalysis payload on run ${runId}`,
      500,
      'MF_RUN_PAYLOAD_CORRUPT',
    );
  }
  return raw as unknown as MfPortfolioAnalysisDto;
}

/** The scheme codes the run actually analysed, read off the snapshot it stored. */
function analysedSchemeCodes(analysis: MfPortfolioAnalysisDto): Set<string> | null {
  const funds = (analysis as { funds?: unknown }).funds;
  if (!Array.isArray(funds)) return null;
  return new Set(
    funds
      .map((f) => (typeof f === 'object' && f !== null ? (f as { schemeCode?: unknown }).schemeCode : null))
      .filter((c): c is string => typeof c === 'string'),
  );
}

/**
 * Only COMPLETED and PARTIAL runs are visible to a client.
 *
 * `RUNNING` and `FAILED` rows exist and are kept — they are the evidence behind
 * the 1/hour refresh limit and the record that an attempt was made — but their
 * `factsSnapshot` / `portfolioAnalysis` columns still hold the `{}` placeholder
 * the engine writes before the facts build, and no honest `MfAnalysisRunDto`
 * can be made from that. Returning one would put an empty portfolio in front of
 * a user who holds twelve funds, which is exactly the "render a partial view as
 * a total" failure `CONTEXT.md §16.8` forbids.
 */
const CLIENT_VISIBLE_STATUSES = ['COMPLETED', 'PARTIAL'] as const;

/**
 * Assemble one run into its DTO.
 *
 * **`verdicts` are the standing heads, not `run.verdicts`.** A run that reaches
 * the same conclusion for the same reasons writes no new row (`05 §5`,
 * guarantee 3 — "touch nothing"), so a fund that has been a steady HOLD across
 * five runs has its verdict row attached to the FIRST of them. Reading
 * `run.verdicts` would therefore show a verdict for the funds whose conclusion
 * changed and nothing at all for the funds that are fine — the page would look
 * like the engine had opinions only about problems. The heads
 * (`supersededById: null`) are what is live right now; each carries its own
 * `runId`, so the audit trail back to the run that produced the figures is
 * intact and visible.
 *
 * They are narrowed to the schemes this run analysed. A fund sold last month
 * still has a standing verdict head, and it is still part of the audit trail,
 * but presenting it beside a current holdings analysis would assert something
 * about a position the user no longer holds.
 */
async function toRunDto(userId: string, run: MfAnalysisRunRow): Promise<MfAnalysisRunDto> {
  const portfolioAnalysis = asPortfolioAnalysis(run.portfolioAnalysis, run.id);
  const analysed = analysedSchemeCodes(portfolioAnalysis);

  const [findingRows, verdictRows] = await Promise.all([
    prisma.mfFinding.findMany({
      where: { userId, runId: run.id },
      // `MfFindingSeverity` is declared INFO -> NOTICE -> WARNING -> CRITICAL,
      // so Postgres orders it ascending in that direction and `desc` is what
      // puts CRITICAL first. Reading `asc` here as "most serious first" is the
      // easy mistake, and it would bury a regulatory action under an INFO note
      // about an exit-load window.
      orderBy: [{ severity: 'desc' }, { schemeCode: 'asc' }, { code: 'asc' }],
    }),
    prisma.mfFundVerdict.findMany({
      where: {
        userId,
        supersededById: null,
        ...(analysed === null ? {} : { schemeCode: { in: [...analysed] } }),
      },
      orderBy: [{ schemeCode: 'asc' }, { createdAt: 'desc' }],
    }),
  ]);

  const names = await replacementNamesFor(verdictRows);
  const ruleVersionsSnapshot = asRuleSnapshot(run.ruleVersionsSnapshot);

  return {
    id: run.id,
    asOf: run.asOf.toISOString(),
    status: run.status as MfAnalysisRunStatus,
    triggeredBy: run.triggeredBy as MfAnalysisRunDto['triggeredBy'],
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt === null ? null : run.completedAt.toISOString(),
    portfolioAnalysis,
    findings: findingRows.map(toFindingDto),
    verdicts: verdictRows.map((v) =>
      toVerdictDto(v, names.get(v.suggestedReplacementSchemeCode ?? '') ?? null),
    ),
    ruleVersionsSnapshot,
    missingCategories: missingCategoriesFrom(ruleVersionsSnapshot),
  };
}

/** The caller's newest client-visible run, or null if they have never had one. */
async function latestRunRow(userId: string): Promise<MfAnalysisRunRow | null> {
  return prisma.mfAnalysisRun.findFirst({
    where: { userId, status: { in: [...CLIENT_VISIBLE_STATUSES] } },
    orderBy: { startedAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * `GET /api/mf-analytics/runs/latest` → `MfAnalysisRunDto | null`.
 *
 * `null` with a 200 means "no analysis has ever completed for you", which is a
 * real state with a real cause (the engine is trigger-driven — a user who has
 * never imported a fund and never pressed refresh has no run) and is
 * deliberately not a 404. The page renders an empty state with a refresh
 * button, not an error.
 *
 * Not family-aware. `MfAnalysisRun.familyId` is provenance and explicitly not
 * part of the RLS predicate (see the schema comment): a run belongs to the user
 * who triggered it, full stop. A household view of findings would be a
 * per-member fan-out with visibility caps applied, which is
 * `familyScope.service.ts`'s job and is not in this task's scope.
 */
export async function getLatestRun(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const run = await latestRunRow(req.user.id);
  ok(res, run === null ? null : await toRunDto(req.user.id, run));
}

/**
 * `GET /api/mf-analytics/funds/:schemeCode/findings` → `MfFinding[]`.
 *
 * Scoped to the latest client-visible run: a finding from a superseded run
 * describes a portfolio that no longer exists.
 *
 * An empty array is ambiguous on its own — "the latest run found nothing about
 * this fund" and "no run has ever happened" both produce `[]` — and that
 * ambiguity is resolved by `/runs/latest` rather than by inventing a wrapper
 * shape here, because `MfFundAnalyticsDto.findings` is `MfFinding[]` and a
 * second, differently-shaped findings payload is the contract drift CONTEXT.md
 * §11 is about. **Consumers must not render `[]` as a clean bill of health.**
 *
 * Portfolio-level findings (`schemeCode: null`) are excluded on purpose. They
 * are statements about the book, not about this fund, and repeating an
 * allocation drift on each of twelve fund pages turns one observation into
 * twelve accusations — the same reasoning `decideVerdicts` gives for keeping
 * them out of fund verdicts.
 */
export async function getFundFindings(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const schemeCode = req.params.schemeCode!;

  const run = await latestRunRow(req.user.id);
  if (run === null) {
    ok(res, [] as MfFinding[]);
    return;
  }

  const rows = await prisma.mfFinding.findMany({
    where: { userId: req.user.id, runId: run.id, schemeCode },
    // See `toRunDto`: `desc` on this enum is most-serious-first.
    orderBy: [{ severity: 'desc' }, { code: 'asc' }],
  });
  ok(res, rows.map(toFindingDto));
}

/**
 * `GET /api/mf-analytics/funds/:schemeCode/verdict` → `MfFundVerdictDto | null`.
 *
 * The **standing head** — the one row a user could be looking at right now —
 * not the latest run's row, for the reason set out on `toRunDto`: an unchanged
 * verdict writes no new row, so keying off the run would report "no verdict" for
 * every fund the engine is consistently comfortable with.
 *
 * RIA-gated on the way out. See the file header.
 */
export async function getFundVerdict(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const schemeCode = req.params.schemeCode!;

  const row = await prisma.mfFundVerdict.findFirst({
    where: { userId: req.user.id, schemeCode, supersededById: null },
    orderBy: { createdAt: 'desc' },
  });
  if (row === null) {
    ok(res, null);
    return;
  }

  const names = await replacementNamesFor([row]);
  ok(res, toVerdictDto(row, names.get(row.suggestedReplacementSchemeCode ?? '') ?? null));
}

/**
 * `POST /api/mf-analytics/refresh` → the resulting `MfAnalysisRunDto`.
 *
 * The 1/hour limit is **not re-implemented here**. `requestMfAnalysisRefresh`
 * enforces it against `MfAnalysisRun.startedAt` where `triggeredBy =
 * 'USER_REFRESH'`, which is the only form of the limit that survives a process
 * restart and works behind more than one instance, and it throws
 * `TooManyRequestsError` naming the time the next refresh becomes available.
 * `errorHandler` maps that to a 429 with `code: 'RATE_LIMIT'`. A second limiter
 * on this route would be a second answer to the same question.
 *
 * The run is synchronous — the caller is a person waiting on a page and seconds
 * of CPU is not worth a job id to poll — so the response is the finished run,
 * assembled by the same `toRunDto` that serves `/runs/latest`. The client
 * therefore cannot see a shape from a refresh that it could not see from a
 * reload.
 *
 * A run that could not build its facts throws out of the engine (the run row is
 * marked FAILED first), and that reaches the client as a 500 rather than as an
 * empty analysis. That is the intended behaviour: `PARTIAL` is the honest
 * "some rules failed" answer, and an empty one would be indistinguishable from
 * "you hold nothing".
 */
export async function postAnalysisRefresh(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;

  const result = await requestMfAnalysisRefresh(userId);

  const run = await prisma.mfAnalysisRun.findFirst({ where: { id: result.runId, userId } });
  if (run === null) {
    // Unreachable unless the run vanished between commit and read. Surfaced as
    // a typed error rather than an empty body: the refresh DID happen and the
    // user's rate-limit window is now spent, so silently returning "no run"
    // would be both wrong and unrecoverable for an hour.
    throw new AppError(
      `Analysis run ${result.runId} was not readable after completing`,
      500,
      'MF_RUN_NOT_READABLE',
    );
  }
  ok(res, await toRunDto(userId, run));
}
