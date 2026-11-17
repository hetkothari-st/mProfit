/**
 * Additional meaningful benefits analysis.
 *
 * Surfaces positive aspects of the policy: OPD cover, health checkup,
 * critical illness cover, AYUSH, maternity, etc. These are INFO findings —
 * they inform the user of what they have, not what they lack.
 */

import type { PolicyRule } from '../types.js';
import { makePolicyFinding } from '../types.js';

const RULE_ID = 'policy.benefits.additional';
const RULE_VERSION = '1.0.0';

export const benefitsAdditionalRule: PolicyRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  policyType: ['HEALTH'],
  category: 'BENEFIT',

  evaluate(facts) {
    const findings = [];

    // ---- OPD cover ----
    const opdField = facts.extraction.opdCovered;
    if (opdField.status !== 'NOT_FOUND' && opdField.value === true) {
      const limitField = facts.extraction.opdLimitInr;
      const limitStr =
        limitField.status !== 'NOT_FOUND' && limitField.value !== null
          ? ` (up to ₹${limitField.value}/year)`
          : '';

      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'OPD_COVERED',
          category: 'BENEFIT',
          severity: 'INFO',
          confidence: String(opdField.confidence),
          headline: `OPD (out-patient) cover included${limitStr}`,
          evidence: [
            {
              docId: opdField.sourceDocId ?? '',
              page: opdField.sourcePage ?? 1,
              clauseHeading: opdField.clauseHeading ?? null,
              extractedText: `OPD covered${limitStr}.`,
            },
          ],
          whatWouldChangeThis:
            'OPD cover reimburses doctor consultations, diagnostics and medicines without hospitalisation. ' +
            'This is a valuable benefit that reduces your out-of-pocket for routine care.',
        }),
      );
    }

    // ---- Health checkup ----
    const checkupField = facts.extraction.healthCheckupCovered;
    if (checkupField.status !== 'NOT_FOUND' && checkupField.value === true) {
      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'HEALTH_CHECKUP_COVERED',
          category: 'BENEFIT',
          severity: 'INFO',
          confidence: String(checkupField.confidence),
          headline: 'Annual health check-up is included',
          evidence: [
            {
              docId: checkupField.sourceDocId ?? '',
              page: checkupField.sourcePage ?? 1,
              clauseHeading: checkupField.clauseHeading ?? null,
              extractedText: 'Annual health check-up included.',
            },
          ],
          whatWouldChangeThis:
            'Take advantage of the annual health check-up — it is a preventive benefit included in your premium. ' +
            'Unused benefits do not carry over.',
        }),
      );
    }

    // ---- Critical illness cover ----
    const ciField = facts.extraction.criticalIllnessCoverInr;
    if (ciField.status !== 'NOT_FOUND' && ciField.value !== null) {
      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'CRITICAL_ILLNESS_COVER',
          category: 'BENEFIT',
          severity: 'INFO',
          confidence: String(ciField.confidence),
          headline: `Critical illness cover of ₹${ciField.value} included`,
          evidence: [
            {
              docId: ciField.sourceDocId ?? '',
              page: ciField.sourcePage ?? 1,
              clauseHeading: ciField.clauseHeading ?? null,
              extractedText: `Critical illness cover: ₹${ciField.value}`,
            },
          ],
          whatWouldChangeThis:
            'Critical illness cover pays a lump sum on diagnosis of listed conditions (cancer, heart attack, stroke, etc.). ' +
            'This is separate from the hospitalisation benefit and can cover income loss and treatment costs beyond hospitalisation.',
        }),
      );
    }

    // ---- AYUSH ----
    const ayushField = facts.extraction.ayushCovered;
    if (ayushField.status !== 'NOT_FOUND' && ayushField.value === true) {
      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'AYUSH_COVERED',
          category: 'BENEFIT',
          severity: 'INFO',
          confidence: String(ayushField.confidence),
          headline: 'AYUSH treatment (Ayurveda, Yoga, Unani, Siddha, Homeopathy) is covered',
          evidence: [
            {
              docId: ayushField.sourceDocId ?? '',
              page: ayushField.sourcePage ?? 1,
              clauseHeading: ayushField.clauseHeading ?? null,
              extractedText: 'AYUSH treatment covered.',
            },
          ],
          whatWouldChangeThis:
            'IRDAI mandates AYUSH coverage in all health policies. ' +
            'Confirm whether AYUSH treatment requires hospitalisation or is covered for day-care too.',
        }),
      );
    }

    // ---- Other benefits ----
    const otherField = facts.extraction.otherBenefits;
    if (
      otherField.status !== 'NOT_FOUND' &&
      otherField.value !== null &&
      otherField.value.length > 0
    ) {
      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'OTHER_BENEFITS',
          category: 'BENEFIT',
          severity: 'INFO',
          confidence: String(otherField.confidence),
          headline: `${otherField.value.length} additional benefit(s) identified in the policy`,
          evidence: [
            {
              docId: otherField.sourceDocId ?? '',
              page: otherField.sourcePage ?? 1,
              clauseHeading: otherField.clauseHeading ?? null,
              extractedText: otherField.value.slice(0, 3).join('; '),
            },
          ],
          whatWouldChangeThis:
            'Review all benefits to understand the full value of your policy. ' +
            'Some benefits require prior approval or specific network hospitals.',
        }),
      );
    }

    return findings;
  },
};
