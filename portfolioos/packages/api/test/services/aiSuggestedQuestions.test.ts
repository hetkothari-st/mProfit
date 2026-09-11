import { describe, it, expect, beforeEach, vi } from 'vitest';

// Insurance hub, phase 4: the assistant suggests an insurance question when
// the user's policies call for one, and every insurance example is routed to
// the insurance context.

const svc = vi.hoisted(() => ({
  getAnalyticsSnapshot: vi.fn(),
  listGoals: vi.fn(),
  listPolicies: vi.fn(),
}));

vi.mock('../../src/lib/prisma.js', () => ({ prisma: {} }));
vi.mock('../../src/services/analytics.service.js', () => ({ getAnalyticsSnapshot: svc.getAnalyticsSnapshot }));
vi.mock('../../src/services/goals.service.js', () => ({ listGoals: svc.listGoals }));
vi.mock('../../src/services/insurance.service.js', () => ({ listPolicies: svc.listPolicies }));

import { computeSuggestedQuestions, INSURANCE_EXAMPLE_QUESTIONS } from '../../src/ai/suggestedQuestions.js';
import { classifyQuery, QueryIntent } from '../../src/ai/queryClassifier.js';

const due = (state: string) => ({ dueDate: '2026-09-01', state, daysUntilDue: -10, graceEndsOn: '2026-10-01', daysLeftInGrace: 20 });

function policy(over: Record<string, unknown> = {}) {
  return {
    insurer: 'LIC',
    type: 'TERM',
    status: 'ACTIVE',
    nominees: [{ name: 'Asha', relation: 'Spouse' }],
    premiumDue: due('UPCOMING'),
    claims: [],
    ...over,
  };
}

beforeEach(() => {
  svc.getAnalyticsSnapshot.mockReset().mockRejectedValue(new Error('no db'));
  svc.listGoals.mockReset().mockResolvedValue([]);
  svc.listPolicies.mockReset();
});

describe('insurance suggested questions', () => {
  it('routes every insurance example to the insurance intent', () => {
    for (const q of INSURANCE_EXAMPLE_QUESTIONS) {
      expect(classifyQuery(q.question).intent, q.question).toBe(QueryIntent.INSURANCE);
      expect(q.intent).toBe(QueryIntent.INSURANCE);
    }
  });

  it('puts an overdue premium first', async () => {
    svc.listPolicies.mockResolvedValue([policy({ insurer: 'HDFC Life', premiumDue: due('IN_GRACE') })]);
    const out = await computeSuggestedQuestions('u1');
    expect(out[0]).toEqual({ question: 'My HDFC Life premium is overdue — what happens now?', intent: 'insurance' });
    expect(classifyQuery(out[0]!.question).intent).toBe(QueryIntent.INSURANCE);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it('asks about a claim that is waiting on the user', async () => {
    svc.listPolicies.mockResolvedValue([
      policy({ insurer: 'Star Health', type: 'HEALTH', claims: [{ progress: { next: { action: 'FILE_GRIEVANCE' } } }] }),
    ]);
    const out = await computeSuggestedQuestions('u1');
    expect(out[0]!.question).toBe('What should I do next on my Star Health insurance claim?');
    expect(classifyQuery(out[0]!.question).intent).toBe(QueryIntent.INSURANCE);
  });

  it('suggests checking nominees when a life policy has none', async () => {
    svc.listPolicies.mockResolvedValue([policy({ nominees: null })]);
    const out = await computeSuggestedQuestions('u1');
    expect(out.map((q) => q.question)).toContain('Which of my policies have no nominee?');
  });

  it('suggests nothing about insurance without active policies, and survives a failed fetch', async () => {
    svc.listPolicies.mockResolvedValue([policy({ status: 'LAPSED' })]);
    expect((await computeSuggestedQuestions('u1')).some((q) => q.intent === 'insurance')).toBe(false);

    svc.listPolicies.mockRejectedValue(new Error('db down'));
    const out = await computeSuggestedQuestions('u1');
    expect(out.map((q) => q.intent)).toEqual(['portfolio_health', 'xirr_query']);
  });
});
