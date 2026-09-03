/**
 * Family dashboard aggregates — DB-backed, RLS-enforced.
 *
 * A household of three (OWNER + two members), each with holdings, a goal, an
 * insurance policy and a loan, plus ONE family-shared portfolio created by the
 * OWNER. The assertions that matter:
 *
 *   - the household total equals the sum of the member rows;
 *   - the family-shared portfolio is counted exactly once (proved, not assumed
 *     — it is the failure mode a per-user fan-out invites);
 *   - a VIEWER granted only EQUITY sees only equity of their siblings, in full
 *     of their own gold;
 *   - a member granted nothing sees only themselves, and the response SAYS the
 *     total is partial;
 *   - per-member percentages sum to ~100 against the household denominator.
 *
 * Every service call runs inside `scope.runAs(...)`, so RLS is live: a call
 * without ambient context reads nothing, exactly as an unauthenticated request
 * would.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import {
  getFamilyWealth,
  getFamilyGoals,
  getFamilyProtection,
  getFamilyAttention,
  GOAL_CATEGORIES,
} from '../../../src/services/family/familyAggregate.service.js';
import { createTestScope, type TestScope } from '../../helpers/db.js';

const TIMEOUT = 120_000;

let owner: TestScope;
let m1: TestScope;
let m2: TestScope;
let familyId: string;
/** Family-shared portfolio: familyId set, userId = the creating OWNER. */
let sharedPortfolioId: string;

