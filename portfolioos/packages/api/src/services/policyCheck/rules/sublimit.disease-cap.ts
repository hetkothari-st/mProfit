/**
 * Disease-specific sub-limit analysis.
 *
 * Many policies impose monetary caps on specific high-cost diseases
 * (cataract, hernia, knee replacement, etc.) regardless of the sum insured.
 * This rule surfaces these caps so the user knows before they claim.
 */

import type { PolicyRule } from '../types.js';
import { makePolicyFinding } from '../types.js';

const RULE_ID = 'policy.sublimit.disease-cap';
const RULE_VERSION = '1.0.0';

// Well-known high-cost procedures that are commonly sub-limited
const HIGH_COST_KEYWORDS = new RegExp(
  '(cataract|knee|hip|organ transplant|renal|cardiac|cancer|dialysis|joint replacement|bypass)',
  'i',
);

export const sublimitDiseaseCap: PolicyRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  policyType: ['HEALTH'],
  category: 'SUB_LIMIT',

  evaluate(facts) {
    const field = facts.extraction.diseaseSubLimits;

    if (field.status === 'NOT_FOUND' || field.value === null) {
      // Not present or not found — no finding; could be no sub-limits
      return [];
    }

    const subLimits = field.value;
    const entries = Object.entries(subLimits);

    if (entries.length === 0) return [];

    // Surface any high-cost procedure caps as CRITICAL; others as WARNING
    const findings = [];

    for (const [disease, limit] of entries) {
      const severity = HIGH_COST_KEYWORDS.test(disease) ? 'CRITICAL' : 'WARNING';
      const headline = `Sub-limit of ₹${limit} applies for ${disease}`;

      if (headline.length > 120) continue; // skip if headline would be too long

      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: `SUBLIMIT_${disease.replace(/[^A-Z0-9]/gi, '_').toUpperCase().slice(0, 30)}`,
          category: 'SUB_LIMIT',
          severity,
          confidence: String(field.confidence),
          headline,
          evidence: [
            {
              docId: field.sourceDocId ?? '',
              page: field.sourcePage ?? 1,
              clauseHeading: field.clauseHeading ?? 'Disease sub-limits',
              extractedText: `${disease}: ₹${limit}`,
            },
          ],
          whatWouldChangeThis:
            `The policy caps ${disease} treatment at ₹${limit} regardless of your sum insured. ` +
            'If your treatment cost exceeds this cap, the remaining amount is out-of-pocket. ' +
            'Compare plans that offer full sum-insured coverage for this condition.',
        }),
      );
    }

    return findings;
  },
};
