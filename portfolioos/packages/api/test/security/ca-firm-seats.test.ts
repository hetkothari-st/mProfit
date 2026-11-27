import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope, runAsVerified } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  inviteProfessional,
  acceptProfessionalInvitation,
  getCaScope,
  listClients,
  listMyProfessionalGrants,
  revokeGrant,
} from '../../src/services/ca/caAccess.service.js';
import {
  inviteStaff,
  acceptStaffInvitation,
  assignClient,
  unassignClient,
  revokeSeat,
  listSeats,
} from '../../src/services/ca/caFirmSeats.service.js';
import { requestDocument } from '../../src/services/ca/caDocumentRequests.service.js';
import { listClientOverview } from '../../src/services/ca/caClientList.service.js';
import { savePracticeProfile, createInvoice } from '../../src/services/ca/caInvoice.service.js';

/**
 * Firm seats: a CA's staff work on the clients the CA assigns them, under the
 * client's own grant — and on nothing else. These read rows back under the
 * staff member's own database context, so RLS is what is being tested, not
 * only the service checks in front of it.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope & { email: string }> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  const user = await runAsSystem(() =>
    prisma.user.findUniqueOrThrow({ where: { id: scope.userId }, select: { email: true } }),
  );
  return { ...scope, email: user.email };
}

/** asha grants `ca` access to her books; one BUY so there is something to read. */
async function grant(asha: TestScope, ca: TestScope & { email: string }): Promise<string> {
  const { client, token } = await runAsUser(asha.userId, () =>
    inviteProfessional(asha.userId, { name: 'Our CA', email: ca.email }),
  );
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.invoice.deleteMany({ where: { clientId: client.id } });
      await prisma.documentRequest.deleteMany({ where: { clientId: client.id } });
      await prisma.caAuditLog.deleteMany({ where: { clientId: client.id } });
      await prisma.firmSeatClient.deleteMany({ where: { clientId: client.id } });
      await prisma.client.deleteMany({ where: { id: client.id } });
    });
  });
  await runAsUser(ca.userId, () => acceptProfessionalInvitation(ca.userId, ca.email, token));
  await runAsSystem(() =>
    prisma.transaction.create({
      data: {
        portfolioId: asha.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY', assetName: 'Infosys',
        assetKey: 'name:Infosys', tradeDate: new Date('2025-05-02'), quantity: '10', price: '1500',
        grossAmount: '15000', netAmount: '15000',
      },
    }),
  );
  return client.id;
}

async function seat(ca: TestScope, staff: TestScope & { email: string }, name = 'Ramesh') {
  const { seat: row, token } = await runAsUser(ca.userId, () => inviteStaff(ca.userId, { name, email: staff.email }));
  cleanups.push(() => runAsSystem(() => prisma.firmSeat.deleteMany({ where: { id: row.id } })).then(() => undefined));
  await runAsUser(staff.userId, () => acceptStaffInvitation(staff.userId, staff.email, token));
  return row.id;
}

const visibleTxns = (userId: string, owner: TestScope) =>
  runAsUser(userId, () => prisma.transaction.count({ where: { portfolio: { userId: owner.userId } } }));

