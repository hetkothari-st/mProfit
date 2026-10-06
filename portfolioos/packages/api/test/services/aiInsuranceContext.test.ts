import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// Insurance hub, phase 4: the assistant's insurance context — the user's
// policies (never a policy number), open claims, nominee gaps, and the
// help-library topics that match the question, each rule with its source.

const svc = vi.hoisted(() => ({
  listPolicies: vi.fn(),
  getEffectiveScope: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: { user: { findUnique: svc.userFindUnique }, holdingProjection: { findMany: vi.fn() } },
}));
vi.mock('../../src/services/insurance.service.js', () => ({ listPolicies: svc.listPolicies }));
vi.mock('../../src/services/familyScope.service.js', () => ({ getEffectiveScope: svc.getEffectiveScope }));
vi.mock('../../src/services/analytics.service.js', () => ({ getAnalyticsSnapshot: vi.fn().mockRejectedValue(new Error('no db')) }));
vi.mock('../../src/services/dashboard.service.js', () => ({
  getDashboardNetWorthForScope: vi.fn().mockRejectedValue(new Error('no db')),
}));
vi.mock('../../src/services/xirr.service.js', () => ({ computeUserXirr: vi.fn().mockRejectedValue(new Error('no db')) }));
vi.mock('../../src/services/capitalGains.service.js', () => ({ computeUserCapitalGains: vi.fn() }));
vi.mock('../../src/services/tax.service.js', () => ({ taxHarvestReport: vi.fn() }));
vi.mock('../../src/services/goals.service.js', () => ({ listGoals: vi.fn() }));
vi.mock('../../src/services/loans.service.js', () => ({ listLoans: vi.fn() }));
vi.mock('../../src/services/creditCards.service.js', () => ({ listCards: vi.fn() }));

import { buildContext, buildInsuranceData } from '../../src/ai/contextBuilder.js';
import { classifyQuery, QueryIntent } from '../../src/ai/queryClassifier.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function policy(over: Record<string, unknown> = {}) {
  return {
    id: 'pol1',
    userId: 'u1',
    insurer: 'LIC',
    policyNumberLast4: '2345',
    hasPolicyNumber: true,
    type: 'TERM',
    planName: 'Tech Term',
    policyHolder: 'TEST USER',
    nominees: [{ name: 'Asha', relation: 'Spouse', sharePercent: 100 }],
    contacts: { helpline: '1800 000 000' },
    sumAssured: new Prisma.Decimal('10000000'),
    premiumAmount: new Prisma.Decimal('12000'),
    premiumFrequency: 'ANNUAL',
    startDate: day('2020-10-01'),
    maturityDate: day('2055-10-01'),
    nextPremiumDue: day('2026-09-01'),
    status: 'ACTIVE',
    graceDays: 30,
    premiumDue: { dueDate: '2026-09-01', state: 'IN_GRACE', daysUntilDue: -10, graceEndsOn: '2026-10-01', daysLeftInGrace: 20 },
    vehicle: null,
    premiumHistory: [],
    claims: [],
    ...over,
  };
}

function claim(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    claimNumber: 'CLM-99887766',
    claimDate: day('2026-08-01'),
    claimType: 'Hospitalisation',
    kind: 'HEALTH_REIMBURSEMENT',
    status: 'SUBMITTED',
    claimedAmount: '100000',
    settledAmount: null,
    grievanceRef: 'GRV-55443322',
    timeline: [{ on: '2026-08-02', note: 'Called the TPA' }],
    progress: {
      stage: 'REPORTED',
      decisionDueOn: '2026-08-16',
      latestDueOn: '2026-08-16',
      overdueDays: 26,
      withinOmbudsmanLimit: true,
      next: { action: 'FILE_GRIEVANCE', dueOn: null, reason: 'The insurer is past IRDAI’s time limit.' },
    },
    ...over,
  };
}

const q = (text: string) => classifyQuery(text);

beforeEach(() => {
  svc.listPolicies.mockReset();
  svc.getEffectiveScope.mockReset();
  svc.userFindUnique.mockReset();
});

