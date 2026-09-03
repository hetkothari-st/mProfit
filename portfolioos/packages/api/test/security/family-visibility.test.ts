/**
 * Family visibility caps — the guarantee that a non-OWNER sees only what an
 * OWNER granted them.
 *
 * These exist because all three parts of that guarantee were broken at once:
 *
 *  1. dashboard.service's family fan-out ignored the caps entirely, with a
 *     comment claiming the frontend filtered per widget. It did not, so a
 *     VIEWER saw every member's complete net worth.
 *  2. getEffectiveScope mapped an empty visibleAssetClasses to `null`, which
 *     means "unrestricted" — while the schema and the EffectiveScope contract
 *     both say an empty list is deny-all. The column is `@default([])`, so
 *     every member invited without someone ticking boxes was silently granted
 *     sight of the whole household.
 *  3. The readableUserIds doc claimed non-OWNERs get no sibling ids, while the
 *     code returned the full union to every role.
 *
 * A number cannot be filtered after it has been summed, so these assert on
 * totals built from the fan-out, not on row-level queries.
 *
 * Every service call runs inside `scope.runAs(...)`. RLS is enforced, so a
 * call with no ambient user context reads zero rows and getEffectiveScope
 * reports "not an active member" — the same fail-closed behaviour a request
 * would get without authentication.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getEffectiveScope } from '../../src/services/familyScope.service.js';
import { getDashboardNetWorthForScope } from '../../src/services/dashboard.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

let owner: TestScope;
let member: TestScope;
let familyId: string;

/** Give a user one holding of a given class, so totals are non-zero. */
async function seedHolding(scope: TestScope, assetClass: 'EQUITY' | 'GOLD_ETF', value: string) {
  await runAsSystem(async () => {
    await prisma.holdingProjection.create({
      data: {
        portfolioId: scope.portfolioId,
        assetKey: `${assetClass}:${scope.portfolioId}`,
        assetClass,
        assetName: `${assetClass} position`,
        sourceTxCount: 1,
        quantity: new Decimal(1),
        avgCostPrice: new Decimal(value),
        totalCost: new Decimal(value),
        currentValue: new Decimal(value),
        unrealisedPnL: new Decimal(0),
      },
    });
  });
}

async function setCaps(userId: string, assetClasses: string[], categories: string[]) {
  await runAsSystem(async () => {
    await prisma.familyMember.updateMany({
      where: { familyId, userId },
      data: { visibleAssetClasses: assetClasses as never, visibleCategories: categories },
    });
  });
}

beforeAll(async () => {
  owner = await createTestScope('fam-owner');
  member = await createTestScope('fam-member');

  // The owner holds equity; the member holds gold. Distinct classes so we can
  // tell whose money a total is made of.
  await seedHolding(owner, 'EQUITY', '100000');
  await seedHolding(member, 'GOLD_ETF', '50000');

  familyId = await runAsSystem(async () => {
    const family = await prisma.family.create({
      data: { name: 'Visibility Test Family', createdById: owner.userId },
    });
    await prisma.familyMember.create({
      data: { familyId: family.id, userId: owner.userId, role: 'OWNER', status: 'ACTIVE' },
    });
    await prisma.familyMember.create({
      data: { familyId: family.id, userId: member.userId, role: 'VIEWER', status: 'ACTIVE' },
    });
    return family.id;
  });
}, 120_000);

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.familyMember.deleteMany({ where: { familyId } });
    await prisma.family.deleteMany({ where: { id: familyId } });
  });
  await owner.cleanup();
  await member.cleanup();
}, 120_000);

describe('family visibility caps', () => {
  it('gives an OWNER no restriction', async () => {
    const scope = await owner.runAs(() => getEffectiveScope(owner.userId, { familyId }));
    expect(scope.role).toBe('OWNER');
    expect(scope.allowedAssetClasses).toBeNull();
    expect(scope.allowedCategories).toBeNull();
  });

  it('treats an unconfigured member as deny-all, not allow-all', async () => {
    // The regression that mattered most: the column defaults to [], so this is
    // the state every member is in until an OWNER grants something.
    await setCaps(member.userId, [], []);
    const scope = await member.runAs(() => getEffectiveScope(member.userId, { familyId }));

    expect(scope.role).toBe('VIEWER');
    // Empty array, NOT null. null would mean unrestricted.
    expect(scope.allowedAssetClasses).toEqual([]);
    expect(scope.allowedCategories).toEqual([]);
  });

  it('still lets every role read the sibling union — caps do the limiting', async () => {
    const scope = await member.runAs(() => getEffectiveScope(member.userId, { familyId }));
    expect(scope.readableUserIds).toEqual(
      expect.arrayContaining([owner.userId, member.userId]),
    );
  });

  it("hides a sibling's holdings from a member granted nothing", async () => {
    await setCaps(member.userId, [], []);
    const view = await member.runAs(() =>
      getDashboardNetWorthForScope(member.userId, { familyId }),
    );

    // Their own 50,000 of gold, and none of the owner's 100,000 of equity.
    expect(new Decimal(view.portfolio.currentValue).toNumber()).toBe(50_000);
    const classes = view.allocationBreakdown.map((a) => a.key);
    expect(classes).not.toContain('EQUITY');
  });

  it("reveals only the granted asset class of a sibling's holdings", async () => {
    await setCaps(member.userId, ['EQUITY'], []);
    const view = await member.runAs(() =>
      getDashboardNetWorthForScope(member.userId, { familyId }),
    );

    // Own gold (unfiltered — caps never apply to your own data) plus the
    // owner's equity, which was explicitly granted.
    expect(new Decimal(view.portfolio.currentValue).toNumber()).toBe(150_000);
  });

  it('shows an OWNER the whole family regardless of their own caps row', async () => {
    const view = await owner.runAs(() =>
      getDashboardNetWorthForScope(owner.userId, { familyId }),
    );
    expect(new Decimal(view.portfolio.currentValue).toNumber()).toBe(150_000);
  });

  it('leaves a personal view untouched by any family cap', async () => {
    await setCaps(member.userId, [], []);
    const view = await member.runAs(() => getDashboardNetWorthForScope(member.userId, {}));
    // No familyId: their own data in full, never restricted by a grant that
    // only governs what they see OF THE FAMILY.
    expect(new Decimal(view.portfolio.currentValue).toNumber()).toBe(50_000);
  });
});
