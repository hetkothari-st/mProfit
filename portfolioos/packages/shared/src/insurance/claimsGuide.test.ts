import { describe, it, expect } from 'vitest';
import {
  CLAIM_GUIDES,
  ESCALATION,
  claimProgress,
  guidesForPolicyType,
  type ClaimTrackInput,
} from './claimsGuide.js';

const OFFICIAL = /^https:\/\/(irdai\.gov\.in|bimabharosa\.irdai\.gov\.in|www\.cioins\.co\.in)\//;

const claim = (over: Partial<ClaimTrackInput>): ClaimTrackInput => ({
  kind: 'HEALTH_REIMBURSEMENT',
  status: 'SUBMITTED',
  claimDate: '2026-08-01',
  documentsCompletedOn: null,
  surveyorAllocatedOn: null,
  claimedAmount: '100000',
  settledAmount: null,
  grievanceFiledOn: null,
  ombudsmanFiledOn: null,
  ...over,
});

describe('claims guides', () => {
  it('offers the guides that fit a kind of policy', () => {
    expect(guidesForPolicyType('HEALTH').map((g) => g.kind)).toEqual(['HEALTH_CASHLESS', 'HEALTH_REIMBURSEMENT']);
    expect(guidesForPolicyType('TERM').map((g) => g.kind)).toContain('LIFE_DEATH');
    expect(guidesForPolicyType('MOTOR').map((g) => g.kind)).toEqual(['MOTOR_OWN_DAMAGE', 'MOTOR_THEFT']);
  });

  it('backs every stated right with an official source', () => {
    for (const guide of Object.values(CLAIM_GUIDES)) {
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(guide.documents.length).toBeGreaterThan(0);
      for (const right of guide.rights) expect(right.source.url).toMatch(OFFICIAL);
    }
    expect(ESCALATION.bimaBharosa.url).toMatch(OFFICIAL);
    expect(ESCALATION.ombudsman.url).toMatch(OFFICIAL);
  });

  it('gives every document a unique id within its guide', () => {
    for (const guide of Object.values(CLAIM_GUIDES)) {
      const ids = guide.documents.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('claimProgress', () => {
  it('health reimbursement: decision due 15 days after the claim is submitted', () => {
    const p = claimProgress(claim({ documentsCompletedOn: '2026-09-01' }), '2026-09-05');
    expect(p.decisionDueOn).toBe('2026-09-16');
    expect(p.next).toMatchObject({ action: 'WAIT', dueOn: '2026-09-16' });
  });

  it('suggests a complaint once the insurer is past the time limit', () => {
    const p = claimProgress(claim({ documentsCompletedOn: '2026-08-01' }), '2026-09-11');
    expect(p.overdueDays).toBe(26);
    expect(p.next.action).toBe('FILE_GRIEVANCE');
  });

  it('death claims: 15 days, but 45 when the insurer investigates', () => {
    const early = claimProgress(claim({ kind: 'LIFE_DEATH', claimDate: '2026-08-20' }), '2026-09-11');
    expect(early.decisionDueOn).toBe('2026-09-04');
    expect(early.latestDueOn).toBe('2026-10-04');
    expect(early.next.action).toBe('WAIT');

    const late = claimProgress(claim({ kind: 'LIFE_DEATH', claimDate: '2026-07-01' }), '2026-09-11');
    expect(late.next.action).toBe('FILE_GRIEVANCE');
  });

  it('motor: report 15 days after the surveyor, decision 7 days after that', () => {
    const p = claimProgress(claim({ kind: 'MOTOR_OWN_DAMAGE', surveyorAllocatedOn: '2026-09-01' }), '2026-09-05');
    expect(p.decisionDueOn).toBe('2026-09-23');
  });

  it('cashless has no day clock of its own', () => {
    expect(claimProgress(claim({ kind: 'HEALTH_CASHLESS' }), '2026-09-11').decisionDueOn).toBeNull();
  });

  it('a rejected or short-paid claim starts with a complaint to the insurer', () => {
    expect(claimProgress(claim({ status: 'REJECTED' }), '2026-09-11').next.action).toBe('FILE_GRIEVANCE');
    expect(
      claimProgress(claim({ status: 'SETTLED', settledAmount: '60000' }), '2026-09-11').next.action,
    ).toBe('FILE_GRIEVANCE');
    expect(claimProgress(claim({ status: 'SETTLED', settledAmount: '100000' }), '2026-09-11').next.action).toBe('NONE');
  });

  it('waits 14 days for the insurer to answer a complaint, then 30 before the Ombudsman', () => {
    const waiting = claimProgress(claim({ status: 'REJECTED', grievanceFiledOn: '2026-09-01' }), '2026-09-11');
    expect(waiting.next).toMatchObject({ action: 'WAIT', dueOn: '2026-09-15' });

    const unanswered = claimProgress(claim({ status: 'REJECTED', grievanceFiledOn: '2026-08-20' }), '2026-09-11');
    expect(unanswered.next).toMatchObject({ action: 'WAIT', dueOn: '2026-09-19' });

    const ombudsman = claimProgress(claim({ status: 'REJECTED', grievanceFiledOn: '2026-08-01' }), '2026-09-11');
    expect(ombudsman.next.action).toBe('GO_TO_OMBUDSMAN');
  });

  it('points above the Ombudsman limit elsewhere', () => {
    const big = claimProgress(
      claim({ status: 'REJECTED', claimedAmount: '7500000', grievanceFiledOn: '2026-08-01' }),
      '2026-09-11',
    );
    expect(big.next.action).toBe('GO_TO_OMBUDSMAN');
    expect(big.withinOmbudsmanLimit).toBe(false);
  });

  it('stops nagging once the Ombudsman has it', () => {
    const p = claimProgress(
      claim({ status: 'REJECTED', grievanceFiledOn: '2026-06-01', ombudsmanFiledOn: '2026-07-15' }),
      '2026-09-11',
    );
    expect(p.next.action).toBe('NONE');
    expect(p.stage).toBe('WITH_OMBUDSMAN');
  });
});
