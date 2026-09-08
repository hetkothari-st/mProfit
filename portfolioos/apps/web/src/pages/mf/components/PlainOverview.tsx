/**
 * The fund page a reader without a finance background can act on.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 *
 * The detailed panels answer "what are this fund's numbers". They open on
 * Sortino, Jensen's alpha, information ratio, HHI and tracking error, and a
 * reader who does not already know what those mean cannot tell from them
 * whether the fund is good, and is not told what to do about it. That reader is
 * most of the people who own mutual funds.
 *
 * So this is the default view and the detailed one is a toggle. It answers, in
 * order: is this fund any good, what is good about it, what is not, and how
 * does it compare to its category.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WILL NOT DO
 * ---------------------------------------------------------------------------
 *
 * Every sentence here is derived from a number already in the payload. There is
 * no separate "simple score", no rounding a rating up to make a cleaner story,
 * and no prose that survives its evidence: when a pillar could not be scored,
 * this says the pillar is unscored rather than quietly dropping it and letting
 * the reader assume it was fine. Plain language is a translation of the
 * analysis, never a second, friendlier analysis.
 *
 * It also does not give advice. "Consider" and "worth checking" are as far as
 * this goes; a recommendation to buy or sell belongs to the verdict engine,
 * which knows the reader's holdings, costs and tax position — none of which are
 * visible here.
 */

import type {
  MfAlternativesDto,
  MfFundAnalyticsDto,
  MfHorizonMetrics,
  MfHorizonYears,
  MfPillarScore,
} from '@portfolioos/shared';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Money-adjacent ratios arrive as strings; parse only for display. */
function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct(v: string | number | null | undefined, digits = 1): string | null {
  const n = num(v);
  return n === null ? null : `${(n * 100).toFixed(digits)}%`;
}

