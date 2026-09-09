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
  const weaknesses = scored.filter((p) => p.score < 0.4).sort((a, b) => a.score - b.score);

  // Only when nothing is weak in absolute terms, and only with something to
  // rank against.
  const ranked = [...informative].sort((a, b) => a.score - b.score);
  const relativeWeakest =
    weaknesses.length === 0 && ranked.length >= 2 ? (ranked[0] ?? null) : null;

  // A pillar can clear the strength bar AND still be the lowest of them — on a
  // five-star fund every pillar does. Listing it in both places rendered
  // "Protection in falls" twice on the same screen, once as something the fund
  // does well and once as its weak side. The weaker statement is the more
  // useful one, so the pillar is claimed by `relativeWeakest` and dropped from
  // the strengths rather than appearing in both.
  const strengths = informative
    .filter((p) => p.score >= 0.6 && p.key !== relativeWeakest?.key)
    .sort((a, b) => b.score - a.score);

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

/**
 * Longest first: the rolling stats on the 10-year row were computed over the
 * 10-year window and know every completed period in it, while the 3-year row
 * only knows the periods inside its own three years. Taking the longest is
 * taking the fullest account of the fund's record.
 */
const ROLLING_HORIZON_PREFERENCE: MfHorizonYears[] = [10, 7, 5, 3, 1];

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
 * What colour a score is printed in.
 *
 * Tied to the STAR BANDS, not to round numbers. The composite is a percentile
 * blend, so 60 means nothing fixed — in a tight liquid-fund category the top
 * quarter starts at 56, in a spread-out equity one at 67. Colouring on
 * arbitrary thresholds would call the same fund good in one category and
 * average in another, which is exactly the error the rating exists to prevent.
 * The bands already encode "against its peers", so the colour follows them.
 *
 * The green stop is `--accent`, NOT `--primary`. In this theme `--primary` is
 * near-white (0 0% 96%) and `--accent` carries the signature lime; reading the
 * names the other way round printed every four- and five-star score in plain
 * white and cost the scale its top stop entirely.
 *
 * Amber is a literal because the palette has no mid state — a three-stop scale
 * needs something between lime and coral that belongs to neither.
 */
const SCORE_AMBER = 'hsl(38 92% 62%)';

