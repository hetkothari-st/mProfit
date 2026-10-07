import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { mfAnalyticsKeys } from '@/api/mfAnalyticsKeys';
import {
  mfMethodologyApi,
  type MfMethodologyModel,
  type MfMetricDirection,
} from '@/api/mfMethodology.api';
import { AnalyticsDisclaimer } from './components/AnalyticsDisclaimer';
import { SectionUnavailable } from './components/MetricValue';
import { RatioPctCell } from './components/MetricCells';
import { humanizeKey, known } from './mfFormat';

/**
 * `/methodology/mf-score` — the transparency page (`06-QUALITY-COMPLIANCE.md §5`,
 * `07-IMPLEMENTATION-PLAN.md` Task 3.3).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * **Every number on this page is fetched, and none is typed here.**
 *
 * The acceptance criterion for this task is not "the page shows the weights",
 * it is: *"a weight change in `activeEquity.ts` shows on the page with no other
 * edit"*. That criterion exists because the failure mode it guards against is
 * silent. A hand-copied table renders perfectly, passes review, passes its own
 * tests, and simply describes a scorer that no longer exists — and it describes
 * it to exactly the audience (a user deciding whether to trust a rating, an
 * auditor, a regulator) who has no other way to check. There is no version of
 * "transcribe the tables and remember to update them" that is safe, because the
 * moment it goes wrong is the moment nobody is looking.
 *
 * So the weights come over the wire from `GET /api/mf-analytics/methodology`,
 * which reads them out of `MF_SCORING_MODELS` — the very objects
 * `mfScoreMath.ts` scores with. The models live in `packages/api` and cannot be
 * imported into a browser bundle; publishing them through a read endpoint is
 * how the constants reach the page without being copied. The alternative was to
 * move the weight tables into `packages/shared`, which would be cleaner still —
 * one import, no endpoint, a compile-time guarantee instead of a runtime one —
 * and it is the right end state. It was not taken here only because that package
 * is frozen for this change; `api/mfMethodology.api.ts` records the compromise
 * and the promotion path.
 *
 * The one thing this page DOES state in its own words is prose: what a pillar
 * means, why a direction points the way it does. Prose is not a number a scorer
 * can silently disagree with.
 * ─────────────────────────────────────────────────────────────────────────
 */

const DIRECTION_LABEL: Record<MfMetricDirection, string> = {
  HIGHER_IS_BETTER: 'Higher is better',
  LOWER_IS_BETTER: 'Lower is better',
  HIGHER_IS_BETTER_TO_CAP: 'Higher is better, up to a cap',
  RAW_SCORE: 'Raw score, not ranked against peers',
};

export function MethodologyPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: mfAnalyticsKeys.methodology(),
    queryFn: () => mfMethodologyApi.get(),
    // Constants. They change when a model file changes and a deploy ships, not
    // while someone is reading the page.
    staleTime: 60 * 60 * 1000,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Mutual funds"
        title="How we score a fund"
        description="Every weight below is read from the scoring models themselves, not restated here. If the scorer changes, this page changes with it."
      />

      {isLoading && (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="inline h-5 w-5 animate-spin" /> Loading the scoring models…
        </div>
      )}

      {/* A Zod parse failure lands here too, and deliberately: the payload has
          no shared type, so a server-side rename would otherwise render as a
          page of blank cells that looks like missing data rather than like a
          broken contract. Failing out loud is the whole point of validating. */}
      {error !== null && !isLoading && (
        <SectionUnavailable
          title="Could not load the scoring methodology"
          reason={apiErrorMessage(
            error,
            'The methodology service returned something this page does not understand. Rather than render a partial table that might misstate how funds are scored, it shows nothing.',
          )}
        />
      )}

      {data && (
        <div className="space-y-10">
          <section data-testid="mf-methodology-overview">
            <Card tone="hero">
              <CardContent className="space-y-4 p-6 text-[13px] leading-relaxed text-muted-foreground">
                <p>
                  A fund&apos;s score is a weighted blend of percentile ranks against its own SEBI
                  sub-category, never against the whole market. Each pillar below is a weighted mean
                  of its inputs&apos; percentiles; a pillar with no usable input scores nothing at
                  all and its weight is redistributed across the rest, rather than being counted as
                  a zero.
                </p>
                <p>
                  A rating is withheld — not lowered — when the evidence is thin. A scheme with
                  fewer than{' '}
                  <strong className="font-medium text-foreground">
                    {data.minRatingHistoryMonths} months
                  </strong>{' '}
                  of NAV history is unrated, because thirty months of a rising market is a momentum
                  reading rather than a quality one. A category with fewer than{' '}
                  <strong className="font-medium text-foreground">
                    {data.minUniverseSize} schemes
                  </strong>{' '}
                  produces no rating either, because one place changes a percentile by double digits
                  in a group that small. In both cases the metrics are still published; only the
                  peer-relative claim is held back.
                </p>
                <p>
                  Where a model declares them, both{' '}
                  {data.ratingRequiredPillars.map((p) => humanizeKey(p)).join(' and ')} must be
                  scorable before a rating is issued: a composite assembled from cost and portfolio
                  structure alone describes a fund&apos;s plumbing, and stars would be read as a
                  judgement of its investing.
                </p>
                <p className="text-[11.5px]">
                  Scoring arithmetic version{' '}
                  <span className="font-medium text-foreground">{data.mathVersion}</span>. A change
                  to it invalidates every model at once; a change to a single model&apos;s weights
                  bumps only that model&apos;s version.
                </p>
              </CardContent>
            </Card>
          </section>

          <RatingBuckets buckets={data.ratingBuckets} />

          <HorizonBlend blend={data.horizonBlend} />

          <section data-testid="mf-methodology-models" className="space-y-5">
            <h2 className="font-display text-[22px] leading-none text-foreground">
              The models
            </h2>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Which model a scheme is scored by follows from its SEBI category. Two categories that
              share a methodology version share the model itself, not merely a resemblance —
              solution-oriented funds are hybrids with a lock-in bolted on, and the lock-in changes
              their tax treatment rather than what makes the portfolio good or bad.
            </p>
            {data.models.map((model) => (
              <ModelTable key={model.modelKey} model={model} />
            ))}
          </section>

          <Changelog changelogPath={data.changelogPath} backtestDirPath={data.backtestDirPath} />

          <AnalyticsDisclaimer />
        </div>
      )}
    </div>
  );
}

