/**
 * Policy check rules registry.
 *
 * Mirrors rules/registry.ts in mfAnalytics: a single exported array of all
 * registered rules, with a duplicate-id guard at module load. Adding a rule
 * means appending to this list — no engine change required.
 *
 * Rules are evaluated in registration order. Order affects the finding list
 * but NOT the verdict (the verdict table branches on severity, not insertion
 * order). Keep related rules adjacent for readability.
 */

import type { PolicyRule } from '../types.js';
import { copayMandatoryRule } from './copay.mandatory.js';
import { roomRentRestrictionRule } from './roomrent.restriction.js';
import { sublimitDiseaseCap } from './sublimit.disease-cap.js';
import { waitingPedRule } from './waiting.ped.js';
import { ncbStructureRule } from './ncb.structure.js';
import { restorationConditionsRule } from './restoration.conditions.js';
import { exclusionsPermanentRule } from './exclusions.permanent.js';
import { benefitsAdditionalRule } from './benefits.additional.js';
import { waitingContinuityRule } from './waiting.continuity.js';
import { documentsConflictsRule } from './documents.conflicts.js';
import { TERM_RULES } from './term.rules.js';
import { SAVINGS_RULES } from './savings.rules.js';
import { MOTOR_RULES } from './motor.rules.js';
import { HOME_RULES } from './home.rules.js';

export const POLICY_RULES: PolicyRule[] = [
  copayMandatoryRule,
  roomRentRestrictionRule,
  sublimitDiseaseCap,
  waitingPedRule,
  waitingContinuityRule,
  ncbStructureRule,
  restorationConditionsRule,
  exclusionsPermanentRule,
  benefitsAdditionalRule,
  documentsConflictsRule,
];

/** Term life rules (see term.rules.ts). Evaluated for TERM policies only. */
export const TERM_POLICY_RULES = TERM_RULES;

/** Savings-plan rules (see savings.rules.ts). Evaluated for ENDOWMENT / WHOLE_LIFE / ULIP policies. */
export const SAVINGS_POLICY_RULES = SAVINGS_RULES;

/** Motor rules (see motor.rules.ts). Evaluated for MOTOR policies. */
export const MOTOR_POLICY_RULES = MOTOR_RULES;

/** Home rules (see home.rules.ts). Evaluated for HOME policies. */
export const HOME_POLICY_RULES = HOME_RULES;

// Duplicate-id guard — catches copy-paste errors at module load, not at runtime
// when two rules emit findings and one silently overwrites the other.
(function checkDuplicateIds() {
  const seen = new Set<string>();
  const all: Array<{ id: string }> = [
    ...POLICY_RULES,
    // The cross-document conflicts rule is intentionally shared by both lists.
    ...TERM_POLICY_RULES.filter((r) => r.id !== documentsConflictsRule.id),
    ...SAVINGS_POLICY_RULES.filter((r) => r.id !== documentsConflictsRule.id),
    ...MOTOR_POLICY_RULES.filter((r) => r.id !== documentsConflictsRule.id),
    ...HOME_POLICY_RULES.filter((r) => r.id !== documentsConflictsRule.id),
  ];
  for (const rule of all) {
    if (seen.has(rule.id)) {
      throw new Error(
        `[policy rules] Duplicate rule id "${rule.id}". Rule ids must be unique and stable across versions.`,
      );
    }
    seen.add(rule.id);
  }
})();
