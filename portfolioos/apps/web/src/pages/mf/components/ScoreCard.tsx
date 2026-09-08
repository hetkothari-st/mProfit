import { Star } from 'lucide-react';
import {
  MIN_RATING_HISTORY_MONTHS,
  MIN_UNIVERSE_SIZE,
  type MfFundAnalyticsDto,
  type MfSchemeMetaDto,
  type MfSchemeScoreDto,
} from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { Riskometer } from './Riskometer';
import { PillarBreakdown } from './PillarBreakdown';
import { formatIsoDate, formatRatio } from '../mfFormat';

/**
 * Score, rating, risk-o-meter, and — when there is no rating — the sentence
 * `06-QUALITY-COMPLIANCE.md §6` requires instead of one.
 *
 * The four `ratingStatus` branches below are the acceptance criteria for this
 * card, and each exists because a bare "Unrated" is useless to the reader. It
 * does not say whether to wait six months, look at a different category, or
 * conclude the fund cannot be rated at all — three completely different actions
 * behind one word. So:
 *
 *  - `INSUFFICIENT_HISTORY` → "Unrated — {N} months of history (rated from
 *    {date})". `historyMonths` and `ratedFrom` are carried on the score DTO for
 *    exactly this sentence; without them the client could only render the
 *    useless version.
 *  - `CATEGORY_TOO_SMALL` → "Unrated — only {n} peers in category". The fund is
 *    fine; the category is too thin for a percentile to mean anything, and no
 *    amount of waiting changes that.
 *  - `NOT_APPLICABLE` → the scheme is not scored by construction (an IDCW option
 *    is scored once on its growth sibling, `03 §1`), so we point at the sibling
 *    rather than implying a gap.
 *  - `score === null` → the scoring job has not run for this scheme. Distinct
 *    from every branch above, and distinct from a rating of zero, which is not
 *    a thing this model can produce.
 *
 * A composite of `null` is never rendered as 0. `composite` is 0-100 and 0 is a
 * legitimate (catastrophic) score, so the two must stay distinguishable.
 */

export interface ScoreCardProps {
  meta: MfSchemeMetaDto;
  score: MfSchemeScoreDto | null;
  categoryStats: MfFundAnalyticsDto['categoryStats'];
}

