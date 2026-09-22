import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  inviteProfessional,
  acceptProfessionalInvitation,
  peekProfessionalInvitation,
  cancelProfessionalInvitation,
  listMyProfessionalGrants,
  getCaScope,
  createManagedClient,
} from '../../src/services/ca/caAccess.service.js';

/**
 * The ordinary direction: the person whose money it is brings in their
 * accountant.
 *
 * The thing these have to prove is that an OPEN invitation grants nothing.
 * Until someone accepts, the row has no advisor, and every policy compares
 * that column to the caller — so the assertions read rows back rather than
 * trusting the service to have said no.
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

async function invite(client: TestScope, professionalEmail: string) {
  const { client: row, token } = await runAsUser(client.userId, () =>
    inviteProfessional(client.userId, { name: 'Ramesh CA', email: professionalEmail }),
  );
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.caAuditLog.deleteMany({ where: { clientId: row.id } });
      await prisma.client.deleteMany({ where: { id: row.id } });
    });
  });
  return { row, token };
}

describe('an invitation nobody has accepted', () => {
  it('grants nothing — the professional cannot read a single row', async () => {
    const het = await person('cig-client');
    const ramesh = await person('cig-pro');
    const { row } = await invite(het, ramesh.email);

    expect(row.advisorId).toBeNull();
    expect(row.status).toBe('PENDING');
    expect(row.initiatedBy).toBe('CLIENT');

    const seen = await runAsUser(ramesh.userId, async () => ({
      portfolios: await prisma.portfolio.count({ where: { userId: het.userId } }),
      transactions: await prisma.transaction.count({ where: { portfolio: { userId: het.userId } } }),
    }));
    expect(seen).toEqual({ portfolios: 0, transactions: 0 });

    await expect(
      runAsUser(ramesh.userId, () => getCaScope(ramesh.userId, row.id)),
    ).rejects.toThrow();
  });

  it('tells a signed-out professional who is asking, and nothing else', async () => {
    const het = await person('cig-peek-client');
    const ramesh = await person('cig-peek-pro');
    const { row, token } = await invite(het, ramesh.email);

    const preview = await peekProfessionalInvitation(token);
    expect(preview.invitedEmail).toBe(ramesh.email);
    expect(preview.expiresAt).toBeInstanceOf(Date);
    expect(JSON.stringify(preview)).not.toContain(row.id);
  });

  it('shows up on the client’s own list as still open', async () => {
    const het = await person('cig-list-client');
    const ramesh = await person('cig-list-pro');
    await invite(het, ramesh.email);

    const grants = await runAsUser(het.userId, () => listMyProfessionalGrants(het.userId));
    expect(grants).toHaveLength(1);
    expect(grants[0]!.status).toBe('PENDING');
    expect(grants[0]!.advisor).toBeNull();
    expect(grants[0]!.invitedEmail).toBe(ramesh.email);
  });

  it('can be cancelled by the client, and is then dead', async () => {
    const het = await person('cig-cancel-client');
    const ramesh = await person('cig-cancel-pro');
    const { row, token } = await invite(het, ramesh.email);

    await runAsUser(het.userId, () => cancelProfessionalInvitation(het.userId, row.id));

    await expect(
      runAsUser(ramesh.userId, () =>
        acceptProfessionalInvitation(ramesh.userId, ramesh.email, token),
      ),
    ).rejects.toThrow();
  });
});

describe('accepting', () => {
  it('names the professional on the grant and opens the books', async () => {
    const het = await person('cig-accept-client');
    const ramesh = await person('cig-accept-pro');
    const { row, token } = await invite(het, ramesh.email);

    await runAsSystem(() =>
      prisma.transaction.create({
        data: {
          portfolioId: het.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY',
          assetName: 'Infosys', assetKey: 'name:Infosys', tradeDate: new Date('2025-05-02'),
          quantity: '10', price: '1500', grossAmount: '15000', netAmount: '15000',
        },
      }),
    );

    const accepted = await runAsUser(ramesh.userId, () =>
      acceptProfessionalInvitation(ramesh.userId, ramesh.email, token),
    );
    expect(accepted.advisorId).toBe(ramesh.userId);
    expect(accepted.status).toBe('ACTIVE');

    const seen = await runAsUser(ramesh.userId, async () => ({
      portfolios: await prisma.portfolio.count({ where: { userId: het.userId } }),
      transactions: await prisma.transaction.count({ where: { portfolio: { userId: het.userId } } }),
    }));
    expect(seen).toEqual({ portfolios: 1, transactions: 1 });

    const scope = await runAsUser(ramesh.userId, () => getCaScope(ramesh.userId, row.id));
    expect(scope.subjectUserId).toBe(het.userId);
  });

  it('refuses somebody the invitation was not sent to', async () => {
    const het = await person('cig-wrong-client');
    const ramesh = await person('cig-wrong-pro');
    const mahesh = await person('cig-wrong-other');
    const { token } = await invite(het, ramesh.email);

    await expect(
      runAsUser(mahesh.userId, () =>
        acceptProfessionalInvitation(mahesh.userId, mahesh.email, token),
      ),
    ).rejects.toThrow(/different email/i);
  });

  it('cannot be replayed', async () => {
    const het = await person('cig-replay-client');
    const ramesh = await person('cig-replay-pro');
    const { token } = await invite(het, ramesh.email);

    await runAsUser(ramesh.userId, () =>
      acceptProfessionalInvitation(ramesh.userId, ramesh.email, token),
    );
    await expect(
      runAsUser(ramesh.userId, () =>
        acceptProfessionalInvitation(ramesh.userId, ramesh.email, token),
      ),
    ).rejects.toThrow();
  });

  it('leaves the accepted grant revocable by the client, as before', async () => {
    const het = await person('cig-revoke-client');
    const ramesh = await person('cig-revoke-pro');
    const { row, token } = await invite(het, ramesh.email);
    await runAsUser(ramesh.userId, () =>
      acceptProfessionalInvitation(ramesh.userId, ramesh.email, token),
    );

    const { revokeGrant } = await import('../../src/services/ca/caAccess.service.js');
    await runAsUser(het.userId, () => revokeGrant(het.userId, row.id));

    const seen = await runAsUser(ramesh.userId, () =>
      prisma.portfolio.count({ where: { userId: het.userId } }),
    );
    expect(seen).toBe(0);
  });
});

describe('the client’s own invitation list', () => {
  it('refuses a second open invitation to the same address', async () => {
    const het = await person('cig-dup-client');
    const ramesh = await person('cig-dup-pro');
    await invite(het, ramesh.email);

    await expect(
      runAsUser(het.userId, () =>
        inviteProfessional(het.userId, { name: 'Ramesh again', email: ramesh.email }),
      ),
    ).rejects.toThrow(/already invited/i);
  });

  it('refuses an invitation addressed to yourself', async () => {
    const het = await person('cig-self-client');

    await expect(
      runAsUser(het.userId, () => inviteProfessional(het.userId, { name: 'Me', email: het.email })),
    ).rejects.toThrow(/your own address/i);
  });
});

describe('records for people with no login', () => {
  it('are no longer created', async () => {
    const ca = await person('cig-shadow-ca');

    await expect(
      runAsUser(ca.userId, () =>
        createManagedClient(ca.userId, { name: 'Mahesh', consentBasis: 'ENGAGEMENT_LETTER' }),
      ),
    ).rejects.toThrow(/no longer created/i);
  });
});
