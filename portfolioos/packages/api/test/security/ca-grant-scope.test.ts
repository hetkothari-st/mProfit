import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  getCaScope,
  updateGrantScope,
  reinstateGrant,
  revokeGrant,
  getGrantForSubject,
} from '../../src/services/ca/caAccess.service.js';

/**
 * What a grant covers, tested where it is enforced.
 *
 * The scope lives on `Client` but the enforcement lives in the policies, so
 * every assertion here reads through Prisma as the CA and checks what comes
 * back — not what `getCaScope` reports. A cap that only the service honours is
 * a cap the next endpoint forgets, and these would still pass if that were the
 * case, which is exactly why they query rows instead.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  return scope;
}

/** A client with two portfolios, a loan and a car — three scope dimensions. */
async function clientWithSpread(label: string) {
  const scope = await person(label);
  const extra = await runAsSystem(async () => {
    const p = await prisma.portfolio.create({
      data: { userId: scope.userId, name: 'Second portfolio', currency: 'INR', type: 'INVESTMENT' },
    });
    await prisma.transaction.create({
      data: {
        portfolioId: scope.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY',
        assetName: 'Infosys', assetKey: 'name:Infosys', tradeDate: new Date('2025-05-02'),
        quantity: '10', price: '1500', grossAmount: '15000', netAmount: '15000',
      },
    });
    await prisma.transaction.create({
      data: {
        portfolioId: p.id, assetClass: 'MUTUAL_FUND', transactionType: 'BUY',
        assetName: 'Parag Parikh Flexi Cap', assetKey: 'name:PPFC',
        tradeDate: new Date('2025-05-03'), quantity: '100', price: '60',
        grossAmount: '6000', netAmount: '6000',
      },
    });
    const loan = await prisma.loan.create({
      data: {
        userId: scope.userId, lenderName: 'HDFC', loanType: 'HOME', borrowerName: 'Self',
        principalAmount: '1000000', interestRate: '9', tenureMonths: 120, emiAmount: '12000',
        disbursementDate: new Date('2025-04-01'), firstEmiDate: new Date('2025-05-01'),
      },
    });
    await prisma.vehicle.create({
      data: { userId: scope.userId, registrationNo: `MH01${label.slice(0, 4)}`, make: 'Maruti' },
    });
    return { secondPortfolioId: p.id, loanId: loan.id };
  });

  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.vehicle.deleteMany({ where: { userId: scope.userId } });
      await prisma.loan.deleteMany({ where: { userId: scope.userId } });
      await prisma.transaction.deleteMany({ where: { portfolioId: extra.secondPortfolioId } });
      await prisma.portfolio.deleteMany({ where: { id: extra.secondPortfolioId } });
    });
  });

  return { ...scope, ...extra };
}

async function grant(advisorId: string, clientUserId: string) {
  const client = await runAsSystem(() =>
    prisma.client.create({
      data: {
        advisorId, userId: clientUserId, name: 'Scoped Client',
        kind: 'INVITED', status: 'ACTIVE', acceptedAt: new Date(),
      },
    }),
  );
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.clientPortfolioScope.deleteMany({ where: { clientId: client.id } });
      await prisma.caAuditLog.deleteMany({ where: { clientId: client.id } });
      await prisma.client.deleteMany({ where: { id: client.id } });
    });
  });
  return client;
}

describe('a grant narrowed to some portfolios', () => {
  it('shows the CA only those, and only their transactions', async () => {
    const client = await clientWithSpread('scope-pf-client');
    const ca = await person('scope-pf-ca');
    const g = await grant(ca.userId, client.userId);

    const wideOpen = await runAsUser(ca.userId, () =>
      prisma.portfolio.findMany({ where: { userId: client.userId } }),
    );
    expect(wideOpen).toHaveLength(2);

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, g.id, { portfolioIds: [client.portfolioId] }),
    );

    const narrowed = await runAsUser(ca.userId, () =>
      prisma.portfolio.findMany({ where: { userId: client.userId } }),
    );
    expect(narrowed.map((p) => p.id)).toEqual([client.portfolioId]);

    // The rows inside the excluded portfolio go with it.
    const txns = await runAsUser(ca.userId, () =>
      prisma.transaction.findMany({ where: { portfolio: { userId: client.userId } } }),
    );
    expect(txns).toHaveLength(1);
    expect(txns[0]!.portfolioId).toBe(client.portfolioId);
  });

  it('reports the same narrowing through getCaScope', async () => {
    const client = await clientWithSpread('scope-report-client');
    const ca = await person('scope-report-ca');
    const g = await grant(ca.userId, client.userId);

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, g.id, { portfolioIds: [client.secondPortfolioId] }),
    );

    const scope = await runAsUser(ca.userId, () => getCaScope(ca.userId, g.id));
    expect(scope.allowedPortfolioIds).toEqual([client.secondPortfolioId]);
  });
});

