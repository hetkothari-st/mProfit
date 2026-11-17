/**
 * Room rent restriction analysis.
 *
 * A room rent limit can trigger proportionate deductions: if you occupy a
 * room priced above the limit, the insurer may apply the same proportion to
 * all associated charges (doctor fees, diagnostics, etc.), not just the
 * room difference. This is one of the most impactful and least-understood
 * restrictions in Indian health insurance.
 *
 * CRITICAL RULE: We NEVER assume proportionate deductions apply from the
 * mere presence of a room rent limit. We only flag proportionate deductions
 * when `proportionateDeductionApplies` is explicitly confirmed EXTRACTED or
 * USER_EDITED with value true.
 *
 * Room rent types:
 *  - NO_LIMIT → positive, no finding
 *  - ACTUAL → positive
 *  - SUB_LIMIT_PCT → warn if low (<1.5% SI per day)
 *  - SUB_LIMIT_FIXED → warn if low (<₹3000/day) or flag if proportionate
 *    deductions apply
 */

import { Decimal } from '@everypaisa/shared';
import type { PolicyRule } from '../types.js';
import { makePolicyFinding } from '../types.js';

const RULE_ID = 'policy.roomrent.restriction';
const RULE_VERSION = '1.0.0';

export const roomRentRestrictionRule: PolicyRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  policyType: ['HEALTH'],
  category: 'ROOM_RENT',

  evaluate(facts) {
    const limitTypeField = facts.extraction.roomRentLimitType;
    const proportionateField = facts.extraction.proportionateDeductionApplies;

    if (limitTypeField.status === 'NOT_FOUND' || limitTypeField.value === null) {
      return [
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'ROOM_RENT_UNKNOWN',
          category: 'ROOM_RENT',
          severity: 'NOTICE',
          confidence: '0.6',
          headline: 'Room rent limits could not be confirmed from the uploaded documents',
          evidence: [
            {
              docId: limitTypeField.sourceDocId ?? '',
              page: limitTypeField.sourcePage ?? 1,
              clauseHeading: null,
              extractedText: 'Room rent clause not found.',
            },
          ],
          whatWouldChangeThis:
            'Upload the full policy wording or schedule that contains the room rent clause.',
        }),
      ];
    }

    const limitType = limitTypeField.value;
    const findings = [];

    if (limitType === 'NO_LIMIT' || limitType === 'ACTUAL') {
      // Positive — no restriction finding
      return [];
    }

    // Build base evidence
    const evidence = [
      {
        docId: limitTypeField.sourceDocId ?? '',
        page: limitTypeField.sourcePage ?? 1,
        clauseHeading: limitTypeField.clauseHeading ?? 'Room rent clause',
        extractedText: limitTypeField.value ?? '',
      },
    ];

    if (limitType === 'SUB_LIMIT_PCT') {
      const pctField = facts.extraction.roomRentLimitPct;
      if (pctField.status !== 'NOT_FOUND' && pctField.value !== null) {
        const pct = new Decimal(pctField.value);
        const lowThreshold = new Decimal(facts.constants.roomRentLowPct);
        if (pct.lt(lowThreshold)) {
          findings.push(
            makePolicyFinding(facts, {
              ruleId: RULE_ID,
              ruleVersion: RULE_VERSION,
              code: 'ROOM_RENT_LOW_PCT',
              category: 'ROOM_RENT',
              severity: 'WARNING',
              confidence: String(pctField.confidence),
              headline: `Room rent capped at ${pctField.value}% of sum insured per day — may be insufficient`,
              evidence: [
                ...evidence,
                {
                  docId: pctField.sourceDocId ?? '',
                  page: pctField.sourcePage ?? 1,
                  clauseHeading: pctField.clauseHeading ?? null,
                  extractedText: `Room rent: ${pctField.value}% of sum insured per day`,
                },
              ],
              whatWouldChangeThis:
                `At ${pctField.value}% of SI, a ₹10L policy allows ₹${new Decimal('10').mul(pctField.value).toFixed(0)}00 per day. ` +
                `Most urban hospitals charge ₹5,000–₹15,000/day for a standard room. ` +
                `Look for a policy with ≥${lowThreshold.toFixed(1)}% per day or a fixed limit of ₹5,000+/day.`,
            }),
          );
        }
      }
    }

    if (limitType === 'SUB_LIMIT_FIXED') {
      const fixedField = facts.extraction.roomRentLimitInr;
      if (fixedField.status !== 'NOT_FOUND' && fixedField.value !== null) {
        const limit = new Decimal(fixedField.value);
        const lowThreshold = new Decimal(facts.constants.roomRentLowInr);
        if (limit.lt(lowThreshold)) {
          findings.push(
            makePolicyFinding(facts, {
              ruleId: RULE_ID,
              ruleVersion: RULE_VERSION,
              code: 'ROOM_RENT_LOW_FIXED',
              category: 'ROOM_RENT',
              severity: 'WARNING',
              confidence: String(fixedField.confidence),
              headline: `Room rent capped at ₹${limit.toFixed(0)}/day — insufficient for most urban hospitals`,
              evidence: [
                ...evidence,
                {
                  docId: fixedField.sourceDocId ?? '',
                  page: fixedField.sourcePage ?? 1,
                  clauseHeading: fixedField.clauseHeading ?? null,
                  extractedText: `Room rent limit: ₹${limit.toFixed(0)}/day`,
                },
              ],
              whatWouldChangeThis:
                `₹${limit.toFixed(0)}/day is below the threshold of ₹${lowThreshold.toFixed(0)}. ` +
                `Most urban hospitals charge ₹5,000–₹15,000/day for a standard room. ` +
                `Upgrade to a plan with ₹5,000+/day room rent limit.`,
            }),
          );
        }
      }
    }

    // Proportionate deductions — ONLY if explicitly confirmed
    if (
      proportionateField.status !== 'NOT_FOUND' &&
      proportionateField.value === true
    ) {
      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'ROOM_RENT_PROPORTIONATE_DEDUCTION',
          category: 'ROOM_RENT',
          severity: 'CRITICAL',
          confidence: String(proportionateField.confidence),
          headline: 'Policy explicitly applies proportionate deductions if room rent limit is exceeded',
          evidence: [
            ...evidence,
            {
              docId: proportionateField.sourceDocId ?? '',
              page: proportionateField.sourcePage ?? 1,
              clauseHeading: proportionateField.clauseHeading ?? 'Proportionate deduction clause',
              extractedText: 'Proportionate deductions apply when room rent exceeds the policy limit.',
            },
          ],
          whatWouldChangeThis:
            'If you book a room priced above the policy limit, ALL associated charges ' +
            '(doctor fees, diagnostics, nursing) are reduced in the same proportion — ' +
            'not just the room cost. This can significantly increase your out-of-pocket. ' +
            'Book a room within the policy limit, or switch to a plan without proportionate deductions.',
        }),
      );
    }

    return findings;
  },
};
