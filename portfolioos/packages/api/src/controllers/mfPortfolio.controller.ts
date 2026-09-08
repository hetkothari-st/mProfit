/**
 * HTTP surface for the two MF-analytics reads that `mfAnalytics.controller.ts`
 * deliberately cannot host (`07-IMPLEMENTATION-PLAN.md` Tasks 4.3 and 3.3):
 *
 *  - `GET /api/mf-analytics/portfolio`   — the caller's own `MfPortfolioAnalysisDto`.
 *  - `GET /api/mf-analytics/methodology` — the scoring model tables, as data.
 *
 * **Why a second controller rather than two more handlers in the first one.**
 * The header of `mfAnalytics.controller.ts` states, as an invariant a reader is
 * meant to rely on, that every table behind it is shared market data: absent
 * from `USER_SCOPED_MODELS`, carrying no RLS policy, and therefore containing
 * "no `userId` filter and no `runAsUser` wrapper anywhere below". The portfolio
 * analysis is the exact opposite — it reads `HoldingProjection`, `Transaction`
 * and `Goal` under the caller's RLS context and fans out across family members.
 * Putting it in that file would make its header a lie, and the next person to
 * add a handler there would inherit the wrong mental model. The two concerns
 * get two files and the header of each stays true.
 *
 * Same three constraints as the reference controller otherwise:
 *
 * 1. **No hand-written response shape for the portfolio read.**
 *    `computeMfPortfolioAnalysis` already returns `MfPortfolioAnalysisDto` from
 *    `@portfolioos/shared`; the handler hands it to `ok()` untouched. Nothing
 *    here re-serialises a numeric — every `Money`, `Ratio` and `Pct` in that
 *    DTO is already a Decimal string, and a round trip through `JSON.parse`
 *    would be the IEEE-754 loss the brands exist to prevent (CONTEXT.md §16.1).
 *
 * 2. **It does not compute** beyond assembling constants. The one piece of
 *    arithmetic below is the rating-bucket widths, and it is done in `Decimal`
 *    for a reason spelled out at `ratingBuckets`.
 *
 * 3. **The scope is resolved once, by `getEffectiveScope`, and passed down.**
 *    `readableUserIds` is not on its own an authorisation decision; the service
 *    applies the caps too (CONTEXT.md §6). This file makes no visibility
 *    decision of its own.
 */

import type { Request, Response } from 'express';
import { Decimal } from 'decimal.js';
import {
  MIN_RATING_HISTORY_MONTHS,
  MIN_UNIVERSE_SIZE,
  serializeRatio,
  type MfModelKey,
  type MfPortfolioAnalysisDto,
  type Ratio,
} from '@portfolioos/shared';

import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { parseFamilyId } from '../lib/familyHeader.js';
import { getEffectiveScope } from '../services/familyScope.service.js';
import { computeMfPortfolioAnalysis } from '../services/mfAnalytics/mfPortfolioAnalysis.service.js';
import { MF_SCORING_MODELS } from '../services/mfAnalytics/mfScoring/models/registry.js';
import {
  HORIZON_BASE_WEIGHTS,
  METRIC_DIRECTION,
  MF_SCORE_MATH_VERSION,
  RATING_CUMULATIVE_CUTOFFS,
  RATING_REQUIRED_PILLARS,
  type MetricDirection,
  type ScoringHorizon,
} from '../services/mfAnalytics/mfScoring/mfScoreMath.js';

// ---------------------------------------------------------------------------
// Portfolio analysis (`04-PORTFOLIO-ANALYSIS.md`, Task 4.3)
// ---------------------------------------------------------------------------

/**
 * `GET /api/mf-analytics/portfolio`
 *
 * Read-only. There is no write path here and none is planned on this route:
 * persisting a run onto `MfAnalysisRun` belongs to the analysis engine
 * (Task 5.4), which another agent owns. A page that called this endpoint and a
 * page that read a persisted run must therefore be able to show the same
 * numbers, which is why `runId` comes back as the service's `UNPERSISTED_RUN_ID`
 * sentinel rather than as a plausible-looking id resolving to nothing.
 *
 * `X-Viewing-As-Family` (or `?familyId=`) selects the household view. The
 * header is re-verified inside `getEffectiveScope`, which throws
 * `ForbiddenError` for a forged one — the client's selection is a request, not
 * a grant.
 */