describe('a grant narrowed by category', () => {
  it('keeps the included ones and hides the rest', async () => {
    const client = await clientWithSpread('scope-cat-client');
    const ca = await person('scope-cat-ca');
    const g = await grant(ca.userId, client.userId);

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, g.id, { categories: ['LOAN'] }),
    );

    const seen = await runAsUser(ca.userId, async () => ({
      loans: await prisma.loan.count({ where: { userId: client.userId } }),
      vehicles: await prisma.vehicle.count({ where: { userId: client.userId } }),
    }));
    expect(seen).toEqual({ loans: 1, vehicles: 0 });
  });

  it('treats an empty list as deny-all, not as unrestricted', async () => {
    const client = await clientWithSpread('scope-empty-client');
    const ca = await person('scope-empty-ca');
    const g = await grant(ca.userId, client.userId);

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, g.id, { categories: [] }),
    );

    const loans = await runAsUser(ca.userId, () =>
      prisma.loan.count({ where: { userId: client.userId } }),
    );
    expect(loans).toBe(0);
  });
});

describe('a grant narrowed by asset class', () => {
  it('hides the transactions of every class left out', async () => {
    const client = await clientWithSpread('scope-ac-client');
    const ca = await person('scope-ac-ca');
    const g = await grant(ca.userId, client.userId);

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, g.id, { assetClasses: ['EQUITY'] }),
    );

    const txns = await runAsUser(ca.userId, () =>
      prisma.transaction.findMany({ where: { portfolio: { userId: client.userId } } }),
    );
    expect(txns.map((t) => t.assetClass)).toEqual(['EQUITY']);
  });
});

describe('the access window', () => {
  it('closes the grant once it has passed, in the database', async () => {
    const client = await clientWithSpread('scope-window-client');
    const ca = await person('scope-window-ca');
    const g = await grant(ca.userId, client.userId);

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, g.id, { accessUntil: '2020-01-01' }),
    );

    const portfolios = await runAsUser(ca.userId, () =>
      prisma.portfolio.findMany({ where: { userId: client.userId } }),
    );
    expect(portfolios).toHaveLength(0);

    // And the service says why, rather than showing an empty page.
    await expect(runAsUser(ca.userId, () => getCaScope(ca.userId, g.id))).rejects.toThrow(
      /ended on 2020-01-01/,
    );
  });

  it('refuses a window that ends before it starts', async () => {
    const client = await clientWithSpread('scope-badwindow-client');
    const ca = await person('scope-badwindow-ca');
    const g = await grant(ca.userId, client.userId);

    await expect(
      runAsUser(client.userId, () =>
        updateGrantScope(client.userId, g.id, { accessFrom: '2026-06-01', accessUntil: '2026-01-01' }),
      ),
    ).rejects.toThrow(/cannot end before it starts/);
  });
});

describe('who may change a grant', () => {
  it('refuses the CA who holds it', async () => {
    const client = await clientWithSpread('scope-actor-client');
    const ca = await person('scope-actor-ca');
    const g = await grant(ca.userId, client.userId);

    await expect(
      runAsUser(ca.userId, () => updateGrantScope(ca.userId, g.id, { categories: null })),
    ).rejects.toThrow(/not yours to manage/);
  });

  it('lets the client take access back and give it again', async () => {
    const client = await clientWithSpread('scope-cycle-client');
    const ca = await person('scope-cycle-ca');
    const g = await grant(ca.userId, client.userId);

    await runAsUser(client.userId, () => revokeGrant(client.userId, g.id));
    const duringRevocation = await runAsUser(ca.userId, () =>
      prisma.portfolio.count({ where: { userId: client.userId } }),
    );
    expect(duringRevocation).toBe(0);

    await runAsUser(client.userId, () => reinstateGrant(client.userId, g.id));
    const after = await runAsUser(ca.userId, () =>
      prisma.portfolio.count({ where: { userId: client.userId } }),
    );
    expect(after).toBe(2);
  });

  it('will not let a CA reinstate a grant a real client ended', async () => {
    const client = await clientWithSpread('scope-reinstate-client');
    const ca = await person('scope-reinstate-ca');
    const g = await grant(ca.userId, client.userId);

    await runAsUser(client.userId, () => revokeGrant(client.userId, g.id));

    await expect(
      runAsUser(ca.userId, () => reinstateGrant(ca.userId, g.id)),
    ).rejects.toThrow(/Only the client can restore/);
  });
});

describe('the client’s own view of a grant', () => {
  it('names the advisor and lists the portfolios they could pick from', async () => {
    const client = await clientWithSpread('scope-view-client');
    const ca = await person('scope-view-ca');
    const g = await grant(ca.userId, client.userId);

    const view = await runAsUser(client.userId, () => getGrantForSubject(client.userId, g.id));
    expect(view.advisor?.id).toBe(ca.userId);
    expect(view.availablePortfolios).toHaveLength(2);
    expect(view.scopeAllPortfolios).toBe(true);
  });

  it('is refused to anyone else', async () => {
    const client = await clientWithSpread('scope-view-stranger-client');
    const ca = await person('scope-view-stranger-ca');
    const stranger = await person('scope-view-stranger');
    const g = await grant(ca.userId, client.userId);

    await expect(
      runAsUser(stranger.userId, () => getGrantForSubject(stranger.userId, g.id)),
    ).rejects.toThrow();
  });
});
