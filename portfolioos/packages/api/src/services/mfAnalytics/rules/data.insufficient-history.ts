/**
 * `INSUFFICIENT_HISTORY` — this scheme has no rating, and here is why.
 *
 * `05 §4`: "`score.ratingStatus != RATED`", severity INFO, counterfactual
 * "Rated once the fund has 36 months of NAV history (on {date})".
 *
 * ---------------------------------------------------------------------------
 * The trap: three unrated states, one finding code
 * ---------------------------------------------------------------------------
 *
 * `MfRatingStatus` has three non-RATED values and they are **not** variations
 * on a theme:
 *
 *   - `INSUFFICIENT_HISTORY` — fewer than `MIN_RATING_HISTORY_MONTHS` months of
 *     NAV. The fund will become ratable on a knowable date. Waiting works.
 *   - `CATEGORY_TOO_SMALL` — the fund may have fifteen years of history and be
 *     perfectly measurable; there simply are not `MIN_UNIVERSE_SIZE` rated
 *     peers to rank it against (`00-README.md` invariant 3). Waiting does
 *     nothing; only the category growing helps.
 *   - `NOT_APPLICABLE` — no scoring model covers this scheme at all.
 *
 * `05 §4`'s single counterfactual template is written for the first case. Using
 * it for the second produces a sentence that is simply false — "needs 36
 * months of NAV history" said about a fund with ten years of it — and a user
 * who reads that has been told to wait for something that has already
 * happened. Each branch therefore gets its own headline and its own
 * counterfactual, and `historyMonths` / `ratedFrom` are read **only** on the
 * branch where they mean anything.
 *
 * `historyMonths` and `ratedFrom` come off `MfSchemeScoreDto` rather than being
 * recomputed from `inceptionDate`: `06 §6` mandates the copy "Unrated - {N}
 * months of history (rated from {date})", the scoring service is what decided
 * the fund was short of history, and a second derivation here could disagree
 * with the badge the user is looking at on the same screen.
 *
 * Thresholds come from `../constants.js` rather than `facts.constants` for the
 * one reason `mfAnalytics.constants.ts` states explicitly: `MIN_RATING_HISTORY_
 * MONTHS` and `MIN_UNIVERSE_SIZE` are layer-wide invariants, not this rule's
 * calibration, and are deliberately absent from `MfRuleConstants` so a fixture
 * cannot move them.
 */

import { serializeRatio } from '@portfolioos/shared';
import type { MfEvidence, MfFinding } from '@portfolioos/shared';
import { MIN_RATING_HISTORY_MONTHS, MIN_UNIVERSE_SIZE } from '../constants.js';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.data.insufficient-history';
const RULE_VERSION = '1.0.0';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function humanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTH_NAMES[Number.parseInt(m[2]!, 10) - 1];
  if (!month) return iso;
  return `${Number.parseInt(m[3]!, 10)} ${month} ${m[1]}`;
}

interface Copy {
  headline: string;
  counterfactual: string;
  evidence: MfEvidence[];
}

export const dataInsufficientHistoryRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'DATA',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const fund = facts.funds[schemeCode];
    if (!fund) return [];

    const score = fund.score;

    // A RATED score is the only silent case. Everything else — including no
    // score row at all — is a fact about our coverage that the user is
    // entitled to see beside the numbers we *did* produce.
    if (score && score.ratingStatus === 'RATED') return [];

    const copy = copyFor(fund.meta.schemeName, score);
    if (copy === null) return [];

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'INSUFFICIENT_HISTORY',
        category: 'DATA',
        severity: 'INFO',
        // No return series is being cited — the finding is about the absence
        // of one. `05 §4`'s no-horizon band.
        confidence: confidenceFor(),
        headline: copy.headline,
        evidence: copy.evidence,
        whatWouldChangeThis: copy.counterfactual,
      }),
    ];
  },
};

/**
 * Branch on *why* the fund is unrated. Returns null only in the impossible
 * case that a score row exists and is RATED, which the caller has already
 * excluded — kept as a total function so the switch has no silent default.
 */