export async function getPortfolioAnalysis(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const scope = await getEffectiveScope(req.user.id, { familyId: parseFamilyId(req) });
  const dto: MfPortfolioAnalysisDto = await computeMfPortfolioAnalysis(scope);
  ok(res, dto);
}

// ---------------------------------------------------------------------------
// Methodology (`06-QUALITY-COMPLIANCE.md §5`, Task 3.3)
// ---------------------------------------------------------------------------

/**
 * The wire shape of `GET /api/mf-analytics/methodology`.
 *
 * **This is the one response shape in the MF layer with no type in
 * `@portfolioos/shared`, and that is a compromise, not a design.** The model
 * tables live in `packages/api/src/services/mfAnalytics/mfScoring/models/*` —
 * server-side by necessity, since the scorer runs there — and `06 §5` requires
 * the public methodology page to render them "from the same constants the
 * scorer uses", never a hand-copy. The client therefore has to receive them
 * over the wire, and the wire needs a shape both sides agree on.
 *
 * The correct home for that shape is `packages/shared`, exactly as for every
 * other DTO here, and it should move there the moment that package is open for
 * edits. Until then the mitigation is deliberate and stated in both places: the
 * client does not re-declare this interface as a bare TypeScript type it can
 * quietly drift from, it declares a **Zod schema** and infers its type from it
 * (`apps/web/src/api/mfMethodology.api.ts`), so a server change that this file
 * does not carry becomes a visible parse failure on the page instead of a
 * silent row of blank cells. That is weaker than a compile error and stronger
 * than nothing, which is the honest description of the situation.
 *
 * Weights are `number`, not Decimal strings, and deliberately so. Every one of
 * them is an integer or a one-decimal figure declared as `number` in
 * `ScoringModel`; re-emitting them as `Decimal(12,6)` strings would dress a
 * hand-chosen weight of `30` up as a measured `30.000000` and imply a precision
 * the source does not have. The genuinely computed figures below — the rating
 * bucket widths — ARE Decimal strings, for the reason given there.
 */
interface MfMethodologyInputDto {
  metric: string;
  /** 0-100 within the pillar. */
  weight: number;
  /**
   * Null when the metric has no `METRIC_DIRECTION` entry. That is a scoring-layer
   * bug (`mf-score-*` tests assert coverage), but the page renders "unknown"
   * for it rather than defaulting to higher-is-better — quietly asserting a
   * direction we do not have is how a lower-is-better metric ends up presented
   * as a virtue.
   */
  direction: MetricDirection | null;
}

interface MfMethodologyPillarDto {
  key: string;
  /** 0-100 within the model. */
  weight: number;
  inputs: MfMethodologyInputDto[];
}

interface MfMethodologyModelDto {
  modelKey: MfModelKey;
  methodologyVersion: string;
  pillars: MfMethodologyPillarDto[];
}

interface MfMethodologyBucketDto {
  rating: 1 | 2 | 3 | 4 | 5;
  /** Share of the universe this bucket takes, as a fraction (`0.225` = 22.5%). */
  shareOfUniverse: Ratio;
  /** Cumulative share above this bucket, measured from the top of the universe. */
  fromTopCumulative: Ratio;
}

interface MfMethodologyDto {
  /** `mfScoreMath.ts`'s own version; a change here invalidates every model. */
  mathVersion: string;
  minRatingHistoryMonths: number;
  minUniverseSize: number;
  ratingRequiredPillars: string[];
  horizonBlend: Array<{ horizonYears: ScoringHorizon; baseWeight: number }>;
  ratingBuckets: MfMethodologyBucketDto[];
  models: MfMethodologyModelDto[];
  /** Repo-relative paths, so the page can link rather than transcribe. */
  changelogPath: string;
  backtestDirPath: string;
}

