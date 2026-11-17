/**
 * Policy verdict decision table.
 *
 * First-match-wins: INCOMPLETE → RED → AMBER → GREEN.
 *
 * The verdict is informational/non-binding. No imperative advice is embedded
 * in a verdict — it describes what the analysis found, not what the user
 * must do.
 *
 * Append-only: PolicyVerdict rows are never edited. A re-run that reaches a
 * different conclusion writes a new row and points the old row's
 * supersededById at it. The orchestrator handles this — this file is pure.
 */

import type { PolicyFindingDTO, PolicyVerdictKind } from '@everypaisa/shared';
import type { PolicyScoreSnapshot } from '@everypaisa/shared';

// ---------------------------------------------------------------------------
// Decision table
// ---------------------------------------------------------------------------

export interface PolicyVerdictDecision {
  verdict: PolicyVerdictKind;
  /** Finding codes that drove this verdict, for the reasons column. */
  reasons: string[];
}

/**
 * Decide the verdict from findings and the score snapshot.
 *
 * Rules (first-match):
 *  1. INCOMPLETE — score snapshot says incompleteAnalysis=true.
 *  2. RED — any CRITICAL finding.
 *  3. AMBER — any WARNING finding.
 *  4. GREEN — no findings above NOTICE level.
 */
export function decidePolicyVerdict(
  findings: PolicyFindingDTO[],
  scoreSnapshot: PolicyScoreSnapshot,
): PolicyVerdictDecision {
  // Rule 1: INCOMPLETE
  if (scoreSnapshot.incompleteAnalysis || scoreSnapshot.overall === null) {
    const incompleteReasons = findings
      .filter((f) => f.severity === 'CRITICAL' || f.severity === 'WARNING')
      .map((f) => f.code)
      .slice(0, 5);
    return {
      verdict: 'INCOMPLETE',
      reasons: incompleteReasons.length > 0 ? incompleteReasons : ['INCOMPLETE_ANALYSIS'],
    };
  }

  const criticalFindings = findings.filter((f) => f.severity === 'CRITICAL');
  const warningFindings = findings.filter((f) => f.severity === 'WARNING');

  // Rule 2: RED — any CRITICAL finding
  if (criticalFindings.length > 0) {
    return {
      verdict: 'RED',
      reasons: criticalFindings.map((f) => f.code).slice(0, 5),
    };
  }

  // Rule 3: AMBER — any WARNING finding
  if (warningFindings.length > 0) {
    return {
      verdict: 'AMBER',
      reasons: warningFindings.map((f) => f.code).slice(0, 5),
    };
  }

  // Rule 4: GREEN
  const noticeFindings = findings.filter((f) => f.severity === 'NOTICE');
  return {
    verdict: 'GREEN',
    reasons: noticeFindings.map((f) => f.code).slice(0, 3),
  };
}
