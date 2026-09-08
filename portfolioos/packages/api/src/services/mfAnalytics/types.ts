/**
 * The MF analytics findings engine's shared contract (`docs/mf-analytics/
 * 05-FINDINGS-ENGINE.md §2-§3`).
 *
 * This file is a deliberate mirror of `services/advisor/types.ts`. Every rule,
 * the verdict table and the orchestrator agree on the shapes here, and nothing
 * in this file touches the database or the clock: `MfAnalysisFacts` is
 * assembled once by `mfFacts.builder.ts` and handed to rules as immutable
 * input.
 *
 * The reason rules receive facts rather than fetching for themselves is the
 * same one `CONTEXT.md §9.8` gives for the advisor engine, and it is worth
 * restating because it is the single load-bearing decision in this layer:
 *
 *   **A rule that can query is a rule that cannot be unit-tested without a
 *   database, and an advice engine whose rules cannot be tested is one whose
 *   output cannot be defended.**
 *
 * There is a second, sharper reason here that the advisor does not have.
 * `MfAnalysisFacts` is snapshotted verbatim onto `MfAnalysisRun.factsSnapshot`
 * so a stored run can be **replayed** against a newer rule version without
 * recomputing a single metric (`05 §2`, `05 §8.8`). That replay is how a
 * threshold change gets tested against real historical runs before it is
 * shipped. It only works if the facts are a closed, self-describing,
 * JSON-round-trippable value — which is why every numeric below is a Decimal
 * *string*, every date an ISO *string*, and why `mfFacts.builder.ts` asserts
 * the round trip rather than hoping for it.
 */

import type {
  MfCurrentProfile,
  MfEvidence,
  MfFinding,
  MfFindingCategory,
  MfFindingSeverity,
  MfHeldFundDto,
  MfHorizonMetrics,
  MfHorizonYears,
  MfPeerPercentiles,
  MfPlanType,
  MfPortfolioAnalysisDto,
  MfQualitativeFactDto,
  MfRuleConstants,
  MfSchemeMetaDto,
  MfSchemeScoreDto,
  Pct,
  Ratio,
} from '@portfolioos/shared';
import { serializeRatio, toDecimal } from '@portfolioos/shared';
import type { SebiSubCategory } from '@portfolioos/shared';
import type { EffectiveScope } from '../familyScope.service.js';
import type { RiskCategoryValue } from '../riskProfileMath.js';

// ---------------------------------------------------------------------------
// Horizon keys
// ---------------------------------------------------------------------------

/**
 * `05 §2` writes the per-horizon maps as `Record<1|3|5|7|10, …>`. They are
 * declared here with **template-literal string keys** instead, because that is
 * what the value actually is once it has been through JSON.
 *
 * JavaScript object keys are strings regardless of how they were written, so
 * `{1: x}` and `{'1': x}` are the same object at runtime and
 * `JSON.parse(JSON.stringify(…))` returns the string-keyed form either way.
 * Declaring numeric keys would therefore describe a shape the snapshot can
 * never hold, and `Object.keys()` over it would be typed `string[]` and need a
 * cast at every use site. `MfFundAnalyticsDto` in `@portfolioos/shared`
 * already uses exactly this form for the same maps, so this also keeps the
 * facts and the API DTO indexable by the same key.
 */
export type MfHorizonKey = `${MfHorizonYears}`;

/** The five reporting horizons as fact-map keys, in ascending order. */
export const MF_HORIZON_KEYS: readonly MfHorizonKey[] = ['1', '3', '5', '7', '10'] as const;

// ---------------------------------------------------------------------------
// Facts (`05 §2`)
// ---------------------------------------------------------------------------

/**
 * Everything the engine knows about one scheme the user holds.
 *
 * `meta` and `score` are copied from the `04` analysis rather than re-queried:
 * `MfHeldFundDto` already carries both, and a fund whose meta on the summary
 * row disagreed with its meta in the facts would be undebuggable.
 *
 * Every map is **total** over its key space — a horizon with no metrics row is
 * present with the value `null`, not absent. `05 §4`'s rules distinguish "we
 * have no 10-year history" from "we did not look", and an absent key cannot
 * express the first without ambiguity. It also keeps the snapshot's shape
 * stable across runs, which is what makes two runs diffable.
 */