const num = (s: string) => new Decimal(s).toNumber();
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function seedHolding(
  portfolioId: string,
  assetClass: 'EQUITY' | 'GOLD_ETF',
  value: string,
  tag: string,
) {
  await runAsSystem(async () => {
    await prisma.holdingProjection.create({
      data: {
        portfolioId,
        assetKey: `${assetClass}:${tag}`,
        assetClass,
        assetName: `${assetClass} ${tag}`,
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

/**
 * Goals are seeded AS THE USER, not under runAsSystem: the `goal_owner` policy
 * (20260529180000_phase_2c_goals) is the one RLS policy in the schema with no
 * `app_is_system()` escape hatch, so a privileged insert fails with 42501.
 */
async function seedGoal(scope: TestScope, name: string, target: string, initial: string) {
  const userId = scope.userId;
  await scope.runAs(async () => {
    await prisma.goal.create({
      data: {
        userId,
        name,
        targetAmount: new Decimal(target).toString(),
        initialAmount: new Decimal(initial).toString(),
        expectedReturn: '0.1200',
        targetDate: days(365 * 5),
      },
    });
  });
}

async function seedPolicy(
  userId: string,
  opts: { type: string; sumAssured: string; premium: string; dueInDays?: number; no: string },
) {
  await runAsSystem(async () => {
    await prisma.insurancePolicy.create({
      data: {
        userId,
        insurer: 'Test Insurer',
        policyNumber: opts.no,
        type: opts.type,
        policyHolder: 'Test Holder',
        sumAssured: new Decimal(opts.sumAssured).toString(),
        premiumAmount: new Decimal(opts.premium).toString(),
        premiumFrequency: 'ANNUAL',
        startDate: days(-365),
        nextPremiumDue: opts.dueInDays === undefined ? null : days(opts.dueInDays),
        status: 'ACTIVE',
      },
    });
  });
}

async function seedLoan(userId: string, lender: string) {
  await runAsSystem(async () => {
    await prisma.loan.create({
      data: {
        userId,
        lenderName: lender,
        loanType: 'HOME',
        borrowerName: 'Test Borrower',
        principalAmount: '1000000',
        interestRate: '9.0000',
        tenureMonths: 120,
        emiAmount: '12668',
        emiDueDay: 1,
        disbursementDate: days(-30),
        // First EMI ten days out, so every member has one upcoming EMI.
        firstEmiDate: days(10),
        status: 'ACTIVE',
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

const ALL_CATEGORIES = ['VEHICLE', 'RENTAL', 'INSURANCE', 'LOAN', 'CREDIT_CARD', 'BANK_ACCOUNT', 'OWNED_PROPERTY', 'GOAL'];

beforeAll(async () => {
  owner = await createTestScope('fa-owner');
  m1 = await createTestScope('fa-m1');
  m2 = await createTestScope('fa-m2');

  // Personal holdings. Distinct classes so a total can be traced to a member.
  await seedHolding(owner.portfolioId, 'EQUITY', '100000', 'own');
  await seedHolding(m1.portfolioId, 'GOLD_ETF', '50000', 'm1');
  await seedHolding(m2.portfolioId, 'EQUITY', '30000', 'm2e');
  await seedHolding(m2.portfolioId, 'GOLD_ETF', '20000', 'm2g');

  familyId = await runAsSystem(async () => {
    const family = await prisma.family.create({
      data: { name: 'Aggregate Test Family', createdById: owner.userId },
    });
    await prisma.familyMember.create({
      data: { familyId: family.id, userId: owner.userId, role: 'OWNER', status: 'ACTIVE' },
    });
    await prisma.familyMember.create({
      data: { familyId: family.id, userId: m1.userId, role: 'VIEWER', status: 'ACTIVE' },
    });
    await prisma.familyMember.create({
      data: { familyId: family.id, userId: m2.userId, role: 'CONTRIBUTOR', status: 'ACTIVE' },
    });
    return family.id;
  });

  // The shared pot: familyId set, userId = creator. This is the row a naive
  // fan-out double-counts.
  sharedPortfolioId = await runAsSystem(async () => {
    const p = await prisma.portfolio.create({
      data: {
        userId: owner.userId,
        familyId,
        name: 'Shared HUF pot',
        currency: 'INR',
        type: 'INVESTMENT',
      },
    });
    return p.id;
  });
  await seedHolding(sharedPortfolioId, 'EQUITY', '40000', 'shared');

  // Sequential, not Promise.all: the RLS hook wraps every user-scoped write in
  // its own interactive transaction, and a burst of concurrent ones fights for
  // Neon pool slots for no benefit in a fixture.
  await seedGoal(owner, 'Retirement', '1000000', '250000');
  await seedGoal(m1, 'Education', '500000', '100000');
  await seedGoal(m2, 'Car', '200000', '0');

  await Promise.all([
    seedPolicy(owner.userId, { type: 'TERM', sumAssured: '5000000', premium: '12000', dueInDays: 3, no: 'P-OWN-1' }),
    // Two more HIGH-urgency items for the OWNER, so the attention feed has a
    // member who would swamp a global sort-then-slice.
    seedPolicy(owner.userId, { type: 'HEALTH', sumAssured: '1000000', premium: '20000', dueInDays: 2, no: 'P-OWN-2' }),
    seedPolicy(owner.userId, { type: 'PERSONAL_ACCIDENT', sumAssured: '500000', premium: '3000', dueInDays: 4, no: 'P-OWN-3' }),
    seedPolicy(m1.userId, { type: 'HEALTH', sumAssured: '1000000', premium: '15000', no: 'P-M1-1' }),
    seedPolicy(m2.userId, { type: 'TERM', sumAssured: '2000000', premium: '8000', no: 'P-M2-1' }),
  ]);

  await Promise.all([
    seedLoan(owner.userId, 'Owner Bank'),
    seedLoan(m1.userId, 'M1 Bank'),
    seedLoan(m2.userId, 'M2 Bank'),
  ]);

  // Income drives the 10x-annual-income life-cover requirement.
  await runAsSystem(async () => {
    await prisma.income.create({
      data: { userId: owner.userId, sourceName: 'Salary', monthlyAmount: '100000' },
    });
    await prisma.income.create({
      data: { userId: m2.userId, sourceName: 'Salary', monthlyAmount: '50000' },
    });
  });
}, TIMEOUT);

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.holdingProjection.deleteMany({ where: { portfolioId: sharedPortfolioId } });
    await prisma.portfolio.deleteMany({ where: { id: sharedPortfolioId } });
    await prisma.familyMember.deleteMany({ where: { familyId } });
    await prisma.family.deleteMany({ where: { id: familyId } });
  });
  await owner.cleanup();
  await m1.cleanup();
  await m2.cleanup();
}, TIMEOUT);

// ── Wealth ────────────────────────────────────────────────────────────────

describe('getFamilyWealth', () => {
  it(
    'totals equal the sum of the member rows, and shares sum to 100',
    async () => {
      const w = await owner.runAs(() => getFamilyWealth(owner.userId, familyId));

      expect(w.members).toHaveLength(3);

      const summed = w.members.reduce((s, m) => s.plus(new Decimal(m.netWorth)), new Decimal(0));
      expect(summed.toNumber()).toBe(num(w.totals.netWorth));

      // 100k owner + 40k shared + 50k m1 + 50k m2.
      expect(num(w.totals.netWorth)).toBe(240_000);

      const shareSum = w.members.reduce((s, m) => s + m.sharePct, 0);
      expect(shareSum).toBeCloseTo(100, 6);

      const allocSum = w.allocation.reduce((s, a) => s + a.percent, 0);
      expect(allocSum).toBeCloseTo(100, 6);

      // An OWNER is capped by nothing, so nothing is reported as hidden.
      expect(w.visibility.restricted).toBe(false);
      expect(w.visibility.partial).toBe(false);
      expect(w.visibility.hiddenMemberCount).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'counts a family-shared portfolio exactly once — in its creator\'s row only',
    async () => {
      const w = await owner.runAs(() => getFamilyWealth(owner.userId, familyId));

      const ownerRow = w.members.find((m) => m.userId === owner.userId)!;
      const m1Row = w.members.find((m) => m.userId === m1.userId)!;
      const m2Row = w.members.find((m) => m.userId === m2.userId)!;

      // The 40k shared pot lands in the creator's slice and nowhere else.
      expect(num(ownerRow.netWorth)).toBe(140_000);
      expect(num(m1Row.netWorth)).toBe(50_000);
      expect(num(m2Row.netWorth)).toBe(50_000);

      // Double-counting would show 280,000 here.
      expect(num(w.totals.netWorth)).toBe(240_000);

      // And once more from a non-creator's seat, with a full grant, to prove
      // the shared row is not attributed to whoever is looking.
      await setCaps(m2.userId, ['EQUITY', 'GOLD_ETF'], ALL_CATEGORIES);
      const seenByM2 = await m2.runAs(() => getFamilyWealth(m2.userId, familyId));
      expect(num(seenByM2.totals.netWorth)).toBe(240_000);
      expect(num(seenByM2.members.find((m) => m.userId === owner.userId)!.netWorth)).toBe(140_000);
    },
    TIMEOUT,
  );

  it(
    'shows a VIEWER granted only EQUITY their own gold in full and only equity of siblings',
    async () => {
      await setCaps(m1.userId, ['EQUITY'], []);
      const w = await m1.runAs(() => getFamilyWealth(m1.userId, familyId));

      const ownerRow = w.members.find((m) => m.userId === owner.userId)!;
      const selfRow = w.members.find((m) => m.userId === m1.userId)!;
      const m2Row = w.members.find((m) => m.userId === m2.userId)!;

      // Own gold, unfiltered — caps never apply to your own data.
      expect(num(selfRow.netWorth)).toBe(50_000);
      expect(selfRow.restricted).toBe(false);
      // Siblings: equity only. m2's 20k of gold is gone; the owner keeps both
      // equity slices (100k personal + 40k shared).
      expect(num(ownerRow.netWorth)).toBe(140_000);
      expect(num(m2Row.netWorth)).toBe(30_000);
      expect(ownerRow.restricted).toBe(true);
      expect(m2Row.restricted).toBe(true);

      expect(num(w.totals.netWorth)).toBe(220_000);

      // The only gold in the household allocation is the caller's own.
      const gold = w.allocation.find((a) => a.key === 'GOLD_ETF');
      expect(gold).toBeDefined();
      expect(num(gold!.value)).toBe(50_000);

      // The response says the total is partial.
      expect(w.visibility.restricted).toBe(true);
      expect(w.visibility.partial).toBe(true);
      expect(w.visibility.restrictedMemberCount).toBe(2);
      expect(w.visibility.allowedAssetClasses).toEqual(['EQUITY']);

      // Percentages still sum to 100 — against the visible household total.
      const shareSum = w.members.reduce((s, m) => s + m.sharePct, 0);
      expect(shareSum).toBeCloseTo(100, 6);
    },
    TIMEOUT,
  );

  it(
    'shows a member with no grant only themselves, and flags every sibling hidden',
    async () => {
      // The default state of every invited member: visibleAssetClasses = [].
      await setCaps(m2.userId, [], []);
      const w = await m2.runAs(() => getFamilyWealth(m2.userId, familyId));

      expect(num(w.totals.netWorth)).toBe(50_000);
      expect(num(w.members.find((m) => m.userId === owner.userId)!.netWorth)).toBe(0);
      expect(num(w.members.find((m) => m.userId === m1.userId)!.netWorth)).toBe(0);
      expect(num(w.members.find((m) => m.userId === m2.userId)!.netWorth)).toBe(50_000);

      // Both siblings are structurally invisible, and the payload says so.
      expect(w.visibility.hiddenMemberCount).toBe(2);
      expect(w.visibility.partial).toBe(true);
      expect(w.visibility.restrictedMemberIds).toEqual(
        expect.arrayContaining([owner.userId, m1.userId]),
      );

      // The caller is 100% of what they can see.
      expect(w.members.find((m) => m.userId === m2.userId)!.sharePct).toBeCloseTo(100, 6);
    },
    TIMEOUT,
  );
});

// ── Goals ─────────────────────────────────────────────────────────────────

describe('getFamilyGoals', () => {
  it(
    'lists every goal with owner attribution, progress and a required SIP',
    async () => {
      const g = await owner.runAs(() => getFamilyGoals(owner.userId, familyId));

      expect(g.totals.goalCount).toBe(3);
      expect(num(g.totals.totalTarget)).toBe(1_700_000);
      expect(num(g.totals.totalCurrent)).toBe(350_000);
      expect(num(g.totals.totalShortfall)).toBe(1_350_000);

      // Household denominator, recomputed — not the mean of the member rows.
      expect(g.totals.progressPct).toBeCloseTo((350_000 / 1_700_000) * 100, 6);

      const retirement = g.goals.find((x) => x.name === 'Retirement')!;
      expect(retirement.owner.userId).toBe(owner.userId);
      expect(retirement.owner.isSelf).toBe(true);
      expect(retirement.progressPct).toBeCloseTo(25, 6);
      expect(num(retirement.shortfall)).toBe(750_000);
      expect(Number(retirement.requiredMonthlySip)).toBeGreaterThan(0);

      const education = g.goals.find((x) => x.name === 'Education')!;
      expect(education.owner.userId).toBe(m1.userId);
      expect(education.owner.isSelf).toBe(false);

      // Per-member rows carry their own denominator.
      const byM1 = g.byMember.find((m) => m.userId === m1.userId)!;
      expect(byM1.goalCount).toBe(1);
      expect(byM1.progressPct).toBeCloseTo(20, 6);
    },
    TIMEOUT,
  );

  it(
    "returns only the caller's own goals when the GOAL category is not granted",
    async () => {
      await setCaps(m2.userId, [], []);
      const g = await m2.runAs(() => getFamilyGoals(m2.userId, familyId));

      expect(g.totals.goalCount).toBe(1);
      expect(g.goals[0]!.owner.userId).toBe(m2.userId);
      expect(g.goals[0]!.owner.isSelf).toBe(true);
      expect(g.visibility.hiddenMemberCount).toBe(2);
      expect(g.visibility.partial).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'includes siblings once the GOAL category is granted',
    async () => {
      await setCaps(m2.userId, [], ['GOAL']);
      const g = await m2.runAs(() => getFamilyGoals(m2.userId, familyId));

      expect(g.totals.goalCount).toBe(3);
      expect(g.visibility.hiddenMemberCount).toBe(0);
    },
    TIMEOUT,
  );
});

// ── Protection ────────────────────────────────────────────────────────────

describe('getFamilyProtection', () => {
  it(
    'reports cover vs 10x income, premiums, renewals and liabilities per member',
    async () => {
      const p = await owner.runAs(() => getFamilyProtection(owner.userId, familyId));

      const ownerRow = p.members.find((x) => x.userId === owner.userId)!;
      const m1Row = p.members.find((x) => x.userId === m1.userId)!;
      const m2Row = p.members.find((x) => x.userId === m2.userId)!;

      // TERM counts as life; HEALTH and PERSONAL_ACCIDENT do not.
      expect(num(ownerRow.lifeCover)).toBe(5_000_000);
      expect(num(ownerRow.healthCover)).toBe(1_000_000);
      expect(num(ownerRow.otherCover)).toBe(500_000);

      // 1,00,000/month → 12,00,000 a year → 1,20,00,000 required.
      expect(num(ownerRow.annualIncome)).toBe(1_200_000);
      expect(num(ownerRow.requiredLifeCover)).toBe(12_000_000);
      expect(num(ownerRow.lifeCoverGap)).toBe(7_000_000);

      // m1 has health cover only and no income on file.
      expect(num(m1Row.lifeCover)).toBe(0);
      expect(num(m1Row.healthCover)).toBe(1_000_000);
      expect(m1Row.hasNoCover).toBe(false);

      // m2: 50,000/month → 60,00,000 required against 20,00,000 of term.
      expect(num(m2Row.requiredLifeCover)).toBe(6_000_000);
      expect(num(m2Row.lifeCoverGap)).toBe(4_000_000);

      // The household gap is the sum of per-member gaps, never netted.
      expect(num(p.totals.protectionGap)).toBe(11_000_000);
      expect(num(p.totals.lifeCover)).toBe(7_000_000);
      expect(num(p.totals.healthCover)).toBe(2_000_000);
      expect(p.totals.membersWithNoCover).toEqual([]);

      // Annual premiums: 12,000 + 20,000 + 3,000 owner, 15,000 m1, 8,000 m2.
      expect(num(p.totals.annualPremiumTotal)).toBe(58_000);
      // Only the owner's three policies have a due date inside 30 days.
      expect(p.totals.upcomingRenewalCount).toBe(3);
      expect(ownerRow.upcomingRenewals).toHaveLength(3);

      // Liabilities: one active loan each, EMI not yet due, so the whole
      // principal is outstanding.
      expect(p.totals.liabilities.loanCount).toBe(3);
      expect(num(p.totals.liabilities.monthlyEmi)).toBeCloseTo(38_004, 4);
      expect(num(p.totals.liabilities.loanOutstanding)).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  it(
    'never reports a hidden member as uninsured',
    async () => {
      await setCaps(m2.userId, [], []);
      const p = await m2.runAs(() => getFamilyProtection(m2.userId, familyId));

      const ownerRow = p.members.find((x) => x.userId === owner.userId)!;
      // Nothing visible — but "we cannot see" is null, not "they have none".
      expect(ownerRow.policyCount).toBe(0);
      expect(ownerRow.hasNoCover).toBeNull();
      expect(p.totals.membersWithNoCover.map((x) => x.userId)).not.toContain(owner.userId);

      // The caller's own protection is untouched by their grant.
      const selfRow = p.members.find((x) => x.userId === m2.userId)!;
      expect(num(selfRow.lifeCover)).toBe(2_000_000);
      expect(selfRow.liabilities.loanCount).toBe(1);

      expect(p.visibility.hiddenMemberCount).toBe(2);
    },
    TIMEOUT,
  );
});

// ── Attention ─────────────────────────────────────────────────────────────

describe('getFamilyAttention', () => {
  it(
    'attributes every item to a member and does not let one member crowd the feed',
    async () => {
      const a = await owner.runAs(() => getFamilyAttention(owner.userId, familyId));

      const familyIds = new Set([owner.userId, m1.userId, m2.userId]);
      expect(a.items.length).toBeGreaterThan(0);
      for (const item of a.items) {
        expect(familyIds.has(item.member.userId)).toBe(true);
      }

      // The OWNER has three HIGH-urgency premiums; a global sort-then-slice
      // would put all three first. Round-robin puts one item per member in the
      // first round instead.
      const ownerItems = a.items.filter((i) => i.member.userId === owner.userId);
      expect(ownerItems.length).toBeGreaterThanOrEqual(3);

      const firstRound = a.items.slice(0, 3).map((i) => i.member.userId);
      expect(new Set(firstRound).size).toBe(3);

      // Still urgency-ordered within a round: the owner's HIGH premium leads.
      expect(a.items[0]!.member.userId).toBe(owner.userId);
      expect(a.items[0]!.urgency).toBe('HIGH');

      // Every member has an upcoming EMI, so every member is represented.
      for (const uid of familyIds) {
        expect(a.items.some((i) => i.member.userId === uid)).toBe(true);
        expect(a.perMember.find((p) => p.userId === uid)!.total).toBeGreaterThan(0);
      }

      const types = new Set(a.items.map((i) => i.type));
      expect(types.has('INSURANCE_PREMIUM_DUE')).toBe(true);
      expect(types.has('LOAN_EMI_DUE')).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'shows a member granted nothing only their own items',
    async () => {
      await setCaps(m2.userId, [], []);
      const a = await m2.runAs(() => getFamilyAttention(m2.userId, familyId));

      for (const item of a.items) {
        expect(item.member.userId).toBe(m2.userId);
      }
      expect(a.items.length).toBeGreaterThan(0);
      expect(a.visibility.hiddenMemberCount).toBe(2);

      // A cap-filtered read cannot tell absence from concealment, so a hidden
      // sibling is never accused of having connected nothing.
      expect(a.items.some((i) => i.type === 'NO_ACCOUNTS_CONNECTED')).toBe(false);
    },
    TIMEOUT,
  );
});

// ── Shared response contract ──────────────────────────────────────────────

describe('shared response contract', () => {
  it(
    'stamps asOf and a top-level hiddenMemberCount on all four aggregates',
    async () => {
      // A caller granted nothing: every sibling is hidden, and each of the
      // four payloads must be able to say so on its own, without the client
      // threading the count in from another endpoint.
      await setCaps(m2.userId, [], []);

      const [w, g, p, a] = await m2.runAs(async () => [
        await getFamilyWealth(m2.userId, familyId),
        await getFamilyGoals(m2.userId, familyId),
        await getFamilyProtection(m2.userId, familyId),
        await getFamilyAttention(m2.userId, familyId),
      ] as const);

      for (const r of [w, g, p, a]) {
        expect(new Date(r.asOf).getTime()).not.toBeNaN();
        expect(r.hiddenMemberCount).toBe(2);
        expect(r.hiddenMemberCount).toBe(r.visibility.hiddenMemberCount);
      }
    },
    TIMEOUT,
  );

  it(
    'types attention dueDate/amountInr as nullable and goal categories as a closed set',
    async () => {
      const [a, g] = await owner.runAs(async () => [
        await getFamilyAttention(owner.userId, familyId),
        await getFamilyGoals(owner.userId, familyId),
      ] as const);

      // Never an empty string standing in for "no value".
      for (const item of a.items) {
        expect(item.dueDate === null || item.dueDate.length === 10).toBe(true);
        expect(item.amountInr === null || item.amountInr.length > 0).toBe(true);
      }
      // A dated item carries both; the stale-price roll-up carries neither.
      const emi = a.items.find((i) => i.type === 'LOAN_EMI_DUE')!;
      expect(emi.dueDate).not.toBeNull();
      expect(emi.amountInr).not.toBeNull();
      const stale = a.items.find((i) => i.type === 'STALE_PRICES');
      if (stale) {
        expect(stale.dueDate).toBeNull();
        expect(stale.amountInr).toBeNull();
      }

      for (const goal of g.goals) {
        expect(GOAL_CATEGORIES).toContain(goal.category);
      }
    },
    TIMEOUT,
  );
});