describe('firm seats', () => {
  it('an assigned staff member reads the client under the grant; an unassigned one reads nothing', async () => {
    const ca = await person('fs-ca');
    const ramesh = await person('fs-ramesh');
    const priya = await person('fs-priya');
    const asha = await person('fs-asha');
    const clientId = await grant(asha, ca);
    const rameshSeat = await seat(ca, ramesh, 'Ramesh');
    await seat(ca, priya, 'Priya');

    expect(await visibleTxns(ramesh.userId, asha)).toBe(0);
    await runAsUser(ca.userId, () => assignClient(ca.userId, rameshSeat, clientId));

    expect(await visibleTxns(ramesh.userId, asha)).toBe(1);
    expect(await visibleTxns(priya.userId, asha)).toBe(0);
    const scope = await runAsVerified(ramesh.userId, () => getCaScope(ramesh.userId, clientId));
    expect(scope.subjectUserId).toBe(asha.userId);
    await expect(runAsVerified(priya.userId, () => getCaScope(priya.userId, clientId))).rejects.toThrow();

    const list = await runAsVerified(ramesh.userId, () => listClients(ramesh.userId));
    expect(list.map((c) => [c.id, c.actingAs])).toEqual([[clientId, 'STAFF']]);
    const overview = await runAsUser(ramesh.userId, () => listClientOverview(ramesh.userId, { fy: '2025-26' }));
    expect(overview.rows.map((r) => r.clientId)).toEqual([clientId]);
  });

  it('loses access the moment the seat is revoked or the client unassigned', async () => {
    const ca = await person('fs-rev-ca');
    const ramesh = await person('fs-rev-ramesh');
    const asha = await person('fs-rev-asha');
    const clientId = await grant(asha, ca);
    const s = await seat(ca, ramesh);
    await runAsUser(ca.userId, () => assignClient(ca.userId, s, clientId));
    expect(await visibleTxns(ramesh.userId, asha)).toBe(1);

    await runAsUser(ca.userId, () => unassignClient(ca.userId, s, clientId));
    expect(await visibleTxns(ramesh.userId, asha)).toBe(0);

    await runAsUser(ca.userId, () => assignClient(ca.userId, s, clientId));
    await runAsUser(ca.userId, () => revokeSeat(ca.userId, s));
    expect(await visibleTxns(ramesh.userId, asha)).toBe(0);
  });

  it('follows the client: a revoked grant shuts the staff out too', async () => {
    const ca = await person('fs-grant-ca');
    const ramesh = await person('fs-grant-ramesh');
    const asha = await person('fs-grant-asha');
    const clientId = await grant(asha, ca);
    const s = await seat(ca, ramesh);
    await runAsUser(ca.userId, () => assignClient(ca.userId, s, clientId));
    await runAsUser(asha.userId, () => revokeGrant(asha.userId, clientId));
    expect(await visibleTxns(ramesh.userId, asha)).toBe(0);
  });

  it('staff cannot change the grant, close it, bill, or manage seats', async () => {
    const ca = await person('fs-limits-ca');
    const ramesh = await person('fs-limits-ramesh');
    const asha = await person('fs-limits-asha');
    const clientId = await grant(asha, ca);
    const s = await seat(ca, ramesh);
    await runAsUser(ca.userId, () => assignClient(ca.userId, s, clientId));

    // The grant row: readable, never writable.
    await expect(
      runAsUser(ramesh.userId, () => prisma.client.update({ where: { id: clientId }, data: { canEditBooks: true } })),
    ).rejects.toThrow();
    await expect(runAsUser(ramesh.userId, () => revokeGrant(ramesh.userId, clientId))).rejects.toThrow();

    await runAsUser(ramesh.userId, () =>
      savePracticeProfile(ramesh.userId, { firmName: 'Mine', address: 'x', stateCode: '27', gstin: null }),
    );
    cleanups.push(() => runAsSystem(() => prisma.practiceProfile.deleteMany({ where: { userId: ramesh.userId } })).then(() => undefined));
    await expect(
      runAsUser(ramesh.userId, () =>
        createInvoice(ramesh.userId, { clientId, invoiceDate: '2026-07-20', buyerName: 'Asha', lines: [{ description: 'x', amount: '1' }] }),
      ),
    ).rejects.toThrow();

    await expect(runAsUser(ramesh.userId, () => assignClient(ramesh.userId, s, clientId))).rejects.toThrow();
    expect(await runAsUser(ramesh.userId, () => listSeats(ramesh.userId))).toHaveLength(0);
  });

  it('names the staff member to the client and in the trail, which the CA can read', async () => {
    const ca = await person('fs-name-ca');
    const ramesh = await person('fs-name-ramesh');
    const asha = await person('fs-name-asha');
    await runAsSystem(() => prisma.user.update({ where: { id: ca.userId }, data: { name: 'Iyer' } }));
    const clientId = await grant(asha, ca);
    const s = await seat(ca, ramesh, 'Ramesh');
    await runAsUser(ca.userId, () => assignClient(ca.userId, s, clientId));

    const grants = await runAsUser(asha.userId, () => listMyProfessionalGrants(asha.userId));
    expect(grants.find((g) => g.clientId === clientId)!.staff).toEqual(['Ramesh']);

    await runAsUser(ramesh.userId, () => requestDocument(ramesh.userId, clientId, { title: 'Form 16' }));
    const byCa = await runAsUser(ca.userId, () =>
      prisma.caAuditLog.findMany({ where: { clientId, action: 'DOCUMENT_REQUESTED' } }),
    );
    expect(byCa).toHaveLength(1);
    expect(byCa[0]!.actorUserId).toBe(ramesh.userId);
    expect((byCa[0]!.metadata as { actor?: string }).actor).toBe('Ramesh (Iyer’s office)');
  });

  it('accepts only for the invited address, once', async () => {
    const ca = await person('fs-acc-ca');
    const ramesh = await person('fs-acc-ramesh');
    const other = await person('fs-acc-other');
    const { seat: row, token } = await runAsUser(ca.userId, () => inviteStaff(ca.userId, { name: 'Ramesh', email: ramesh.email }));
    cleanups.push(() => runAsSystem(() => prisma.firmSeat.deleteMany({ where: { id: row.id } })).then(() => undefined));
    await expect(runAsUser(other.userId, () => acceptStaffInvitation(other.userId, other.email, token))).rejects.toThrow();
    await runAsUser(ramesh.userId, () => acceptStaffInvitation(ramesh.userId, ramesh.email, token));
    await expect(runAsUser(ramesh.userId, () => acceptStaffInvitation(ramesh.userId, ramesh.email, token))).rejects.toThrow();
  });
});
