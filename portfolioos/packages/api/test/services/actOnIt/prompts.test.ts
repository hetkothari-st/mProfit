/**
 * Act on it, Task 8: pop-ups and alerts, at most 2 a week unless urgent.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem, runAsUser } from '../../../src/lib/requestContext.js';
import { queuePrompts, pendingPopup, markPopupSeen } from '../../../src/services/actOnIt/prompts.js';

const DAY = 86_400_000;
const NOW = new Date('2026-11-06T06:00:00Z');
const scopes: TestScope[] = [];
const sent: string[] = [];
const fakeSend = async (input: { to: string; subject: string }) => {
  sent.push(input.subject);
  return { sent: true as const };
};
const failingSend = async () => {
  throw new Error('smtp down');
};

afterAll(async () => {
  for (const s of scopes) {
    await runAsSystem(async () => {
      await prisma.alert.deleteMany({ where: { userId: s.userId } });
      await prisma.advicePrompt.deleteMany({ where: { userId: s.userId } });
      await prisma.advisorRecommendation.deleteMany({ where: { userId: s.userId } });
      await prisma.advisorRun.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  }
});

async function user(recs: { key: string; gain: string | null; urgent?: boolean; status?: string; acceptedAt?: Date; createdAt?: Date }[]) {
  const s = await createTestScope('aoi-prompts');
  scopes.push(s);
  const ids = await runAsUser(s.userId, async () => {
    const run = await prisma.advisorRun.create({ data: { userId: s.userId, engineVersion: 'test', ruleVersionsSnapshot: {}, status: 'COMPLETED' } });
    const out: Record<string, string> = {};
    for (const r of recs) {
      const row = await prisma.advisorRecommendation.create({
        data: {
          userId: s.userId, generationRunId: run.id, ruleId: 'IDLE_CASH_PARKING', ruleVersion: 1, category: 'IDLE_CASH_PARKING', priority: 22,
          action: [], rationale: 'r', inputsSnapshot: {}, dedupeKey: r.key, headline: `Advice ${r.key}`,
          promise: { gainInr: r.gain, riskBand: 'LOW', costInr: '0.00', liquidity: '1 working day', confidence: 'HIGH' },
          measurement: { method: 'NOT_MEASURED', horizonDays: 0, baseline: {} },
          status: (r.status ?? 'OPEN') as never, acceptedAt: r.acceptedAt ?? null, createdAt: r.createdAt ?? NOW,
          urgentUntil: r.urgent ? new Date(NOW.getTime() + 3 * DAY) : null,
        },
      });
      out[r.key] = row.id;
    }
    return out;
  });
  return { s, ids };
}

describe('prompts (DB)', () => {
  it('sends the two biggest this week and holds the rest; a re-run sends nothing new', async () => {
    const { s, ids } = await user([{ key: 'a', gain: '1000.00' }, { key: 'b', gain: '9000.00' }, { key: 'c', gain: '5000.00' }]);
    const r = await runAsUser(s.userId, () => queuePrompts(s.userId, NOW, { send: fakeSend }));
    expect(r).toEqual({ sent: 2, held: 1 });
    const prompts = await runAsUser(s.userId, () => prisma.advicePrompt.findMany({ where: { userId: s.userId } }));
    expect(prompts.map((p) => p.recommendationId).sort()).toEqual([ids.b, ids.c].sort());
    expect(prompts.every((p) => p.emailedAt !== null)).toBe(true);
    expect(await runAsUser(s.userId, () => prisma.alert.count({ where: { userId: s.userId, type: 'ADVICE' } }))).toBe(2);

    expect(await runAsUser(s.userId, () => queuePrompts(s.userId, new Date(NOW.getTime() + DAY), { send: fakeSend }))).toEqual({ sent: 0, held: 1 });
    // A week later the held one goes out.
    expect(await runAsUser(s.userId, () => queuePrompts(s.userId, new Date(NOW.getTime() + 8 * DAY), { send: fakeSend }))).toEqual({ sent: 1, held: 0 });
  });

  it('urgent advice goes out even when the week is full', async () => {
    const { s } = await user([{ key: 'a', gain: '1000.00' }, { key: 'b', gain: '2000.00' }, { key: 'u', gain: '500.00', urgent: true }, { key: 'd', gain: '3000.00' }]);
    expect(await runAsUser(s.userId, () => queuePrompts(s.userId, NOW, { send: fakeSend }))).toEqual({ sent: 3, held: 1 });
    const urgent = await runAsUser(s.userId, () => prisma.advicePrompt.findMany({ where: { userId: s.userId, urgent: true } }));
    expect(urgent).toHaveLength(1);
  });

  it('nudges accepted advice once after 30 days without a sign of it', async () => {
    const { s } = await user([{ key: 'n', gain: '6300.00', status: 'ACCEPTED', acceptedAt: new Date(NOW.getTime() - 31 * DAY), createdAt: new Date(NOW.getTime() - 32 * DAY) }]);
    expect(await runAsUser(s.userId, () => queuePrompts(s.userId, NOW, { send: fakeSend }))).toEqual({ sent: 1, held: 0 });
    const p = await runAsUser(s.userId, () => prisma.advicePrompt.findFirstOrThrow({ where: { userId: s.userId } }));
    expect(p.kind).toBe('NUDGE');
    expect(await runAsUser(s.userId, () => queuePrompts(s.userId, new Date(NOW.getTime() + 10 * DAY), { send: fakeSend }))).toEqual({ sent: 0, held: 0 });
  });

  it('an email failure does not stop the pop-up and the bell', async () => {
    const { s, ids } = await user([{ key: 'a', gain: '1000.00' }]);
    expect(await runAsUser(s.userId, () => queuePrompts(s.userId, NOW, { send: failingSend }))).toEqual({ sent: 1, held: 0 });
    const popup = await runAsUser(s.userId, () => pendingPopup(s.userId, NOW));
    expect(popup).toMatchObject({ recommendationId: ids.a, headline: 'Advice a', gainInr: '1000.00' });
    await runAsUser(s.userId, () => markPopupSeen(s.userId, popup!.promptId, NOW));
    expect(await runAsUser(s.userId, () => pendingPopup(s.userId, NOW))).toBeNull();
  });
});