/**
 * The `03 §8` distribution: 10 / 22.5 / 35 / 22.5 / 10.
 *
 * Derived server-side from the same cumulative cut-offs the rating function
 * compares against, and sent as Decimal strings rather than JS numbers because
 * `0.325 - 0.1` in IEEE-754 is `0.22499999999999998`. On a page whose entire
 * purpose is to be checkable, a bucket width that renders with fifteen spurious
 * decimals is worse than useless — it invites the reader to distrust the
 * numbers that ARE exact.
 */
function RatingBuckets({
  buckets,
}: {
  buckets: Array<{ rating: number; shareOfUniverse: string; fromTopCumulative: string }>;
}) {
  return (
    <section data-testid="mf-methodology-buckets" className="space-y-3">
      <h2 className="font-display text-[22px] leading-none text-foreground">
        From composite to stars
      </h2>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        The composite is the number; the stars are its position within the fund&apos;s own category,
        on a fixed distribution. A fund can improve and still lose a star if its peers improved more
        — that is what &quot;relative&quot; means, and it is why the composite is shown alongside.
        Ties go to the higher rating.
      </p>
      <Card tone="flat">
        <CardContent className="p-0">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Rating</th>
                <th className="px-4 py-2.5 text-right font-medium">Share of category</th>
                <th className="px-4 py-2.5 text-right font-medium">Ranked above it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {buckets.map((b) => (
                <tr key={b.rating} data-rating-bucket={b.rating}>
                  <td className="px-4 py-2 text-foreground">
                    {b.rating} {b.rating === 1 ? 'star' : 'stars'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {/* A fraction of the universe → the Ratio formatter. */}
                    <RatioPctCell resolved={known(b.shareOfUniverse)} fractionDigits={1} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <RatioPctCell resolved={known(b.fromTopCumulative)} fractionDigits={1} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * How the three reporting horizons are blended. The blend is applied to the
 * PERCENTILE, not to the raw metric — which is what makes it reward a fund that
 * was good across a whole cycle rather than one on a recent hot streak.
 */
function HorizonBlend({
  blend,
}: {
  blend: Array<{ horizonYears: number; baseWeight: number }>;
}) {
  return (
    <section data-testid="mf-methodology-horizons" className="space-y-3">
      <h2 className="font-display text-[22px] leading-none text-foreground">Horizon blending</h2>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Pillars whose inputs depend on a time window blend the percentiles from each horizon at
        these weights. When a horizon is unavailable — a seven-year-old fund has no ten-year record
        — the remaining weights are renormalised rather than the missing window being treated as an
        average result.
      </p>
      <Card tone="flat">
        <CardContent className="flex flex-wrap gap-x-10 gap-y-3 p-5 text-[13px]">
          {blend.map((h) => (
            <span key={h.horizonYears} data-horizon={h.horizonYears}>
              <span className="text-muted-foreground">{h.horizonYears}-year </span>
              <span className="numeric tabular-nums font-medium text-foreground">
                {h.baseWeight}
              </span>
            </span>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * One model's pillar table, rendered from the fetched constants.
 *
 * `humanizeKey` derives the display label from the key rather than looking it
 * up in a map kept here. That is the same reasoning as the acceptance criterion
 * for the whole page: a hardcoded label map renders a brand-new input as a blank
 * cell, and the failure is silent. An unrecognised key stays legible.
 */
function ModelTable({ model }: { model: MfMethodologyModel }) {
  return (
    <Card tone="flat" data-model={model.modelKey}>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 px-4 py-3">
          <h3 className="font-medium text-foreground">{humanizeKey(model.modelKey)}</h3>
          <span className="text-[11px] text-muted-foreground">
            Methodology{' '}
            <span data-methodology-version className="font-medium">
              {model.methodologyVersion}
            </span>
          </span>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Pillar</th>
              <th className="px-4 py-2.5 text-right font-medium">Weight</th>
              <th className="px-4 py-2.5 font-medium">Input</th>
              <th className="px-4 py-2.5 text-right font-medium">Within pillar</th>
              <th className="px-4 py-2.5 font-medium">Direction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {model.pillars.flatMap((pillar) =>
              pillar.inputs.map((input, i) => (
                <tr
                  key={`${pillar.key}-${input.metric}`}
                  data-pillar={pillar.key}
                  data-input={input.metric}
                >
                  {i === 0 ? (
                    <>
                      <td
                        rowSpan={pillar.inputs.length}
                        className="px-4 py-2 align-top font-medium text-foreground"
                      >
                        {humanizeKey(pillar.key)}
                      </td>
                      <td
                        rowSpan={pillar.inputs.length}
                        data-pillar-weight={pillar.key}
                        className="px-4 py-2 text-right align-top numeric tabular-nums text-foreground"
                      >
                        {pillar.weight}
                      </td>
                    </>
                  ) : null}
                  <td className="px-4 py-2 text-muted-foreground">{humanizeKey(input.metric)}</td>
                  <td
                    data-input-weight={input.metric}
                    className="px-4 py-2 text-right numeric tabular-nums text-muted-foreground"
                  >
                    {input.weight}
                  </td>
                  <td className="px-4 py-2 text-[12px] text-muted-foreground">
                    {input.direction === null ? (
                      // A missing direction is a scoring-layer bug, not a
                      // neutral default. Assuming higher-is-better here is how
                      // a lower-is-better metric gets presented as a virtue.
                      <span className="italic">not declared — treat this row as unverified</span>
                    ) : (
                      DIRECTION_LABEL[input.direction]
                    )}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/**
 * The changelog is linked rather than mirrored.
 *
 * `06 §5` asks for the changelog's current state or a link to it, and a link is
 * the honest choice: the file is the record, and a rendering of it maintained
 * separately from the file is a second record that can disagree with the first —
 * the same failure this whole page exists to avoid, one level up. What IS shown
 * here comes from the constants: the methodology version each model currently
 * declares, which is the thing a reader needs in order to know which changelog
 * entry applies to the score they are looking at.
 */
function Changelog({
  changelogPath,
  backtestDirPath,
}: {
  changelogPath: string;
  backtestDirPath: string;
}) {
  return (
    <section data-testid="mf-methodology-changelog" className="space-y-3">
      <h2 className="font-display text-[22px] leading-none text-foreground">
        Versions and changes
      </h2>
      <Card tone="muted">
        <CardContent className="space-y-3 p-5 text-[12.5px] leading-relaxed text-muted-foreground">
          <p>
            Any change to a pillar weight, an input weight, the set of inputs, a metric&apos;s
            direction, the horizon-blend weights, the rating cut-offs or the percentile formula
            bumps the model&apos;s methodology version. Scores are append-only: a re-run under a new
            version writes new rows and never edits the old ones, so a figure shown last month stays
            reproducible.
          </p>
          <p>
            No version becomes the default without a backtest — the forward-return spread between
            the top and bottom quintile has to be positive across most months, and the top
            quintile&apos;s drawdown no worse than the bottom&apos;s. A model that does not
            discriminate does not ship.
          </p>
          <p>
            What changed, why, and the backtest delta against the version it replaced are recorded
            in{' '}
            <code className="rounded bg-muted px-1 py-px text-[11.5px] text-foreground">
              {changelogPath}
            </code>
            , with the backtest reports themselves under{' '}
            <code className="rounded bg-muted px-1 py-px text-[11.5px] text-foreground">
              {backtestDirPath}
            </code>
            . The version each model currently declares is shown on its table above.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