describe('buildInsuranceData', () => {
  it('summarises policies without any policy number, reference number or registration', async () => {
    svc.listPolicies.mockResolvedValue([
      policy(),
      policy({
        id: 'pol2',
        insurer: 'Acko',
        type: 'MOTOR',
        policyNumberLast4: '7788',
        nominees: null,
        vehicle: { id: 'v1', registrationNo: 'MH47BT5950', make: 'Maruti', model: 'Swift' },
        premiumDue: { dueDate: '2027-01-01', state: 'UPCOMING', daysUntilDue: 112, graceEndsOn: null, daysLeftInGrace: null },
      }),
    ]);

    const data = await buildInsuranceData('u1', q('when is my premium due'));
    const json = JSON.stringify(data);

    for (const secret of ['2345', '7788', 'MH47BT5950', 'policyNumber', 'TEST USER', '1800 000 000']) {
      expect(json, secret).not.toContain(secret);
    }
    const policies = data.policies as Array<Record<string, unknown>>;
    expect(policies).toHaveLength(2);
    expect(policies[0]).toMatchObject({
      insurer: 'LIC',
      type: 'TERM',
      plan: 'Tech Term',
      cover: '10000000',
      premium: '12000',
      status: 'ACTIVE',
      nomineeCount: 1,
      premiumDue: { state: 'IN_GRACE', graceEndsOn: '2026-10-01' },
    });
    expect(data.activeCoverByType).toEqual({ TERM: '10000000', MOTOR: '10000000' });
    expect(data.premiumsNeedingAttention).toEqual([
      expect.objectContaining({ insurer: 'LIC', state: 'IN_GRACE', graceEndsOn: '2026-10-01' }),
    ]);
  });

  it('lists open claims with their progress, but no claim or complaint reference and no notes', async () => {
    svc.listPolicies.mockResolvedValue([
      policy({
        type: 'HEALTH',
        claims: [
          claim(),
          claim({ id: 'c2', claimNumber: 'CLM-11112222', progress: { ...claim().progress, stage: 'SETTLED' } }),
        ],
      }),
    ]);

    const data = await buildInsuranceData('u1', q('where does my claim stand'));
    const json = JSON.stringify(data);

    expect(json).not.toContain('CLM-');
    expect(json).not.toContain('GRV-');
    expect(json).not.toContain('Called the TPA');
    expect(data.openClaims).toEqual([
      expect.objectContaining({
        insurer: 'LIC',
        policyType: 'HEALTH',
        stage: 'REPORTED',
        claimedAmount: '100000',
        overdueDays: 26,
        nextAction: 'FILE_GRIEVANCE',
      }),
    ]);
  });

  it('flags active life, health and accident policies with no nominee', async () => {
    svc.listPolicies.mockResolvedValue([
      policy({ nominees: [] }),
      policy({ id: 'p2', type: 'HEALTH', insurer: 'Niva Bupa', nominees: null }),
      policy({ id: 'p3', type: 'MOTOR', insurer: 'Acko', nominees: null }),
      policy({ id: 'p4', type: 'ENDOWMENT', nominees: null, status: 'MATURED' }),
    ]);

    const data = await buildInsuranceData('u1', q('which policies have no nominee'));
    expect(data.nomineeGaps).toEqual([
      { insurer: 'LIC', type: 'TERM', plan: 'Tech Term' },
      { insurer: 'Niva Bupa', type: 'HEALTH', plan: 'Tech Term' },
    ]);
  });

  it('adds the matching help topics with every rule’s source and a link', async () => {
    svc.listPolicies.mockResolvedValue([]);
    const data = await buildInsuranceData('u1', q('what is the grace period on my policy'));

    const topics = data.helpTopics as Array<{ id: string; link: string; rules: Array<{ source: string; url: string }> }>;
    expect(topics[0]!.id).toBe('grace-period');
    expect(topics[0]!.link).toBe('/insurance/help#grace-period');
    for (const r of topics[0]!.rules) {
      expect(r.url).toMatch(/^https:\/\/irdai\.gov\.in\//);
      expect(r.source).toMatch(/page \d+/);
    }
    const others = data.otherHelpTopics as Array<{ id: string }>;
    expect(others.map((t) => t.id)).not.toContain('grace-period');
    expect(others.length).toBeGreaterThan(5);
  });

  it('still answers from the help library when policies can’t be read', async () => {
    svc.listPolicies.mockRejectedValue(new Error('db down'));
    const data = await buildInsuranceData('u1', q('how do I complain to the ombudsman'));
    expect(data.policiesUnavailable).toBe(true);
    expect(data.policies).toEqual([]);
    expect((data.helpTopics as Array<{ id: string }>).map((t) => t.id)).toContain('complaints');
  });
});

describe('buildContext', () => {
  it('routes insurance questions to the insurance data', async () => {
    svc.getEffectiveScope.mockResolvedValue({
      callerId: 'u1',
      familyId: null,
      role: null,
      readableUserIds: ['u1'],
    });
    svc.userFindUnique.mockResolvedValue({ name: 'Test User', email: 't@example.com', dob: null, plan: 'FREE', role: 'INVESTOR' });
    svc.listPolicies.mockResolvedValue([policy()]);

    const query = q('who is the nominee on my LIC policy');
    expect(query.intent).toBe(QueryIntent.INSURANCE);
    const ctx = await buildContext('u1', null, query);

    expect(ctx.queryIntent).toBe('insurance');
    expect(ctx.relevantData).toHaveProperty('nomineeGaps');
    expect(ctx.formattingHints.responseLength).toBe('medium');
    expect(JSON.stringify(ctx)).not.toContain('2345');
  });
});
