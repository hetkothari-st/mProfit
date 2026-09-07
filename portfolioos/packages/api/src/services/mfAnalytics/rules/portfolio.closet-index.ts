/**
 * `CLOSET_INDEX` (`05 §4`, fund scope, row 11).
 *
 * Fires when a fund's active share is below `closetIndexActiveShareCeiling`
 * (its portfolio barely differs from the benchmark) **and** its TER percentile
 * is below `closetIndexTerPercentileCeiling` (it is still charging at or above
 * the category median). Either half alone is unremarkable: a low-cost fund
 * that hugs its index is a tracker doing its job, and an expensive fund with
 * genuine active positions is at least selling what it charges for. The
 * combination — an active fee for passive exposure — is the finding.
 *
 * BOTH CONSTANTS ARE READ IN THE STORED ORIENTATION. `terPct` is
 * LOWER_IS_BETTER, so the stored percentile is "higher = cheaper" (`03 §1`);
 * `closetIndexTerPercentileCeiling: 0.5` therefore means "at or above the
 * category median cost". No inversion, exactly as in `HIGH_TER`.
 *
 * ---------------------------------------------------------------------------
 * THIS RULE IS SILENT IN PRODUCTION TODAY, AND THAT IS CORRECT
 * ---------------------------------------------------------------------------
 * `activeShare` requires the benchmark's constituent weights
 * (`½ Σ |w_fund,i - w_bench,i|`, `02 §7`). No table in this repository carries
 * index constituents, so `mfMetrics.service.ts` sets it to null with status
 * `BENCHMARK_UNAVAILABLE` for every fund. This rule will therefore emit
 * nothing until that data lands.
 *
 * The tempting substitute is a proxy — R² against the benchmark, or tracking
 * error, both of which we do have. Neither is active share. A fund can hold
 * very different stocks and still track closely (same sectors, similar betas),
 * and calling that a closet index fund would be an accusation built on a
 * different measurement than the one named in the finding. `05 §4` names
 * `activeShare`; silence is recorded in `ruleVersionsSnapshot`, so "why was
 * this fund not flagged?" stays answerable, which is the whole point of
 * recording silent rules.
 */

import {
  serializeRatio,
  toDecimal,
  type MfEvidence,
  type MfFinding,
} from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.portfolio.closet-index';
const RULE_VERSION = '1.0.0';
const CODE = 'CLOSET_INDEX';

export const portfolioClosetIndexRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'PORTFOLIO',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    const profile = fund.profile;
    if (profile === null || profile.status === 'QUARANTINED') return [];

    const activeShare = profile.activeShare;
    const activeShareStatus = profile.fieldStatus['activeShare'];
    if (activeShare === null || (activeShareStatus !== undefined && activeShareStatus !== 'OK')) {
      return [];
    }

    const terPercentile = profile.terPercentile;
    const terPercentileStatus = profile.fieldStatus['terPercentile'];
    if (
      terPercentile === null ||
      (terPercentileStatus !== undefined && terPercentileStatus !== 'OK')
    ) {
      return [];
    }

    const { constants } = facts;
    const activeShareCeiling = toDecimal(constants.closetIndexActiveShareCeiling);
    const terCeiling = toDecimal(constants.closetIndexTerPercentileCeiling);

    const activeShareDec = toDecimal(activeShare);
    const terPercentileDec = toDecimal(terPercentile);

    if (!activeShareDec.lessThan(activeShareCeiling)) return [];
    if (!terPercentileDec.lessThan(terCeiling)) return [];

    const terStatus = profile.fieldStatus['terPct'];
    const ter = terStatus !== undefined && terStatus !== 'OK' ? null : profile.terPct;

    const evidence: MfEvidence[] = [
      {
        metric: 'activeShare',
        label: 'Active share vs benchmark',
        value: activeShare,
        unit: 'ratio',
      },
      {
        metric: 'terPercentile',
        label: 'Expense-ratio percentile in category (higher = cheaper)',
        value: terPercentile,
        percentile: terPercentile,
        unit: 'ratio',
      },
    ];
    if (ter !== null) {
      evidence.push({
        metric: 'terPct',
        label: 'Total expense ratio',
        value: serializeRatio(toDecimal(ter)),
        unit: 'pct',
      });
    }

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'PORTFOLIO',
        severity: 'WARNING',
        // Active share is benchmark-relative and non-null here, so the
        // benchmark constituents were available for this fund.
        confidence: confidenceFor({ benchmarkAvailable: true }),
        headline:
          `Active share of ${activeShareDec.toFixed(2)} with an above-median expense ratio: ` +
          `an active fee for near-index exposure`,
        evidence,
        whatWouldChangeThis:
          `Would clear at an active share above ${activeShareCeiling.toFixed(2)} ` +
          `(currently ${activeShareDec.toFixed(2)}), or at an expense-ratio percentile of ` +
          `${terCeiling.toFixed(2)} or better — at or below the category median cost.`,
      }),
    ];
  },
};
