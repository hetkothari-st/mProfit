/**
 * Tests for the policy verdict decision table.
 */

import { describe, it, expect } from 'vitest';
import { decidePolicyVerdict } from '../../src/services/policyCheck/verdict.js';
import type { PolicyFindingDTO } from '@everypaisa/shared';
import type { PolicyScoreSnapshot } from '@everypaisa/shared';

function makeSnapshot(overrides: Partial<PolicyScoreSnapshot> = {}): PolicyScoreSnapshot {
  return {
    overall: '75',
    pillars: [],
    ratingCategory: 'Good',
    strongestAspects: [],
    weakestAspects: [],
    criticalIssues: [],
    scoringVersion: 'v1',
    incompleteAnalysis: false,
    ...overrides,
  };
}

function finding(severity: PolicyFindingDTO['severity'], code: string): PolicyFindingDTO {
  return {
    id: code,
    checkId: 'c',
    ruleId: 'r',
    ruleVersion: '1',
    code,
    category: 'CO_PAYMENT',
    severity,
    confidence: '0.9',
    headline: `Test finding ${code}`,
    evidence: [{ docId: 'd', page: 1, clauseHeading: null, extractedText: 'Test' }],
    whatWouldChangeThis: 'Fix it',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

describe('decidePolicyVerdict', () => {
  it('GREEN when no findings above NOTICE', () => {
    const verdict = decidePolicyVerdict([finding('INFO', 'BENEFIT_A')], makeSnapshot());
    expect(verdict.verdict).toBe('GREEN');
  });

  it('AMBER when any WARNING finding', () => {
    const verdict = decidePolicyVerdict(
      [finding('WARNING', 'ROOM_RENT_LOW'), finding('INFO', 'NCB_OK')],
      makeSnapshot(),
    );
    expect(verdict.verdict).toBe('AMBER');
    expect(verdict.reasons).toContain('ROOM_RENT_LOW');
  });

  it('RED when any CRITICAL finding', () => {
    const verdict = decidePolicyVerdict(
      [finding('CRITICAL', 'COPAY_CRITICAL'), finding('WARNING', 'ROOM_RENT_LOW')],
      makeSnapshot(),
    );
    expect(verdict.verdict).toBe('RED');
    expect(verdict.reasons).toContain('COPAY_CRITICAL');
  });

  it('INCOMPLETE when score snapshot says incompleteAnalysis', () => {
    const verdict = decidePolicyVerdict(
      [finding('CRITICAL', 'COPAY_CRITICAL')],
      makeSnapshot({ incompleteAnalysis: true, overall: null }),
    );
    expect(verdict.verdict).toBe('INCOMPLETE');
  });

  it('INCOMPLETE when overall score is null', () => {
    const verdict = decidePolicyVerdict([], makeSnapshot({ overall: null, incompleteAnalysis: true }));
    expect(verdict.verdict).toBe('INCOMPLETE');
  });

  it('reasons list contains only finding codes from the triggering findings', () => {
    const verdict = decidePolicyVerdict(
      [finding('WARNING', 'W1'), finding('WARNING', 'W2'), finding('INFO', 'I1')],
      makeSnapshot(),
    );
    expect(verdict.verdict).toBe('AMBER');
    expect(verdict.reasons).toContain('W1');
    expect(verdict.reasons).toContain('W2');
    expect(verdict.reasons).not.toContain('I1');
  });

  it('capped at 5 reasons', () => {
    const findings = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].map((c) => finding('CRITICAL', c));
    const verdict = decidePolicyVerdict(findings, makeSnapshot());
    expect(verdict.reasons.length).toBeLessThanOrEqual(5);
  });
});
