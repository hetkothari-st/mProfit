/**
 * `CONCENTRATED_PORTFOLIO` (`05 §4`, fund scope, row 9).
 *
 * Fires when the top 10 holdings are more than
 * `concentratedPortfolioTop10WeightPct` of the fund's portfolio — **and the
 * mandate does not say they should be.**
 *
 * The exclusion is the whole rule. Two sub-categories are concentrated on
 * purpose and telling their holder so is noise dressed as insight:
 *
 *  - **Focused Fund** — SEBI caps it at 30 holdings (`capBand.maxHoldings` in
 *    `sebiCategories.ts`). A focused fund whose top 10 were under 60% would be
 *    failing to do the one thing it exists to do.
 *  - **Sectoral/Thematic Fund** — `spec.thematic`, mandated at >= 80% in a
 *    single declared theme. Its concentration is the product.
 *
 * Both are identified from `SEBI_SUBCATEGORY_MAP`, i.e. from the regulation,
 * not from a list of names maintained here. A sub-category that later gains a
 * `maxHoldings` cap is excluded automatically.
 *
 * UNMAPPED sub-categories do not fire either. We cannot rule out that
 * concentration is that fund's mandate, and asserting a breach of a mandate we
 * could not identify is the "confidently wrong" failure `sebiCategories.ts`'s
 * header describes.
 */

import {
  SEBI_SUBCATEGORY_MAP,
  serializeRatio,
  specFor,
  toDecimal,
  type MfEvidence,
  type MfFinding,
  type SebiSubCategory,
} from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.portfolio.concentration';
const RULE_VERSION = '1.0.0';
const CODE = 'CONCENTRATED_PORTFOLIO';

function isMappedSubCategory(value: string): value is SebiSubCategory {
  return Object.prototype.hasOwnProperty.call(SEBI_SUBCATEGORY_MAP, value);
}

export const portfolioConcentrationRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'PORTFOLIO',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    const sub = fund.meta.sebiSubCategory;
    if (!isMappedSubCategory(sub)) return [];

    const spec = specFor(sub);
    // Concentration is the mandate here, not a deviation from it.
    if (spec.thematic === true) return [];
    if (spec.capBand?.maxHoldings !== undefined) return [];

    const profile = fund.profile;
    if (profile === null || profile.status === 'QUARANTINED') return [];

    const top10 = profile.top10WeightPct;
    const status = profile.fieldStatus['top10WeightPct'];
    if (top10 === null || (status !== undefined && status !== 'OK')) return [];

    // `top10WeightPct` and the threshold are both PERCENTAGE POINTS
    // (`mfAnalytics.constants.ts` units convention), so they compare directly
    // with no scaling — the one place in this batch where that is true.
    const threshold = toDecimal(facts.constants.concentratedPortfolioTop10WeightPct);
    const top10Dec = toDecimal(top10);
    if (!top10Dec.greaterThan(threshold)) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'top10WeightPct',
        label: 'Weight of the top 10 holdings',
        value: serializeRatio(top10Dec),
        unit: 'pct',
      },
      {
        metric: 'numHoldings',
        label: 'Number of securities held',
        value: profile.numHoldings === null ? null : serializeRatio(profile.numHoldings),
        unit: 'count',
      },
    ];

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'PORTFOLIO',
        severity: 'NOTICE',
        confidence: confidenceFor(),
        // Sub-category names run to 50 characters ("Dynamic Asset Allocation
        // or Balanced Advantage Fund"), which would push this past the
        // 120-char cap `makeFinding` enforces. The mandate is on the evidence
        // and on the fund page; the headline carries the two numbers.
        headline:
          `Top 10 holdings are ${top10Dec.toFixed(1)}% of the portfolio, above the ` +
          `${threshold.toFixed(0)}% diversification mark`,
        evidence,
        whatWouldChangeThis:
          `Would clear once the top 10 holdings are ${threshold.toFixed(0)}% or less of the ` +
          `fund's portfolio (currently ${top10Dec.toFixed(1)}%).`,
      }),
    ];
  },
};