export interface MfFundFacts {
  meta: MfSchemeMetaDto;
  /** Null when the scheme has never been scored (new fund, tiny universe). */
  score: MfSchemeScoreDto | null;
  /** Latest row at or before `asOf` per horizon. Null = no row, not zero. */
  metrics: Record<MfHorizonKey, MfHorizonMetrics | null>;
  /** The horizon-0 row (`02 §7`): current portfolio + structural profile. */
  profile: MfCurrentProfile | null;
  /** Peer percentiles per horizon. Null where the universe was too small. */
  peer: Record<MfHorizonKey, MfPeerPercentiles | null>;
  /** Admin-curated facts in force at `asOf` (`01 §2`). Never null; may be []. */
  qualitative: MfQualitativeFactDto[];
  /** This user's (or household's) position: lots, XIRR, timing gap. */
  held: MfHeldFundDto;
  categoryStats: MfCategoryStatsFacts;
}

/**
 * Where this fund's universe sits, so a rule can say "top-quartile funds in
 * this category score 78" without a second query.
 *
 * `universeKey` is not in `05 §2`'s literal shape and is carried anyway: a
 * percentile with no universe attached is the exact failure
 * `MfPeerRank.universeSize`'s schema comment warns about, and a finding that
 * cannot name the peer group it compared against cannot be disputed by the
 * person reading it.
 *
 * All three of `medianComposite`, `topQuartileComposite` and `universeSize`
 * describe the **rated** members of the universe only. An unrated fund has no
 * composite, and including it as a zero would drag the median toward a value
 * no fund actually scored.
 */
export interface MfCategoryStatsFacts {
  /** `"<sebiSubCategory>|<planType>"` (`03 §1`). Null when the fund is unscored. */
  universeKey: string | null;
  /** Rated members of the universe at `asOf`. 0 is a real answer here. */
  universeSize: number;
  /** Null when fewer than `MIN_UNIVERSE_SIZE` rated members — never 0. */
  medianComposite: Ratio | null;
  /** The 75th-percentile composite. Null under the same condition. */
  topQuartileComposite: Ratio | null;
}

/**
 * One entry from the adviser-curated buy-side list, flattened with everything
 * the verdict table needs to justify naming it as a replacement (`05 §5`
 * row 3: same sub-category, rating >= 4).
 *
 * The scheme-side columns are denormalised on purpose. `mfVerdict.ts` is a
 * **pure function of findings + facts**, so it cannot go and look up the
 * candidate's rating; if that lookup is not in the facts, the only ways to
 * write row 3 are to make the verdict impure or to guess. Both are worse.
 */
export interface AdvisorApprovedProductFacts {
  approvedProductId: string;
  /** `AdvisorAssetBucket` as a string — this layer never branches on it. */
  bucket: string;
  /** Adviser's own ordering within the bucket. Lower is more preferred. */
  rank: number;
  label: string;
  fundId: string | null;
  /** Null when the approved product is not a mutual fund, or is unmapped. */
  schemeCode: string | null;
  schemeName: string | null;
  sebiSubCategory: SebiSubCategory | 'UNMAPPED' | null;
  planType: MfPlanType | null;
  /** 1-5. Null unless the candidate is RATED — never defaulted to 3. */
  rating: 1 | 2 | 3 | 4 | 5 | null;
  composite: Ratio | null;
  /** Latest TER in force at `asOf`. Null means unknown, never "free". */
  terPct: Pct | null;
}

/**
 * The caller's risk assessment, as much of it as bears on a finding.
 *
 * `05 §2` names the type but not its fields. It is kept to what `05 §4`
 * actually consumes — `RISK_PROFILE_MISMATCH` needs the category and nothing
 * else — plus the provenance a finding must cite to be arguable: which
 * assessment, taken when.
 *
 * NOTE for rule authors: `05 §4` phrases the mismatch trigger as "user risk
 * profile <= MODERATE". This codebase has no MODERATE. `RiskCategoryValue` is
 * `CONSERVATIVE | BALANCED | GROWTH | AGGRESSIVE` (`riskProfileMath.ts`), and
 * BALANCED is the band the doc's MODERATE describes. Resolve that in the rule,
 * against this field, and say so in its comment; do not invent a fifth
 * category here.
 */