function scoreColor(rating: number | null): string | undefined {
  if (rating === null) return undefined;
  if (rating >= 4) return 'hsl(var(--accent))';
  if (rating === 3) return SCORE_AMBER;
  return 'hsl(var(--destructive))';
}

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
  markColor,
}: {
  score: number;
  median: number;
  topQuartile: number | null;
  markColor?: string;
}) {
  /**
   * The axis is the category's range, not 0–100.
   *
   * Drawn full-scale, a liquid-fund page put the median at 52, the top quarter
   * at 56 and this fund at 54.3 — three marks inside four points of a hundred,
   * so the fund sat on top of the median and the labels collided. Eighty per
   * cent of the width carried no information while the part that did was
   * unreadable.
   *
   * The window is centred on the median and widened to hold every mark with
   * room to spare. `MIN_SPAN` stops the opposite failure: when a fund really is
   * a hair from the median, a window that hugged the marks would magnify a
   * rounding difference into a visible gap and claim a distinction the numbers
   * do not support.
   */
  const MIN_SPAN = 12;
  const marks = [score, median, ...(topQuartile === null ? [] : [topQuartile])];
  const reach = Math.max(...marks.map((m) => Math.abs(m - median)));
  const half = Math.max(MIN_SPAN / 2, reach * 1.7);
  const lo = median - half;
  const hi = median + half;
  const at = (v: number) => Math.max(1, Math.min(99, ((v - lo) / (hi - lo)) * 100));

  const scoreAt = at(score);
  const medianAt = at(median);
  const tqAt = topQuartile === null ? null : at(topQuartile);
  // Only stagger when the labels would actually overlap.
  const crowded = tqAt !== null && Math.abs(tqAt - medianAt) < 22;

  return (
    <div>
      <div className="relative h-[3px] w-full rounded-full bg-muted">
        {tqAt !== null && (
          <div
            className="absolute inset-y-0 rounded-full bg-accent/25"
            style={{ left: `${tqAt}%`, right: 0 }}
          />
        )}
        <div
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-muted-foreground/60"
          style={{ left: `${medianAt}%` }}
        />
        <div
          className="absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-background"
          style={{ left: `${scoreAt}%`, backgroundColor: markColor }}
        />
      </div>

      <div className="relative mt-2 h-4 text-[12px] text-muted-foreground">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${medianAt}%` }}>
          median {median.toFixed(0)}
        </span>
        {tqAt !== null && !crowded && (
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${tqAt}%` }}>
            top quarter {topQuartile!.toFixed(0)}
          </span>
        )}
      </div>
      {tqAt !== null && crowded && (
        <div className="relative h-4 text-[12px] text-muted-foreground">
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${tqAt}%` }}>
            top quarter {topQuartile!.toFixed(0)}
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

/**
 * What holding this fund has actually meant, over every period in its record.
 *
 * ---------------------------------------------------------------------------
 * WHY A RANGE OF PAST PERIODS AND NOT A PROJECTION
 * ---------------------------------------------------------------------------
 *
 * The obvious version of this panel is "your probable return over 1, 2 and 5
 * years". It cannot be built honestly. SEBI does not permit indicative-return
 * communications for mutual funds, this page's own disclaimer says no analysis
 * here predicts future returns, and a projected figure is precisely the kind of
 * confident number with nothing behind it that the rating gates exist to keep
 * out — a fund's future return is not a quantity we hold.
 *
 * What we do hold is every completed holding period in the fund's history. For
 * ICICI Prudential Large & Mid Cap that is 1,232 separate one-year periods:
 * the worst lost 3.0%, the median made 17.4%, the best made 88.5%, and 0.5% of
 * them ended below where they started. That answers the question the reader is
 * actually asking — "what might this do for me" — with the fund's own evidence
 * rather than an extrapolation, and it shows the spread, which a single
 * projected number would hide.
 *
 * The band is p10–p90 rather than min–max: one 2020 window should not set the
 * width of the whole picture, and the tails are still drawn as ticks so nothing
 * is concealed.
 */

interface RollingStatsLike {
  windowYears: 1 | 3 | 5;
  observations: number;
  median: string | null;
  min: string | null;
  max: string | null;
  p10: string | null;
  p25: string | null;
  p75: string | null;
  p90: string | null;
  pctNegative: string | null;
}

function HoldingPeriodBar({
  stats,
  lo,
  hi,
  height = 'h-6',
}: {
  stats: RollingStatsLike;
  lo: number;
  hi: number;
  height?: string;
}) {
  const at = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const p10 = num(stats.p10);
  const p90 = num(stats.p90);
  const median = num(stats.median);
  const min = num(stats.min);
  const max = num(stats.max);
  if (p10 === null || p90 === null || median === null) return null;

  return (
    <div className={`relative ${height}`}>
      {/* zero line — the difference between making and losing money */}
      {lo < 0 && hi > 0 && (
        <div
          className="absolute inset-y-0 w-px bg-border"
          style={{ left: `${at(0)}%` }}
          aria-hidden
        />
      )}
      {min !== null && max !== null && (
        <div
          className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/30"
          style={{ left: `${at(min)}%`, width: `${Math.max(0.5, at(max) - at(min))}%` }}
          aria-hidden
        />
      )}
      <div
        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted-foreground/35"
        style={{ left: `${at(p10)}%`, width: `${Math.max(1, at(p90) - at(p10))}%` }}
        aria-hidden
      />
      <div
        className="absolute top-1/2 h-[14px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${at(median)}%`, backgroundColor: median >= 0 ? 'hsl(var(--accent))' : 'hsl(var(--destructive))' }}
        aria-hidden
      />
    </div>
  );
}

/**
 * The axis every bar on the page is drawn against.
 *
 * One axis for the subject fund AND its alternatives, not one per fund. A bar
 * is only readable against its neighbours, and rescaling each fund to its own
 * extremes would draw a steady fund and a wild one at identical widths — the
 * exact comparison the panel exists to make, silently erased.
 */
export function holdingPeriodAxis(
  groups: ReadonlyArray<ReadonlyArray<RollingStatsLike>>,
): { lo: number; hi: number } | null {
  const all = groups
    .flat()
    .flatMap((r) => [num(r.min), num(r.max)].filter((v): v is number => v !== null));
  if (all.length === 0) return null;
  return { lo: Math.min(0, ...all), hi: Math.max(...all) };
}

/**
 * The same distribution at the density an alternatives row can carry.
 *
 * Full-size rows under each of three alternatives would be four near-identical
 * blocks down the page, and the reader would stop reading before the third. So
 * the label, the count and the money translation go, and what stays is the bar
 * and the typical figure — which is what the comparison turns on. The axis is
 * the subject fund's, so the bars line up column-wise: a band sitting further
 * right than the fund above it means exactly that.
 */
