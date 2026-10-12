import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { touchActivity } from '../../src/services/legacy/activity.service.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { signAccessToken } from '../../src/services/jwt.service.js';

const lastActive = (id: string) =>
  runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id }, select: { lastActiveAt: true } })).then((u) => u.lastActiveAt);

function runAuth(headers: Record<string, string>): Promise<void> {
  const req = {
    header: (h: string) => headers[h.toLowerCase()],
    originalUrl: '/api/dashboard',
  } as never;
  return new Promise((resolve, reject) => authenticate(req, {} as never, (e?: unknown) => (e ? reject(e) : resolve())));
}

describe('touchActivity', () => {
  let s: TestScope;
  beforeAll(async () => { s = await createTestScope('legacy-act'); });
  afterAll(async () => { await s.cleanup(); });

  it('writes once, then throttles for an hour', async () => {
    const t0 = new Date('2027-01-01T10:00:00Z');
    expect(await touchActivity(s.userId, t0)).toBe(true);
    expect(await touchActivity(s.userId, new Date(t0.getTime() + 30 * 60_000))).toBe(false);
    expect((await lastActive(s.userId))?.toISOString()).toBe(t0.toISOString());
    expect(await touchActivity(s.userId, new Date(t0.getTime() + 61 * 60_000))).toBe(true);
  });

  it('authenticate() touches for the own session', async () => {
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { lastActiveAt: null } }));
    const { token } = signAccessToken({ sub: s.userId, email: 'x@test.local', role: 'INVESTOR', plan: 'FREE' });
    await runAuth({ authorization: `Bearer ${token}` });
    await new Promise((r) => setTimeout(r, 100)); // touch is fire-and-forget
    expect(await lastActive(s.userId)).not.toBeNull();
  });
});
