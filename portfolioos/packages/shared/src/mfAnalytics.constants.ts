/**
 * Calibration and compliance constants for the mutual fund analytics layer
 * (`docs/mf-analytics/`).
 *
 * Everything here is a *decision*, not an implementation detail. Each
 * threshold below decides whether a real person is told their fund is
 * underperforming, so the full set lives in one reviewable file rather than
 * inline in the rule that uses it — the convention `services/advisor/
 * constants.ts` and `healthScoreMath.WEIGHTS` already set.
 *
 * This file lives in `packages/shared` rather than beside the rules in
 * `packages/api` because the frontend needs the same numbers to render "would
 * clear at a TER ≤ …" copy and threshold markers on charts. A second copy on
 * the client is how the explanation and the finding start disagreeing.
 */

/**
 * The single disclaimer shown on every MF analytics surface
 * (`06-QUALITY-COMPLIANCE.md §4`).
 *
 * It is ONE constant, not a per-page string, precisely because SEBI's
 * expectation is that the disclosure is uniform wherever a scheme is
 * presented. Per-page copies drift — one page gets reworded, another keeps the
 * old text, and the product now makes two different claims about the same
 * rating. Import this; never retype it.
 */
import { REBALANCE_BAND_PP, LIQUID_BUFFER_ALARM_MONTHS } from './finance/planningBands.js';

export const MF_ANALYTICS_DISCLAIMER =
  'Past performance does not guarantee future returns, and no analysis here ' +
  'predicts them. Scores and ratings are relative measures: a fund is ranked ' +
  'only against the other schemes in its own SEBI category and plan type, so ' +
  'a 5-star fund in a weak category may still lose money. Figures are derived ' +
  'from published NAVs, portfolio disclosures and factsheets, and may lag or ' +
  'differ from your account statement. This is research and information for ' +
  'your own decision-making, not a recommendation to buy, sell or hold any ' +
  'scheme, unless a section is explicitly marked as a recommendation. Mutual ' +
  'fund investments are subject to market risks; read all scheme related ' +
  'documents carefully.';

/**
 * A scheme needs this much NAV history before it may be rated at all
 * (`00-README.md` invariant 2). Below it, metrics are computed where they can
 * be and `rating` is null with `ratingStatus: 'INSUFFICIENT_HISTORY'`.
 *
 * 36 months is not arbitrary: the risk metrics that carry most of the score
 * (down-capture, Sortino, rolling-window consistency) need at least one full
 * drawdown-and-recovery cycle to mean anything, and a 3-year window is the
 * shortest that reliably contains one in Indian equity markets. A rating from
 * 18 months of a rising market is a momentum reading wearing a quality label.
 */
export const MIN_RATING_HISTORY_MONTHS = 36;

/**
 * A category universe smaller than this does not get percentile ranks
 * (`00-README.md` invariant 3, `03-SCORING.md`).
 *
 * With 8 schemes a "top decile" is one fund and moving one place changes the
 * percentile by 12 points; the rank would be noise reported to two decimals.
 * Such categories still get metrics and findings, just no peer-relative claim.
 */
export const MIN_UNIVERSE_SIZE = 10;

/**
 * The §112A annual exemption is deliberately NOT a constant here.
 *
 * It is financial-year dependent — ₹1,00,000 through FY 2023-24, ₹1,25,000
 * from FY 2024-25 (Finance (No. 2) Act 2024) — so a single value is wrong for
 * roughly half the years any user has gains in. `04-PORTFOLIO-ANALYSIS.md §5`
 * asks for the limit to come from a shared constant rather than a literal; the
 * faithful reading of that is a shared *lookup*, and it lives in
 * `finance/ltcg112a.ts` alongside `CII_BY_FY` for the same reason.
 *
 * Use `ltcg112aExemptionForFy(fy)` when computing `ltcgExemptionHeadroomInr`.
 */

