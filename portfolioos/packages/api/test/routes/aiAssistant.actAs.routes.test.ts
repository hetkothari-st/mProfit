import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Managing a family member ("acting as" them): authenticate() swaps req.user
// for the managed profile and keeps the manager in req.actor. The chat's data
// — sessions, history, the portfolio it reads — is the profile's, like every
// other data route. The cost and the AI-use notice belong to the person at the
// keyboard: the profile is on FREE in the database, so charging it would lock
// the manager out of a feature they pay for (resolveActAs: "features follow
// the person paying"). No database: every dependency is stubbed.
vi.mock('../../src/config/env.js', async (orig) => {
  const m = (await orig()) as { env: Record<string, unknown> };
  return { env: { ...m.env, ANTHROPIC_API_KEY: 'test-key', ENABLE_LLM_INSIGHTS: 'true' } };
});
const acting = { on: true };
vi.mock('../../src/middleware/authenticate.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as unknown as { user: { id: string }; actor?: { id: string } };
    if (acting.on) {
      r.user = { id: 'profile-1' };
      r.actor = { id: 'manager-1' };
    } else {
      r.user = { id: 'manager-1' };
    }
    next();
  },
}));
const aiDisclosureStatus = vi.fn(async (_u: string) => ({ version: 'v', acknowledged: true, acknowledgedAt: null }));
const acknowledgeAiDisclosure = vi.fn(async (_u: string, _v: string) => undefined);
vi.mock('../../src/ai/aiDisclosure.js', () => ({
  aiDisclosureStatus: (u: string) => aiDisclosureStatus(u),
  acknowledgeAiDisclosure: (u: string, v: string) => acknowledgeAiDisclosure(u, v),
}));
const assertSessionOwnership = vi.fn(async (_u: string, _s: string) => undefined);
vi.mock('../../src/ai/chatSessions.js', async (orig) => ({
  ...((await orig()) as object),
  assertSessionOwnership: (u: string, s: string) => assertSessionOwnership(u, s),
}));
const checkQuota = vi.fn(async (_u: string) => ({ allowed: false, reason: 'daily_cap', used: 1, limit: 1, resetsAt: '' }));
vi.mock('../../src/ai/rateLimit.js', async (orig) => ({
  ...((await orig()) as object),
  checkQuota: (u: string) => checkQuota(u),
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
  acting.on = true;
  aiDisclosureStatus.mockClear();
  acknowledgeAiDisclosure.mockClear();
  assertSessionOwnership.mockClear();
  checkQuota.mockClear();
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('AI assistant while acting for a managed profile', () => {
  it("chat looks the session up in the profile's sessions", async () => {
    await post('/chat', { message: 'How is my portfolio?', sessionId: 's1' });
    expect(assertSessionOwnership).toHaveBeenCalledWith('profile-1', 's1');
  });

  it("chat counts against the manager's quota and notice, not the profile's", async () => {
    const res = await post('/chat', { message: 'How is my portfolio?', sessionId: 's1' });
    expect(res.status).toBe(429);
    expect(aiDisclosureStatus).toHaveBeenCalledWith('manager-1');
    expect(checkQuota).toHaveBeenCalledWith('manager-1');
  });

  it("the quota and notice endpoints report the manager's state", async () => {
    await fetch(`${base}/quota`);
    expect(checkQuota).toHaveBeenCalledWith('manager-1');
    await fetch(`${base}/disclosure`);
    expect(aiDisclosureStatus).toHaveBeenCalledWith('manager-1');
    await post('/disclosure/ack', { version: 'v' });
    expect(acknowledgeAiDisclosure).toHaveBeenCalledWith('manager-1', 'v');
  });

  it('without acting, everything is the signed-in user', async () => {
    acting.on = false;
    await post('/chat', { message: 'hi', sessionId: 's1' });
    expect(assertSessionOwnership).toHaveBeenCalledWith('manager-1', 's1');
    expect(checkQuota).toHaveBeenCalledWith('manager-1');
  });
});
