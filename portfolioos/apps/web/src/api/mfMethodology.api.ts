import { z } from 'zod';
import { api, unwrap } from './client';
import type { ApiResponse } from '@portfolioos/shared';

/**
 * Client for `GET /api/mf-analytics/methodology` (`06-QUALITY-COMPLIANCE.md §5`,
 * `07-IMPLEMENTATION-PLAN.md` Task 3.3).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * **Why this module declares a shape at all, when nothing else in the MF
 * client is allowed to.**
 *
 * Every other type the MF pages consume is imported verbatim from
 * `@portfolioos/shared`, because `/advisor` crashed on first load when a client
 * declared its own version of a server shape and `tsc`, having only the
 * client's word for it, certified the drift instead of catching it
 * (CONTEXT.md §11, §16.6).
 *
 * The methodology payload is the one thing here with no shared type, and the
 * reason is structural rather than an oversight. The scoring model tables live
 * in `packages/api/src/services/mfAnalytics/mfScoring/models/*` — they have to,
 * the scorer runs on the server — and `06 §5` requires this page to render them
 * "from the same constants the scorer uses, do not hand-copy". The acceptance
 * criterion is literally that *a weight change in `activeEquity.ts` shows on
 * the page with no other edit*. That rules out the two obvious alternatives:
 * transcribing the tables into the page fails the criterion silently, and
 * importing server code into the browser bundle is not a thing we do. So the
 * numbers must travel over the wire, and the wire needs a shape.
 *
 * The right home for that shape is `packages/shared`, exactly like every other
 * DTO in this layer, and it should move there the moment that package is open
 * for edits — the server-side interface it mirrors is documented as the same
 * compromise in `packages/api/src/controllers/mfPortfolio.controller.ts`.
 *
 * Until then, the mitigation: **the shape is a Zod schema and the type is
 * inferred from it**, never a bare `interface`. A bare interface drifts in
 * silence — the server renames `weight` to `pillarWeight`, `tsc` is happy
 * because it was only ever comparing the client against itself, and the page
 * renders a column of blank cells that looks like missing data. A schema turns
 * the same drift into a parse failure the page can *say out loud*, which is
 * weaker than a compile error and enormously stronger than nothing.
 *
 * That is also why `parse` is used here rather than `safeParse`: a rejected
 * promise surfaces through React Query's `error` and the page renders "the
 * methodology service returned a shape this page does not understand". Failing
 * loudly is the whole point; swallowing the error to render partial tables
 * would reintroduce exactly the silent failure the schema exists to prevent.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Note on numeric types. Pillar and input `weight`s arrive as JS numbers, which
 * is the one place in this layer that is correct rather than a lapse: they are
 * hand-chosen dimensionless integers (`30`, `22.5`) declared as `number` in the
 * scorer's own `ScoringModel`, not measurements. The rating-bucket shares, which
 * ARE computed (by subtracting cumulative cut-offs), arrive as Decimal strings
 * because `0.325 - 0.1` in IEEE-754 is `0.22499999999999998` and this page's
 * entire job is to be checkable.
 */

/** Mirrors the scorer's `MetricDirection` union in `mfScoreMath.ts`. */
const directionSchema = z.enum([
  'HIGHER_IS_BETTER',
  'LOWER_IS_BETTER',
  'HIGHER_IS_BETTER_TO_CAP',
  'RAW_SCORE',
]);

const inputSchema = z.object({
  metric: z.string(),
  weight: z.number(),
  /**
   * Null when the metric has no entry in the scorer's direction table. That is
   * a server-side bug (an invariant test asserts coverage), and the page says
   * "unknown" for it rather than assuming higher-is-better — silently asserting
   * a direction we do not have is how a lower-is-better metric gets presented
   * to a reader as a virtue.
   */
  direction: directionSchema.nullable(),
});

const pillarSchema = z.object({
  key: z.string(),
  weight: z.number(),
  inputs: z.array(inputSchema),
});

const modelSchema = z.object({
  modelKey: z.string(),
  methodologyVersion: z.string(),
  pillars: z.array(pillarSchema),
});

const bucketSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  /** Fraction of the universe, as a Decimal string: `0.225000` = 22.5%. */
  shareOfUniverse: z.string(),
  fromTopCumulative: z.string(),
});

const methodologySchema = z.object({
  mathVersion: z.string(),
  minRatingHistoryMonths: z.number(),
  minUniverseSize: z.number(),
  ratingRequiredPillars: z.array(z.string()),
  horizonBlend: z.array(z.object({ horizonYears: z.number(), baseWeight: z.number() })),
  ratingBuckets: z.array(bucketSchema),
  models: z.array(modelSchema),
  changelogPath: z.string(),
  backtestDirPath: z.string(),
});

export type MfMethodologyPayload = z.infer<typeof methodologySchema>;
export type MfMethodologyModel = z.infer<typeof modelSchema>;
export type MfMethodologyPillar = z.infer<typeof pillarSchema>;
export type MfMethodologyInput = z.infer<typeof inputSchema>;
export type MfMethodologyBucket = z.infer<typeof bucketSchema>;
export type MfMetricDirection = z.infer<typeof directionSchema>;

export const mfMethodologyApi = {
  /**
   * Authenticated but not entitlement-gated, unlike the rest of
   * `/api/mf-analytics`. `06 §5` calls the methodology page *public*: it is how
   * a reader decides whether a rating is worth trusting, which they have to be
   * able to do before paying for the plan that shows them ratings.
   */
  async get(): Promise<MfMethodologyPayload> {
    const { data } = await api.get<ApiResponse<unknown>>('/api/mf-analytics/methodology');
    return methodologySchema.parse(unwrap(data));
  },
};