/**
 * Every numeric threshold the rule catalogue in `05-FINDINGS-ENGINE.md §4`
 * reasons with, one field per threshold, named after the finding code it
 * drives.
 *
 * This is an interface rather than a bag of top-level constants because rules
 * receive it through `MfAnalysisFacts.constants` and never import it directly
 * (`05 §3`: rules are pure functions of their facts). That indirection is what
 * lets a rule test build facts with `{...DEFAULT_MF_RULE_CONSTANTS, highTer
 * PercentileCeiling: 0.9}` and assert the fire/no-fire boundary without
 * touching production calibration — so the shape matters as much as the
 * numbers.
 *
 * Units convention, since the doc mixes three of them:
 *   - `…Pct` / `…Pp` are PERCENTAGE POINTS (60 means 60%, 5 means 5pp).
 *   - `…Percentile`, `…Ratio`, `…Floor`, `…Ceiling` on a percentile are
 *     FRACTIONS in [0,1] (0.25 is the 25th percentile). Percentiles are
 *     "higher is better" unless the field says otherwise.
 *   - `…Inr` are RUPEE AMOUNTS held as decimal strings and compared as
 *     `Decimal`, never as numbers (§3.1).
 *   - `…Months` / `…Years` / `…Days` are whole counts.
 *
 * Ratio thresholds are plain numbers deliberately: they are exact short
 * decimals used only on the right-hand side of a `Decimal.gt/lt` comparison,
 * where decimal.js takes the number's `toString()` and so reads 0.30 as
 * exactly 0.30. Rupee amounts are strings because they can end up in
 * arithmetic (savings, break-even, headroom), where a double would not.
 */
export interface MfRuleConstants {
  // ── Fund scope · performance ─────────────────────────────────────────────
  /** `PERSISTENT_UNDERPERFORMANCE`: which rolling window is tested. */
  persistentUnderperformanceHorizonYears: number;
  /** `PERSISTENT_UNDERPERFORMANCE`: fires below this share of rolling windows beaten. */
  persistentUnderperformanceRollingBeatPctFloor: number;
  /** `PERSISTENT_UNDERPERFORMANCE`: and blended PERFORMANCE pillar percentile below this. */
  persistentUnderperformancePillarPercentileCeiling: number;
  /** `CONSISTENT_OUTPERFORMER`: share of periods in the top category quartile. */
  consistentOutperformerQuartileConsistencyFloor: number;
  /** `CONSISTENT_OUTPERFORMER`: minimum history before the claim is made at all. */
  consistentOutperformerMinYears: number;
  /** `CONSISTENT_OUTPERFORMER`: and this share of rolling 3y windows beaten. */
  consistentOutperformerRollingBeatPctFloor: number;
  /** `RECENT_REVERSAL`: the strong end of the split (10y percentile at or above). */
  recentReversalLongPercentileFloor: number;
  /** `RECENT_REVERSAL`: the weak end of the split (1y percentile at or below). Symmetric — the rule fires either way round. */
  recentReversalShortPercentileCeiling: number;

  // ── Fund scope · risk ────────────────────────────────────────────────────
  /** `HIGH_DOWN_CAPTURE`: fund falls more than this multiple of the benchmark's down months. */
  highDownCaptureRatioCeiling: number;
  /** `HIGH_DOWN_CAPTURE`: and its down-capture percentile is below this. */
  highDownCapturePercentileCeiling: number;
  /** `DEEP_DRAWDOWN`: max drawdown worse than the category p25 by more than this many percentage points. */
  deepDrawdownWorseThanCategoryP25Pp: number;
  /** `RISK_PROFILE_MISMATCH`: annualised-stdDev percentile above this (here HIGHER = riskier) against a ≤ MODERATE profile. */
  riskProfileMismatchVolatilityPercentileFloor: number;

  // ── Fund scope · cost ────────────────────────────────────────────────────
  /** `HIGH_TER`: TER percentile below this, i.e. costlier than 75% of the category. */
  highTerPercentileCeiling: number;

  // ── Fund scope · portfolio construction ──────────────────────────────────
  /** `CONCENTRATED_PORTFOLIO`: top-10 holdings weight above this %, outside Focused/Sectoral mandates. */
  concentratedPortfolioTop10WeightPct: number;
  /** `STYLE_DRIFT`: months outside the SEBI mandate band that trigger the finding. */
  styleDriftMonthsOutsideBand: number;
  /** `STYLE_DRIFT`: window those months are counted over. */
  styleDriftLookbackMonths: number;
  /** `CLOSET_INDEX`: active share below this — too index-like to justify an active fee. */
  closetIndexActiveShareCeiling: number;
  /** `CLOSET_INDEX`: and TER percentile below this, i.e. still charging above the category median. */
  closetIndexTerPercentileCeiling: number;
  /**
   * `AUM_CAPACITY`: small-cap AUM above which size itself starts to constrain
   * the strategy (₹20,000 crore). **Rupees** as a decimal string — 2e11, big
   * enough that writing it as a number invites a missing zero. Compared as
   * `Decimal`.
   */
  smallCapAumCapInr: string;

