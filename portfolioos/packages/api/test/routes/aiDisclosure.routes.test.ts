import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// The assistant may not answer until the client has accepted the AI-use notice
// (SEBI IA Regulations 15(14), 18(9)). No database: auth, the notice store,
// session ownership and the quota check are stubbed.
const state = { acknowledged: false, acks: [] as string[] };
vi.mock('../../src/config/env.js', async (orig) => {
  const m = (await orig()) as { env: Record<string, unknown> };
  return { env: { ...m.env, ANTHROPIC_API_KEY: 'test-key', ENABLE_LLM_INSIGHTS: 'true' } };
});
vi.mock('../../src/middleware/authenticate.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: { id: string } }).user = { id: 'u1' };
    next();
  },
}));
vi.mock('../../src/ai/aiDisclosure.js', () => ({
  aiDisclosureStatus: vi.fn(async () => ({ version: 'v-now', acknowledged: state.acknowledged, acknowledgedAt: null })),
  acknowledgeAiDisclosure: vi.fn(async (_u: string, version: string) => {
    state.acks.push(version);
  }),
}));
vi.mock('../../src/ai/chatSessions.js', async (orig) => ({
  ...((await orig()) as object),
  assertSessionOwnership: vi.fn(async () => undefined),
}));
const checkQuota = vi.fn(async () => ({ allowed: false, reason: 'daily_cap', used: 1, limit: 1, resetsAt: '' }));
vi.mock('../../src/ai/rateLimit.js', async (orig) => ({
  ...((await orig()) as object),
  checkQuota: () => checkQuota(),
}));

const { aiAssistantRouter } = await import('../../src/routes/aiAssistant.routes.js');
const { errorHandler } = await import('../../src/middleware/errorHandler.js');

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/assistant', aiAssistantRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/assistant`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  state.acknowledged = false;
  state.acks = [];
  checkQuota.mockClear();
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('AI-use disclosure routes', () => {
  it('reports whether the current notice has been accepted', async () => {
    const res = await fetch(`${base}/disclosure`);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ version: 'v-now', acknowledged: false });
  });

  it('records an acceptance', async () => {
    const res = await post('/disclosure/ack', { version: 'v-now' });
    expect(res.status).toBe(204);
    expect(state.acks).toEqual(['v-now']);
  });

  it('rejects an acceptance without a version', async () => {
    expect((await post('/disclosure/ack', {})).status).toBe(400);
    expect(state.acks).toEqual([]);
  });

  it('chat refuses to answer before the notice is accepted, without touching the quota', async () => {
    const res = await post('/chat', { message: 'Should I stop my SIPs?', sessionId: 's1' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ai_disclosure_required');
    expect(checkQuota).not.toHaveBeenCalled();
  });

  it('chat proceeds past the gate once accepted', async () => {
    state.acknowledged = true;
    const res = await post('/chat', { message: 'Should I stop my SIPs?', sessionId: 's1' });
    expect(res.status).not.toBe(409);
    expect(checkQuota).toHaveBeenCalled();
  });
});