export function ScoreCard({ meta, score, categoryStats }: ScoreCardProps) {
  // `06 §4` again: the risk-o-meter must appear beside the score even when
  // there is no score. Prefer the score's denormalised copy so the disclosure
  // is the one that travelled with the rating; fall back to meta.
  const band = score?.riskometer ?? meta.riskometer;

  return (
    <Card tone="hero" data-testid="mf-score-card">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Fund score
            </p>
            <div className="mt-2">
              {score === null ? (
                <UnratedNotice
                  status="NOT_SCORED"
                  headline="Not scored"
                  detail="No score has been computed for this scheme yet. This is the scoring job's coverage, not a judgement on the fund."
                />
              ) : (
                <ScoreBody score={score} meta={meta} />
              )}
            </div>
          </div>

          <div className="flex flex-col items-start gap-3">
            <Riskometer band={band} />
            {score !== null && (
              <div className="text-[11px] text-muted-foreground">
                <p>
                  Category universe:{' '}
                  <span className="numeric">{score.universeSize}</span> schemes in{' '}
                  <span className="font-medium">{score.universeKey}</span>
                </p>
                <p className="mt-0.5">
                  Methodology <span className="font-medium">{score.methodologyVersion}</span> ·
                  model <span className="font-medium">{score.modelKey}</span>
                </p>
                {formatIsoDate(score.asOf) && <p className="mt-0.5">As of {formatIsoDate(score.asOf)}</p>}
              </div>
            )}
          </div>
        </div>

        <CategoryContext stats={categoryStats} />

        {score !== null && Object.keys(score.pillars).length > 0 && (
          <div className="mt-6 border-t border-border/60 pt-5">
            <PillarBreakdown pillars={score.pillars} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBody({ score, meta }: { score: MfSchemeScoreDto; meta: MfSchemeMetaDto }) {
  if (score.ratingStatus === 'RATED') {
    return (
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          {score.composite === null ? (
            // RATED with a null composite is a contract violation. It must not
            // become "0" — that reads as the worst fund in the category.
            <p data-metric-value data-status="INSUFFICIENT_DATA" className="text-sm text-muted-foreground">
              Not available — the score was marked rated but carried no composite
            </p>
          ) : (
            <p className="font-display text-[44px] leading-none tabular-nums text-foreground">
              {formatRatio(score.composite, 1)}
              <span className="ml-1 text-[16px] text-muted-foreground">/ 100</span>
            </p>
          )}
        </div>
        <Stars rating={score.rating} />
      </div>
    );
  }

  if (score.ratingStatus === 'INSUFFICIENT_HISTORY') {
    const ratedFrom = formatIsoDate(score.ratedFrom);
    // Both fields are nullable on the DTO. When they are present we render the
    // mandated sentence verbatim; when they are not we say what we do know
    // (the threshold) rather than fabricating a month count.
    const detail =
      score.historyMonths !== null && ratedFrom !== null
        ? `${score.historyMonths} months of history (rated from ${ratedFrom})`
        : score.historyMonths !== null
          ? `${score.historyMonths} months of history — below the ${MIN_RATING_HISTORY_MONTHS}-month minimum`
          : `fewer than the ${MIN_RATING_HISTORY_MONTHS} months of NAV history a rating requires`;
    return (
      <UnratedNotice
        status="INSUFFICIENT_HISTORY"
        headline="Unrated"
        detail={detail}
        note="Metrics below are still computed wherever the available history allows it."
      />
    );
  }

  if (score.ratingStatus === 'CATEGORY_TOO_SMALL') {
    return (
      <UnratedNotice
        status="CATEGORY_TOO_SMALL"
        headline="Unrated"
        detail={`only ${score.universeSize} peers in category`}
        note={`A percentile needs at least ${MIN_UNIVERSE_SIZE} schemes to mean anything; below that, one place changes the rank by double digits. The fund's own metrics are unaffected.`}
      />
    );
  }

  // NOT_APPLICABLE — the scheme is not scored by construction.
  return (
    <UnratedNotice
      status="NOT_APPLICABLE"
      headline="Not rated"
      detail="this scheme is not scored by the model"
      note={
        meta.growthSiblingSchemeCode
          ? `IDCW options share a portfolio with their growth sibling and are scored once, on scheme ${meta.growthSiblingSchemeCode}.`
          : 'This is a property of the scheme, not a data gap — there is nothing to wait for.'
      }
    />
  );
}

function UnratedNotice({
  status,
  headline,
  detail,
  note,
}: {
  status: string;
  headline: string;
  detail: string;
  note?: string;
}) {
  return (
    <div data-rating-status={status}>
      <p className="font-display text-[28px] leading-tight text-foreground">
        {headline} <span className="text-[18px] text-muted-foreground">— {detail}</span>
      </p>
      {note && <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

function Stars({ rating }: { rating: MfSchemeScoreDto['rating'] }) {
  if (rating === null) {
    return (
      <p data-metric-value data-status="INSUFFICIENT_DATA" className="text-[12px] text-muted-foreground">
        Not available — no star rating was assigned
      </p>
    );
  }
  return (
    <div className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            'h-5 w-5',
            n <= rating ? 'fill-accent text-accent' : 'text-muted-foreground/35',
          )}
        />
      ))}
    </div>
  );
}

/**
 * Where this fund's score sits relative to its category. Both figures are
 * nullable — a universe that is too small has no median worth quoting — so
 * each is guarded independently rather than the whole strip being hidden.
 */
function CategoryContext({ stats }: { stats: MfFundAnalyticsDto['categoryStats'] }) {
  return (
    <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-border/60 pt-4 text-[12px]">
      <span className="text-muted-foreground">
        Category median score:{' '}
        {stats.medianComposite === null ? (
          <span data-metric-value data-status="INSUFFICIENT_DATA" className="italic">
            Not available — the category has no published median
          </span>
        ) : (
          <span data-metric-value data-status="OK" className="numeric font-medium text-foreground">
            {formatRatio(stats.medianComposite, 1)}
          </span>
        )}
      </span>
      <span className="text-muted-foreground">
        Top quartile from:{' '}
        {stats.topQuartileComposite === null ? (
          <span data-metric-value data-status="INSUFFICIENT_DATA" className="italic">
            Not available — the category has no published quartile cut-off
          </span>
        ) : (
          <span data-metric-value data-status="OK" className="numeric font-medium text-foreground">
            {formatRatio(stats.topQuartileComposite, 1)}
          </span>
        )}
      </span>
    </div>
  );
}
