/**
 * Cross-document conflicts.
 *
 * A policy's wording, schedule and endorsements can disagree. Extraction
 * records every disagreement (see fieldMerge.ts); this rule turns them into
 * findings so the user sees:
 *  - UNRESOLVED   (WARNING): documents of equal standing disagree — which one
 *                  applies is unknown, so the figure below it is provisional.
 *  - RESOLVED     (NOTICE):  a higher-precedence document (endorsement or
 *                  schedule) changed a value from what a lower one says.
 */

import type { PolicyEvidence, PolicyFieldConflict, PolicyFindingDTO } from '@everypaisa/shared';
import type { PolicyRule } from '../types.js';
import { makePolicyFinding } from '../types.js';

const RULE_ID = 'policy.documents.conflicts';
const RULE_VERSION = '1.0.0';

function label(field: string): string {
  const [base, sub] = field.split('.');
  const words = base!.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return sub ? `${words} (${sub})` : words;
}

const clip = (v: string, n = 28) => (v.length > n ? v.slice(0, n - 1) + '…' : v);

function evidenceFor(c: PolicyFieldConflict): PolicyEvidence[] {
  return [c.chosen, c.other].map((s) => ({
    docId: s.docId ?? '',
    page: s.page ?? 1,
    clauseHeading: s.clauseHeading ?? s.classification.replace('_', ' ').toLowerCase(),
    extractedText: `${label(c.field)}: ${s.value}`,
  }));
}

export const documentsConflictsRule: PolicyRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  policyType: ['HEALTH'],
  category: 'OTHER',

  evaluate(facts) {
    const out: PolicyFindingDTO[] = [];
    const used = new Set<string>();

    for (const c of facts.conflicts ?? []) {
      const unresolved = c.status === 'UNRESOLVED';
      const baseCode = `${unresolved ? 'CONFLICT' : 'AMENDED'}_${c.field.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`;
      let code = baseCode;
      for (let i = 2; used.has(code); i++) code = `${baseCode}_${i}`;
      used.add(code);

      const headline = unresolved
        ? `Documents disagree on ${label(c.field)}: "${clip(c.chosen.value)}" vs "${clip(c.other.value)}"`
        : `${label(c.field)} differs by document; ${c.chosen.classification.replace('_', ' ').toLowerCase()} value "${clip(c.chosen.value)}" used`;

      out.push(
        makePolicyFinding(facts, {
          ruleId: RULE_ID,
          ruleVersion: RULE_VERSION,
          code,
          category: 'OTHER',
          severity: unresolved ? 'WARNING' : 'NOTICE',
          confidence: '0.9',
          headline: headline.slice(0, 120),
          evidence: evidenceFor(c),
          whatWouldChangeThis: unresolved
            ? `Two documents give "${c.chosen.value}" and "${c.other.value}" for ${label(c.field)}. ` +
              'Confirm the correct value on the verification screen, or ask the insurer which document is current. ' +
              'Results that depend on this value are provisional until then.'
            : `The ${c.chosen.classification.replace('_', ' ').toLowerCase()} says "${c.chosen.value}" while the ` +
              `${c.other.classification.replace('_', ' ').toLowerCase()} says "${c.other.value}". ` +
              'The higher-precedence document was used. Check that its effective date covers your current policy year.',
        }),
      );
    }
    return out;
  },
};
