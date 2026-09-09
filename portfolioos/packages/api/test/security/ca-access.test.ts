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
import type { Request, Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
 * A minimal Express req/res pair for calling a caAccounting.controller
 * handler directly. Used only for the assertions that need the CONTROLLER
 * (the audit entry is written there, not by any lower-level service), never
 * as a substitute for the RLS-level tests above and below, which drive
 * Prisma directly so the boundary is proven as a Postgres fact rather than
 * as "the handler happened to call things in the right order".
 */
function fakeCaRequest(
  callerId: string,
  clientIdParam: string,
  body: Record<string, unknown>,
  file?: { path: string; originalname: string },
): Request {
  return {
    user: { id: callerId },
    params: { clientId: clientIdParam },
    body,
    query: {},
    file,
    header: () => undefined,
    ip: '127.0.0.1',
  } as unknown as Request;
}

function fakeResponse(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    end() {
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}
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
    const rows = await runAsSystem(
      () =>
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
    await expect(stranger.runAs(() => getCaScope(stranger.userId, clientId))).rejects.toThrow(
      /not yours/i,
    );
  });

  it("lets the CA read and write the client's books", async () => {
    const account = await ca.runAs(() =>
      prisma.account.create({
        data: { userId: client.userId, code: 'CA100', name: 'Opened by CA', type: 'ASSET' },
      }),
    );
    expect(account.userId).toBe(client.userId);

    const read = await ca.runAs(() =>
      prisma.account.findMany({ where: { userId: client.userId } }),
    );
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
      ca.runAs(() => prisma.transaction.deleteMany({ where: { portfolioId: client.portfolioId } })),
    ).resolves.toMatchObject({ count: 0 });

    const after = await runAsSystem(() =>
      prisma.transaction.count({ where: { portfolioId: client.portfolioId } }),
    );
    expect(after).toBe(before);
  });

  it("cannot read the client's broker credentials, though one exists", async () => {
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

  it("does not reach the client's family-shared portfolios", async () => {
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

  it('lets a CA create and correct a client transaction, and records both', async () => {
    // `transaction_ca_insert` was added deliberately, relaxing the boundary
    // this test used to assert the OTHER way ("...but never create one").
    // The reason: `correctTransactionSchema` already lets a CA rewrite
    // `tradeDate`, `quantity`, `price`, `assetName`, `isin` and every charge
    // field on ANY existing transaction — a CA who wanted to fabricate a
    // trade could already take a ₹1 buy and correct it into 500 shares at
    // any price on any date. Forbidding INSERT therefore only stopped a CA
    // adding a row to an EMPTY ledger, which protected almost nothing while
    // blocking the workspace's actual point: a CA cannot help a client whose
    // books have nothing in them yet. What still holds, unchanged: there is
    // no DELETE policy for a CA on this table — a CA can add a trade and fix
    // a trade, never erase one (see the DELETE assertion at the end, and
    // `cannot delete a client transaction...` above).
    const inserted = await ca.runAs(() =>
      prisma.transaction.create({
        data: {
          portfolioId: client.portfolioId,
          assetClass: 'EQUITY',
          transactionType: 'BUY',
          tradeDate: new Date('2025-07-01'),
          quantity: '10',
          price: '250',
          grossAmount: '2500',
          netAmount: '2500',
          assetName: 'Created by CA',
        },
      }),
    );
    // Lands in the CLIENT's portfolio, not the CA's own — the CA never had a
    // portfolio in this flow, only the grant.
    expect(inserted.portfolioId).toBe(client.portfolioId);
    await runAsSystem(() => prisma.transaction.delete({ where: { id: inserted.id } }));

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
      ca.runAs(() => prisma.transaction.delete({ where: { id: clientTransactionId } })),
    ).rejects.toThrow();
  });

  it('refuses a transaction insert with no grant, a revoked grant, or an unrelated caller', async () => {
    const attempt = (asWho: TestScope) =>
      asWho.runAs(() =>
        prisma.transaction.create({
          data: {
            portfolioId: client.portfolioId,
            assetClass: 'EQUITY',
            transactionType: 'BUY',
            tradeDate: new Date('2025-07-02'),
            quantity: '1',
            price: '1',
            grossAmount: '1',
            netAmount: '1',
            assetName: 'Should not exist',
          },
        }),
      );

    const before = await runAsSystem(() =>
      prisma.transaction.count({ where: { portfolioId: client.portfolioId } }),
    );

    // No grant at all — this is also the "unrelated authenticated user"
    // case: `stranger` is exactly some other CA's session pointed at a
    // client id that is not theirs.
    await expect(attempt(stranger)).rejects.toThrow();

    await runAsSystem(() =>
      prisma.client.update({ where: { id: clientId }, data: { status: 'REVOKED' } }),
    );
    await expect(attempt(ca)).rejects.toThrow();
    await runAsSystem(() =>
      prisma.client.update({ where: { id: clientId }, data: { status: 'ACTIVE' } }),
    );

    const after = await runAsSystem(() =>
      prisma.transaction.count({ where: { portfolioId: client.portfolioId } }),
    );
    expect(after).toBe(before);
  });

  it('does not let an unrelated user read a transaction the CA created for the client', async () => {
    const inserted = await ca.runAs(() =>
      prisma.transaction.create({
        data: {
          portfolioId: client.portfolioId,
          assetClass: 'EQUITY',
          transactionType: 'BUY',
          tradeDate: new Date('2025-07-03'),
          quantity: '5',
          price: '20',
          grossAmount: '100',
          netAmount: '100',
          assetName: 'Not for the stranger',
        },
      }),
    );

    const seenByStranger = await stranger.runAs(() =>
      prisma.transaction.findMany({ where: { id: inserted.id } }),
    );
    expect(seenByStranger).toEqual([]);

    const seenByOwner = await client.runAs(() =>
      prisma.transaction.findMany({ where: { id: inserted.id } }),
    );
    expect(seenByOwner.map((t) => t.id)).toEqual([inserted.id]);

    await runAsSystem(() => prisma.transaction.delete({ where: { id: inserted.id } }));
  });

  it('creates a transaction through the CA route handler and records an audit row with the asset and amount', async () => {
    const { caCreateTransaction } = await import(
      '../../src/controllers/caAccounting.controller.js'
    );

    const req = fakeCaRequest(ca.userId, clientId, {
      transactionType: 'BUY',
      assetClass: 'EQUITY',
      assetName: 'Route-created holding',
      tradeDate: '2025-07-04',
      quantity: '3',
      price: '150',
    });
    const res = fakeResponse();

    await ca.runAs(() => caCreateTransaction(req, res));

    expect(res.statusCode).toBe(201);
    const body = res.body as { success: true; data: { id: string; portfolioId: string } };
    expect(body.success).toBe(true);
    // Lands in the client's own portfolio, resolved server-side — the CA
    // never named one.
    expect(body.data.portfolioId).toBe(client.portfolioId);

    const audit = await runAsSystem(() =>
      prisma.caAuditLog.findFirst({
        where: { clientId, action: 'TRANSACTION_CREATED', resourceId: body.data.id },
      }),
    );
    expect(audit).toBeTruthy();
    expect(audit?.actorUserId).toBe(ca.userId);
    expect(audit?.subjectUserId).toBe(client.userId);
    const metadata = audit?.metadata as { after?: Record<string, unknown> } | null;
    expect(metadata?.after?.assetName).toBe('Route-created holding');
    expect(metadata?.after?.netAmount).toBe('450');

    await runAsSystem(async () => {
      await prisma.transaction.delete({ where: { id: body.data.id } });
      await prisma.caAuditLog.deleteMany({ where: { resourceId: body.data.id } });
    });
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

  it('projects the client books, so the tab and the report cannot disagree', async () => {
    // Trial Balance, P&L and Balance Sheet are all computed from vouchers, and
    // vouchers are derived from activity by a projection that nothing else
    // runs. The report downloads projected first; the CA's books tabs did not.
    // A CA therefore saw an empty Trial balance tab and a populated Trial
    // Balance report for the same client on the same date.
    //
    // The projection is also a WRITE into someone else's ledger under the CA's
    // own identity, so this asserts three things at once: RLS permits it, it
    // produces figures, and it lands on the client's audit trail.
    const { projectBooks } = await import('../../src/services/ca/caProjection.service.js');
    const { getTrialBalance } = await import('../../src/services/accounting.service.js');

    const audit = {
      actorUserId: ca.userId,
      subjectUserId: client.userId,
      clientId,
    };

    // The bug, stated as an assertion: the chart exists (an earlier test
    // seeded it) and the client has a real transaction, yet every figure is
    // zero until something projects. This is exactly what the CA saw.
    const before = await ca.runAs(() => getTrialBalance(client.userId));
    expect(before.length).toBeGreaterThan(0);
    expect(
      before.every((r) => parseFloat(r.totalDebit) === 0 && parseFloat(r.totalCredit) === 0),
    ).toBe(true);

    const first = await ca.runAs(() => projectBooks(client.userId, audit));
    expect(first.created).toBeGreaterThan(0);

    // The tab's own query, run as the CA, now shows the same figures the
    // report is built from. Before the fix this was all zeroes.
    const tb = await ca.runAs(() => getTrialBalance(client.userId));
    const moved = tb.filter((r) => parseFloat(r.totalDebit) > 0 || parseFloat(r.totalCredit) > 0);
    expect(moved.length).toBeGreaterThan(0);

    // A trial balance that does not balance is not one.
    const debits = tb.reduce((sum, r) => sum + parseFloat(r.totalDebit), 0);
    const credits = tb.reduce((sum, r) => sum + parseFloat(r.totalCredit), 0);
    expect(Math.abs(debits - credits)).toBeLessThan(0.005);

    const recorded = await runAsSystem(() =>
      prisma.caAuditLog.findMany({
        where: { clientId, action: 'VOUCHER_CREATED', resourceType: 'Voucher' },
      }),
    );
    expect(recorded.length).toBe(1);
    expect(recorded[0]!.summary).toContain(`${first.created} voucher`);

    // Idempotent, and silent when it is. Re-opening the tab must not create
    // duplicate vouchers or bury the client's feed in entries about nothing.
    const second = await ca.runAs(() => projectBooks(client.userId, audit));
    expect(second.created).toBe(0);

    const after = await runAsSystem(() =>
      prisma.caAuditLog.count({ where: { clientId, action: 'VOUCHER_CREATED' } }),
    );
    expect(after).toBe(1);
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

  // ─── Portfolio bootstrap: exactly one, never a second ─────────────────

  it('lets a CA bootstrap the one portfolio a portfolio-less shadow client needs, and never a second', async () => {
    // `portfolio_ca_bootstrap_insert` is deliberately narrower than the CA's
    // ordinary grant shape — see the migration comment. This is the positive
    // half; `cannot create a portfolio for the client` above (unmodified) is
    // the negative half for a client who already has one.
    const managed = await ca.runAs(() =>
      createManagedClient(ca.userId, {
        name: 'Bootstrap Client',
        consentBasis: 'ENGAGEMENT_LETTER',
      }),
    );
    const subjectId = managed.userId!;

    const zero = await runAsSystem(() =>
      prisma.portfolio.count({ where: { userId: subjectId } }),
    );
    expect(zero).toBe(0);

    const bootstrapped = await ca.runAs(() =>
      prisma.portfolio.create({
        data: { userId: subjectId, name: 'My Portfolio', type: 'INVESTMENT' },
      }),
    );
    expect(bootstrapped.userId).toBe(subjectId);

    // Now provisioned — a second bootstrap attempt for the SAME client is
    // refused, exactly like a client who had one from the start.
    await expect(
      ca.runAs(() =>
        prisma.portfolio.create({
          data: { userId: subjectId, name: 'Second one', type: 'INVESTMENT' },
        }),
      ),
    ).rejects.toThrow();

    await runAsSystem(async () => {
      await prisma.portfolio.deleteMany({ where: { userId: subjectId } });
      await prisma.caAuditLog.deleteMany({ where: { clientId: managed.id } });
      await prisma.client.delete({ where: { id: managed.id } });
      await prisma.user.delete({ where: { id: subjectId } });
    });
  });

  it('bootstraps a portfolio and records a transaction for a client who starts with neither', async () => {
    // The end-to-end path `ensureDefaultPortfolio` + `caCreateTransaction`
    // exist for: a brand-new shadow client, with no portfolio at all, gets
    // exactly the one they need and their first trade lands in it.
    const { caCreateTransaction } = await import(
      '../../src/controllers/caAccounting.controller.js'
    );

    const managed = await ca.runAs(() =>
      createManagedClient(ca.userId, {
        name: 'Fresh Client',
        consentBasis: 'ENGAGEMENT_LETTER',
      }),
    );
    const subjectId = managed.userId!;

    const req = fakeCaRequest(ca.userId, managed.id, {
      transactionType: 'BUY',
      assetClass: 'EQUITY',
      assetName: 'First ever holding',
      tradeDate: '2025-07-05',
      quantity: '1',
      price: '10',
    });
    const res = fakeResponse();

    await ca.runAs(() => caCreateTransaction(req, res));

    expect(res.statusCode).toBe(201);
    const body = res.body as { success: true; data: { id: string; portfolioId: string } };

    const portfolio = await runAsSystem(() =>
      prisma.portfolio.findUnique({ where: { id: body.data.portfolioId } }),
    );
    expect(portfolio?.userId).toBe(subjectId);
    expect(portfolio?.name).toBe('My Portfolio');
    expect(portfolio?.type).toBe('INVESTMENT');

    const portfolioCount = await runAsSystem(() =>
      prisma.portfolio.count({ where: { userId: subjectId } }),
    );
    expect(portfolioCount).toBe(1);

    const auditActions = await runAsSystem(() =>
      prisma.caAuditLog.findMany({
        where: { clientId: managed.id },
        select: { action: true },
      }),
    );
    expect(auditActions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['PORTFOLIO_CREATED', 'TRANSACTION_CREATED']),
    );

    await runAsSystem(async () => {
      await prisma.capitalGain.deleteMany({ where: { portfolioId: body.data.portfolioId } });
      await prisma.holdingProjection.deleteMany({ where: { portfolioId: body.data.portfolioId } });
      await prisma.transaction.deleteMany({ where: { portfolioId: body.data.portfolioId } });
      await prisma.caAuditLog.deleteMany({ where: { clientId: managed.id } });
      await prisma.portfolio.delete({ where: { id: body.data.portfolioId } });
      await prisma.client.delete({ where: { id: managed.id } });
      await prisma.user.delete({ where: { id: subjectId } });
    });
  });

  // ─── ImportJob: the same set of cases as Transaction ──────────────────

  it('lets a CA insert an import job for the client, refuses one with no or revoked grant, and hides it from a stranger', async () => {
    const attemptInsert = (asWho: TestScope) =>
      asWho.runAs(() =>
        prisma.importJob.create({
          data: {
            userId: client.userId,
            portfolioId: client.portfolioId,
            type: 'GENERIC_CSV',
            fileName: 'boundary-test.csv',
            filePath: '/tmp/does-not-need-to-exist.csv',
          },
        }),
      );

    // No grant at all — and the same case as "an unrelated authenticated
    // user": `stranger` is some other CA's session pointed at a client id
    // that is not theirs.
    await expect(attemptInsert(stranger)).rejects.toThrow();

    await runAsSystem(() =>
      prisma.client.update({ where: { id: clientId }, data: { status: 'REVOKED' } }),
    );
    await expect(attemptInsert(ca)).rejects.toThrow();
    await runAsSystem(() =>
      prisma.client.update({ where: { id: clientId }, data: { status: 'ACTIVE' } }),
    );

    const job = await attemptInsert(ca);
    expect(job.userId).toBe(client.userId);

    const seenByStranger = await stranger.runAs(() =>
      prisma.importJob.findMany({ where: { id: job.id } }),
    );
    expect(seenByStranger).toEqual([]);

    // importjob_ca_read: without it this would also come back empty, because
    // `caListImports` reads under the CA's OWN ambient identity (no
    // `runAsUser` bridge), for which `importjob_owner` alone matches nothing.
    const seenByCa = await ca.runAs(() => prisma.importJob.findMany({ where: { id: job.id } }));
    expect(seenByCa.map((j) => j.id)).toEqual([job.id]);

    await runAsSystem(() => prisma.importJob.delete({ where: { id: job.id } }));
  });

  it('creates an import job through the CA route handler and records an audit row with the file name and job id', async () => {
    const { caCreateImport } = await import('../../src/controllers/caAccounting.controller.js');

    const filePath = path.join(os.tmpdir(), `ca-import-test-${randomUUID()}.csv`);
    fs.writeFileSync(filePath, 'date,amount\n2025-07-01,100\n');

    const req = fakeCaRequest(ca.userId, clientId, {}, { path: filePath, originalname: 'statement.csv' });
    const res = fakeResponse();

    try {
      await ca.runAs(() => caCreateImport(req, res));

      expect(res.statusCode).toBe(201);
      const body = res.body as {
        success: true;
        data: { id: string; fileName: string; status: string };
      };
      expect(body.success).toBe(true);
      expect(body.data.fileName).toBe('statement.csv');

      const job = await runAsSystem(() =>
        prisma.importJob.findUnique({ where: { id: body.data.id } }),
      );
      expect(job?.userId).toBe(client.userId);
      expect(job?.portfolioId).toBe(client.portfolioId);

      const audit = await runAsSystem(() =>
        prisma.caAuditLog.findFirst({
          where: { clientId, action: 'IMPORT_JOB_CREATED', resourceId: body.data.id },
        }),
      );
      expect(audit).toBeTruthy();
      const metadata = audit?.metadata as { after?: Record<string, unknown> } | null;
      expect(metadata?.after?.fileName).toBe('statement.csv');
      expect(metadata?.after?.jobId).toBe(body.data.id);

      await runAsSystem(async () => {
        await prisma.transaction.updateMany({
          where: { importJobId: body.data.id },
          data: { importJobId: null },
        });
        await prisma.importJob.delete({ where: { id: body.data.id } });
        await prisma.caAuditLog.deleteMany({ where: { resourceId: body.data.id } });
      });
    } finally {
      fs.unlink(filePath, () => {});
    }
  });
});
