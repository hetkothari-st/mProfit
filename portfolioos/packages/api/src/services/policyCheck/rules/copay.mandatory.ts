/**
 * Co-payment analysis rule.
 *
 * Co-payment requires the insured to contribute a fixed percentage of every
 * claim. A mandatory co-payment on all claims is a significant financial
 * restriction. This rule produces a Decimal example of the out-of-pocket
 * cost based on the extraction + a hypothetical ₹5L claim, so the user
 * understands the real-money impact.
 *
 * We distinguish:
 *  - 0% co-payment → no finding (a positive attribute, handled by scoring)
 *  - >0% but ≤threshold → NOTICE
 *  - >threshold (WARNING) → WARNING
 *  - >criticalThreshold → CRITICAL
 *  - NOT_FOUND → special finding explaining we could not confirm
 *
 * NEVER assume proportionate deductions or other policy mechanics from
 * a co-payment clause alone. This rule is scoped strictly to co-payment.
 */

import { Decimal } from '@everypaisa/shared';
import type { PolicyRule } from '../types.js';
import { makePolicyFinding } from '../types.js';

const RULE_ID = 'policy.copay.mandatory';
const RULE_VERSION = '1.0.0';
const EXAMPLE_CLAIM = new Decimal('500000'); // ₹5L example

export const copayMandatoryRule: PolicyRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  policyType: ['HEALTH'],
  category: 'CO_PAYMENT',

  evaluate(facts) {
    const field = facts.extraction.copaymentPct;

    // NOT_FOUND — we don't know
    if (field.status === 'NOT_FOUND' || field.value === null) {
      return [
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'COPAY_UNKNOWN',
          category: 'CO_PAYMENT',
          severity: 'NOTICE',
          confidence: '0.6',
          headline: 'Co-payment terms could not be confirmed from the uploaded documents',
          evidence: [
            {
              docId: field.sourceDocId ?? '',
              page: field.sourcePage ?? 1,
              clauseHeading: field.clauseHeading,
              extractedText: 'Co-payment clause not found in the uploaded documents.',
            },
          ],
          whatWouldChangeThis:
            'Upload the full policy wording document which contains the co-payment clause, ' +
            'or manually enter the co-payment percentage in the verification step.',
        }),
      ];
    }

    const pct = new Decimal(field.value);

    // No co-payment — positive, no finding from this rule
    if (pct.isZero()) return [];

    const outOfPocket = EXAMPLE_CLAIM.mul(pct).div(100).toFixed(0);
    const pctStr = pct.toFixed(2);
    const evidence = [
      {
        docId: field.sourceDocId ?? '',
        page: field.sourcePage ?? 1,
        clauseHeading: field.clauseHeading ?? 'Co-payment clause',
        extractedText: field.value !== null ? `Co-payment: ${field.value}%` : '',
      },
    ];

    const criticalPct = new Decimal(facts.constants.copaymentCriticalPct);
    const warningPct = new Decimal(facts.constants.copaymentWarningPct);

    if (pct.gte(criticalPct)) {
      return [
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'COPAY_CRITICAL',
          category: 'CO_PAYMENT',
          severity: 'CRITICAL',
          confidence: String(field.confidence),
          headline: `Mandatory ${pctStr}% co-payment on all claims — high out-of-pocket risk`,
          evidence,
          whatWouldChangeThis:
            `A co-payment of ${pctStr}% means you pay ₹${outOfPocket} on a ₹5L claim. ` +
            'Consider switching to a plan with zero or lower co-payment for comprehensive coverage. ' +
            'Some plans offer co-payment only for senior citizens — verify if that is the case here.',
        }),
      ];
    }

    if (pct.gte(warningPct)) {
      return [
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'COPAY_WARNING',
          category: 'CO_PAYMENT',
          severity: 'WARNING',
          confidence: String(field.confidence),
          headline: `${pctStr}% co-payment on all claims — ₹${outOfPocket} out-of-pocket on a ₹5L claim`,
          evidence,
          whatWouldChangeThis:
            `You will pay ${pctStr}% of every claim. On a ₹5L bill that is ₹${outOfPocket}. ` +
            'Look for a plan with co-payment only for specific age groups or specific treatments.',
        }),
      ];
    }

    // Low co-payment (>0% but < warning threshold) — NOTICE
    return [
      makePolicyFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        code: 'COPAY_NOTICE',
        category: 'CO_PAYMENT',
        severity: 'NOTICE',
        confidence: String(field.confidence),
        headline: `${pctStr}% co-payment applies — ₹${outOfPocket} out-of-pocket on a ₹5L claim`,
        evidence,
        whatWouldChangeThis:
          `A ${pctStr}% co-payment is relatively low but still reduces your effective coverage. ` +
          'Zero co-payment plans are available at comparable premiums — compare before renewal.',
      }),
    ];
  },
};
