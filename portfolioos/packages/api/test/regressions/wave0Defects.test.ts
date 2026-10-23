import { describe, it, expect } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { AddressInfo } from 'node:net';
import { hasEffectiveFeature } from '../../src/lib/effectivePlan.js';
import { requireFamilyFeature } from '../../src/middleware/requirePlan.js';
import { requireRole } from '../../src/middleware/authenticate.js';
import { finfactorRouter } from '../../src/routes/finfactor.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/auth/jwt.service.js';

const past = new Date('2020-01-01T00:00:00Z');
const future = new Date('2099-01-01T00:00:00Z');

describe('AI connector honours plan expiry', () => {
  it('a lapsed PLUS plan no longer unlocks the connector', () => {
    expect(hasEffectiveFeature({ plan: 'PLUS', planExpiresAt: past }, 'AI_CONNECTOR')).toBe(false);
  });
  it('an active PLUS plan does', () => {
    expect(hasEffectiveFeature({ plan: 'PLUS', planExpiresAt: future }, 'AI_CONNECTOR')).toBe(true);
  });
});

/** Run a middleware once and report what it passed to next(). */
function run(mw: (req: Request, res: Response, next: NextFunction) => void, req: Partial<Request>): Promise<unknown> {
  return new Promise((resolve) => mw(req as Request, {} as Response, (err?: unknown) => resolve(err ?? 'next')));
}

describe('family dashboard is gated on the family plan', () => {
  const freeMember = { user: { id: 'u', plan: 'FREE' }, params: { familyId: 'f1' } } as unknown as Partial<Request>;

  it('lets a FREE member into a family whose creator is on FAMILY', async () => {
    const mw = requireFamilyFeature('FAMILY_SHARING', async () => ({ plan: 'FAMILY', planExpiresAt: future }));
    expect(await run(mw, freeMember)).toBe('next');
  });

  it("refuses when the family creator's plan has lapsed", async () => {
    const mw = requireFamilyFeature('FAMILY_SHARING', async () => ({ plan: 'FAMILY', planExpiresAt: past }));
    expect(await run(mw, freeMember)).toMatchObject({ statusCode: 403 });
  });

  it('does not look up the family when the caller has the plan', async () => {
    let looked = false;
    const mw = requireFamilyFeature('FAMILY_SHARING', async () => { looked = true; return null; });
    expect(await run(mw, { user: { id: 'u', plan: 'FAMILY' }, params: { familyId: 'f1' } } as unknown as Partial<Request>)).toBe('next');
    expect(looked).toBe(false);
  });
});

describe('admin routes', () => {
  it('a signed-in non-admin gets 403, not 401', async () => {
    const err = await run(requireRole('ADMIN'), { user: { id: 'u', role: 'INVESTOR' } } as unknown as Partial<Request>);
    expect(err).toMatchObject({ statusCode: 403 });
  });
});

describe('Finvu data endpoints are an admin sandbox', () => {
  it('refuses a PLUS user', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/integrations/finfactor', finfactorRouter);
    app.use(errorHandler);
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const token = signAccessToken({ sub: 'finvu-test-user', email: 'f@test.local', role: 'INVESTOR', plan: 'PLUS' }).token;
      const res = await fetch(`http://127.0.0.1:${port}/api/integrations/finfactor/mf/insights`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ uniqueIdentifier: 'someone-else' }),
      });
      expect(res.status).toBe(403);
    } finally {
      server.close();
    }
  });
});
