import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { runInTransaction } from '../../src/lib/prisma.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { createLinkToken, resolveLinkToken } from '../../src/services/legacy/tokens.service.js';
import { reissueAccessLink } from '../../src/services/legacy/publicLinks.service.js';
import type { SendEmailInput } from '../../src/services/notifications/email.service.js';

describe('ACCESS link re-issue (design §7.1)', () => {
  let s: TestScope; let planId: string; let nomineeId: string;
  beforeAll(async () => {
    s = await createTestScope('legacy-reissue');
    planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: s.userId, status: 'RELEASED', releasedAt: new Date() } }))).id;
    nomineeId = (await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('Ravi'), emailEnc: encryptSecret('ravi@test.local'),
      relationship: 'Brother', priority: 1, categories: ['INSURANCE'],
    } }))).id;
  });
  afterAll(async () => { await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: s.userId } })); await s.cleanup(); });

  it('an expired link gets a fresh one mailed to the nominee on file, nowhere else', async () => {
    const issued = new Date('2027-01-01T00:00:00Z');
    const old = await runAsSystem(() => runInTransaction((tx) =>
      createLinkToken(tx, { planId, userId: s.userId, nomineeId, purpose: 'ACCESS', cycle: 1, now: issued })));
    const later = new Date('2027-06-01T00:00:00Z'); // > 90 days: expired
    expect(await resolveLinkToken(old, 'ACCESS', later)).toBeNull();
    const sent: SendEmailInput[] = [];
    await reissueAccessLink(old, later, async (m) => { sent.push(m); return { sent: true, messageId: 'm' }; });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ravi@test.local');
    const fresh = /\/legacy\/access\/([A-Za-z0-9_-]+)/.exec(sent[0]!.html)![1]!;
    expect(fresh).not.toBe(old);
    expect((await resolveLinkToken(fresh, 'ACCESS', later))?.nomineeId).toBe(nomineeId);
  });

  it('does nothing once access was revoked (plan no longer released)', async () => {
    const tok = await runAsSystem(() => runInTransaction((tx) =>
      createLinkToken(tx, { planId, userId: s.userId, nomineeId, purpose: 'ACCESS', cycle: 1, now: new Date() })));
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'ARMED' } }));
    const sent: SendEmailInput[] = [];
    await reissueAccessLink(tok, new Date(), async (m) => { sent.push(m); return { sent: true, messageId: 'm' }; });
    expect(sent).toHaveLength(0);
  });
});
