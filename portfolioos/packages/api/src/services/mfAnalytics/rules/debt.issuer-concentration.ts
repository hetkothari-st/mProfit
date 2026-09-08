/**
 * `ISSUER_CONCENTRATION` — one issuer accounts for more of the debt book than
 * SEBI's single-issuer norm.
 *
 * `05 §4`: "`topIssuerPct > 10`", severity NOTICE.
 *
 * ---------------------------------------------------------------------------
 * The sovereign suppression
 * ---------------------------------------------------------------------------
 *
 * `05 §4` states the trigger as a bare comparison. Applied literally it fires
 * on every gilt fund in existence, permanently: a Gilt Fund holds >= 80%
 * government securities by mandate, and the Government of India is a single
 * issuer. Same for `Gilt Fund with 10 year constant duration`.
 *
 * That is not what the finding means. SEBI's own 10% single-issuer cap
 * (Seventh Schedule) explicitly excludes central and state government
 * securities and treasury bills, because the concern is *issuer default* and a
 * sovereign in its own currency is the reference point against which every
 * other issuer's risk is measured. Flagging it would make the finding say
 * "this gilt fund is concentrated in the government", which is the definition
 * of a gilt fund.
 *
 * So the rule is suppressed wherever the sub-category's `creditBand` mandates
 * a SOVEREIGN issuer floor — keyed on the structural property rather than the
 * category name, exactly as `debt.credit-quality.ts` keys its Credit Risk
 * suppression on `minPctBelow`.
 *
 * This is a deliberate narrowing of `05 §4` and is reported as such.
 */

import { serializeRatio, specFor, toDecimal } from '@portfolioos/shared';
import type { MfEvidence, MfFinding, SebiSubCategory } from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.debt.issuer-concentration';
const RULE_VERSION = '1.0.0';

/** The `issuerType` marker `sebiCategories.ts` uses for government paper. */
const SOVEREIGN = 'SOVEREIGN';

function mandatesSovereign(sub: SebiSubCategory | 'UNMAPPED'): boolean {
  if (sub === 'UNMAPPED') return false;
  return specFor(sub)?.creditBand?.minPctIssuerType?.issuerType === SOVEREIGN;
}

export const debtIssuerConcentrationRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'DEBT',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const fund = facts.funds[schemeCode];
    const profile = fund?.profile;
    if (!fund || !profile) return [];

    if (mandatesSovereign(fund.meta.sebiSubCategory)) return [];

    // Debt-only field. Null on an equity fund, and null on a debt fund whose
    // disclosure did not name issuers — both mean "no finding", never "0%".
    if (profile.topIssuerPct === null) return [];

    const top = toDecimal(profile.topIssuerPct);
    const threshold = facts.constants.issuerConcentrationTopIssuerPct;
    if (!top.greaterThan(threshold)) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'topIssuerPct',
        label: 'Largest single-issuer weight in the debt book',
        // Branded `Ratio` for transport, `unit: 'pct'` for meaning — see the
        // same note in `debt.credit-quality.ts`.
        value: serializeRatio(profile.topIssuerPct),
        unit: 'pct',
      },
    ];

    if (profile.numHoldings !== null) {
      // The holding count is context for the weight: 12% of a 15-security book
      // reads very differently from 12% of a 200-security one. It is a plain
      // integer, so it goes through `serializeRatio` to satisfy the branded
      // `Ratio` slot rather than being cast.
      evidence.push({
        metric: 'numHoldings',
        label: 'Securities held',
        value: serializeRatio(profile.numHoldings),
        unit: 'count',
      });
    }

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'ISSUER_CONCENTRATION',
        category: 'DEBT',
        severity: 'NOTICE',
        confidence: confidenceFor(),
        headline:
          `Largest single issuer is ${top.toFixed(1)}% of the debt book, above the ` +
          `${threshold}% single-issuer norm`,
        evidence,
        whatWouldChangeThis:
          `Clears when the largest single issuer falls to ${threshold}% or less of net assets ` +
          'in the AMC’s monthly portfolio disclosure.',
      }),
    ];
  },
};

export default debtIssuerConcentrationRule;
