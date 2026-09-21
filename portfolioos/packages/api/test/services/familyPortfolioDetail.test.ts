import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  getPortfolio,
  getPortfolioHoldings,
  getPortfolioSummary,
} from '../../src/services/portfolio.service.js';

/**
 * Opening a family member's portfolio.
 *
 * The access checks fetch the row first and judge it second. Row-level
 * security hides a peer's personal portfolio from the caller, so the fetch
 * returned nothing and the judgement never happened: every family member's
 * portfolio page answered "not found". It only showed up once the app stopped
 * connecting as a superuser — the checks had always been written for a
 * connection that could see every row.
 *
 * These run as the caller, with policies in force, which is the configuration
 * that broke.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function member(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  await runAsSystem(async () => {
    await prisma.transaction.create({
      data: {
        portfolioId: scope.portfolioId,
        assetClass: 'EQUITY',
        transactionType: 'BUY',
        assetName: 'Infosys',
        assetKey: 'name:Infosys',
        tradeDate: new Date('2025-05-02'),
        quantity: '10',
        price: '1500',
        grossAmount: '15000',
        netAmount: '15000',
      },
    });
    await prisma.holdingProjection.create({
      data: {
        portfolioId: scope.portfolioId,
        assetKey: 'name:Infosys',
        assetClass: 'EQUITY',
        assetName: 'Infosys',
        quantity: '10',
        avgCostPrice: '1500',
        totalCost: '15000',
        currentValue: '16000',
        sourceTxCount: 1,
      },
    });
  });
  return scope;
}

async function family(owner: TestScope, other: TestScope): Promise<string> {
  const id = await runAsSystem(async () => {
    const fam = await prisma.family.create({ data: { name: 'Detail Household', createdById: owner.userId } });
    await prisma.familyMember.create({ data: { familyId: fam.id, userId: owner.userId, role: 'OWNER', status: 'ACTIVE' } });
    await prisma.familyMember.create({ data: { familyId: fam.id, userId: other.userId, role: 'CONTRIBUTOR', status: 'ACTIVE' } });
    return fam.id;
  });
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.familyMember.deleteMany({ where: { familyId: id } });
      await prisma.family.deleteMany({ where: { id } });
    });
  });
  return id;
}

describe('a family member’s portfolio pages', () => {
  it('opens for another member of the family', async () => {
    const owner = await member('detail-owner');
    const other = await member('detail-other');
    await family(owner, other);

    const dto = await runAsUser(owner.userId, () => getPortfolio(owner.userId, other.portfolioId));
    expect(dto.id).toBe(other.portfolioId);

    const summary = await runAsUser(owner.userId, () => getPortfolioSummary(owner.userId, other.portfolioId));
    expect(summary.holdingCount).toBe(1);

    const holdings = await runAsUser(owner.userId, () => getPortfolioHoldings(owner.userId, other.portfolioId));
    expect(holdings).toHaveLength(1);
    expect(holdings[0]!.assetName).toBe('Infosys');
  });

  it('stays shut to someone outside the family', async () => {
    const owner = await member('detail-stranger-owner');
    const stranger = await createTestScope('detail-stranger');
    cleanups.push(stranger.cleanup);

    await expect(
      runAsUser(stranger.userId, () => getPortfolioSummary(stranger.userId, owner.portfolioId)),
    ).rejects.toThrow();
  });
});
