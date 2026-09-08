/**
 * CA workspace — the access boundary.
 *
 * This feature hands a third party someone's complete financial position and
 * lets them edit a filing-relevant ledger, so the boundary is asserted rather
 * than trusted.
 *
 * The cases that matter most are the negative ones, and two in particular:
 *
 *  - **The family leak.** The reason this feature does not use
 *    `runAsUser(clientId)` impersonation is that `Portfolio`'s policy has a
 *    family branch: under the client's identity it fires for every family they
 *    belong to, handing the CA portfolios owned by the client's relatives, who
 *    granted nothing. `does not reach the client's family-shared portfolios`
 *    is the test that would fail if anyone later "simplified" this to
 *    impersonation.
 *
 *  - **The write allow-list.** A CA may keep books and correct entries. They
 *    may not create a portfolio, join a family, or read credentials. Those are
 *    Postgres facts here, not controller discipline, so the tests drive Prisma
 *    directly rather than going through the service layer — a service-level
 *    test would only prove the service behaves, not that the boundary holds if
 *    someone writes a new one.
 *
 * NOTE ON RLS: these assertions are only meaningful when the test connection
 * uses a NOBYPASSRLS role (`portfolioos_app`). Connected as `postgres`, every
 * policy is skipped and every case below passes vacuously. The first test
 * asserts that precondition so the suite cannot lie about what it proved.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getCaScope, createManagedClient } from '../../src/services/ca/caAccess.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

let ca: TestScope;
let client: TestScope;
let stranger: TestScope;
let clientId: string;

beforeAll(async () => {
  ca = await createTestScope('ca-user');
  client = await createTestScope('ca-client');
  stranger = await createTestScope('ca-stranger');

  clientId = await runAsSystem(async () => {
    const row = await prisma.client.create({
      data: {
        advisorId: ca.userId,
        name: 'Consented Client',
        userId: client.userId,
        kind: 'INVITED',
        status: 'ACTIVE',
        acceptedAt: new Date(),
      },
    });
    return row.id;
  });
}, 120_000);

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.caAuditLog.deleteMany({ where: { actorUserId: ca.userId } });
    await prisma.client.deleteMany({ where: { advisorId: ca.userId } });
  });
  await ca.cleanup();
  await client.cleanup();
  await stranger.cleanup();
}, 120_000);

describe('CA access boundary', () => {
  it('runs against a role that actually enforces RLS', async () => {
    // Guards every other assertion in this file. `postgres` and the Neon owner
    // carry BYPASSRLS, under which none of the policies below are evaluated.
    const rows = await runAsSystem(() =>
      prisma.$queryRaw<Array<{ rolbypassrls: boolean }>>`
        SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user
      `,
    );
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it('resolves a scope for an active grant', async () => {
    const scope = await ca.runAs(() => getCaScope(ca.userId, clientId));
    expect(scope.subjectUserId).toBe(client.userId);
    expect(scope.callerId).toBe(ca.userId);
  });

  it('refuses a CA who holds no grant over that client', async () => {
    await expect(
      stranger.runAs(() => getCaScope(stranger.userId, clientId)),
    ).rejects.toThrow(/not yours/i);
  });

  it('lets the CA read and write the client\'s books', async () => {
    const account = await ca.runAs(() =>
      prisma.account.create({
        data: { userId: client.userId, code: 'CA100', name: 'Opened by CA', type: 'ASSET' },
      }),
    );
    expect(account.userId).toBe(client.userId);

    const read = await ca.runAs(() => prisma.account.findMany({ where: { userId: client.userId } }));
    expect(read.map((a) => a.code)).toContain('CA100');
  });

  it('cannot create a portfolio for the client', async () => {
    // No CA branch exists on Portfolio's WITH CHECK, so Postgres refuses.
    // This is the difference between "keeps the books" and "owns the account".
    await expect(
      ca.runAs(() =>
        prisma.portfolio.create({
          data: { userId: client.userId, name: 'Should not exist', type: 'EQUITY' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('cannot insert or delete a client transaction — only correct one', async () => {
    await expect(
      ca.runAs(() =>
        prisma.transaction.deleteMany({ where: { portfolioId: client.portfolioId } }),
      ),
    ).resolves.toMatchObject({ count: 0 });
  });

  it('cannot read the client\'s broker credentials', async () => {
    const creds = await ca.runAs(() =>
      prisma.brokerCredential.findMany({ where: { userId: client.userId } }),
    );
    expect(creds).toEqual([]);
  });

  it('does not reach the client\'s family-shared portfolios', async () => {
    // The whole reason this feature keeps the CA's own identity. If someone
    // reintroduces runAsUser(clientId), this is what breaks.
    const familyId = await runAsSystem(async () => {
      const fam = await prisma.family.create({
        data: { name: 'Client Household', createdById: client.userId },
      });
      await prisma.familyMember.create({
        data: { familyId: fam.id, userId: client.userId, role: 'OWNER', status: 'ACTIVE' },
      });
      await prisma.portfolio.create({
        data: {
          userId: stranger.userId, // a relative's book, shared into the household
          familyId: fam.id,
          name: 'Relative shared book',
          type: 'EQUITY',
        },
      });
      return fam.id;
    });

    const seen = await ca.runAs(() => prisma.portfolio.findMany({ where: { familyId } }));
    expect(seen).toEqual([]);

    await runAsSystem(async () => {
      await prisma.portfolio.deleteMany({ where: { familyId } });
      await prisma.familyMember.deleteMany({ where: { familyId } });
      await prisma.family.deleteMany({ where: { id: familyId } });
    });
  });

  it('stops at the moment the client revokes', async () => {
    await runAsSystem(() =>
      prisma.client.update({ where: { id: clientId }, data: { status: 'REVOKED' } }),
    );

    await expect(ca.runAs(() => getCaScope(ca.userId, clientId))).rejects.toThrow(/revoked/i);

    // And the database agrees, independently of the service layer.
    const rows = await ca.runAs(() =>
      prisma.account.findMany({ where: { userId: client.userId } }),
    );
    expect(rows).toEqual([]);

    await runAsSystem(() =>
      prisma.client.update({ where: { id: clientId }, data: { status: 'ACTIVE' } }),
    );
  });

  it('keeps the audit trail append-only', async () => {
    const entry = await runAsSystem(() =>
      prisma.caAuditLog.create({
        data: {
          actorUserId: ca.userId,
          subjectUserId: client.userId,
          clientId,
          action: 'ACCOUNT_CREATED',
          summary: 'test entry',
        },
      }),
    );

    // No UPDATE or DELETE policy exists, so under FORCE ROW LEVEL SECURITY
    // these match nothing — for the CA, for the client, and for system context.
    await expect(
      ca.runAs(() =>
        prisma.caAuditLog.updateMany({ where: { id: entry.id }, data: { summary: 'rewritten' } }),
      ),
    ).resolves.toMatchObject({ count: 0 });

    await expect(
      ca.runAs(() => prisma.caAuditLog.deleteMany({ where: { id: entry.id } })),
    ).resolves.toMatchObject({ count: 0 });

    const still = await runAsSystem(() =>
      prisma.caAuditLog.findUnique({ where: { id: entry.id } }),
    );
    expect(still?.summary).toBe('test entry');
  });

  it('lets the client read what was done to their books', async () => {
    const seen = await client.runAs(() =>
      prisma.caAuditLog.findMany({ where: { subjectUserId: client.userId } }),
    );
    expect(seen.length).toBeGreaterThan(0);
  });

  it('does not let an unrelated user read that trail', async () => {
    const seen = await stranger.runAs(() =>
      prisma.caAuditLog.findMany({ where: { subjectUserId: client.userId } }),
    );
    expect(seen).toEqual([]);
  });

  it('provisions a managed client that cannot log in', async () => {
    const managed = await ca.runAs(() =>
      createManagedClient(ca.userId, {
        name: 'No-Login Client',
        consentBasis: 'ENGAGEMENT_LETTER',
      }),
    );

    const shadow = await runAsSystem(() =>
      prisma.user.findUnique({ where: { id: managed.userId! } }),
    );
    expect(shadow?.isShadowClient).toBe(true);
    // RFC 2606 reserved — cannot resolve, so nothing can ever be mailed to it.
    expect(shadow?.email).toMatch(/@ca-client\.invalid$/);

    await runAsSystem(async () => {
      await prisma.caAuditLog.deleteMany({ where: { clientId: managed.id } });
      await prisma.client.delete({ where: { id: managed.id } });
      await prisma.user.delete({ where: { id: managed.userId! } });
    });
  });
});