function HoldingPeriodsCompact({
  rolling,
  lo,
  hi,
}: {
  rolling: ReadonlyArray<RollingStatsLike>;
  lo: number;
  hi: number;
}) {
  const usable = rolling.filter((r) => num(r.median) !== null && r.observations > 0);
  if (usable.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {usable.map((r) => {
        const median = num(r.median)!;
        return (
          <div key={r.windowYears} className="flex items-center gap-3">
            <span className="w-6 shrink-0 text-[12px] text-muted-foreground">
              {r.windowYears}y
            </span>
            <span className="min-w-0 flex-1">
              <HoldingPeriodBar stats={r} lo={lo} hi={hi} height="h-4" />
            </span>
            <span
              className="w-14 shrink-0 text-right text-[12px] text-muted-foreground"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {(median * 100).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HoldingPeriods({
  rolling,
  lo,
  hi,
  lakhs = 1,
}: {
  rolling: ReadonlyArray<RollingStatsLike>;
  lo: number;
  hi: number;
  lakhs?: number;
}) {
  const usable = rolling.filter((r) => num(r.median) !== null && r.observations > 0);
  if (usable.length === 0) return null;

  const money = (ratio: number, years: number) =>
    `₹${(lakhs * Math.pow(1 + ratio, years)).toFixed(2)}L`;

  return (
    <div className="space-y-6">
      {usable.map((r) => {
        const median = num(r.median)!;
        const p10 = num(r.p10);
        const p90 = num(r.p90);
        const neg = num(r.pctNegative);
        return (
          <div key={r.windowYears}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[15px] text-foreground">
                Held {r.windowYears} year{r.windowYears === 1 ? '' : 's'}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {r.observations.toLocaleString('en-IN')} such periods since launch
              </span>
            </div>

            <div className="mt-2">
              <HoldingPeriodBar stats={r} lo={lo} hi={hi} />
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px]">
              <span className="text-muted-foreground">
                typically{' '}
                <span
                  className="font-display text-[17px]"
                  style={{ color: median >= 0 ? 'hsl(var(--accent))' : 'hsl(var(--destructive))' }}
                >
                  {(median * 100).toFixed(1)}%
                </span>{' '}
                a year — ₹{lakhs.toFixed(0)}L became {money(median, r.windowYears)}
              </span>
              {p10 !== null && p90 !== null && (
                <span className="text-muted-foreground">
                  most landed between {(p10 * 100).toFixed(1)}% and {(p90 * 100).toFixed(1)}%
                </span>
              )}
              {neg !== null && (
                <span className="text-muted-foreground">
                  {neg <= 0
                    ? 'never ended below where it started'
                    : `ended down in ${(neg * 100).toFixed(neg < 0.01 ? 1 : 0)}% of them`}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
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

  /**
   * Rolling stats come from the LONGEST horizon that has them.
   *
   * Every horizon row carries its own copy computed over its own window, so
   * the 3-year row knows 736 one-year periods while the 10-year row knows
   * 2,463. The longest is simply the fullest account of the fund's record, and
   * a shorter one would quietly discard history the fund actually has.
   */
  const rollingSource = ROLLING_HORIZON_PREFERENCE.map((h) => data.metrics[`${h}`]).find(
    (m) => m !== undefined && m.status === 'OK' && m.returns.rolling1y !== null,
  );

  const rollingSet = rollingSource
    ? [
        rollingSource.returns.rolling1y,
        rollingSource.returns.rolling3y,
        rollingSource.returns.rolling5y,
      ].filter((r): r is NonNullable<typeof r> => r !== null)
    : [];

  // The subject and every alternative share one axis, so a band drawn further
  // right genuinely is further right.
  const rollingAxis = holdingPeriodAxis([
    rollingSet,
    ...(alternatives?.alternatives ?? []).map((a) => a.rolling),
  ]);

  const composite = num(score?.composite);
  const median = num(data.categoryStats.medianComposite);
  const topQuartile = num(data.categoryStats.topQuartileComposite);

  return (
    <div data-testid="mf-plain-overview">
      {/* Never let a borrowed rating read as this scheme's own. An IDCW option
          is not ranked — peer universes are growth-only — so its numbers come
          from the growth option of the same fund, and the reader is told before
          they read anything else. */}
      {data.analyticsFromSchemeCode !== null && (
        <p className="mb-8 border-l-2 border-l-muted-foreground/40 pl-4 text-sm text-muted-foreground">
          <span className="text-foreground">These figures are the growth option&rsquo;s.</span>{' '}
          Payout and reinvest options are not ranked separately: same portfolio, same manager,
          differing only in how it pays you. Your own returns will trail the growth figures by
          whatever has been distributed.
        </p>
      )}

      {/* ── The verdict ───────────────────────────────────────────────────
          No card. This is the page's one loud moment and it sits on the page
          ground; boxing it would make it one tile among six. */}
      {rating === null || verdict === undefined || verdict === null ? (
        <section className="border-b border-border pb-10">
          <h2 className="font-display text-[26px] text-foreground">Not rated</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {score === null
              ? 'We have not scored this fund. That is a gap in our data, not a judgement about the fund.'
              : score.ratingStatus === 'INSUFFICIENT_HISTORY'
                ? 'Not enough track record to rate it fairly yet. A rating on a short history says more about timing than about the fund.'
                : `We rate a fund only against enough peers for the comparison to mean something. Its category holds ${data.categoryStats.universeSize} scheme${data.categoryStats.universeSize === 1 ? '' : 's'} we can score, which is too few.`}
          </p>
        </section>
      ) : (
        <section className="border-b border-border pb-10">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
            <div>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-display text-[92px] leading-[0.8]"
                  style={{ fontVariantNumeric: 'tabular-nums', color: scoreColor(rating) }}
                >
                  {composite === null ? '—' : composite.toFixed(1)}
                </span>
                <span className="font-display text-[22px] leading-none text-muted-foreground">
                  /100
                </span>
              </div>
              <div className="mt-4">
                <Stars rating={rating} size={19} />
              </div>
            </div>

            <div className="max-w-lg flex-1">
              <h2 className="font-display text-[27px] leading-[1.15] text-foreground">
                {verdict.headline}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                {verdict.body}
              </p>
            </div>
          </div>

          {composite !== null && median !== null && (
            <div className="mt-9 max-w-2xl">
              <CategoryScale
                score={composite}
                median={median}
                topQuartile={topQuartile}
                markColor={scoreColor(rating)}
              />
              <p className="mt-3 text-[13px] text-muted-foreground">
                Against {data.categoryStats.universeSize} funds in {data.meta.sebiSubCategory}
                {data.meta.planType === 'DIRECT' ? ', direct plans' : ', regular plans'}.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── The assessment ────────────────────────────────────────────────
          One list, not two columns. Strengths and weaknesses are the same
          judgement read in two directions, and splitting them into matching
          boxes made the page look like a template rather than an opinion. The
          pillar name is set in the display face and its meaning in the body
          face: typographic contrast carries what an em dash was carrying. */}
      {(strengths.length > 0 || weaknesses.length > 0 || relativeWeakest !== null) && (
        <section className="border-b border-border py-10">
          <dl className="grid gap-x-12 gap-y-7 sm:grid-cols-2">
            {strengths.map((p) => (
              <div
                key={p.key}
                className="flex gap-4 rounded-lg border border-border bg-card p-5"
              >
                <div>
                  <dt className="font-display text-[17px] text-foreground">{p.label}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {p.meaning}.
                  </dd>
                </div>
              </div>
            ))}

            {weaknesses.map((p) => (
              <div
                key={p.key}
                className="flex gap-4 rounded-lg border border-border bg-card p-5"
              >
                <div>
                  <dt className="font-display text-[17px] text-foreground">{p.label}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {p.meaning}. Weaker here than most of its category.
                  </dd>
                </div>
              </div>
            ))}

            {weaknesses.length === 0 && relativeWeakest !== null && (
              <div className="flex gap-4 rounded-lg border border-border bg-card p-5">
                <div>
                  <dt className="font-display text-[17px] text-foreground">
                    {relativeWeakest.label}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {relativeWeakest.meaning}. Its weakest side, though still ahead of most of the
                    category, and not a red flag.
                  </dd>
                </div>
              </div>
            )}
          </dl>

          {unscored.length > 0 && (
            <p className="mt-8 text-[13px] leading-relaxed text-muted-foreground">
              We could not measure {unscored.join(', ').toLowerCase()}, so the rating rests on what
              is left. Shown rather than hidden: a missing input is not a pass.
            </p>
          )}
        </section>
      )}

      {/* ── The record ────────────────────────────────────────────────────
          A factsheet sets its figures in a row of columns divided by rules,
          not in tiles. Same here: the numbers belong to one statement about
          the fund, so they share one block. */}
      {metrics !== undefined && horizon !== null && (
        <section className="border-b border-border py-10">
          <div className="grid gap-y-8 sm:grid-cols-3 sm:gap-x-10 sm:divide-x sm:divide-border">
            {plainMetrics(metrics, horizon).map((m, i) => (
              <div key={m.label} className={i > 0 ? 'sm:pl-10' : undefined}>
                <div
                  className={`font-display text-[34px] leading-none ${
                    m.tone === 'good'
                      ? 'text-accent'
                      : m.tone === 'bad'
                        ? 'text-destructive'
                        : 'text-foreground'
                  }`}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {m.value}
                </div>
                <div className="mt-2 text-[15px] text-foreground">{m.label}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.help}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── What holding it has meant ─────────────────────────────────────
          Not a forecast. Every completed holding period the fund has had, with
          the spread a single number would hide. */}
      {rollingSet.length > 0 && rollingAxis !== null && (
        <section className="border-b border-border py-10">
          <h3 className="font-display text-[19px] text-foreground">
            What holding it has meant
          </h3>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Every completed holding period since launch, not a forecast. The bar shows where most
            periods landed; the line through it is the typical one. What the fund does next is not
            something this or any page can know.
          </p>
          <div className="mt-7">
            <HoldingPeriods rolling={rollingSet} lo={rollingAxis.lo} hi={rollingAxis.hi} />
          </div>
        </section>
      )}

      {/* ── The alternatives ──────────────────────────────────────────────
          Hairline rows, not cards: this is a ranked list read top to bottom,
          and a border around each entry fights the ordering it is meant to
          show. */}
      {alternatives !== null && alternatives.alternatives.length > 0 && (
        <section className="border-b border-border py-10">
          <h3 className="font-display text-[19px] text-foreground">Better-scoring funds here</h3>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Same category, same plan, same scoring. A comparison, not advice to switch: moving
            funds can trigger an exit load and a tax bill this page cannot see.
          </p>

          <ul className="mt-6 divide-y divide-border border-y border-border">
            {alternatives.alternatives.map((a) => {
              const delta = num(a.compositeDelta);
              return (
                <li key={a.schemeCode}>
                  <a
                    href={`/mutual-funds/${a.schemeCode}`}
                    className="group flex items-center gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <HouseMark amcName={a.amcName} />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-foreground group-hover:underline group-hover:underline-offset-4">
                        {a.schemeName}
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {a.amcName}
                      </span>
                    </span>

                    {a.rating !== null && (
                      <span className="hidden sm:block">
                        <Stars rating={a.rating} size={13} />
                      </span>
                    )}

                    {anyCostKnown && (
                      <span className="hidden w-24 text-right text-[13px] text-muted-foreground md:block">
                        {a.terPct === null ? 'cost unknown' : `${num(a.terPct)!.toFixed(2)}% a year`}
                      </span>
                    )}

                    <span className="w-24 text-right">
                      <span
                        className="block font-display text-[24px] leading-none"
                        style={{ fontVariantNumeric: 'tabular-nums', color: scoreColor(a.rating) }}
                      >
                        {num(a.composite)?.toFixed(1) ?? '—'}
                      </span>
                      {delta !== null && (
                        <span className="mt-1 block text-[12px] text-accent">
                          +{delta.toFixed(1)}
                        </span>
                      )}
                    </span>
                  </a>

                  {rollingAxis !== null && a.rolling.length > 0 && (
                    <div className="pb-4 pl-[52px] pr-1">
                      <HoldingPeriodsCompact
                        rolling={a.rolling}
                        lo={rollingAxis.lo}
                        hi={rollingAxis.hi}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {rollingAxis !== null &&
            alternatives.alternatives.some((a) => a.rolling.length > 0) && (
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                The bars under each fund are its own completed 1, 3 and 5-year holding periods,
                drawn on the same scale as this fund&rsquo;s above, so they can be read against
                each other.
              </p>
            )}

          {alternatives.subjectTerPct !== null ? (
            <p className="mt-4 text-[13px] text-muted-foreground">
              This fund charges {num(alternatives.subjectTerPct)!.toFixed(2)}% a year.
            </p>
          ) : (
            <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              We hold no expense ratios for these funds, so cost is not compared. It is one of the
              strongest predictors of long-term return, and worth checking on each AMC&rsquo;s own
              factsheet.
            </p>
          )}
        </section>
      )}

      {alternatives !== null &&
        alternatives.alternatives.length === 0 &&
        alternatives.subjectComposite !== null && (
          <section className="border-b border-border py-10">
            <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              <span className="text-foreground">Nothing in its category scores higher.</span> Of
              the {alternatives.universeSize} funds we can rate here, none beats it.
            </p>
          </section>
        )}

      <button
        type="button"
        onClick={onShowDetail}
        className="mt-8 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Show the full calculations
      </button>
    </div>
  );
}