  // ── Fund scope · people ──────────────────────────────────────────────────
  /** `MANAGER_CHANGE`: a lead-manager change this recent means the track record is partly someone else's. */
  managerChangeLookbackMonths: number;
  /** `AMC_REGULATORY_ACTION`: how far back a regulatory action still counts. */
  amcRegulatoryActionLookbackYears: number;

  // ── Fund scope · debt ────────────────────────────────────────────────────
  /** `LOW_CREDIT_QUALITY`: share of the book rated below AA, outside the Credit Risk sub-category where it is the mandate. */
  lowCreditQualityBelowAaPct: number;
  /** `ISSUER_CONCENTRATION`: single-issuer weight above this %. */
  issuerConcentrationTopIssuerPct: number;

  // ── Fund scope · index funds ─────────────────────────────────────────────
  /** `HIGH_TRACKING_ERROR`: annualised tracking-error percentile below this within the INDEX model. */
  highTrackingErrorPercentileCeiling: number;

  // ── Fund scope · data quality ────────────────────────────────────────────
  /** `STALE_HOLDINGS_DATA`: latest portfolio snapshot older than this many days. */
  staleHoldingsDays: number;

  // ── Fund scope · this user's position ────────────────────────────────────
  /**
   * `NEGATIVE_TIMING_GAP`: investor return minus fund return below this
   * (−0.03 = 3 percentage points a year worse). Negative by construction.
   * Descriptive only — this finding never becomes advice.
   */
  negativeTimingGapCeiling: number;
  /** `NEGATIVE_TIMING_GAP`: minimum holding history before a timing gap is meaningful rather than a single badly-timed lump sum. */
  negativeTimingGapMinYears: number;
  /** `LTCG_FLIP_SOON`: days to the STCG→LTCG flip that make it worth waiting. */
  ltcgFlipSoonDays: number;
  /**
   * `TAX_HARVEST_OPPORTUNITY`: minimum harvestable loss worth a taxable event.
   * **Rupees** as a decimal string, compared as `Decimal`. Matches the advisor
   * engine's `MIN_HARVEST_LOSS_INR` on purpose — two surfaces disagreeing on
   * whether a ₹4,000 loss is worth harvesting is a support ticket.
   */
  minHarvestInr: string;

  // ── Portfolio scope ──────────────────────────────────────────────────────
  /** `REDUNDANT_FUNDS`: pairwise holdings overlap at or above this, within the same sub-category. */
  redundantFundsOverlapFloor: number;
  /** `FUND_SPRAWL`: more equity funds than this. */
  fundSprawlEquityFundCount: number;
  /** `FUND_SPRAWL`: or effective (HHI-derived) fund count below this fraction of the actual count — many funds, few real bets. */
  fundSprawlEffectiveFundRatioFloor: number;
  /** `LOOK_THROUGH_CONCENTRATION`: a single underlying stock above this % of the whole MF book. */
  lookThroughSingleStockPct: number;
  /**
   * `ALLOCATION_DRIFT`: equity share away from the model by more than this
   * many percentage points. `04 §3` requires this to be the *same* tolerance
   * the advisor's REBALANCE rule uses, so both read `REBALANCE_BAND_PP` from
   * `finance/planningBands.ts` — one definition, not two that must be kept
   * in step by hand.
   */
  allocationDriftBandPp: number;
  /** `PORTFOLIO_COST_HIGH`: weighted-cost percentile against the category below this. */
  portfolioCostPercentileCeiling: number;
  /**
   * `DIRECT_PLAN_SAVINGS`: annual saving from moving regular→direct that makes
   * the switch worth surfacing at portfolio level. **Rupees per year** as a
   * decimal string, compared as `Decimal`.
   */
  directPlanSavingsInr: string;
  /**
   * `LTCG_HEADROOM_UNUSED`: unused §112A headroom above which it is worth
   * flagging near FY end. **Rupees** as a decimal string, compared as
   * `Decimal`. Distinct from `LTCG_112A_EXEMPTION_INR`, which is the statutory
   * limit — this is only how much of it must remain unused before we say so.
   */
  ltcgHeadroomMinInr: string;
  /** `LTCG_HEADROOM_UNUSED`: how close to 31 March the finding starts firing — before that there is no urgency and it is just noise. */
  ltcgHeadroomFyEndWindowDays: number;
  /**
   * `NO_LIQUID_BUFFER`: months of expenses covered by liquid assets, below
   * which holding no liquid/overnight fund is a real gap rather than a
   * preference.
   *
   * In months, not in health-sub-score points. The sub-score is derived,
   * capped and rescaled; a "score below 50" threshold encodes "under three
   * months" in a form no reviewer can verify by reading it, and would change
   * meaning silently if that formula were ever rescaled.
   */
  noLiquidBufferMonthsCoveredFloor: number;
}

