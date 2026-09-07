/**
 * `LOW_CREDIT_QUALITY` — the debt book carries more sub-AA paper than the
 * category norm.
 *
 * `05 §4`: "`belowAAPct > 15` **outside Credit Risk sub-category**", severity
 * WARNING.
 *
 * ---------------------------------------------------------------------------
 * The Credit Risk suppression is the whole rule
 * ---------------------------------------------------------------------------
 *
 * SEBI's Credit Risk Fund category is *defined* as ">= 65% of net assets in
 * paper rated below AA+" (`SEBI_SUBCATEGORY_MAP['Credit Risk Fund']
 * .creditBand.minPctBelow`). Sub-investment-grade exposure there is the
 * product, not a defect: an investor who bought a credit risk fund bought
 * exactly this, and telling them their credit risk fund holds credit risk is
 * not a finding, it is a category error that discredits every other finding on
 * the page.
 *
 * Worse, it is not a near miss. Every scheme in the category would trip a
 * 15% threshold, all of them at once, every run — a whole SEBI category
 * permanently flagged WARNING.
 *
 * The suppression is keyed on `creditBand.minPctBelow` rather than on the
 * sub-category *name* deliberately. `minPctBelow` is the structural property
 * that makes the finding meaningless ("this category mandates a floor on
 * low-rated paper"), so if SEBI ever creates a second such category the
 * suppression follows automatically instead of needing someone to remember.
 */

import { serializeRatio, specFor, toDecimal } from '@portfolioos/shared';
import type { MfEvidence, MfFinding, SebiSubCategory } from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.debt.credit-quality';
const RULE_VERSION = '1.0.0';

/**
 * True when the sub-category's *mandate* is to hold low-rated paper.
 *
 * `'UNMAPPED'` is not a `SebiSubCategory` and has no spec, so it is handled
 * before the lookup: an unmapped scheme has no known mandate, and we do not
 * assert a breach of a band we cannot name.
 */
function mandatesLowCredit(sub: SebiSubCategory | 'UNMAPPED'): boolean {
  if (sub === 'UNMAPPED') return true;
  const spec = specFor(sub);
  return spec?.creditBand?.minPctBelow !== undefined;
}

export const debtCreditQualityRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'DEBT',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const fund = facts.funds[schemeCode];
    const profile = fund?.profile;
    if (!fund || !profile) return [];

    // Suppressed for the one category where this is the mandate. Also
    // suppressed for UNMAPPED, where we cannot say what the mandate is.
    if (mandatesLowCredit(fund.meta.sebiSubCategory)) return [];

    // `null` means the AMC's disclosure did not let us compute it — never 0%.
    // A missing input is not a passing grade and it is not a finding either.
    if (profile.belowAAPct === null) return [];

    const belowAA = toDecimal(profile.belowAAPct);
    const threshold = facts.constants.lowCreditQualityBelowAaPct;
    if (!belowAA.greaterThan(threshold)) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'belowAAPct',
        label: 'Net assets rated below AA',
        // `MfEvidence.value` is branded `Ratio` for transport; `unit` carries the
        // semantics. Re-serialising the same digits under the Ratio brand keeps
        // the percent value intact — converting with `pctToRatio` would divide
        // by 100 and contradict `unit: 'pct'`.
        value: serializeRatio(profile.belowAAPct),
        unit: 'pct',
      },
    ];

    const split = profile.creditQualitySplit;
    if (split?.unrated !== null && split?.unrated !== undefined) {
      // Unrated paper is not the same as low-rated paper and is not counted in
      // `belowAAPct`, but a reader deciding how worried to be needs both.
      evidence.push({
        metric: 'creditQualitySplit.unrated',
        label: 'Net assets in unrated paper',
        value: serializeRatio(split.unrated),
        unit: 'pct',
      });
    }

    if (profile.snapshotAsOf) {
      evidence.push({
        metric: 'snapshotAsOf',
        label: `Portfolio disclosure this is measured from (${profile.snapshotAsOf})`,
        value: null,
        unit: 'count',
      });
    }

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'LOW_CREDIT_QUALITY',
        category: 'DEBT',
        severity: 'WARNING',
        // A structural fact from one disclosure, not a return series: `05 §4`'s
        // "no horizon" band. No benchmark is cited, so no ceiling applies.
        confidence: confidenceFor(),
        headline:
          `${belowAA.toFixed(1)}% of the debt book is rated below AA, above the ` +
          `${threshold}% level for this category`,
        evidence,
        whatWouldChangeThis:
          `Clears when paper rated below AA falls to ${threshold}% or less of net assets ` +
          'in the AMC’s monthly portfolio disclosure.',
      }),
    ];
  },
};

export default debtCreditQualityRule;