function copyFor(
  schemeName: string,
  score: MfAnalysisFacts['funds'][string]['score'],
): Copy | null {
  if (!score) {
    // No score row at all: the scheme has never been through the scoring job.
    // Distinct from every `ratingStatus`, because it says nothing about the
    // fund and everything about our pipeline.
    return {
      headline: 'Not rated yet — this scheme has not been through our scoring run',
      counterfactual:
        'Clears at the next scoring run, once this scheme is picked up by it. ' +
        `Rating requires ${MIN_RATING_HISTORY_MONTHS} months of NAV history and at least ` +
        `${MIN_UNIVERSE_SIZE} rated schemes in its category.`,
      evidence: [
        {
          metric: 'score.ratingStatus',
          label: 'No score row exists for this scheme',
          value: null,
          unit: 'count',
        },
      ],
    };
  }

  switch (score.ratingStatus) {
    case 'INSUFFICIENT_HISTORY': {
      const months = score.historyMonths;
      const from = score.ratedFrom;
      const evidence: MfEvidence[] = [
        {
          metric: 'score.historyMonths',
          label: `Months of NAV history (${MIN_RATING_HISTORY_MONTHS} required)`,
          value: months === null ? null : serializeRatio(months),
          unit: 'count',
        },
      ];
      return {
        headline:
          months === null
            ? `Not rated — less than ${MIN_RATING_HISTORY_MONTHS} months of NAV history`
            : `Not rated — ${months} of the ${MIN_RATING_HISTORY_MONTHS} months of NAV history a rating needs`,
        counterfactual:
          from === null
            ? `Rated once the fund has ${MIN_RATING_HISTORY_MONTHS} months of NAV history.`
            : `Rated once the fund has ${MIN_RATING_HISTORY_MONTHS} months of NAV history (on ${humanDate(from)}).`,
        evidence,
      };
    }

    case 'CATEGORY_TOO_SMALL': {
      // Deliberately says nothing about history: this fund may have a decade
      // of it. The constraint is the peer group, and a percentile over eight
      // schemes would be noise reported to two decimals (`00-README.md`
      // invariant 3).
      return {
        headline: `Not rated — only ${score.universeSize} rated schemes in this category to rank against`,
        counterfactual:
          `Rated once at least ${MIN_UNIVERSE_SIZE} schemes in ${score.universeKey} carry a rating ` +
          `(currently ${score.universeSize}). This is about the size of the peer group, not about this ` +
          'fund’s own history.',
        evidence: [
          {
            metric: 'score.universeSize',
            label: `Rated schemes in ${score.universeKey} (${MIN_UNIVERSE_SIZE} required)`,
            value: serializeRatio(score.universeSize),
            unit: 'count',
          },
        ],
      };
    }

    case 'NOT_APPLICABLE': {
      return {
        headline: 'Not rated — no scoring model applies to this scheme’s category',
        counterfactual:
          `Rated if a scoring model is published for ${score.universeKey}. Ratings are relative to a ` +
          'SEBI category, and this scheme’s category has no model, so there is nothing to wait for on ' +
          'the fund’s side.',
        evidence: [
          {
            metric: 'score.modelKey',
            label: `No scoring model for ${score.universeKey} (model key: ${score.modelKey})`,
            value: null,
            unit: 'count',
          },
        ],
      };
    }

    case 'RATED':
      return null;

    default:
      // A new `MfRatingStatus` must not fall through into one of the messages
      // above. Emitting a neutral, honest finding is better than mislabelling
      // it, and better than silence — the user still sees "no rating".
      return {
        headline: `Not rated — ${schemeName.slice(0, 60)} has no rating for this run`,
        counterfactual:
          `Rated once the scheme clears both rating conditions: ${MIN_RATING_HISTORY_MONTHS} months of ` +
          `NAV history and at least ${MIN_UNIVERSE_SIZE} rated schemes in its category.`,
        evidence: [
          {
            metric: 'score.ratingStatus',
            label: 'Rating status',
            value: null,
            unit: 'count',
          },
        ],
      };
  }
}

export default dataInsufficientHistoryRule;