export interface RiskProfileFacts {
  assessmentId: string;
  category: RiskCategoryValue;
  /** ISO date-time the questionnaire was submitted. */
  assessedAt: string;
  /** Percentage points. Null when the user has not told us — never 30. */
  taxSlabPct: number | null;
  age: number | null;
}

/**
 * One ACTIVE goal, in the shape a horizon-suitability rule needs.
 *
 * The *fit* of the user's funds to each goal is already computed by `04 §6`
 * and arrives on `facts.portfolio.goals` as `MfGoalFitDto[]`. This is the raw
 * goal beside it, so a rule can talk about a goal the fit list dropped (one
 * with no linked portfolios, say) instead of silently having no opinion.
 */
export interface GoalFacts {
  goalId: string;
  name: string;
  category: string;
  priority: string;
  /** ISO date. */
  targetDate: string;
  /** Years from `asOf` to `targetDate`. Negative for an overdue goal. */
  horizonYears: Ratio;
  targetAmount: string;
  currentValue: string;
  /** Portfolios the goal is funded from. Empty = not linked to anything. */
  portfolioIds: string[];
}

/**
 * The immutable input to every rule, assembled once per run.
 *
 * Snapshotted verbatim onto `MfAnalysisRun.factsSnapshot`. Everything in here
 * is JSON-safe by construction: strings, numbers, booleans, nulls, arrays and
 * plain objects. No `Date`, no `Decimal`, no `undefined`. `mfFacts.builder.ts`
 * enforces that at the boundary and `mfFacts.builder.test.ts` proves it.
 */
export interface MfAnalysisFacts {
  /** ISO date-time. Every time-dependent rule reads this, never `Date.now()`. */
  asOf: string;
  /** The caller. In a family view this is the viewer, not the fund's owner. */
  userId: string;
  /**
   * The visibility scope the analysis ran under (`CONTEXT.md §6`).
   *
   * Snapshotted because a finding computed over a *restricted* household view
   * is a finding about a floor, and a replay six months later must be able to
   * tell that from a finding about a complete book. `facts.portfolio.scope`
   * carries the user-facing honesty flags; this carries the caps that produced
   * them.
   */
  scope: EffectiveScope;
  /**
   * Thresholds, passed through facts rather than imported by rules so a test
   * can move one boundary without touching production calibration (`05 §4`).
   */
  constants: MfRuleConstants;
  /** The full `04` analysis, including `runId`, totals, lots, overlap and tax. */
  portfolio: MfPortfolioAnalysisDto;
  /** Keyed by `schemeCode`. Empty object when the user holds no funds. */
  funds: Record<string, MfFundFacts>;
  /** Adviser-curated replacement candidates. Empty = nothing approved yet. */
  approvedUniverse: AdvisorApprovedProductFacts[];
  userProfile: {
    /** Null, not absent: `05 §2` writes it optional, but an absent key cannot
     *  survive `JSON.stringify` as a distinguishable value and a rule that
     *  branches on "no profile" needs it to be explicit. */
    riskProfile: RiskProfileFacts | null;
    goals: GoalFacts[];
    /**
     * Whether we have any income on file at all. `false` is a licence to say
     * "we cannot size this for you"; it is never a licence to treat income as
     * zero (`CONTEXT.md §6` — "Income not on file", never ₹0).
     */
    incomeKnown: boolean;
  };
}

// ---------------------------------------------------------------------------
// Rule contract (`05 §3`)
// ---------------------------------------------------------------------------

/**
 * What a rule is.
 *
 * Adding rule #34 means writing one file that exports this and appending it to
 * `rules/registry.ts` — no engine change, and the coverage and purity suites
 * pick it up automatically.
 *
 * `evaluate` is **synchronous and pure**: no `await`, no I/O, no `Date.now()`,
 * no randomness, no mutation of `facts`. The signature enforces the first
 * (there is no `Promise` in the return type) and
 * `test/invariants/mf-rules-pure.test.ts` enforces the rest statically, by
 * reading what the rule module is allowed to import.
 */
