/**
 * Waiting period analysis — PED and other waiting periods.
 *
 * Indian health insurance policies have multiple waiting periods:
 *  1. Initial waiting period — no claims accepted (except accidents) for the
 *     first N days after policy inception.
 *  2. Pre-existing disease (PED) waiting period — conditions present before
 *     policy inception are not covered until this period elapses.
 *  3. Specific disease waiting period — named conditions have their own wait.
 *  4. Maternity waiting period.
 *
 * We surface all waiting periods so the user understands their real coverage
 * start date.
 */

import type { PolicyRule } from '../types.js';
import { makePolicyFinding } from '../types.js';

const RULE_ID = 'policy.waiting.ped';
const RULE_VERSION = '1.0.0';

export const waitingPedRule: PolicyRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  policyType: ['HEALTH'],
  category: 'WAITING_PERIOD',

  evaluate(facts) {
    const findings = [];

    // ---- Initial waiting period ----
    const initialField = facts.extraction.initialWaitingDays;
    if (initialField.status !== 'NOT_FOUND' && initialField.value !== null) {
      const days = initialField.value;
      if (days > facts.constants.initialWaitingWarningDays) {
        findings.push(
          makePolicyFinding(facts, {
            ruleId: RULE_ID,
            ruleVersion: RULE_VERSION,
            code: 'INITIAL_WAITING_PERIOD_HIGH',
            category: 'WAITING_PERIOD',
            severity: 'WARNING',
            confidence: String(initialField.confidence),
            headline: `Initial waiting period of ${days} days — no coverage for most conditions during this period`,
            evidence: [
              {
                docId: initialField.sourceDocId ?? '',
                page: initialField.sourcePage ?? 1,
                clauseHeading: initialField.clauseHeading ?? 'Initial waiting period',
                extractedText: `Initial waiting period: ${days} days`,
              },
            ],
            whatWouldChangeThis:
              `For the first ${days} days after policy inception (except accidental hospitalisation), ` +
              'no claims will be accepted. Consider buying before you anticipate needing coverage.',
          }),
        );
      }
    }

    // ---- PED waiting period ----
    const pedField = facts.extraction.pedWaitingDays;
    if (pedField.status !== 'NOT_FOUND' && pedField.value !== null) {
      const days = pedField.value;
      const years = (days / 365).toFixed(1);

      const severity = days >= facts.constants.pedWaitingWarningDays ? 'CRITICAL' : 'WARNING';

      if (days > 0) {
        findings.push(
          makePolicyFinding(facts, {
            ruleId: RULE_ID,
            ruleVersion: RULE_VERSION,
            code: 'PED_WAITING_PERIOD',
            category: 'WAITING_PERIOD',
            severity,
            confidence: String(pedField.confidence),
            headline: `Pre-existing diseases have a ${days}-day (${years} yr) waiting period`,
            evidence: [
              {
                docId: pedField.sourceDocId ?? '',
                page: pedField.sourcePage ?? 1,
                clauseHeading: pedField.clauseHeading ?? 'Pre-existing disease waiting period',
                extractedText: `PED waiting period: ${days} days`,
              },
            ],
            whatWouldChangeThis:
              `Conditions existing before policy inception (diabetes, hypertension, thyroid, etc.) ` +
              `are not covered until ${years} years have elapsed. ` +
              `Continuing uninterrupted coverage reduces this period — do not let the policy lapse.`,
          }),
        );
      }
    }

    // ---- Specific disease waiting period ----
    const specificField = facts.extraction.specificDiseaseWaitingDays;
    if (specificField.status !== 'NOT_FOUND' && specificField.value !== null) {
      const days = specificField.value;
      if (days > 0) {
        findings.push(
          makePolicyFinding(facts, {
            ruleId: RULE_ID,
            ruleVersion: RULE_VERSION,
            code: 'SPECIFIC_DISEASE_WAITING',
            category: 'WAITING_PERIOD',
            severity: 'NOTICE',
            confidence: String(specificField.confidence),
            headline: `Specific diseases have a ${days}-day waiting period`,
            evidence: [
              {
                docId: specificField.sourceDocId ?? '',
                page: specificField.sourcePage ?? 1,
                clauseHeading: specificField.clauseHeading ?? 'Specific disease waiting period',
                extractedText: `Specific disease waiting period: ${days} days`,
              },
            ],
            whatWouldChangeThis:
              'Named conditions (joint replacement, hernia, cataract, etc.) are listed in the policy ' +
              'wording with their specific waiting periods. Review the exclusion list carefully.',
          }),
        );
      }
    }

    // ---- Maternity waiting period ----
    const maternityField = facts.extraction.maternityWaitingDays;
    if (
      maternityField.status !== 'NOT_FOUND' &&
      maternityField.value !== null &&
      maternityField.value > 0
    ) {
      const days = maternityField.value;
      const months = Math.round(days / 30);
      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'MATERNITY_WAITING_PERIOD',
          category: 'WAITING_PERIOD',
          severity: 'NOTICE',
          confidence: String(maternityField.confidence),
          headline: `Maternity waiting period of ${days} days (~${months} months)`,
          evidence: [
            {
              docId: maternityField.sourceDocId ?? '',
              page: maternityField.sourcePage ?? 1,
              clauseHeading: maternityField.clauseHeading ?? 'Maternity waiting period',
              extractedText: `Maternity waiting period: ${days} days`,
            },
          ],
          whatWouldChangeThis:
            `Maternity claims are only covered after ${months} months of continuous coverage. ` +
            'Plan accordingly — do not buy a policy expecting immediate maternity coverage.',
        }),
      );
    }

    return findings;
  },
};