/**
 * Production calibration. Values are the defaults stated in
 * `05-FINDINGS-ENGINE.md §4`; where the doc named a rule but no number, no
 * field exists here — see the note below the object.
 *
 * Changing any value here changes what users are told, so it also requires
 * bumping the `version` of the affected rule (`05 §3`): a finding produced
 * under old thresholds and one produced under new thresholds must be
 * distinguishable in the audit trail.
 */
export const DEFAULT_MF_RULE_CONSTANTS: MfRuleConstants = {
  // Performance
  persistentUnderperformanceHorizonYears: 3,
  persistentUnderperformanceRollingBeatPctFloor: 0.3,
  persistentUnderperformancePillarPercentileCeiling: 0.25,
  consistentOutperformerQuartileConsistencyFloor: 0.8,
  consistentOutperformerMinYears: 5,
  consistentOutperformerRollingBeatPctFloor: 0.7,
  recentReversalLongPercentileFloor: 0.75,
  recentReversalShortPercentileCeiling: 0.25,

  // Risk
  highDownCaptureRatioCeiling: 1.1,
  highDownCapturePercentileCeiling: 0.25,
  deepDrawdownWorseThanCategoryP25Pp: 5,
  riskProfileMismatchVolatilityPercentileFloor: 0.75,

  // Cost
  highTerPercentileCeiling: 0.25,

  // Portfolio construction
  concentratedPortfolioTop10WeightPct: 60,
  styleDriftMonthsOutsideBand: 3,
  styleDriftLookbackMonths: 12,
  closetIndexActiveShareCeiling: 0.4,
  closetIndexTerPercentileCeiling: 0.5,
  smallCapAumCapInr: '200000000000', // ₹20,000 crore

  // People
  managerChangeLookbackMonths: 12,
  amcRegulatoryActionLookbackYears: 3,

  // Debt
  lowCreditQualityBelowAaPct: 15,
  issuerConcentrationTopIssuerPct: 10,

  // Index
  highTrackingErrorPercentileCeiling: 0.25,

  // Data quality
  staleHoldingsDays: 60,

  // This user's position
  negativeTimingGapCeiling: -0.03,
  negativeTimingGapMinYears: 3,
  ltcgFlipSoonDays: 45,
  minHarvestInr: '5000',

  // Portfolio scope
  redundantFundsOverlapFloor: 0.5,
  fundSprawlEquityFundCount: 10,
  fundSprawlEffectiveFundRatioFloor: 0.5,
  lookThroughSingleStockPct: 5,
  allocationDriftBandPp: REBALANCE_BAND_PP,
  portfolioCostPercentileCeiling: 0.3,
  directPlanSavingsInr: '2000',
  ltcgHeadroomMinInr: '50000',
  ltcgHeadroomFyEndWindowDays: 60,
  noLiquidBufferMonthsCoveredFloor: LIQUID_BUFFER_ALARM_MONTHS,
};

/**
 * Rules in `05 §4` that deliberately have NO entry above, so their absence
 * reads as a decision rather than an oversight:
 *
 *   - `REGULAR_PLAN_COST`, `EXIT_LOAD_ACTIVE` — pure predicates (plan type is
 *     REGULAR and a direct sibling exists; a lot is inside its exit-load
 *     window). There is no number to tune.
 *   - `DURATION_MISMATCH`, and the band half of `STYLE_DRIFT` — the band comes
 *     from `SEBI_SUBCATEGORY_MAP` in `sebiCategories.ts`. It is regulation, not
 *     calibration, and must not be overridable by a test fixture.
 *   - `INSUFFICIENT_HISTORY` — driven by `MIN_RATING_HISTORY_MONTHS` above,
 *     which is a layer-wide invariant rather than one rule's threshold.
 *   - `GOAL_MISMATCH` / `GOAL_UNDERPOWERED` — a horizon-vs-model-key
 *     suitability matrix (`04 §6`), not a scalar; it belongs with the goal
 *     logic that owns the matrix.
 */