export interface MfRule {
  /** Dotted, stable, and never reused: `"mf.cost.regular-plan"`. */
  id: string;
  /**
   * Bump on **any** threshold or logic change that could alter output for
   * identical facts. It is stamped onto every finding, so advice a user was
   * shown last quarter stays reconstructable under the rules that produced it.
   */
  version: string;
  /** FUND rules get a `schemeCode`; PORTFOLIO rules are called once. */
  scope: 'FUND' | 'PORTFOLIO';
  category: MfFindingCategory;
  /** Pure, synchronous, no I/O. `schemeCode` is set iff `scope === 'FUND'`. */
  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[];
}

// ---------------------------------------------------------------------------
// Finding construction
// ---------------------------------------------------------------------------

/** The parts of an `MfFinding` a rule actually authors. */
export interface MfFindingInput {
  ruleId: string;
  ruleVersion: string;
  /** Null for a portfolio-scope finding. */
  schemeCode: string | null;
  /** The stable code, e.g. `HIGH_DOWN_CAPTURE`. Used as a verdict reason. */
  code: string;
  category: MfFindingCategory;
  severity: MfFindingSeverity;
  confidence: Ratio;
  /** <= 120 chars, filled from a deterministic template. Never LLM-written. */
  headline: string;
  /** At least one cited number. See the throw below for why. */
  evidence: MfEvidence[];
  /** Mandatory and non-empty. See the throw below for why. */
  whatWouldChangeThis: string;
}

/** `MfFinding.headline` is capped at this in `05 §1`'s schema comment. */
export const MF_HEADLINE_MAX_CHARS = 120;

/**
 * Build an `MfFinding`, refusing to build an indefensible one.
 *
 * Four things are enforced here rather than left to review, because each has a
 * failure mode that is invisible once the finding reaches a user:
 *
 *  1. **`whatWouldChangeThis` is non-empty.** `05 §3` makes it mandatory. A
 *     finding that cannot say what would clear it is an opinion, not an
 *     observation: the user can neither act on it nor argue with it, and the
 *     next run has no way to show progress. This is the whole reason the
 *     helper throws instead of defaulting.
 *  2. **`evidence` is non-empty.** A finding is only as good as the numbers
 *     behind it (`05 §3`). Without evidence the prose verifier in `05 §6` has
 *     nothing to check the LLM's numbers against, so an unevidenced finding
 *     silently disables the one mechanism that stops the narrative inventing
 *     figures.
 *  3. **`headline` fits.** The column is sized for it and the UI truncates;
 *     a headline whose number falls off the end is worse than no headline.
 *  4. **`confidence` is in [0, 1].** It is a `Decimal(12,6)` fraction, not a
 *     percentage. A 70 here would render as certainty on every surface.
 *
 * `runId` comes from `facts.portfolio.runId` — the engine passes the real run
 * id into `computeMfPortfolioAnalysis`, so the analysis and its findings are
 * stamped with one id from one place.
 *
 * `createdAt` is `facts.asOf`, **not** the wall clock. A rule that reads the
 * clock is not replayable: re-running a stored `factsSnapshot` would produce
 * findings that differ from the originals in a field, and `05 §8.5`'s
 * supersede test ("first row byte-identical") could never pass.
 *
 * `id` is a deterministic composite of rule, scheme and code rather than a
 * random cuid, for the same reason: it makes the same finding from the same
 * facts the same value. The engine replaces it with the database id on
 * insert; until then it doubles as the natural dedupe key.
 */