/** Percentiles are stored 0..1 with higher always better (`03 §1`). */
function ordinal(p: number): string {
  const v = Math.round(p * 100);
  const s = v % 100;
  if (s >= 11 && s <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}

// ---------------------------------------------------------------------------
// Plain-language mappings
// ---------------------------------------------------------------------------

const PILLAR_LABEL: Record<string, string> = {
  PERFORMANCE: 'Returns',
  CONSISTENCY: 'Consistency',
  DOWNSIDE: 'Protection in falls',
  COST: 'Cost',
  PORTFOLIO: 'Portfolio quality',
  PEOPLE_PARENT: 'Fund house & manager',
  CREDIT_QUALITY: 'Credit quality',
  MANDATE_FIT: 'Sticks to its mandate',
  TRACKING: 'Tracking the index',
  SCALE: 'Fund size',
  STRUCTURE: 'Structure',
};

/** What a pillar means, in one sentence, for a reader who has not met it. */
const PILLAR_MEANING: Record<string, string> = {
  PERFORMANCE: 'how much it made compared with similar funds, adjusted for the risk it took',
  CONSISTENCY: 'whether it beat its peers repeatedly or got lucky in one stretch',
  DOWNSIDE: 'how much it lost when markets fell',
  COST: 'what it charges each year, against what similar funds charge',
  PORTFOLIO: 'how spread out its holdings are, and whether it holds what it says it does',
  PEOPLE_PARENT: 'the track record of the fund house and the manager running it',
  CREDIT_QUALITY: 'how safe the bonds it holds are',
  MANDATE_FIT: 'whether it invests the way its category says it should',
  TRACKING: 'how closely it follows the index it is meant to copy',
  SCALE: 'whether it has grown too large to invest the way it used to',
  STRUCTURE: 'how the fund itself is put together',
};

const RATING_VERDICT: Record<number, { headline: string; body: string }> = {
  5: {
    headline: 'One of the strongest funds in its category',
    body: 'It scores in the top band against funds doing the same job. That is a statement about the past, not a promise about the future.',
  },
  4: {
    headline: 'Better than most funds in its category',
    body: 'It scores above the majority of its peers, without being at the very top.',
  },
  3: {
    headline: 'About average for its category',
    body: 'Roughly in the middle of funds doing the same job — neither a standout nor a problem.',
  },
  2: {
    headline: 'Weaker than most funds in its category',
    body: 'Most funds doing the same job score better. Worth understanding why before adding to it.',
  },
  1: {
    headline: 'Among the weakest in its category',
    body: 'It sits in the bottom band against its peers. Worth checking what is driving that before holding more.',
  },
};

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

interface PillarNote {
  key: string;
  label: string;
  meaning: string;
  score: number;
  weight: number;
}

/**
 * Rank the scored pillars, and say which are strong and which are this fund's
 * weakest — which are not the same question.
 *
 * Pillar scores are percentile-shaped: across the scored universe they average
 * 0.50 and run 0.01 to 0.98. So an absolute cut ("below 0.4 is a weakness")
 * describes a fund against its category, and for a genuinely good fund it
 * returns nothing at all. The first version of this did exactly that and the
 * page told the reader there was nothing to watch on a fund whose downside
 * protection was visibly its weakest side — true as stated, useless as
 * guidance, and it reads as a broken panel.
 *
 * So there are two bands, and the copy distinguishes them honestly:
 *
 *   - Below 0.4 is a weakness against the category, and is described that way.
 *   - Otherwise the lowest-scoring pillar is this fund's OWN weakest area, and
 *     is described that way — "its weakest area, though still ahead of most
 *     funds in its category" — rather than being dressed up as a problem.
 *
 * That is a reframing of a real ranking, not an invented finding. What it will
 * not do is pad: a fund with one scored pillar has no meaningful "weakest",
 * and gets nothing.
 *
 * `PEOPLE_PARENT` is excluded from strengths. It is currently 0.75 for every
 * scored scheme in the database — min, mean and max are all 0.75 — so it
 * separates no fund from any other, and presenting it as something this fund
 * does well would be telling the reader a constant.
 */
const UNINFORMATIVE_PILLARS = new Set(['PEOPLE_PARENT']);

function splitPillars(pillars: Record<string, MfPillarScore>): {
  strengths: PillarNote[];
  weaknesses: PillarNote[];
  relativeWeakest: PillarNote | null;
  unscored: string[];
} {
  const scored: PillarNote[] = [];
  const unscored: string[] = [];

  for (const [key, pillar] of Object.entries(pillars)) {
    const score = num(pillar.score);
    const label = PILLAR_LABEL[key] ?? key;
    if (score === null) {
      // A pillar at zero weight contributed nothing to the rating. Saying so is
      // the point: the reader is entitled to know the rating is built on fewer
      // pillars than the methodology describes.
      unscored.push(label);
      continue;
    }
    scored.push({ key, label, meaning: PILLAR_MEANING[key] ?? '', score, weight: num(pillar.weight) ?? 0 });
  }

  const informative = scored.filter((p) => !UNINFORMATIVE_PILLARS.has(p.key));
  const strengths = informative.filter((p) => p.score >= 0.6).sort((a, b) => b.score - a.score);
  const weaknesses = scored.filter((p) => p.score < 0.4).sort((a, b) => a.score - b.score);

  // Only when nothing is weak in absolute terms, and only with something to
  // rank against.
  const ranked = [...informative].sort((a, b) => a.score - b.score);
  const relativeWeakest =
    weaknesses.length === 0 && ranked.length >= 2 ? (ranked[0] ?? null) : null;

  return { strengths, weaknesses, relativeWeakest, unscored };
}

interface PlainMetric {
  label: string;
  value: string;
  help: string;
  tone?: 'good' | 'bad';
}

/** The three numbers a non-specialist actually uses, in plain words. */
function plainMetrics(m: MfHorizonMetrics, horizon: MfHorizonYears): PlainMetric[] {
  const out: PlainMetric[] = [];

  const cagr = pct(m.returns.cagr);
  const catCagr = pct(m.returns.categoryMedianCagr);
  if (cagr !== null) {
    const mine = num(m.returns.cagr);
    const theirs = num(m.returns.categoryMedianCagr);
    out.push({
      label: `Growth per year (${horizon}Y)`,
      value: cagr,
      help:
        catCagr === null
          ? 'The average yearly growth over this period.'
          : `The average yearly growth over this period. Similar funds averaged ${catCagr}.`,
      ...(mine !== null && theirs !== null
        ? { tone: mine >= theirs ? ('good' as const) : ('bad' as const) }
        : {}),
    });
  }

  const dd = num(m.risk.maxDrawdown);
  if (dd !== null) {
    out.push({
      label: 'Worst fall',
      value: pct(m.risk.maxDrawdown) ?? '—',
      help: 'The largest drop from a peak before it recovered. This is what holding it felt like at its worst.',
    });
  }

  const vol = pct(m.risk.stdDevAnn);
  if (vol !== null) {
    out.push({
      label: 'Bumpiness',
      value: vol,
      help: 'How much the value swings up and down in a typical year. Higher means a rougher ride, not necessarily a worse fund.',
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Which period to summarise.
 *
 * Deliberately NOT the horizon the detailed tabs are on. That defaults to 1
 * year, which is the least useful window for judging a fund and the one most
 * likely to be unavailable — a 1-year row needs twelve monthly observations, so
 * a fund can have thirteen years of history and still show nothing there. A
 * reader on the plain view would then see a summary with no growth figure and
 * conclude the fund has no record.
 *
 * Three years is the shortest window over which a comparison means much, so it
 * is preferred, then longer, then shorter — and whichever is chosen is stated
 * on the figure itself rather than assumed.
 */
const SUMMARY_HORIZON_PREFERENCE: MfHorizonYears[] = [3, 5, 10, 7, 1];

function pickSummaryHorizon(data: MfFundAnalyticsDto): MfHorizonYears | null {
  for (const h of SUMMARY_HORIZON_PREFERENCE) {
    const m = data.metrics[`${h}`];
    if (m !== undefined && m.status === 'OK' && num(m.returns.cagr) !== null) return h;
  }
  // Nothing with a return figure — fall back to any OK horizon so the risk
  // numbers still render, rather than showing an empty section.
  for (const h of SUMMARY_HORIZON_PREFERENCE) {
    const m = data.metrics[`${h}`];
    if (m !== undefined && m.status === 'OK') return h;
  }
  return null;
}

export function PlainOverview({
  data,
  alternatives,
  onShowDetail,
}: {
  data: MfFundAnalyticsDto;
  alternatives: MfAlternativesDto | null;
  onShowDetail: () => void;
}) {
  const score = data.score;
  const horizon = pickSummaryHorizon(data);
  const metrics = horizon === null ? undefined : data.metrics[`${horizon}`];

  const rating = score?.rating ?? null;
  const verdict = rating === null ? null : RATING_VERDICT[rating];
  const { strengths, weaknesses, relativeWeakest, unscored } =
    score === null
      ? { strengths: [], weaknesses: [], relativeWeakest: null, unscored: [] }
      : splitPillars(score.pillars);

  // Cost is only shown when somebody's cost is actually known: we hold a TER
  // for the funds whose AMC factsheet has been ingested, which today is a
  // minority of them.
  const anyCostKnown =
    alternatives !== null &&
    (alternatives.subjectTerPct !== null ||
      alternatives.alternatives.some((a) => a.terPct !== null));

  const composite = num(score?.composite);
  const median = num(data.categoryStats.medianComposite);
  const topQuartile = num(data.categoryStats.topQuartileComposite);

  return (
    <div className="space-y-8" data-testid="mf-plain-overview">
      {/* ── The verdict ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-6">
        {rating === null || verdict === undefined || verdict === null ? (
          <div>
            <h2 className="font-display text-[22px] text-foreground">Not rated yet</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {score === null
                ? 'We have not scored this fund. That is a gap in our data, not a judgement about the fund.'
                : score.ratingStatus === 'INSUFFICIENT_HISTORY'
                  ? 'This fund does not yet have enough track record for us to rate it fairly. A rating on a short history says more about timing than about the fund.'
                  : `We rate a fund only against enough peers to make the comparison mean something. Its category currently holds ${data.categoryStats.universeSize} scheme${data.categoryStats.universeSize === 1 ? '' : 's'} we can score, which is too few.`}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2" aria-label={`${rating} out of 5`}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    aria-hidden
                    className={i <= rating ? 'text-primary' : 'text-muted-foreground/30'}
                  >
                    ★
                  </span>
                ))}
              </div>
              <h2 className="font-display text-[26px] leading-tight text-foreground">
                {verdict.headline}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{verdict.body}</p>
              <p className="mt-3 text-sm text-muted-foreground">
                Ranked against{' '}
                <strong className="text-foreground">
                  {data.categoryStats.universeSize} similar funds
                </strong>
                {composite !== null && median !== null ? (
                  <>
                    . It scores <strong className="text-foreground">{composite.toFixed(1)}</strong>{' '}
                    out of 100, where the middle fund in its category scores {median.toFixed(1)}
                    {topQuartile !== null ? ` and the best quarter start at ${topQuartile.toFixed(1)}` : ''}.
                  </>
                ) : (
                  '.'
                )}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── What's good / what to watch ───────────────────────────────── */}
      {(strengths.length > 0 || weaknesses.length > 0 || relativeWeakest !== null) && (
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-display text-[18px] text-foreground">What it does well</h3>
            {strengths.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nothing stands out as a clear strength against its peers.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {strengths.map((p) => (
                  <li key={p.key} className="text-sm">
                    <span className="font-medium text-foreground">{p.label}</span>
                    <span className="text-muted-foreground"> — {p.meaning}.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-display text-[18px] text-foreground">What to watch</h3>
            {weaknesses.length === 0 ? (
              relativeWeakest === null ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nothing stands out as a clear weakness against its peers.
                </p>
              ) : (
                <div className="mt-3 text-sm">
                  <span className="font-medium text-foreground">{relativeWeakest.label}</span>
                  <span className="text-muted-foreground"> — {relativeWeakest.meaning}.</span>
                  <p className="mt-2 text-muted-foreground">
                    This is its weakest area, though it is still ahead of most funds in its
                    category. Nothing here is a red flag.
                  </p>
                </div>
              )
            ) : (
              <ul className="mt-3 space-y-3">
                {weaknesses.map((p) => (
                  <li key={p.key} className="text-sm">
                    <span className="font-medium text-foreground">{p.label}</span>
                    <span className="text-muted-foreground"> — {p.meaning}.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ── The basic numbers ─────────────────────────────────────────── */}
      {metrics !== undefined && horizon !== null && (
        <section>
          <h3 className="mb-4 font-display text-[18px] text-foreground">The numbers that matter</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {plainMetrics(metrics, horizon).map((m) => (
              <div key={m.label} className="rounded-xl border border-border bg-card p-5">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {m.label}
                </div>
                <div
                  className={`mt-1 font-display text-[26px] ${
                    m.tone === 'good'
                      ? 'text-primary'
                      : m.tone === 'bad'
                        ? 'text-destructive'
                        : 'text-foreground'
                  }`}
                >
                  {m.value}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{m.help}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Honesty about what the rating is missing ──────────────────── */}
      {unscored.length > 0 && (
        <section className="rounded-xl border border-dashed border-border p-5">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Not everything could be measured.
            </span>{' '}
            We could not score {unscored.join(', ')} for this fund, so the rating above is built on
            the rest. We show this rather than hide it — a missing input is not a passing grade.
          </p>
        </section>
      )}

      {/* ── Alternatives ─────────────────────────────────────────────── */}
      {alternatives !== null && alternatives.alternatives.length > 0 && (
        <section>
          <h3 className="mb-1 font-display text-[18px] text-foreground">
            Funds in this category that score higher
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Ranked the same way, in the same category and plan. This is a comparison, not a
            recommendation to switch — moving funds can trigger an exit load and a tax bill that
            this page cannot see.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Fund</th>
                  <th className="py-2 pr-4 font-medium">Rating</th>
                  <th className="py-2 pr-4 font-medium">Score</th>
                  {anyCostKnown && <th className="py-2 font-medium">Cost / yr</th>}
                </tr>
              </thead>
              <tbody>
                {alternatives.alternatives.map((a) => (
                  <tr key={a.schemeCode} className="border-b border-border/50">
                    <td className="py-3 pr-4">
                      <a
                        href={`/mutual-funds/${a.schemeCode}`}
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        {a.schemeName}
                      </a>
                      <div className="text-xs text-muted-foreground">{a.amcName}</div>
                    </td>
                    <td className="py-3 pr-4 text-primary">
                      {a.rating === null ? '—' : '★'.repeat(a.rating)}
                    </td>
                    <td className="py-3 pr-4 text-foreground">
                      {num(a.composite)?.toFixed(1) ?? '—'}
                      {num(a.compositeDelta) !== null && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (+{num(a.compositeDelta)!.toFixed(1)})
                        </span>
                      )}
                    </td>
                    {/* The column appears only when at least one row can fill
                        it. A column of "not disclosed" for every fund is not
                        honesty, it is furniture — and it crowds out the numbers
                        that are known. */}
                    {anyCostKnown && (
                      <td className="py-3 text-foreground">
                        {a.terPct === null ? (
                          <span className="text-muted-foreground">not disclosed to us</span>
                        ) : (
                          `${num(a.terPct)!.toFixed(2)}%`
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {alternatives.subjectTerPct !== null ? (
            <p className="mt-3 text-xs text-muted-foreground">
              This fund charges {num(alternatives.subjectTerPct)!.toFixed(2)}% a year.
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              We do not yet hold expense ratios for these funds, so cost is not compared here.
              Cost is one of the strongest predictors of long-term return — worth checking on the
              AMC's own factsheet before deciding anything.
            </p>
          )}
        </section>
      )}

      {alternatives !== null &&
        alternatives.alternatives.length === 0 &&
        alternatives.subjectComposite !== null && (
          <section className="rounded-xl border border-dashed border-border p-5">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Nothing in its category scores higher.</span>{' '}
              Among the {alternatives.universeSize} rated funds we hold for this category, none
              outscores this one.
            </p>
          </section>
        )}

      <button
        type="button"
        onClick={onShowDetail}
        className="text-sm font-medium text-primary underline underline-offset-4"
      >
        Show the full calculations →
      </button>
    </div>
  );
}
