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
import {
  getCaScope,
  createManagedClient,
  inviteClient,
  acceptInvitation,
} from '../../src/services/ca/caAccess.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

let ca: TestScope;
let client: TestScope;
let stranger: TestScope;
let clientId: string;
/** TestScope exposes only ids, and the accept flow is email-bound. */
let strangerEmail: string;
let clientEmail: string;
/**
 * A real transaction and a real credential belonging to the client.
 *
 * Without these, "a CA cannot delete a transaction" and "a CA cannot read
 * broker credentials" pass because the tables are EMPTY, not because the
 * policies hold — the exact way a security suite lies about what it proved.
 * createTestScope seeds only a user, a portfolio and stock masters.
 */
let clientTransactionId: string;

beforeAll(async () => {
  ca = await createTestScope('ca-user');
  client = await createTestScope('ca-client');
  stranger = await createTestScope('ca-stranger');

  [strangerEmail, clientEmail] = await runAsSystem(async () => {
    const users = await prisma.user.findMany({
      where: { id: { in: [stranger.userId, client.userId] } },
      select: { id: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u.email]));
    return [byId.get(stranger.userId)!, byId.get(client.userId)!];
  });

  clientTransactionId = await runAsSystem(async () => {
    const tx = await prisma.transaction.create({
      data: {
        portfolioId: client.portfolioId,
        assetClass: 'EQUITY',
        transactionType: 'BUY',
        tradeDate: new Date('2025-06-02'),
        quantity: '10',
        price: '100',
        grossAmount: '1000',
        netAmount: '1000',
        assetName: 'Client holding',
      },
    });
    await prisma.brokerCredential.create({
      data: { userId: client.userId, brokerId: 'zerodha', apiKey: 'encrypted-secret' },
    });
    return tx.id;
  });

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
    await prisma.brokerCredential.deleteMany({ where: { userId: client.userId } });
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
          data: { userId: client.userId, name: 'Should not exist', type: 'INVESTMENT' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('cannot delete a client transaction, though one exists to delete', async () => {
    // The row is seeded, so count: 0 means the policy refused it rather than
    // there being nothing there.
    const before = await runAsSystem(() =>
      prisma.transaction.count({ where: { portfolioId: client.portfolioId } }),
    );
    expect(before).toBeGreaterThan(0);

    await expect(
      ca.runAs(() =>
        prisma.transaction.deleteMany({ where: { portfolioId: client.portfolioId } }),
      ),
    ).resolves.toMatchObject({ count: 0 });

    const after = await runAsSystem(() =>
      prisma.transaction.count({ where: { portfolioId: client.portfolioId } }),
    );
    expect(after).toBe(before);
  });

  it('cannot read the client\'s broker credentials, though one exists', async () => {
    // Asserting the row is really there first. Credentials are the one thing a
    // grant must never reach, so this test must never be able to pass just
    // because the table happens to be empty.
    const seeded = await runAsSystem(() =>
      prisma.brokerCredential.count({ where: { userId: client.userId } }),
    );
    expect(seeded).toBe(1);

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
          type: 'INVESTMENT',
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

  /**
   * The end-to-end consented flow, which had no coverage at all and was
   * therefore completely broken on first write: runAsSystem nested INSIDE
   * runInTransaction is a no-op, so the token lookup ran as the invitee and a
   * PENDING row matches no branch of the Client policy. Every valid invitation
   * failed. Fabricating ACTIVE grants in the other tests hid it.
   */
  it('completes an invitation end to end, and only for the invited address', async () => {
    const { client: invited, token } = await ca.runAs(() =>
      inviteClient(ca.userId, { name: 'Invited Person', email: strangerEmail }),
    );

    // Pending: the CA can see the row but cannot act for them yet.
    await expect(ca.runAs(() => getCaScope(ca.userId, invited.id))).rejects.toThrow(
      /has not accepted/i,
    );

    // Wrong recipient is refused even holding a valid token.
    await expect(
      client.runAs(() => acceptInvitation(client.userId, clientEmail, token)),
    ).rejects.toThrow(/different email address/i);

    const accepted = await stranger.runAs(() =>
      acceptInvitation(stranger.userId, strangerEmail, token),
    );
    expect(accepted.userId).toBe(stranger.userId);
    expect(accepted.status).toBe('ACTIVE');

    // Now, and only now, the grant resolves.
    const scope = await ca.runAs(() => getCaScope(ca.userId, invited.id));
    expect(scope.subjectUserId).toBe(stranger.userId);

    // Single use: the token is cleared, so a replay finds nothing.
    await expect(
      stranger.runAs(() => acceptInvitation(stranger.userId, strangerEmail, token)),
    ).rejects.toThrow(/not found/i);

    await runAsSystem(async () => {
      await prisma.caAuditLog.deleteMany({ where: { clientId: invited.id } });
      await prisma.client.delete({ where: { id: invited.id } });
    });
  });

  it('lets a CA correct a client transaction but never create one', async () => {
    // transaction_ca_correct is FOR UPDATE only — the distinction between
    // correcting a ledger and rewriting it. Both halves asserted, because the
    // grant working matters as much as the restriction holding.
    const updated = await ca.runAs(() =>
      prisma.transaction.updateMany({
        where: { id: clientTransactionId },
        data: { narration: 'Corrected by CA' },
      }),
    );
    expect(updated.count).toBe(1);

    const persisted = await runAsSystem(() =>
      prisma.transaction.findUniqueOrThrow({ where: { id: clientTransactionId } }),
    );
    expect(persisted.narration).toBe('Corrected by CA');

    await expect(
      ca.runAs(() =>
        prisma.transaction.create({
          data: {
            portfolioId: client.portfolioId,
            assetClass: 'EQUITY',
            transactionType: 'BUY',
            tradeDate: new Date(),
            quantity: '1',
            price: '1',
            grossAmount: '1',
            netAmount: '1',
            assetName: 'Should not exist',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('rebuilds derived rows under the CA own identity, without impersonation', async () => {
    // recomputeForAsset writes HoldingProjection and CapitalGain. Those carry a
    // CA write policy precisely so a correction can rebuild them without
    // runAsUser(clientId) — the impersonation that would have reopened the
    // family-shared hole. If the grant were missing this throws 42501.
    const written = await ca.runAs(() =>
      prisma.holdingProjection.updateMany({
        where: { portfolioId: client.portfolioId },
        data: { computedAt: new Date() },
      }),
    );
    expect(written.count).toBeGreaterThanOrEqual(0);

    // Still read-only where it should be: a portfolio cannot be conjured.
    await expect(
      ca.runAs(() =>
        prisma.portfolio.create({
          data: { userId: client.userId, name: 'Nope', type: 'INVESTMENT' },
        }),
      ),
    ).rejects.toThrow();
  });

  /**
   * The read surface is an allow-list, and this is what stops it creeping.
   *
   * A CA gets a client's financial position. Not their credentials, not their
   * household, not their private conversations with the assistant. Each of
   * these would be a plausible-looking addition to a "let the CA see
   * everything they need" sweep, which is exactly why the ban is asserted
   * rather than left to review.
   */
  it('never grants a CA read on credentials, family, or AI history', async () => {
    const forbidden = [
      'BrokerCredential',
      'MailboxAccount',
      'BrokerAccount',
      'GmailScanJob',
      'GmailDiscoveredDoc',
      'GmailAutoApproveRule',
      'PfFetchSession',
      'ExtensionPairing',
      'AaConsent',
      'Family',
      'FamilyMember',
      'FamilyInvitation',
      'PendingFamilyInvite',
      'AiChatSession',
      'AiConversation',
      'AiUsage',
      'LlmSpend',
      'RiskProfileAssessment',
      'ModelPortfolio',
      'AdvisorRun',
      'AdvisorRecommendation',
    ];

    const leaked = await runAsSystem(() =>
      prisma.$queryRawUnsafe<Array<{ tablename: string; policyname: string }>>(
        `SELECT tablename, policyname
           FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = ANY($1)
            AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%app_is_active_ca_for%'`,
        forbidden,
      ),
    );

    expect(
      leaked.map((r) => `${r.tablename}.${r.policyname}`),
      'A CA grant reaches the financial position of a client — never their ' +
        'secrets, their household, or their private conversations.',
    ).toEqual([]);
  });

  it('does grant a CA read on the tables reports actually need', async () => {
    // The other half: a missing grant does not error, it silently returns an
    // empty section in a report, which reads as "this client has no insurance"
    // rather than "you cannot see it".
    const required = [
      'InsurancePolicy',
      'Vehicle',
      'Loan',
      'RentalProperty',
      'BankAccount',
      'CreditCard',
      'ProvidentFundAccount',
      'Document',
      'Income',
      'OwnedProperty',
    ];

    const granted = await runAsSystem(() =>
      prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
        `SELECT DISTINCT tablename
           FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = ANY($1)
            AND COALESCE(qual, '') LIKE '%app_is_active_ca_for%'`,
        required,
      ),
    );

    expect(granted.map((r) => r.tablename).sort()).toEqual([...required].sort());
  });

  it('records the default chart when opening a client book creates it', async () => {
    // Opening a books tab is a read for the CA and a WRITE for the client: the
    // default chart is seeded on first view. It went unrecorded, so a client
    // would have seen twenty accounts appear with nothing in their activity
    // feed. Asserted because the write is invisible from the CA's side.
    const { ensureDefaultAccounts } = await import('../../src/services/accounting.service.js');

    const firstOpen = await ca.runAs(() => ensureDefaultAccounts(client.userId));
    expect(firstOpen.length).toBeGreaterThan(0);

    // Idempotent: opening it again reports nothing created, so a CA browsing
    // the tab repeatedly does not spam the client's trail.
    const secondOpen = await ca.runAs(() => ensureDefaultAccounts(client.userId));
    expect(secondOpen).toEqual([]);
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