/**
 * `GET /api/mf-analytics/methodology`
 *
 * Authenticated but **not** entitlement-gated, unlike every route on
 * `mfAnalyticsRouter`. `06 §5` calls `/methodology/mf-score` a *public* page:
 * it is the transparency artefact that lets a user (or an auditor, or SEBI)
 * check what a rating means before deciding whether to pay for one. Putting it
 * behind `requireFeature('MF_ANALYTICS')` would show the methodology only to
 * the people who already have the scores, which inverts the point of
 * publishing it.
 *
 * Everything below is read out of the frozen model constants. Nothing is
 * transcribed: the acceptance criterion for Task 3.3 is that "a weight change
 * in `activeEquity.ts` shows on the page with no other edit", and a copy would
 * fail that criterion silently, which is the only way it can fail.
 */
export async function getScoringMethodology(_req: Request, res: Response) {
  const models: MfMethodologyModelDto[] = (
    Object.keys(MF_SCORING_MODELS) as MfModelKey[]
  ).map((modelKey) => {
    const model = MF_SCORING_MODELS[modelKey];
    return {
      // The key comes from the registry, not from `model.modelKey`. `SOLUTION`
      // and `HYBRID` share one frozen object (`03 §2`: "SOLUTION uses HYBRID
      // model"), so `model.modelKey` reads `HYBRID` for both. Emitting the
      // registry key keeps both categories visible on the page, and the shared
      // `methodologyVersion` is what tells the reader they are the same model
      // rather than two that happen to agree.
      modelKey,
      methodologyVersion: model.methodologyVersion,
      pillars: model.pillars.map((pillar) => ({
        key: pillar.key,
        weight: pillar.weight,
        inputs: pillar.inputs.map((input) => ({
          metric: input.metric,
          weight: input.weight,
          direction: METRIC_DIRECTION[input.metric] ?? null,
        })),
      })),
    };
  });

  const payload: MfMethodologyDto = {
    mathVersion: MF_SCORE_MATH_VERSION,
    minRatingHistoryMonths: MIN_RATING_HISTORY_MONTHS,
    minUniverseSize: MIN_UNIVERSE_SIZE,
    ratingRequiredPillars: [...RATING_REQUIRED_PILLARS],
    // `Object.keys` on a numeric-keyed record yields strings; `Number.parseInt`
    // is the explicitly-permitted form under `portfolioos/no-money-coercion`
    // (a horizon in years is a count, not money).
    horizonBlend: Object.keys(HORIZON_BASE_WEIGHTS).map((k) => {
      const horizonYears = Number.parseInt(k, 10) as ScoringHorizon;
      return { horizonYears, baseWeight: HORIZON_BASE_WEIGHTS[horizonYears] };
    }),
    ratingBuckets: buildRatingBuckets(),
    models,
    changelogPath: 'docs/mf-analytics/METHODOLOGY-CHANGELOG.md',
    backtestDirPath: 'docs/mf-analytics/backtests/',
  };

  ok(res, payload);
}

/**
 * The `03 §8` bell, derived from `RATING_CUMULATIVE_CUTOFFS` rather than
 * restated.
 *
 * The subtraction runs in `Decimal` and not in JS numbers, and this is not
 * ceremony: `0.325 - 0.1` in IEEE-754 is `0.22499999999999998`, so the naive
 * version renders the 4-star band as "22.499999999999998% of the category" on
 * a page whose entire purpose is to be checkable. Decimal gives the 22.5% the
 * constant actually encodes.
 */
function buildRatingBuckets(): MfMethodologyBucketDto[] {
  const cutoffs = RATING_CUMULATIVE_CUTOFFS.map((c) => new Decimal(c));
  const bounds = [new Decimal(0), ...cutoffs, new Decimal(1)];
  const ratings: Array<1 | 2 | 3 | 4 | 5> = [5, 4, 3, 2, 1];

  return ratings.map((rating, i) => {
    const from = bounds[i]!;
    const to = bounds[i + 1]!;
    return {
      rating,
      shareOfUniverse: serializeRatio(to.minus(from)),
      fromTopCumulative: serializeRatio(from),
    };
  });
}
