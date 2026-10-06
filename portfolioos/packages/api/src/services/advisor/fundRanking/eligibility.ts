/**
 * Who is allowed into the ranking at all.
 *
 * Eligibility is a gate, not a score. A fund that fails any check is out with
 * a typed reason — it does not get a low score and a chance to win anyway.
 * Two of these are absolute regardless of how good the numbers look:
 *
 *   - REGULAR PLANS ARE NEVER ELIGIBLE. A regular plan is the same portfolio
 *     as its direct twin with commission deducted from the investor's return.
 *     Recommending one as a SEBI-registered adviser, who is paid by the client
 *     rather than by the AMC, is indefensible.
 *   - IDCW OPTIONS ARE NEVER ELIGIBLE. An IDCW payout is the investor's own
 *     capital returned and taxed at slab. For a goal-linked plan it is strictly
 *     worse than growth.
 *
 * Where an attribute is missing, the rule is the one in DATA-INVENTORY.md: if
 * eligibility depends on it (plan, option, category, structure), the fund is
 * excluded rather than admitted on an assumption. If only a metric depends on
 * it, the metric degrades and the fund stays in.
 *
 * Pure: no DB, no clock — `asOf` is passed in.
 */

import { bucketForScheme, isPassive } from './categoryMap.js';
import { describeNavGap, largestNavGap } from './navGaps.js';
import type {
  DetailedExclusionReason,
  EligibilityResult,
  ExclusionReason,
  FundCandidate,
  FundTraits,
  MethodologyConfig,
} from './types.js';
import type { AdvisorAssetBucketValue } from '../types.js';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

/** AMFI scheme names carry the plan and option as words. This is the only
 *  place we have to read them from, so the parsing is deliberately strict:
 *  anything ambiguous returns UNKNOWN and the fund is excluded. */
const DEFAULT_MAX_NAV_GAP_TRADING_DAYS = 5;

