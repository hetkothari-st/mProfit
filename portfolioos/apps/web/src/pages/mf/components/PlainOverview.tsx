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

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * Stars, drawn rather than typed.
 *
 * The glyph "★" renders at a different weight in Fraunces than in the body
 * face and sits off the baseline next to a 72px numeral. An inline SVG keeps
 * the row optically aligned with the score and lets a half-filled state exist
 * later without a font that has one.
 */
function Stars({ rating, size = 18 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden
          className={i <= rating ? 'fill-primary' : 'fill-muted-foreground/25'}
        >
          <path d="M12 2.4l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.25l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95z" />
        </svg>
      ))}
    </span>
  );
}

/**
 * Where this fund sits against its own category.
 *
 * A score of 54 means nothing on its own; it means something against a median
 * of 52 and a top quartile starting at 56. The scale is the reason the big
 * numeral is worth printing, so it sits directly beneath it rather than being
 * buried in the sentence below.
 *
 * Rendered only when we hold a median — an invented axis would be worse than
 * no axis.
 */
function CategoryScale({
  score,
  median,
  topQuartile,
}: {
  score: number;
  median: number;
  topQuartile: number | null;
}) {
  const clamp = (n: number) => Math.max(2, Math.min(98, n));
  return (
    <div className="mt-6">
      <div className="relative h-[3px] w-full rounded-full bg-muted">
        {topQuartile !== null && (
          <div
            className="absolute inset-y-0 rounded-full bg-primary/15"
            style={{ left: `${clamp(topQuartile)}%`, right: 0 }}
          />
        )}
        <div
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-muted-foreground/50"
          style={{ left: `${clamp(median)}%` }}
        />
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-background bg-primary"
          style={{ left: `${clamp(score)}%` }}
        />
      </div>
      {/* Two labels on one row collide whenever the median and the top
          quartile are close, which in a tight category they usually are —
          measured at 52 and 56 on a liquid-fund page. Staggering them keeps
          both anchored to their real positions instead of trading accuracy for
          legibility. */}
      <div className="relative mt-2 h-4 text-[11px] text-muted-foreground">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${clamp(median)}%` }}>
          median {median.toFixed(0)}
        </span>
      </div>
      {topQuartile !== null && (
        <div className="relative h-4 text-[11px] text-muted-foreground">
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${clamp(topQuartile)}%` }}
          >
            top quarter {topQuartile.toFixed(0)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * A fund house mark, built from its own name.
 *
 * There are no logo assets in this repo and no endpoint that serves them, so a
 * real logo would mean a broken image on every row. Initials in a tinted disc
 * are honest about being a placeholder, stay stable per AMC across renders, and
 * give the list the scannable left edge that a bare table of names does not.
 *
 * The hue is a hash of the name so two houses are rarely the same colour;
 * saturation and lightness are fixed so none of them fight the lime accent.
 */
function houseMark(amcName: string): { initials: string; hue: number } {
  const words = amcName
    .replace(/(mutual fund|asset management|amc|india|limited|ltd\.?|company|trustee)/gi, ' ')
    .replace(/[^A-Za-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const initials = (words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '');
  let h = 0;
  for (let i = 0; i < amcName.length; i++) h = (h * 31 + amcName.charCodeAt(i)) % 360;
  return { initials: initials.toUpperCase(), hue: h };
}

function HouseMark({ amcName }: { amcName: string }) {
  const { initials, hue } = houseMark(amcName);
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold tracking-tight"
      style={{
        backgroundColor: `hsl(${hue} 40% 22%)`,
        color: `hsl(${hue} 70% 78%)`,
      }}
    >
      {initials}
    </span>
  );
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
      {/* Never let a borrowed rating read as this scheme's own. An IDCW option
          is not ranked — peer universes are growth-only — so its numbers come
          from the growth option of the same fund, and the reader is told so
          before they read anything else. */}
      {data.analyticsFromSchemeCode !== null && (
        <section className="rounded-xl border border-dashed border-border p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              These figures come from this fund&rsquo;s growth option.
            </span>{' '}
            Payout and reinvest options are not ranked separately — it is the same portfolio, run
            the same way, differing only in how it pays you. Your own returns will differ from the
            growth figures by whatever has been distributed.
          </p>
        </section>
      )}
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
          <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-start">
            {/* The score, at the size its importance deserves. Tabular figures
                so 99.1 and 48.5 occupy the same width and the eye can compare
                two funds without re-measuring. */}
            <div>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-display text-[76px] leading-[0.85] text-foreground"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {composite === null ? '—' : composite.toFixed(1)}
                </span>
                <span className="text-sm text-muted-foreground">/100</span>
              </div>
              <div className="mt-3">
                <Stars rating={rating} size={20} />
              </div>
            </div>

            <div className="max-w-xl">
              <h2 className="font-display text-[28px] leading-tight text-foreground">
                {verdict.headline}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{verdict.body}</p>
              <p className="mt-3 text-sm text-muted-foreground">
                Ranked against{' '}
                <span className="text-foreground">{data.categoryStats.universeSize} similar funds</span>
                {' in the same category and plan.'}
              </p>
              {composite !== null && median !== null && (
                <CategoryScale score={composite} median={median} topQuartile={topQuartile} />
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── What's good / what to watch ───────────────────────────────── */}
      {(strengths.length > 0 || weaknesses.length > 0 || relativeWeakest !== null) && (
        <section className="grid gap-6 md:grid-cols-2">
          {/* The two cards carry opposite meanings and used to look identical.
              A single accent rule down the leading edge separates them at a
              glance without adding a second border, a badge or a tint. */}
          <div className="rounded-xl border border-border bg-card p-6 border-l-2 border-l-primary">
            <h3 className="font-display text-[18px] text-foreground">What it does well</h3>
            {strengths.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nothing stands out as a clear strength against its peers.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {strengths.map((p) => (
                  <li key={p.key} className="flex gap-3 text-sm">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      <span className="font-medium text-foreground">{p.label}</span>
                      <span className="text-muted-foreground"> — {p.meaning}.</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6 border-l-2 border-l-destructive/70">
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
                  <li key={p.key} className="flex gap-3 text-sm">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/70" />
                    <span>
                      <span className="font-medium text-foreground">{p.label}</span>
                      <span className="text-muted-foreground"> — {p.meaning}.</span>
                    </span>
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
                <div className="text-sm text-muted-foreground">{m.label}</div>
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
          {/* Cards, not a table. A table asks the reader to compare four
              columns; the decision here is "is one of these clearly better,
              and by how much". So the score gap leads, the house mark gives
              the row a scannable left edge, and the whole card is the link. */}
          <ul className="space-y-2">
            {alternatives.alternatives.map((a) => {
              const delta = num(a.compositeDelta);
              return (
                <li key={a.schemeCode}>
                  <a
                    href={`/mutual-funds/${a.schemeCode}`}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <HouseMark amcName={a.amcName} />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {a.schemeName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {a.amcName}
                      </span>
                    </span>

                    {a.rating !== null && (
                      <span className="hidden sm:block">
                        <Stars rating={a.rating} size={14} />
                      </span>
                    )}

                    <span className="w-24 text-right">
                      <span
                        className="block font-display text-[22px] leading-none text-foreground"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {num(a.composite)?.toFixed(1) ?? '—'}
                      </span>
                      {delta !== null && (
                        <span className="mt-1 block text-xs text-primary">
                          {delta.toFixed(1)} higher
                        </span>
                      )}
                    </span>

                    {anyCostKnown && (
                      <span className="hidden w-28 text-right text-sm md:block">
                        {a.terPct === null ? (
                          <span className="text-muted-foreground">cost unknown</span>
                        ) : (
                          <>
                            <span className="text-foreground">{num(a.terPct)!.toFixed(2)}%</span>
                            <span className="block text-xs text-muted-foreground">a year</span>
                          </>
                        )}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>

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
        Show the full calculations
      </button>
    </div>
  );
}
