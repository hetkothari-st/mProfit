/**
 * Permanent and specific exclusion analysis.
 *
 * We surface all extracted exclusions so the user knows what is NOT covered.
 * We flag conditions that are commonly mis-assumed to be covered (dental,
 * cosmetic, self-inflicted injury, etc.) as INFO, and flag unusual or
 * potentially impactful ones as NOTICE or WARNING.
 */

import type { PolicyFindingDTO } from '@everypaisa/shared';
import type { PolicyRule } from '../types.js';
import { makePolicyFinding } from '../types.js';

const RULE_ID = 'policy.exclusions.permanent';
const RULE_VERSION = '1.0.0';

// Well-known exclusions that most users assume are covered
const COMMONLY_MISSED = new RegExp(
  '(dental|cosmetic|obesity|weight loss|infertility|ivf|mental|psychiatric|' +
  'alcohol|drug|substance|self.inflicted|suicide|war|riot|nuclear|' +
  'experimental|unproven|vitamins|supplements)',
  'i',
);

export const exclusionsPermanentRule: PolicyRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  policyType: ['HEALTH'],
  category: 'EXCLUSION',

  evaluate(facts) {
    const permField = facts.extraction.permanentExclusions;
    const specField = facts.extraction.specificExclusions;

    if (
      (permField.status === 'NOT_FOUND' || !permField.value || permField.value.length === 0) &&
      (specField.status === 'NOT_FOUND' || !specField.value || specField.value.length === 0)
    ) {
      return [
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'EXCLUSIONS_NOT_FOUND',
          category: 'EXCLUSION',
          severity: 'NOTICE',
          confidence: '0.5',
          headline: 'Exclusion clauses could not be extracted from the uploaded documents',
          evidence: [
            {
              docId: permField.sourceDocId ?? '',
              page: permField.sourcePage ?? 1,
              clauseHeading: null,
              extractedText: 'Exclusion clauses not found.',
            },
          ],
          whatWouldChangeThis:
            'Upload the full policy wording document which contains the permanent exclusions list.',
        }),
      ];
    }

    const findings: PolicyFindingDTO[] = [];
    const allExclusions = [
      ...(permField.status !== 'NOT_FOUND' && permField.value ? permField.value : []),
      ...(specField.status !== 'NOT_FOUND' && specField.value ? specField.value : []),
    ];

    if (allExclusions.length === 0) return findings;

    // Flag commonly-missed exclusions
    for (const exclusion of allExclusions) {
      if (COMMONLY_MISSED.test(exclusion)) {
        const headline = `Exclusion: ${exclusion}`.slice(0, 120);
        findings.push(
          makePolicyFinding(facts, {
            ruleId: RULE_ID,
            ruleVersion: RULE_VERSION,
            code: `EXCLUSION_${exclusion.replace(/[^A-Z0-9]/gi, '_').toUpperCase().slice(0, 30)}`,
            category: 'EXCLUSION',
            severity: 'INFO',
            confidence: String(permField.confidence),
            headline,
            evidence: [
              {
                docId: permField.sourceDocId ?? '',
                page: permField.sourcePage ?? 1,
                clauseHeading: permField.clauseHeading ?? 'Exclusions',
                extractedText: exclusion,
              },
            ],
            whatWouldChangeThis:
              `${exclusion} is permanently excluded from this policy. ` +
              'This is a commonly missed exclusion. ' +
              'Specific riders may add coverage for some of these conditions.',
          }),
        );
      }
    }

    // Surface a summary finding of all exclusions (INFO level)
    if (allExclusions.length > 0) {
      const count = allExclusions.length;
      findings.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code: 'EXCLUSIONS_LIST',
          category: 'EXCLUSION',
          severity: 'INFO',
          confidence: String(Math.max(permField.confidence, specField.confidence ?? 0)),
          headline: `${count} exclusion${count === 1 ? '' : 's'} identified in the policy`,
          evidence: [
            {
              docId: permField.sourceDocId ?? '',
              page: permField.sourcePage ?? 1,
              clauseHeading: permField.clauseHeading ?? 'Exclusions',
              extractedText: allExclusions.slice(0, 5).join('; '),
            },
          ],
          whatWouldChangeThis:
            'Review the full exclusions list in the policy wording to understand what is not covered. ' +
            'Common exclusions include dental, cosmetic treatments, pre-existing conditions during waiting period, and more.',
        }),
      );
    }

    return findings;
  },
};
