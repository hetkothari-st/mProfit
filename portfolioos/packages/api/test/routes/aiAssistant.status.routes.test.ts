import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// The assistant launcher must know whether the feature is on (it is off by
// default: ENABLE_LLM_INSIGHTS defaults to 'false'). Every other assistant
// endpoint 404s when off, so the client had nothing to ask; /status answers.
const flags = vi.hoisted(() => ({ key: 'test-key' as string | undefined, insights: 'true' }));
vi.mock('../../src/config/env.js', async (orig) => {
  const m = (await orig()) as { env: Record<string, unknown> };
  return {
    env: new Proxy(m.env, {
      get(target, prop) {
        if (prop === 'ANTHROPIC_API_KEY') return flags.key;
        if (prop === 'ENABLE_LLM_INSIGHTS') return flags.insights;
        return target[prop as string];
      },
    }),
  };
});
const authed = vi.hoisted(() => ({ ok: true }));
vi.mock('../../src/middleware/authenticate.js', () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!authed.ok) {
      res.status(401).json({ success: false });
      return;
    }
    (req as unknown as { user: { id: string } }).user = { id: 'u1' };
    next();
  },
}));

const { aiAssistantRouter } = await import('../../src/routes/aiAssistant.routes.js');
const { errorHandler } = await import('../../src/middleware/errorHandler.js');

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use('/api/assistant', aiAssistantRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/assistant`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  flags.key = 'test-key';
  flags.insights = 'true';
  authed.ok = true;
});

const status = async () => {
  const res = await fetch(`${base}/status`);
  return { code: res.status, body: (await res.json()) as { data?: { enabled: boolean } } };
};

describe('GET /api/assistant/status', () => {
  it('reports enabled when a key is set and insights are on', async () => {
    expect(await status()).toMatchObject({ code: 200, body: { data: { enabled: true } } });
  });

  it('reports disabled when insights are off (the default)', async () => {
    flags.insights = 'false';
    expect(await status()).toMatchObject({ code: 200, body: { data: { enabled: false } } });
  });

  it('reports disabled without an API key', async () => {
    flags.key = undefined;
    expect(await status()).toMatchObject({ code: 200, body: { data: { enabled: false } } });
  });

  it('needs a signed-in user', async () => {
    authed.ok = false;
    expect((await status()).code).toBe(401);
  });
});