export function makeFinding(facts: MfAnalysisFacts, input: MfFindingInput): MfFinding {
  const counterfactual = input.whatWouldChangeThis.trim();
  if (counterfactual.length === 0) {
    throw new Error(
      `[${input.ruleId}] finding ${input.code} has an empty whatWouldChangeThis. ` +
        '05 §3 makes it mandatory: a finding that cannot say what would clear it ' +
        'is an opinion, not an observation.',
    );
  }

  if (input.evidence.length === 0) {
    throw new Error(
      `[${input.ruleId}] finding ${input.code} cites no evidence. A finding is only ` +
        'as good as the numbers behind it, and the prose verifier (05 §6) has ' +
        'nothing to check the narrative against without them.',
    );
  }

  const headline = input.headline.trim();
  if (headline.length === 0 || headline.length > MF_HEADLINE_MAX_CHARS) {
    throw new Error(
      `[${input.ruleId}] finding ${input.code} headline must be 1-${MF_HEADLINE_MAX_CHARS} ` +
        `characters, got ${headline.length}.`,
    );
  }

  const confidence = toDecimal(input.confidence);
  if (confidence.lessThan(0) || confidence.greaterThan(1)) {
    throw new Error(
      `[${input.ruleId}] finding ${input.code} confidence must be a fraction in [0,1], ` +
        `got ${input.confidence}. It is a Ratio, not a percentage.`,
    );
  }

  return {
    id: `${input.ruleId}@${input.ruleVersion}:${input.schemeCode ?? '-'}:${input.code}`,
    runId: facts.portfolio.runId,
    schemeCode: input.schemeCode,
    ruleId: input.ruleId,
    ruleVersion: input.ruleVersion,
    code: input.code,
    category: input.category,
    severity: input.severity,
    confidence: input.confidence,
    headline,
    evidence: input.evidence,
    whatWouldChangeThis: counterfactual,
    createdAt: facts.asOf,
  };
}

// ---------------------------------------------------------------------------
// Confidence (`05 §4`)
// ---------------------------------------------------------------------------

/**
 * How much history each horizon buys.
 *
 * `05 §4` gives two anchors — "10y data => 1.0, 3y only => 0.7" — and leaves
 * the rest. The values between them are a straight interpolation, and 1y is
 * pinned at the same 0.5 as a missing benchmark because a single year of
 * history and no benchmark are equally weak grounds for a relative claim.
 *
 * These are *evidence-quality* weights, not probabilities. They say how much
 * of the fund's life the finding actually looked at, nothing more.
 */
const CONFIDENCE_BY_HORIZON: Readonly<Record<MfHorizonKey, string>> = Object.freeze({
  '1': '0.5',
  '3': '0.7',
  '5': '0.85',
  '7': '0.9',
  '10': '1',
});

/** No horizon at all: the finding rests on a structural fact, not a series. */
const CONFIDENCE_NO_HORIZON = '0.6';

/** `05 §4`: "benchmark missing => 0.5". A ceiling, not a branch — see below. */
const CONFIDENCE_BENCHMARK_MISSING = '0.5';

export interface ConfidenceInput {
  /**
   * The **longest** horizon the finding's evidence actually rests on. Null for
   * a finding with no return series behind it at all (a TER comparison, a
   * manager change), which lands at `CONFIDENCE_NO_HORIZON`.
   */
  horizonYears?: MfHorizonYears | null;
  /**
   * Whether a benchmark was available for the metrics cited. Defaults to
   * `true`, so only rules that genuinely cite a benchmark-relative metric
   * (alpha, capture, tracking error, batting average) need to pass it.
   */
  benchmarkAvailable?: boolean;
}

/**
 * `05 §4`'s confidence scaling, in one place so 33 rules cannot drift apart.
 *
 * The benchmark term is a **ceiling**, applied with `min`, not an alternative
 * branch. A down-capture finding computed over ten years against a benchmark
 * we do not have is not a 1.0 finding — it is 0.5, because the number it cites
 * is only as trustworthy as its weakest input. Taking the max, or letting the
 * horizon win, would let the longest series launder a missing comparison.
 */
export function confidenceFor(input: ConfidenceInput = {}): Ratio {
  const horizon = input.horizonYears ?? null;
  const fromHorizon =
    horizon === null ? CONFIDENCE_NO_HORIZON : CONFIDENCE_BY_HORIZON[`${horizon}`];

  const benchmarkAvailable = input.benchmarkAvailable ?? true;
  const ceiling = benchmarkAvailable ? '1' : CONFIDENCE_BENCHMARK_MISSING;

  return serializeRatio(minDecimalString(fromHorizon, ceiling));
}

/**
 * The smaller of two decimal strings, compared as `Decimal`.
 *
 * `toDecimal` is the sanctioned entry point for money- and ratio-shaped
 * arithmetic (`CONTEXT.md §3.1`); comparing the strings directly would order
 * "0.85" before "0.9" lexicographically, which is exactly the wrong answer.
 */
function minDecimalString(a: string, b: string): string {
  return toDecimal(a).lessThanOrEqualTo(toDecimal(b)) ? a : b;
}
