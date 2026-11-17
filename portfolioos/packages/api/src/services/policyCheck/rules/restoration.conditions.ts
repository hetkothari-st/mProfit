/**
 * Restoration benefit analysis.
 *
 * Restoration (also called "super reinstatement") replenishes the sum insured
 * after it is fully or partially exhausted in a claim year. It is a critical
 * safety net for high-cost illnesses.
 *
 * Key dimensions:
 *  1. Is restoration available at all?
 *  2. How many times per year?
 *  3. Does it apply to the SAME illness that exhausted the SI?
 *     (Some plans restrict restoration to DIFFERENT illnesses only.)
 *  4. What are the actual conditions? (From the policy wording verbatim.)
 *
 * We surface the actual conditions text so the user can read them, not just
 * our interpretation of them.
 */

import type { PolicyRule } from '../types.js';
import { makePolicyFinding } from '../types.js';

const RULE_ID = 'policy.restoration.conditions';
const RULE_VERSION = '1.0.0';

export const restorationConditionsRule: PolicyRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  policyType: ['HEALTH'],
  category: 'RESTORATION',

  evaluate(facts) {
    const restorationField = facts.extraction.restorationAvailable;

    if (restorationField.status === 'NOT_FOUND' || restorationField.value === null) {
      return [
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'RESTORATION_UNKNOWN',
          category: 'RESTORATION',
          severity: 'NOTICE',
          confidence: '0.5',
          headline: 'Restoration / super reinstatement benefit could not be confirmed',
          evidence: [
            {
              docId: restorationField.sourceDocId ?? '',
              page: restorationField.sourcePage ?? 1,
              clauseHeading: null,
              extractedText: 'Restoration clause not found in the uploaded documents.',
            },
          ],
          whatWouldChangeThis:
            'Upload the full policy wording to confirm whether restoration is available. ' +
            'Without it, your sum insured may not be replenished if exhausted in a single year.',
        }),
      ];
    }

    const findings = [];

    if (!restorationField.value) {
      // No restoration
      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'RESTORATION_NOT_AVAILABLE',
          category: 'RESTORATION',
          severity: 'WARNING',
          confidence: String(restorationField.confidence),
          headline: 'No restoration benefit — sum insured is not replenished after a large claim',
          evidence: [
            {
              docId: restorationField.sourceDocId ?? '',
              page: restorationField.sourcePage ?? 1,
              clauseHeading: restorationField.clauseHeading ?? null,
              extractedText: 'No restoration benefit.',
            },
          ],
          whatWouldChangeThis:
            'If your sum insured is exhausted by one claim, there is no coverage left for the rest of the year. ' +
            'Consider upgrading to a plan with restoration. For large sum insureds (₹10L+) this is less critical.',
        }),
      );
      return findings;
    }

    // Restoration available — surface the conditions
    const countField = facts.extraction.restorationCount;
    const sameIllnessField = facts.extraction.restorationForSameIllness;
    const conditionsField = facts.extraction.restorationConditionsText;

    const countStr =
      countField.status !== 'NOT_FOUND' && countField.value !== null
        ? countField.value === 0
          ? 'unlimited'
          : String(countField.value)
        : 'unknown number of';

    // Core restoration finding — INFO level (it's a benefit)
    const restorEvidence = [
      {
        docId: restorationField.sourceDocId ?? '',
        page: restorationField.sourcePage ?? 1,
        clauseHeading: restorationField.clauseHeading ?? 'Restoration clause',
        extractedText: conditionsField.value ?? 'Restoration benefit available.',
      },
    ];

    findings.push(
      makePolicyFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        code: 'RESTORATION_AVAILABLE',
        category: 'RESTORATION',
        severity: 'INFO',
        confidence: String(restorationField.confidence),
        headline: `Restoration benefit available — ${countStr} time(s) per policy year`,
        evidence: restorEvidence,
        whatWouldChangeThis:
          'Restoration replenishes your sum insured if exhausted. ' +
          'Check the conditions carefully — some plans only restore for different illnesses.',
      }),
    );

    // Flag if same-illness restriction applies
    if (
      sameIllnessField.status !== 'NOT_FOUND' &&
      sameIllnessField.value === false
    ) {
      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'RESTORATION_DIFFERENT_ILLNESS_ONLY',
          category: 'RESTORATION',
          severity: 'WARNING',
          confidence: String(sameIllnessField.confidence),
          headline: 'Restoration only applies for a DIFFERENT illness — same illness excludes it',
          evidence: [
            {
              docId: sameIllnessField.sourceDocId ?? '',
              page: sameIllnessField.sourcePage ?? 1,
              clauseHeading: sameIllnessField.clauseHeading ?? null,
              extractedText: 'Restoration is not available for the same illness that exhausted the sum insured.',
            },
          ],
          whatWouldChangeThis:
            'If the same illness (e.g. a cancer requiring multiple admissions) exhausts your sum insured, ' +
            'the restoration benefit will not apply. ' +
            'Upgrade to a plan where restoration applies for the same illness too, ' +
            'or ensure you have an adequate base sum insured.',
        }),
      );
    }

    return findings;
  },
};