export function readTraits(
  candidate: FundCandidate,
  asOf: Date,
  /**
   * Every date the market published a NAV on, from `buildTradingCalendar`.
   * Absent means "we were not given a calendar", and a gap cannot be measured
   * without one — `navGap` is then null and the rule does not fire. It never
   * falls back to calendar days, because that would fail funds over Diwali.
   */
  tradingDays: readonly string[] = [],
): FundTraits {
  const name = candidate.schemeName.toLowerCase();
  const header = (candidate.subCategory ?? '').toLowerCase();

  // AMFI publishes Plan and Option as their own columns now, so read those
  // where we have them and fall back to the name only for rows loaded under
  // the old six-column format. Reading a share class out of a scheme name was
  // the weakest link in the gate that keeps commission-bearing regular plans
  // out of advice; a column is not a guess.
  const planSource = candidate.planType?.toLowerCase() ?? name;
  const optionSource = candidate.optionType?.toLowerCase() ?? name;

  const plan: FundTraits['plan'] = /\bdirect\b/.test(planSource)
    ? 'DIRECT'
    : /\bregular\b/.test(planSource)
      ? 'REGULAR'
      : 'UNKNOWN';

  // IDCW is the current name; "dividend", "payout" and "reinvestment" are the
  // older ones still present in AMFI's file.
  const idcw = /\bidcw\b|\bdividend\b|\bpayout\b|\breinvest/.test(optionSource);
  const growth = /\bgrowth\b/.test(optionSource);
  const option: FundTraits['option'] = idcw ? 'IDCW' : growth ? 'GROWTH' : 'UNKNOWN';

  const structure: FundTraits['structure'] = header.includes('open ended')
    ? 'OPEN_ENDED'
    : header.includes('close ended') || header.includes('closed ended')
      ? 'CLOSE_ENDED'
      : header.includes('interval')
        ? 'CLOSE_ENDED'
        : 'UNKNOWN';

  const sorted = [...candidate.navHistory]
    .filter((p) => p && typeof p.date === 'string' && Number.isFinite(p.nav) && p.nav > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const trackRecordYears =
    first && last
      ? (new Date(last.date).getTime() - new Date(first.date).getTime()) / MS_PER_DAY / DAYS_PER_YEAR
      : null;
  const navAgeDays = last
    ? Math.floor((asOf.getTime() - new Date(last.date).getTime()) / MS_PER_DAY)
    : null;

  return {
    plan,
    option,
    structure,
    passive: isPassive(candidate.category, candidate.schemeName, candidate.subCategory),
    segregatedPortfolio: /segregated\s*portfolio/i.test(candidate.schemeName),
    trackRecordYears,
    navAgeDays,
    // Measured elsewhere when the caller could not hand us a full history
    // (the release gate); computed here otherwise.
    navGap: candidate.navGap ?? largestNavGap(sorted, tradingDays),
  };
}

export function assessEligibility(
  candidate: FundCandidate,
  bucket: AdvisorAssetBucketValue,
  config: MethodologyConfig,
  asOf: Date,
  /** The market's own trading calendar; see `readTraits`. */
  tradingDays: readonly string[] = [],
): EligibilityResult {
  const traits = readTraits(candidate, asOf, tradingDays);
  const reasons: ExclusionReason[] = [];
  const detailed: DetailedExclusionReason[] = [];

  // AMFI stops listing a scheme that has merged or wound up, and the nightly
  // universe refresh flips isActive. It is the closest thing we have to a
  // merger flag; see DATA-INVENTORY.md.
  if (!candidate.isActive) reasons.push('inactive');

  if (config.eligibility.requireDirectPlan) {
    if (traits.plan === 'REGULAR') reasons.push('regular_plan');
    else if (traits.plan === 'UNKNOWN') reasons.push('plan_unknown');
  }

  if (config.eligibility.requireGrowthOption) {
    if (traits.option === 'IDCW') reasons.push('not_growth_option');
    else if (traits.option === 'UNKNOWN') reasons.push('option_unknown');
  }

  const mapped = bucketForScheme(candidate.category, candidate.subCategory, candidate.schemeName);
  if (mapped == null) reasons.push('category_unknown');
  else if (mapped !== bucket) reasons.push('category_not_in_bucket');

  // A close-ended scheme cannot be bought today and cannot take a SIP, so
  // recommending one is advice nobody can act on.
  if (config.eligibility.requireOpenEnded && traits.structure === 'CLOSE_ENDED') {
    reasons.push('close_ended');
  }

  if (traits.segregatedPortfolio) reasons.push('segregated_portfolio');

  if (traits.trackRecordYears == null) {
    // No NAV history at all: either an NFO or a scheme we have never priced.
    // Both mean there is nothing to rank.
    reasons.push('nfo_or_no_history');
  } else {
    const required = traits.passive
      ? config.eligibility.minTrackRecordYearsPassive
      : config.eligibility.minTrackRecordYearsActive;
    if (traits.trackRecordYears < required) reasons.push('track_record_too_short');
  }

  // A scheme whose NAV stopped updating is usually one that merged away
  // before our universe refresh noticed. Sizing a trade against a stale NAV
  // is the same mistake `priceStale` guards against for holdings.
  if (traits.navAgeDays != null && traits.navAgeDays > config.eligibility.maxNavStalenessDays) {
    reasons.push('nav_stale');
  }

  // A hole in the MIDDLE of the history. `nav_stale` catches a fund that
  // stopped and never restarted; this one catches the fund that stopped and
  // came back, which looks healthy at both ends while every metric computed
  // across the hole is quietly wrong.
  const maxGap = config.eligibility.maxNavGapTradingDays ?? DEFAULT_MAX_NAV_GAP_TRADING_DAYS;
  if (traits.navGap && traits.navGap.tradingDaysMissing > maxGap) {
    reasons.push('nav_history_gap');
    detailed.push({ reason: 'nav_history_gap', ...traits.navGap });
  }

  // Size. v1 could only apply this when a figure happened to exist, because
  // there was no AUM source at all; v2 has AMFI's scheme-wise AAUM, so a
  // scheme we cannot size is one we cannot honestly rank — a fund whose size
  // is unknown might be the one where a single redemption moves the portfolio.
  if (candidate.aumInr == null) {
    if (config.eligibility.requireAum) reasons.push('aum_unknown');
  } else if (candidate.aumInr.lessThan(config.eligibility.minAumInr)) {
    reasons.push('aum_below_floor');
  }

  // The plain tokens, plus the evidence for any reason that carries some.
  // `nav_history_gap` appears once, as the object: duplicating it as a bare
  // token too would make it the only reason counted twice.
  const withEvidence = new Set(detailed.map((d) => (typeof d === 'string' ? d : d.reason)));
  const detailedReasons: DetailedExclusionReason[] = [
    ...reasons.filter((r) => !withEvidence.has(r)),
    ...detailed,
  ];

  return { eligible: reasons.length === 0, reasons, traits, detailedReasons };
}

/** For logs: "nav_history_gap 2026-03-04..2026-04-02 (18 trading days)". */
export function describeReason(reason: DetailedExclusionReason): string {
  return typeof reason === 'string' ? reason : `${reason.reason} ${describeNavGap(reason)}`;
}
