/**
 * No-claim bonus (NCB) analysis.
 *
 * NCB rewards claim-free years either by increasing the sum insured (SI bonus)
 * or by reducing the premium (premium discount). SI bonus type is significantly
 * better: it increases your effective coverage without additional premium.
 */

import type { PolicyRule } from '../types.js';
import { makePolicyFinding } from '../types.js';

const RULE_ID = 'policy.ncb.structure';
const RULE_VERSION = '1.0.0';

export const ncbStructureRule: PolicyRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  policyType: ['HEALTH'],
  category: 'NCB',

  evaluate(facts) {
    const ncbField = facts.extraction.ncbAvailable;

    if (ncbField.status === 'NOT_FOUND' || ncbField.value === null) {
      return [
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'NCB_UNKNOWN',
          category: 'NCB',
          severity: 'INFO',
          confidence: '0.5',
          headline: 'No-claim bonus terms could not be confirmed from the uploaded documents',
          evidence: [
            {
              docId: ncbField.sourceDocId ?? '',
              page: ncbField.sourcePage ?? 1,
              clauseHeading: null,
              extractedText: 'NCB clause not found.',
            },
          ],
          whatWouldChangeThis:
            'Upload the full policy wording or schedule that describes the NCB benefit.',
        }),
      ];
    }

    if (!ncbField.value) {
      return [
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'NCB_NOT_AVAILABLE',
          category: 'NCB',
          severity: 'NOTICE',
          confidence: String(ncbField.confidence),
          headline: 'No-claim bonus is not available in this policy',
          evidence: [
            {
              docId: ncbField.sourceDocId ?? '',
              page: ncbField.sourcePage ?? 1,
              clauseHeading: ncbField.clauseHeading ?? null,
              extractedText: 'No NCB benefit.',
            },
          ],
          whatWouldChangeThis:
            'NCB policies reward claim-free years with a higher sum insured at no extra premium. ' +
            'Consider switching to a plan with NCB on renewal.',
        }),
      ];
    }

    // NCB is available — check the structure
    const findings = [];
    const incrField = facts.extraction.ncbIncrementPct;
    const maxField = facts.extraction.ncbMaxPct;
    const typeField = facts.extraction.ncbType;

    if (incrField.status !== 'NOT_FOUND' && incrField.value !== null) {
      const incrPct = incrField.value;
      const maxPct = maxField.status !== 'NOT_FOUND' && maxField.value !== null ? maxField.value : null;
      const ncbType = typeField.status !== 'NOT_FOUND' && typeField.value !== null ? typeField.value : 'BONUS_SI';

      const isDiscountType = ncbType.toUpperCase().includes('DISCOUNT');
      const severity = isDiscountType ? 'NOTICE' : 'INFO';

      const headline = isDiscountType
        ? `NCB gives a ${incrPct}% premium discount per claim-free year (not a sum insured increase)`
        : `NCB increases sum insured by ${incrPct}% per claim-free year${maxPct ? `, up to ${maxPct}%` : ''}`;

      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: isDiscountType ? 'NCB_PREMIUM_DISCOUNT' : 'NCB_SI_BONUS',
          category: 'NCB',
          severity,
          confidence: String(incrField.confidence),
          headline,
          evidence: [
            {
              docId: incrField.sourceDocId ?? '',
              page: incrField.sourcePage ?? 1,
              clauseHeading: incrField.clauseHeading ?? 'NCB clause',
              extractedText: `NCB: ${incrPct}% per claim-free year${maxPct ? `, max ${maxPct}%` : ''}. Type: ${ncbType}`,
            },
          ],
          whatWouldChangeThis: isDiscountType
            ? 'A premium discount type NCB reduces your renewal premium but not your coverage amount. ' +
              'An SI bonus type NCB (sum insured increase) is better — it compounds your coverage each year.'
            : `After each claim-free year your sum insured grows by ${incrPct}%${maxPct ? ` (capped at ${maxPct}%)` : ''}. ` +
              'Avoid claims below ₹30,000–₹50,000 to protect your NCB.',
        }),
      );
    }

    return findings;
  },
};
