import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `save_risk_profile` is the assistant's only write. These cover the parts
 * that would be damaging to get wrong: writing a profile the client never
 * gave, and writing more than one.
 */

const svc = vi.hoisted(() => ({
  submitQuestionnaire: vi.fn(),
  userAgeFromDob: vi.fn(),
}));
vi.mock('../services/advisor/riskProfile.service.js', () => svc);
// Pulled in by the tool module's other executors; none of them run here.
vi.mock('../lib/prisma.js', () => ({ prisma: {} }));

const { runAdvisorTool, ADVISOR_TOOLS } = await import('./advisorTools.js');

const ANSWERS = {
  horizon: 'GT_15Y',
  drawdownReaction: 'BUY_MORE',
  investableShareOfIncome: 'PCT_20_35',
  objective: 'MAX_GROWTH',
  hasEmergencyFund: true,
  taxSlab: 'PCT_30',
};

function ctx(over: Record<string, unknown> = {}) {
  return { userId: 'u1', facts: null, financialYear: '2026-27', ...over } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.userAgeFromDob.mockResolvedValue(34);
  svc.submitQuestionnaire.mockResolvedValue({
    assessmentId: 'a1',
    questionnaireVersion: 1,
    score: 82,
    category: 'GROWTH',
    taxSlabPct: 30,
    overrides: [],
    answers: {},
    modelPortfolio: { id: 'm1', name: 'Growth', riskCategory: 'GROWTH', versionId: 'v1', version: 1, targets: [] },
    assessedAt: '2026-09-21T00:00:00.000Z',
  });
});

describe('save_risk_profile', () => {
  it('is declared, requires every answer, and writes nothing on its own', () => {
    const tool = ADVISOR_TOOLS.find((t) => t.name === 'save_risk_profile');
    expect(tool).toBeTruthy();
    expect(tool!.input_schema.required).toEqual([
      'horizon',
      'drawdownReaction',
      'investableShareOfIncome',
      'objective',
      'hasEmergencyFund',
      'taxSlab',
    ]);
    expect(svc.submitQuestionnaire).not.toHaveBeenCalled();
  });

  it('writes through the same service the Advisor page uses, with the age on file', async () => {
    const out = await runAdvisorTool('save_risk_profile', ANSWERS, ctx());
    expect(out.ok).toBe(true);
    expect(svc.submitQuestionnaire).toHaveBeenCalledWith('u1', {
      age: 34,
      horizon: 'GT_15Y',
      drawdownReaction: 'BUY_MORE',
      investableShareOfIncome: 'PCT_20_35',
      objective: 'MAX_GROWTH',
      hasEmergencyFund: true,
      taxSlab: 'PCT_30',
    });
    expect(out.result).toMatchObject({ saved: true, category: 'GROWTH', taxSlabPct: 30 });
  });

  // The record is append-only, so a model that re-reads its own transcript
  // must not be able to stack assessments.
  it('refuses a second write in the same conversation', async () => {
    const c = ctx();
    await runAdvisorTool('save_risk_profile', ANSWERS, c);
    const second = await runAdvisorTool('save_risk_profile', ANSWERS, c);
    expect(svc.submitQuestionnaire).toHaveBeenCalledTimes(1);
    expect(second.result).toMatchObject({ saved: false });
  });

  it('refuses when a profile is already on file', async () => {
    const out = await runAdvisorTool(
      'save_risk_profile',
      ANSWERS,
      ctx({ riskProfileSavedThisConversation: true }),
    );
    expect(svc.submitQuestionnaire).not.toHaveBeenCalled();
    expect(out.result).toMatchObject({ saved: false });
  });

  it('reports a failure instead of throwing at the model', async () => {
    svc.submitQuestionnaire.mockRejectedValue(new Error('horizon is required'));
    const out = await runAdvisorTool('save_risk_profile', ANSWERS, ctx());
    expect(out.ok).toBe(false);
    expect(out.result).toMatchObject({ error: 'horizon is required' });
  });

  it('passes a null age through rather than inventing one', async () => {
    svc.userAgeFromDob.mockResolvedValue(null);
    await runAdvisorTool('save_risk_profile', ANSWERS, ctx());
    expect(svc.submitQuestionnaire.mock.calls[0]![1]).toMatchObject({ age: null });
  });
});
