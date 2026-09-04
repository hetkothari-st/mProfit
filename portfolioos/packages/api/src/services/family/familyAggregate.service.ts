import { Decimal } from 'decimal.js';
import type { AssetClass } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, ForbiddenError } from '../../lib/errors.js';
import {
  serializeMoney,
  toDecimal,
  type FamilyMemberRef,
  type VisibilitySummary,
  type FamilyMemberWealth,
  type FamilyAllocationSlice,
  type FamilyWealth,
  type FamilyMemberDetail,
  type FamilyMemberHolding,
  type FamilyGoal,
  type FamilyGoalsByMember,
  type FamilyGoals,
  type UpcomingRenewal,
  type MemberLiabilities,
  type FamilyMemberProtection,
  type FamilyProtection,
  type AttentionType,
  type AttentionUrgency,
  type AttentionItem,
  type FamilyAttention,
} from '@portfolioos/shared';
import { runAsUser } from '../../lib/requestContext.js';
import {
  getEffectiveScope,
  fanOutRead,
  type EffectiveScope,
  type NonAcCategory,
  NON_AC_CATEGORIES,
} from '../familyScope.service.js';
import {
  getDashboardNetWorth,
  type MemberVisibilityCaps,
  type DashboardNetWorth,
} from '../dashboard.service.js';
import {
  listGoals,
  GOAL_CATEGORIES,
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  type GoalCategory,
  type GoalPriority,
  type GoalStatus,
} from '../goals.service.js';
import { progressPct, requiredMonthlySip } from '../goalMath.js';
import {
  insuranceScore,
  requiredLifeCover,
  isLifePolicyType,
} from '../healthScoreMath.js';
import { buildAmortizationSchedule, computeLoanSummary, type StoredLoan } from '../loans.service.js';
import { computeCardSummary } from '../creditCards.service.js';
import { activeMonthlyIncomeTotal } from '../income.service.js';
import { isPriceStale } from '../priceStaleness.js';

/**
 * Family dashboard aggregates — the household's whole financial picture,
 * broken down PER MEMBER as well as in total.
 *
 * Four reads, all `(callerId, familyId)`:
 *   getFamilyWealth     — net worth, invested, P&L, share-of-household, allocation
 *   getFamilyGoals      — every goal across members, with owner attribution
 *   getFamilyProtection — cover vs need, premiums, renewals, liabilities
 *   getFamilyAttention  — one ranked, per-member-fair feed of things to act on
 *
 * ── Three rules this module exists to keep ──────────────────────────────
 *
 * 1. CAPS ARE APPLIED BEFORE ANYTHING IS SUMMED. A number cannot be filtered
 *    after it has been added up. Every per-member read below runs with the
 *    caller's `allowedAssetClasses` / `allowedCategories` pushed into its
 *    `where`, exactly as dashboard.service now does. An empty array is
 *    DENY-ALL (see the contract on EffectiveScope) — `{ in: [] }` matches no
 *    rows, which is precisely the wanted behaviour.
 *
 * 2. YOUR OWN DATA IS NEVER FILTERED. The caps are a grant an OWNER makes
 *    about what you may see OF THE FAMILY, not a restriction on yourself.
 *    Every fan-out therefore runs the caller's own pass uncapped and
 *    in-context, and every sibling's pass under `runAsUser` with caps.
 *
 * 3. A PARTIAL TOTAL SAYS SO. Each result carries a `visibility` block with
 *    `restricted`, `restrictedMemberCount` and `hiddenMemberCount`, and each
 *    member row carries `restricted: true`, so the UI can label the household
 *    total "partial" instead of presenting a wrong number as a right one.
 *
 * Cross-user reads go through `runAsUser` (or `fanOutRead`, which wraps it).
 * There is no `runAsSystem` in this file: the single privileged lookup in the
 * whole family stack is the sibling enumeration inside `getEffectiveScope`,
 * which is an authorisation step and is documented as such there.
 *
 * Every response carries `asOf` (when the aggregate was computed) and a
 * top-level `hiddenMemberCount`, so no surface has to thread freshness or
 * partial-ness in from a sibling endpoint.
 *
 * Money is `Decimal` end to end and is serialised to a string exactly once,
 * at the return boundary, via `serializeMoney`. Percentages are numbers, and
 * every percentage is recomputed against its own correct denominator — a
 * per-member percentage against that member's total, the household
 * percentage against the household total. Percentages are never averaged.
 */

/**
 * The closed sets a family goal's `category` / `priority` / `status` can take.
 * Declared once in `@portfolioos/shared` and reached here through
 * goals.service, so a client can map every token to a label exhaustively
 * instead of falling back to a raw enum name.
 */
export { GOAL_CATEGORIES, GOAL_PRIORITIES, GOAL_STATUSES };
export type { GoalCategory, GoalPriority, GoalStatus };

/**
 * The response contract lives in `@portfolioos/shared`
 * (types/familyDashboard.ts) so this service and the web client are typed by
 * ONE declaration of every field name — a rename here that the client has not
 * followed becomes a compile error instead of an `undefined` on the page.
 * Re-exported so existing importers of this module keep working unchanged.
 */
export type {
  FamilyMemberRef,
  VisibilitySummary,
  FamilyMemberWealth,
  FamilyAllocationSlice,
  FamilyWealth,
  FamilyGoal,
  FamilyGoalsByMember,
  FamilyGoals,
  UpcomingRenewal,
  MemberLiabilities,
  FamilyMemberProtection,
  FamilyProtection,
  AttentionType,
  AttentionUrgency,
  AttentionItem,
  FamilyAttention,
};

const ZERO = new Decimal(0);

function d(v: { toString(): string } | null | undefined): Decimal {
  if (v == null) return ZERO;
  return new Decimal(v.toString());
}

function daysUntil(date: Date, from: Date = new Date()): number {
  return Math.ceil((date.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Annualised premium for a stored frequency token.
 *
 * NOTE: dashboard.service has a byte-identical private `premiumToAnnual`. It
 * is not exported, and this module must not modify that file, so the switch is
 * repeated here. Worth hoisting into a shared insuranceMath module — see the
 * hand-off notes.
 */
function premiumToAnnual(amount: Decimal, frequency: string): Decimal {
  switch (frequency) {
    case 'MONTHLY': return amount.times(12);
    case 'QUARTERLY': return amount.times(4);
    case 'HALF_YEARLY': return amount.times(2);
    case 'ANNUAL': return amount;
    // A single-premium policy has no recurring outgo; counting it as an annual
    // cost would overstate the household's premium burden every year.
    case 'SINGLE': return ZERO;
    default: return amount;
  }
}

// ── Member resolution ────────────────────────────────────────────────────

interface MemberContext extends FamilyMemberRef {
  caps: MemberVisibilityCaps;
}

const NO_CAPS: MemberVisibilityCaps = { assetClasses: null, categories: null };

async function resolveMembers(
  callerId: string,
  familyId: string,
): Promise<{ scope: EffectiveScope; members: MemberContext[] }> {
  if (!familyId) throw new BadRequestError('familyId is required for a family aggregate.');

  // Throws ForbiddenError unless the caller is an ACTIVE member of familyId.
  const scope = await getEffectiveScope(callerId, { familyId });

  const caps: MemberVisibilityCaps = {
    assetClasses: scope.allowedAssetClasses,
    categories: scope.allowedCategories,
  };
  const hasCaps = scope.allowedAssetClasses !== null || scope.allowedCategories !== null;

  // `User` carries no RLS policy (it is not a tenant-scoped table) and these
  // ids are already the caller's authorised sibling set, so one read is
  // enough — no fan-out and no privileged context needed for names.
  const users = await prisma.user.findMany({
    where: { id: { in: scope.readableUserIds } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const members: MemberContext[] = scope.readableUserIds.map((uid) => {
    const isSelf = uid === callerId;
    const u = byId.get(uid);
    return {
      userId: uid,
      name: u?.name ?? null,
      email: u?.email ?? '',
      isSelf,
      restricted: !isSelf && hasCaps,
      caps: isSelf ? NO_CAPS : caps,
    };
  });

  // Caller first, then alphabetical — stable ordering for the UI.
  members.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return (a.name ?? a.email).localeCompare(b.name ?? b.email);
  });

  return { scope, members };
}

/** Run a per-member read in the right security context. */
function runFor<T>(m: MemberContext, fn: () => Promise<T>): Promise<T> {
  return m.isSelf ? fn() : runAsUser(m.userId, fn);
}

/** Deny-all is representable, so this cannot collapse to a truthiness test. */
function allowsCategory(caps: MemberVisibilityCaps, category: NonAcCategory): boolean {
  return caps.categories === null || caps.categories.includes(category);
}

/** `{}` when unrestricted; `{ id: { in: [] } }` (matches nothing) when denied. */
function categoryGate(caps: MemberVisibilityCaps, category: NonAcCategory) {
  return allowsCategory(caps, category) ? {} : { id: { in: [] as string[] } };
}

/** Intersect a fixed class list with the caller's grant. `[]` = show nothing. */
function intersectClasses(base: readonly AssetClass[], caps: MemberVisibilityCaps): AssetClass[] {
  if (caps.assetClasses === null) return [...base];
  const grant = new Set<string>(caps.assetClasses);
  return base.filter((c) => grant.has(c));
}

function toRef(m: MemberContext): FamilyMemberRef {
  return {
    userId: m.userId,
    name: m.name,
    email: m.email,
    isSelf: m.isSelf,
    restricted: m.restricted,
  };
}

function buildVisibility(
  scope: EffectiveScope,
  members: MemberContext[],
  /** True when the caps leave nothing of a sibling visible to THIS endpoint. */
  nothingVisible: (caps: MemberVisibilityCaps) => boolean,
): VisibilitySummary {
  const restrictedIds = members.filter((m) => m.restricted).map((m) => m.userId);
  const hidden = members.filter((m) => m.restricted && nothingVisible(m.caps)).length;
  return {
    restricted: scope.allowedAssetClasses !== null || scope.allowedCategories !== null,
    allowedAssetClasses: scope.allowedAssetClasses,
    allowedCategories: scope.allowedCategories,
    restrictedMemberIds: restrictedIds,
    restrictedMemberCount: restrictedIds.length,
    hiddenMemberCount: hidden,
    partial: restrictedIds.length > 0,
  };
}

// ══ 1. Wealth ════════════════════════════════════════════════════════════

/**
 * Household net worth with per-member attribution.
 *
 * Reuses `getDashboardNetWorth` per member — the same function the personal
 * dashboard uses, so a member's number on this page and on their own page are
 * produced by one implementation. `mergeNetWorthResults` is deliberately NOT
 * reused: it throws the member attribution away, and attribution is the entire
 * point of this page.
 *
 * FAMILY-SHARED PORTFOLIOS ARE COUNTED EXACTLY ONCE. A family portfolio sets
 * `Portfolio.familyId` and keeps `userId` = the creating member, so a per-user
 * fan-out sees it in the creator's pass and in nobody else's. That is a
 * property of the schema, not of this code, so `familyAggregate.test.ts`
 * asserts it directly rather than trusting the reasoning.
 */
export async function getFamilyWealth(callerId: string, familyId: string): Promise<FamilyWealth> {
  const asOf = new Date().toISOString();
  const { scope, members } = await resolveMembers(callerId, familyId);

  const slices = await Promise.all(
    members.map((m) => runFor(m, () => getDashboardNetWorth(m.userId, undefined, m.caps))),
  );

  const householdNetWorth = slices.reduce((s, r) => s.plus(toDecimal(r.totalNetWorth)), ZERO);
  const householdInvested = slices.reduce(
    (s, r) => s.plus(toDecimal(r.portfolio.totalInvested)),
    ZERO,
  );
  const householdPnL = slices.reduce((s, r) => s.plus(toDecimal(r.portfolio.unrealisedPnL)), ZERO);
  const householdLiabilities = slices.reduce((s, r) => s.plus(toDecimal(r.totalLiabilities)), ZERO);

  const memberRows: FamilyMemberWealth[] = members.map((m, i) => {
    const r = slices[i]!;
    const net = toDecimal(r.totalNetWorth);
    return {
      ...toRef(m),
      netWorth: serializeMoney(net),
      invested: serializeMoney(toDecimal(r.portfolio.totalInvested)),
      unrealisedPnL: serializeMoney(toDecimal(r.portfolio.unrealisedPnL)),
      // Per-member denominator: this member's own invested capital.
      unrealisedPnLPct: r.portfolio.unrealisedPnLPct,
      totalLiabilities: serializeMoney(toDecimal(r.totalLiabilities)),
      netWorthAfterLiabilities: serializeMoney(toDecimal(r.netWorthAfterLiabilities)),
      // Household denominator. Zero household → 0, not NaN.
      sharePct: householdNetWorth.greaterThan(0)
        ? net.dividedBy(householdNetWorth).times(100).toNumber()
        : 0,
    };
  });

  const visibility = buildVisibility(scope, members, wealthFullyHidden);

  return {
    familyId,
    callerId,
    asOf,
    hiddenMemberCount: visibility.hiddenMemberCount,
    totals: {
      memberCount: members.length,
      netWorth: serializeMoney(householdNetWorth),
      invested: serializeMoney(householdInvested),
      unrealisedPnL: serializeMoney(householdPnL),
      // Recomputed against the household's invested capital. Averaging the
      // members' percentages would weight a 1,000 rupee portfolio the same as
      // a 1 crore one.
      unrealisedPnLPct: householdInvested.greaterThan(0)
        ? householdPnL.dividedBy(householdInvested).times(100).toNumber()
        : 0,
      totalLiabilities: serializeMoney(householdLiabilities),
      netWorthAfterLiabilities: serializeMoney(householdNetWorth.minus(householdLiabilities)),
    },
    members: memberRows,
    allocation: mergeAllocation(slices),
    visibility,
  };
}

/** Nothing of a sibling's WEALTH is visible: no asset class, no vehicles, no rentals. */
function wealthFullyHidden(caps: MemberVisibilityCaps): boolean {
  const noClasses = caps.assetClasses !== null && caps.assetClasses.length === 0;
  return noClasses && !allowsCategory(caps, 'VEHICLE') && !allowsCategory(caps, 'RENTAL');
}

/**
 * Combine per-member allocation slices by key and recompute each share against
 * the HOUSEHOLD total.
 *
 * dashboard.service's `mergeAllocationBreakdown` writes the recomputed share
 * to a new `pct` field and leaves the original `percent` at its stale
 * per-member value, so consumers reading `percent` (healthScore.service does)
 * get the wrong number after a merge. This writes `percent` itself.
 */
function mergeAllocation(slices: DashboardNetWorth[]): FamilyAllocationSlice[] {
  const byKey = new Map<string, { label: string; category: string; value: Decimal }>();
  for (const slice of slices) {
    for (const row of slice.allocationBreakdown) {
      const existing = byKey.get(row.key);
      if (existing) {
        existing.value = existing.value.plus(toDecimal(row.value));
      } else {
        byKey.set(row.key, {
          label: row.label,
          category: row.category,
          value: toDecimal(row.value),
        });
      }
    }
  }
  const total = Array.from(byKey.values()).reduce((s, r) => s.plus(r.value), ZERO);
  return Array.from(byKey.entries())
    .map(([key, r]) => ({
      key,
      label: r.label,
      value: serializeMoney(r.value),
      percent: total.greaterThan(0) ? r.value.dividedBy(total).times(100).toNumber() : 0,
      category: r.category,
    }))
    .sort((a, b) => toDecimal(b.value).comparedTo(toDecimal(a.value)));
}

// ══ 2. Goals ═════════════════════════════════════════════════════════════

type AnnotatedGoal = Awaited<ReturnType<typeof listGoals>>[number] & { ownerUserId: string };

/**
 * Every goal in the household, attributed to its owner.
 *
 * goals.service is single-user, so family scoping is added here with
 * `fanOutRead` under the 'GOAL' category. Two details matter:
 *
 *  - `fanOutRead` short-circuits the WHOLE fan-out to `[]` when the category
 *    is denied, which would also erase the caller's own goals. Own goals are
 *    therefore loaded separately and uncapped, and only the SIBLINGS go
 *    through `fanOutRead` — the scope handed to it has `readableUserIds`
 *    narrowed to the siblings, so every fetch in it runs under `runAsUser`.
 *
 *  - asset-class caps are deliberately NOT pushed into goal progress. A goal's
 *    corpus is defined by the portfolios linked to it; slicing that by class
 *    would not hide the goal, it would report a WRONG progress percentage for
 *    a goal the caller is allowed to see. Visibility of a goal is governed by
 *    the 'GOAL' category grant, which is all-or-nothing per member.
 */
export async function getFamilyGoals(callerId: string, familyId: string): Promise<FamilyGoals> {
  const asOf = new Date().toISOString();
  const { scope, members } = await resolveMembers(callerId, familyId);

  const siblingIds = scope.readableUserIds.filter((uid) => uid !== callerId);
  const siblingScope: EffectiveScope = { ...scope, readableUserIds: siblingIds };

  const [ownGoals, siblingGoals] = await Promise.all([
    listGoals(callerId).then((gs) => gs.map((g) => ({ ...g, ownerUserId: callerId }))),
    fanOutRead<AnnotatedGoal>(siblingScope, 'GOAL', async (uid) =>
      (await listGoals(uid)).map((g) => ({ ...g, ownerUserId: uid })),
    ),
  ]);

  const refById = new Map(members.map((m) => [m.userId, toRef(m)]));
  const fallbackRef: FamilyMemberRef = {
    userId: '',
    name: null,
    email: '',
    isSelf: false,
    restricted: false,
  };

  const goals: FamilyGoal[] = [...ownGoals, ...siblingGoals].map((g) => {
    const target = toDecimal(g.targetAmount);
    const current = toDecimal(g.currentValue);
    const shortfall = Decimal.max(ZERO, target.minus(current));

    const inflTarget = g.inflationAdjustedTarget ? toDecimal(g.inflationAdjustedTarget) : null;
    const inflShortfall = inflTarget ? Decimal.max(ZERO, inflTarget.minus(current)) : null;

    // Goal.expectedReturn is stored as a FRACTION (0.12 = 12%), the same unit
    // goals.service compares against requiredCagr. requiredMonthlySip wants a
    // percentage, so scale it here rather than mis-reading the column.
    const expectedReturnPct =
      g.expectedReturn != null ? toDecimal(g.expectedReturn).times(100).toNumber() : null;

    // Fund the inflation-adjusted shortfall when we have one — that is the
    // number the member actually has to save.
    const sip = requiredMonthlySip(
      inflShortfall ?? shortfall,
      g.yearsRemaining,
      expectedReturnPct,
    );

    return {
      id: g.id,
      name: g.name,
      category: g.category,
      priority: g.priority,
      status: g.status,
      owner: refById.get(g.ownerUserId) ?? { ...fallbackRef, userId: g.ownerUserId },
      targetAmount: serializeMoney(target),
      currentValue: serializeMoney(current),
      shortfall: serializeMoney(shortfall),
      inflationAdjustedTarget: inflTarget ? serializeMoney(inflTarget) : null,
      inflationAdjustedShortfall: inflShortfall ? serializeMoney(inflShortfall) : null,
      progressPct: g.progressPct,
      yearsRemaining: g.yearsRemaining,
      targetDate: g.targetDate,
      requiredCagr: g.requiredCagr,
      requiredMonthlySip: sip ? serializeMoney(sip) : null,
      expectedReturn: g.expectedReturn,
      isOnTrack: g.isOnTrack,
    };
  });

  goals.sort((a, b) => a.targetDate.localeCompare(b.targetDate));

  const byMember: FamilyGoalsByMember[] = members.map((m) => {
    const mine = goals.filter((g) => g.owner.userId === m.userId);
    const target = mine.reduce((s, g) => s.plus(toDecimal(g.targetAmount)), ZERO);
    const current = mine.reduce((s, g) => s.plus(toDecimal(g.currentValue)), ZERO);
    const shortfall = mine.reduce((s, g) => s.plus(toDecimal(g.shortfall)), ZERO);
    const sip = mine.reduce(
      (s, g) => s.plus(g.requiredMonthlySip ? toDecimal(g.requiredMonthlySip) : ZERO),
      ZERO,
    );
    return {
      ...toRef(m),
      goalCount: mine.length,
      totalTarget: serializeMoney(target),
      totalCurrent: serializeMoney(current),
      totalShortfall: serializeMoney(shortfall),
      requiredMonthlySip: serializeMoney(sip),
      // Own denominator: this member's own target sum.
      progressPct: progressPct(current, target),
    };
  });

  const totalTarget = goals.reduce((s, g) => s.plus(toDecimal(g.targetAmount)), ZERO);
  const totalCurrent = goals.reduce((s, g) => s.plus(toDecimal(g.currentValue)), ZERO);
  const totalShortfall = goals.reduce((s, g) => s.plus(toDecimal(g.shortfall)), ZERO);
  const totalSip = goals.reduce(
    (s, g) => s.plus(g.requiredMonthlySip ? toDecimal(g.requiredMonthlySip) : ZERO),
    ZERO,
  );

  const visibility = buildVisibility(scope, members, (caps) => !allowsCategory(caps, 'GOAL'));

  return {
    familyId,
    callerId,
    asOf,
    hiddenMemberCount: visibility.hiddenMemberCount,
    goals,
    totals: {
      goalCount: goals.length,
      totalTarget: serializeMoney(totalTarget),
      totalCurrent: serializeMoney(totalCurrent),
      totalShortfall: serializeMoney(totalShortfall),
      requiredMonthlySip: serializeMoney(totalSip),
      // Household denominator, recomputed — not the mean of the member rows.
      progressPct: progressPct(totalCurrent, totalTarget),
    },
    byMember,
    visibility,
  };
}

// ══ 3. Protection ════════════════════════════════════════════════════════

/** Everything protection-related is hidden for this member. */
function protectionFullyHidden(caps: MemberVisibilityCaps): boolean {
  return (
    !allowsCategory(caps, 'INSURANCE') &&
    !allowsCategory(caps, 'LOAN') &&
    !allowsCategory(caps, 'CREDIT_CARD')
  );
}

interface PolicyTotals {
  policyCount: number;
  life: Decimal;
  health: Decimal;
  other: Decimal;
  annualPremium: Decimal;
  hasLifePolicies: boolean;
  renewals: UpcomingRenewal[];
}

async function loadPolicies(m: MemberContext, horizon: Date): Promise<PolicyTotals> {
  const policies = await prisma.insurancePolicy.findMany({
    where: { userId: m.userId, status: 'ACTIVE', ...categoryGate(m.caps, 'INSURANCE') },
    orderBy: { nextPremiumDue: 'asc' },
  });

  let life = ZERO;
  let health = ZERO;
  let other = ZERO;
  let annualPremium = ZERO;
  let hasLifePolicies = false;
  const renewals: UpcomingRenewal[] = [];

  for (const p of policies) {
    const sum = d(p.sumAssured);
    if (isLifePolicyType(p.type)) {
      life = life.plus(sum);
      hasLifePolicies = true;
    } else if (p.type === 'HEALTH') {
      health = health.plus(sum);
    } else {
      other = other.plus(sum);
    }
    annualPremium = annualPremium.plus(premiumToAnnual(d(p.premiumAmount), p.premiumFrequency));

    if (p.nextPremiumDue && p.nextPremiumDue <= horizon) {
      renewals.push({
        policyId: p.id,
        insurer: p.insurer,
        type: p.type,
        planName: p.planName,
        dueDate: p.nextPremiumDue.toISOString().slice(0, 10),
        daysUntil: daysUntil(p.nextPremiumDue),
        amount: serializeMoney(d(p.premiumAmount)),
      });
    }
  }

  return {
    policyCount: policies.length,
    life,
    health,
    other,
    annualPremium,
    hasLifePolicies,
    renewals,
  };
}

interface LiabilityTotals {
  loanCount: number;
  loanOutstanding: Decimal;
  monthlyEmi: Decimal;
  creditCardCount: number;
  creditCardOutstanding: Decimal;
}

/**
 * Per-member liabilities, built from the same exported helpers the single-user
 * loan and card pages use (`computeLoanSummary`, `computeCardSummary`) rather
 * than from a second amortisation implementation.
 */
async function loadLiabilities(m: MemberContext): Promise<LiabilityTotals> {
  const [loans, cards] = await Promise.all([
    prisma.loan.findMany({
      where: { userId: m.userId, status: 'ACTIVE', ...categoryGate(m.caps, 'LOAN') },
      include: { payments: { orderBy: { paidOn: 'asc' } } },
    }),
    prisma.creditCard.findMany({
      where: { userId: m.userId, status: 'ACTIVE', ...categoryGate(m.caps, 'CREDIT_CARD') },
      include: { statements: { orderBy: { dueDate: 'desc' } } },
    }),
  ]);

  let loanOutstanding = ZERO;
  let monthlyEmi = ZERO;
  for (const loan of loans) {
    monthlyEmi = monthlyEmi.plus(d(loan.emiAmount));
    try {
      loanOutstanding = loanOutstanding.plus(
        toDecimal(computeLoanSummary(loan as unknown as StoredLoan).outstandingBalance),
      );
    } catch {
      // Same fallback dashboard.service takes on an unschedulable loan: the
      // principal is a conservative stand-in, and dropping the loan entirely
      // would understate the household's debt.
      loanOutstanding = loanOutstanding.plus(d(loan.principalAmount));
    }
  }

  let creditCardOutstanding = ZERO;
  for (const card of cards) {
    creditCardOutstanding = creditCardOutstanding.plus(
      card.outstandingBalance
        ? d(card.outstandingBalance)
        : toDecimal(computeCardSummary(card).outstanding),
    );
  }

  return {
    loanCount: loans.length,
    loanOutstanding,
    monthlyEmi,
    creditCardCount: cards.length,
    creditCardOutstanding,
  };
}

function serializeLiabilities(t: LiabilityTotals): MemberLiabilities {
  return {
    loanCount: t.loanCount,
    loanOutstanding: serializeMoney(t.loanOutstanding),
    monthlyEmi: serializeMoney(t.monthlyEmi),
    creditCardCount: t.creditCardCount,
    creditCardOutstanding: serializeMoney(t.creditCardOutstanding),
    totalLiabilities: serializeMoney(t.loanOutstanding.plus(t.creditCardOutstanding)),
  };
}

/**
 * Protection and liabilities, per member and in total.
 *
 * Life-cover adequacy uses `healthScoreMath.requiredLifeCover` /
 * `insuranceScore` — the same 10x-annual-income heuristic the health score
 * shows, so the two pages cannot disagree about whether a member is
 * underinsured. (Extracting `requiredLifeCover` also removed the third
 * hand-written `annualIncome.times(10)` in the codebase.)
 */
export async function getFamilyProtection(
  callerId: string,
  familyId: string,
): Promise<FamilyProtection> {
  const asOf = new Date().toISOString();
  const { scope, members } = await resolveMembers(callerId, familyId);
  const horizon = new Date(Date.now() + 30 * 86_400_000);

  const rows = await Promise.all(
    members.map((m) =>
      runFor(m, async () => {
        const [policies, liabilities, monthlyIncome] = await Promise.all([
          loadPolicies(m, horizon),
          loadLiabilities(m),
          activeMonthlyIncomeTotal(m.userId),
        ]);
        return { m, policies, liabilities, monthlyIncome };
      }),
    ),
  );

  const memberRows: FamilyMemberProtection[] = rows.map(
    ({ m, policies, liabilities, monthlyIncome }) => {
      const annualIncome = monthlyIncome.times(12);
      // No income on file means the 10x rule has nothing to work from. Ten
      // times nothing is not a recommendation of nothing — it is the absence
      // of one, and a UI cannot tell those apart from a serialised "0.00".
      const incomeKnown = annualIncome.greaterThan(ZERO);
      const required = incomeKnown ? requiredLifeCover(annualIncome) : null;
      const gap = required ? Decimal.max(ZERO, required.minus(policies.life)) : null;
      const insuranceHidden = !allowsCategory(m.caps, 'INSURANCE');

      return {
        ...toRef(m),
        policyCount: policies.policyCount,
        lifeCover: serializeMoney(policies.life),
        healthCover: serializeMoney(policies.health),
        otherCover: serializeMoney(policies.other),
        monthlyIncome: serializeMoney(monthlyIncome),
        annualIncome: serializeMoney(annualIncome),
        requiredLifeCover: required ? serializeMoney(required) : null,
        lifeCoverGap: gap ? serializeMoney(gap) : null,
        coverAdequacyScore: insuranceScore(policies.life, annualIncome, policies.hasLifePolicies)
          .score,
        hasNoCover: insuranceHidden ? null : policies.policyCount === 0,
        annualPremiumTotal: serializeMoney(policies.annualPremium),
        upcomingRenewals: policies.renewals.sort((a, b) => a.daysUntil - b.daysUntil),
        liabilities: serializeLiabilities(liabilities),
      };
    },
  );

  const household: LiabilityTotals = rows.reduce<LiabilityTotals>(
    (acc, r) => ({
      loanCount: acc.loanCount + r.liabilities.loanCount,
      loanOutstanding: acc.loanOutstanding.plus(r.liabilities.loanOutstanding),
      monthlyEmi: acc.monthlyEmi.plus(r.liabilities.monthlyEmi),
      creditCardCount: acc.creditCardCount + r.liabilities.creditCardCount,
      creditCardOutstanding: acc.creditCardOutstanding.plus(r.liabilities.creditCardOutstanding),
    }),
    {
      loanCount: 0,
      loanOutstanding: ZERO,
      monthlyEmi: ZERO,
      creditCardCount: 0,
      creditCardOutstanding: ZERO,
    },
  );

  const sum = (pick: (r: FamilyMemberProtection) => string) =>
    memberRows.reduce((s, r) => s.plus(toDecimal(pick(r))), ZERO);

  /**
   * Sum only the members we could actually size. A member with no income on
   * file contributes nothing to the household requirement — treating their
   * unknown as a zero would understate the gap and make the total look
   * healthier than it is.
   */
  const sumKnown = (pick: (r: FamilyMemberProtection) => string | null) =>
    memberRows.reduce((s, r) => {
      const v = pick(r);
      return v === null ? s : s.plus(toDecimal(v));
    }, ZERO);

  /** Members whose requirement could not be sized, so the totals exclude them. */
  const unsizedMemberCount = memberRows.filter((r) => r.requiredLifeCover === null).length;

  const visibility = buildVisibility(scope, members, protectionFullyHidden);

  return {
    familyId,
    callerId,
    asOf,
    hiddenMemberCount: visibility.hiddenMemberCount,
    members: memberRows,
    totals: {
      lifeCover: serializeMoney(sum((r) => r.lifeCover)),
      healthCover: serializeMoney(sum((r) => r.healthCover)),
      requiredLifeCover: serializeMoney(sumKnown((r) => r.requiredLifeCover)),
      protectionGap: serializeMoney(sumKnown((r) => r.lifeCoverGap)),
      unsizedMemberCount,
      annualPremiumTotal: serializeMoney(sum((r) => r.annualPremiumTotal)),
      upcomingRenewalCount: memberRows.reduce((n, r) => n + r.upcomingRenewals.length, 0),
      // `hasNoCover === true` only; a `null` means "hidden", and a hidden
      // member must never be listed as uninsured.
      membersWithNoCover: memberRows
        .filter((r) => r.hasNoCover === true)
        .map((r) => ({
          userId: r.userId,
          name: r.name,
          email: r.email,
          isSelf: r.isSelf,
          restricted: r.restricted,
        })),
      liabilities: serializeLiabilities(household),
    },
    visibility,
  };
}

// ══ 4. Attention ═════════════════════════════════════════════════════════

/**
 * Deposit-style classes whose `Transaction.maturityDate` is a real maturity.
 * Mirrors alerts.service's PO_MATURITY_CLASSES plus the two bank deposits;
 * that list is private to the scanner, so it is restated rather than imported.
 */
const MATURING_DEPOSIT_CLASSES: readonly AssetClass[] = [
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT',
  'NSC', 'KVP', 'SCSS', 'SSY',
  'POST_OFFICE_MIS', 'POST_OFFICE_RD', 'POST_OFFICE_TD',
];

const MATURITY_HORIZON_DAYS = 90;
const PREMIUM_HORIZON_DAYS = 30;
const EMI_HORIZON_DAYS = 30;

/**
 * FAIRNESS POLICY — why this feed is not "sort everything, take the top N".
 *
 * A global sort-then-slice lets one member with a messy month occupy the whole
 * feed: five overdue EMIs from one member push every other member's expiring
 * policy off the page, and the family dashboard stops being about the family.
 * (mergeNetWorthResults has exactly that bug today — it concatenates every
 * member's alerts and slices the first 10, which is also arbitrary because the
 * concatenation is in member order, not urgency order.)
 *
 * So: cap each member at MAX_ITEMS_PER_MEMBER (their own most urgent first),
 * then interleave round-robin — every member's #1 item is emitted before
 * anyone's #2, with each round internally ordered by urgency. Guarantees every
 * member with anything pending appears in the first `memberCount` rows, while
 * still surfacing the genuinely urgent first within each round. Counts of what
 * was dropped are reported per member in `perMember`.
 */
const MAX_ITEMS_PER_MEMBER = 5;

const URGENCY_RANK: Record<AttentionUrgency, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function byUrgencyThenSoonest(a: AttentionItem, b: AttentionItem): number {
  if (URGENCY_RANK[a.urgency] !== URGENCY_RANK[b.urgency]) {
    return URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
  }
  if (a.daysUntil != null && b.daysUntil != null) return a.daysUntil - b.daysUntil;
  if (a.daysUntil != null) return -1;
  if (b.daysUntil != null) return 1;
  return 0;
}

function urgencyForDays(days: number): AttentionUrgency {
  if (days < 0) return 'HIGH';
  if (days <= 7) return 'HIGH';
  if (days <= 15) return 'MEDIUM';
  return 'LOW';
}

export async function getFamilyAttention(
  callerId: string,
  familyId: string,
): Promise<FamilyAttention> {
  const asOf = new Date().toISOString();
  const { scope, members } = await resolveMembers(callerId, familyId);

  const perMemberItems = await Promise.all(
    members.map((m) => runFor(m, () => collectAttention(m))),
  );

  const queues = perMemberItems.map((items) => items.slice().sort(byUrgencyThenSoonest));
  const capped = queues.map((q) => q.slice(0, MAX_ITEMS_PER_MEMBER));

  // Round-robin interleave: round r takes item #r from every member, ordered
  // within the round by urgency. See FAIRNESS POLICY above.
  const items: AttentionItem[] = [];
  const deepest = capped.reduce((n, q) => Math.max(n, q.length), 0);
  for (let r = 0; r < deepest; r++) {
    const round = capped
      .map((q) => q[r])
      .filter((it): it is AttentionItem => it !== undefined)
      .sort(byUrgencyThenSoonest);
    items.push(...round);
  }

  const visibility = buildVisibility(
    scope,
    members,
    (caps) => wealthFullyHidden(caps) && protectionFullyHidden(caps),
  );

  return {
    familyId,
    callerId,
    asOf,
    hiddenMemberCount: visibility.hiddenMemberCount,
    items,
    perMember: members.map((m, i) => ({
      ...toRef(m),
      total: queues[i]!.length,
      shown: capped[i]!.length,
    })),
    totalItemCount: queues.reduce((n, q) => n + q.length, 0),
    shownItemCount: items.length,
    visibility,
  };
}

/** All attention items for ONE member. Runs inside that member's context. */
async function collectAttention(m: MemberContext): Promise<AttentionItem[]> {
  const ref = toRef(m);
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const items: AttentionItem[] = [];

  const depositClasses = intersectClasses(MATURING_DEPOSIT_CLASSES, m.caps);

  const [deposits, policies, loans, holdings] = await Promise.all([
    // Deny-all on asset classes leaves an empty list; skip the query entirely
    // rather than issuing `IN ()`.
    depositClasses.length === 0
      ? Promise.resolve([])
      : prisma.transaction.findMany({
          where: {
            portfolio: { userId: m.userId },
            assetClass: { in: depositClasses },
            transactionType: { in: ['BUY', 'DEPOSIT', 'OPENING_BALANCE'] },
            maturityDate: {
              gte: today,
              lte: new Date(today.getTime() + MATURITY_HORIZON_DAYS * 86_400_000),
            },
          },
          select: {
            id: true,
            assetClass: true,
            assetName: true,
            maturityDate: true,
            netAmount: true,
          },
        }),
    prisma.insurancePolicy.findMany({
      where: {
        userId: m.userId,
        status: 'ACTIVE',
        nextPremiumDue: {
          lte: new Date(today.getTime() + PREMIUM_HORIZON_DAYS * 86_400_000),
        },
        ...categoryGate(m.caps, 'INSURANCE'),
      },
      select: {
        id: true,
        insurer: true,
        type: true,
        premiumAmount: true,
        nextPremiumDue: true,
      },
    }),
    prisma.loan.findMany({
      where: { userId: m.userId, status: 'ACTIVE', ...categoryGate(m.caps, 'LOAN') },
      include: { payments: { orderBy: { paidOn: 'asc' } } },
    }),
    prisma.holdingProjection.findMany({
      where: {
        portfolio: { userId: m.userId },
        ...(m.caps.assetClasses === null ? {} : { assetClass: { in: m.caps.assetClasses } }),
      },
      select: { id: true, assetClass: true, assetName: true, priceAsOf: true },
    }),
  ]);

  for (const t of deposits) {
    const due = t.maturityDate!;
    const days = daysUntil(due, today);
    items.push({
      id: `FD_MATURITY:${t.id}`,
      type: 'FD_MATURITY',
      title: `${t.assetName ?? t.assetClass} matures in ${days} day${days === 1 ? '' : 's'}`,
      description: `Matures on ${due.toISOString().slice(0, 10)} — decide whether to renew or withdraw`,
      urgency: days <= 7 ? 'HIGH' : days <= 30 ? 'MEDIUM' : 'LOW',
      daysUntil: days,
      dueDate: due.toISOString().slice(0, 10),
      amountInr: serializeMoney(d(t.netAmount)),
      member: ref,
    });
  }

  for (const p of policies) {
    const due = p.nextPremiumDue!;
    const days = daysUntil(due, today);
    items.push({
      id: `INSURANCE_PREMIUM_DUE:${p.id}`,
      type: 'INSURANCE_PREMIUM_DUE',
      title: `${p.insurer} ${p.type} premium due`,
      description: `Premium due on ${due.toISOString().slice(0, 10)}`,
      urgency: urgencyForDays(days),
      daysUntil: days,
      dueDate: due.toISOString().slice(0, 10),
      amountInr: serializeMoney(d(p.premiumAmount)),
      member: ref,
    });
  }

  for (const loan of loans) {
    let schedule;
    try {
      schedule = buildAmortizationSchedule(loan as unknown as StoredLoan);
    } catch {
      continue;
    }
    const firstUnpaid = schedule.find((r) => !r.isPaid);
    if (!firstUnpaid) continue;

    const emiDate = new Date(`${firstUnpaid.date}T00:00:00Z`);
    const days = daysUntil(emiDate, today);
    if (days < 0) {
      items.push({
        id: `LOAN_EMI_OVERDUE:${loan.id}`,
        type: 'LOAN_EMI_OVERDUE',
        title: `${loan.lenderName} EMI overdue`,
        description: `EMI is ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`,
        urgency: 'HIGH',
        daysUntil: days,
        dueDate: firstUnpaid.date,
        amountInr: serializeMoney(toDecimal(firstUnpaid.emiAmount)),
        member: ref,
      });
    } else if (days <= EMI_HORIZON_DAYS) {
      items.push({
        id: `LOAN_EMI_DUE:${loan.id}`,
        type: 'LOAN_EMI_DUE',
        title: `${loan.lenderName} EMI due in ${days} day${days === 1 ? '' : 's'}`,
        description: `EMI due on ${firstUnpaid.date}`,
        urgency: urgencyForDays(days),
        daysUntil: days,
        dueDate: firstUnpaid.date,
        amountInr: serializeMoney(toDecimal(firstUnpaid.emiAmount)),
        member: ref,
      });
    }
  }

  const stale = holdings.filter((h) => isPriceStale(h.assetClass, h.priceAsOf, now));
  if (stale.length > 0) {
    // One row per member, not per holding — otherwise a member with 40 stale
    // positions would consume their whole per-member budget on one problem.
    items.push({
      id: `STALE_PRICES:${m.userId}`,
      type: 'STALE_PRICES',
      title: `${stale.length} holding${stale.length === 1 ? '' : 's'} with a stale price`,
      description: 'Prices have not refreshed recently, so this valuation may be out of date',
      urgency: 'LOW',
      daysUntil: null,
      dueDate: null,
      amountInr: null,
      member: ref,
    });
  }

  // "Has connected nothing" is an assertion about ABSENCE, and a cap-filtered
  // read cannot distinguish absence from concealment. Only claim it when this
  // member's slice was not filtered at all.
  if (!m.restricted) {
    const [bankCount, holdingCount] = await Promise.all([
      prisma.bankAccount.count({ where: { userId: m.userId, status: 'ACTIVE' } }),
      prisma.holdingProjection.count({ where: { portfolio: { userId: m.userId } } }),
    ]);
    if (bankCount === 0 && holdingCount === 0) {
      items.push({
        id: `NO_ACCOUNTS_CONNECTED:${m.userId}`,
        type: 'NO_ACCOUNTS_CONNECTED',
        title: `${m.name ?? m.email} has not added any account yet`,
        description: 'No bank account and no holdings — their share of the household is missing',
        urgency: 'MEDIUM',
        daysUntil: null,
        dueDate: null,
        amountInr: null,
        member: ref,
      });
    }
  }

  return items;
}

// ─── One member, in full ─────────────────────────────────────────

/**
 * Everything the caller may see about a single member.
 *
 * Two rules decide the whole shape of this:
 *
 * 1. The member must be in the caller's readable set. Anyone can put any userId
 *    in a URL, so this is checked against the resolved scope rather than
 *    assumed from the fact that a link existed.
 * 2. The caps apply to a sibling and never to the caller themselves — this is
 *    the same grant that governs the household view, not a separate rule, so a
 *    VIEWER granted only EQUITY opening a sibling sees that sibling's equity
 *    and nothing else.
 *
 * What is hidden is reported rather than dropped. A page showing three of a
 * person's six asset classes, with no indication that three are missing, is
 * worse than one that says so.
 */
export async function getFamilyMemberDetail(
  callerId: string,
  familyId: string,
  memberUserId: string,
): Promise<FamilyMemberDetail> {
  const asOf = new Date().toISOString();
  const { members } = await resolveMembers(callerId, familyId);

  const m = members.find((x) => x.userId === memberUserId);
  if (!m) {
    // Not "not found": the caller is an active member of this family, so the
    // honest answer is that this person is not theirs to look at.
    throw new ForbiddenError('That member is not part of a family you can see.');
  }

  // Derived from the household aggregates rather than from three new loaders.
  // They already apply the caps, are already tested, and reusing them means a
  // member page cannot quietly disagree with the family view it was opened
  // from. The cost is computing for every member and keeping one — cheap
  // beside the per-query round trips these already make.
  const [netWorth, holdings, goalsAll, protectionAll, attentionAll] = await Promise.all([
    runFor(m, () => getDashboardNetWorth(m.userId, undefined, m.caps)),
    loadMemberHoldings(m),
    getFamilyGoals(callerId, familyId),
    getFamilyProtection(callerId, familyId),
    getFamilyAttention(callerId, familyId),
  ]);

  const hiddenCategories = NON_AC_CATEGORIES.filter((c) => !allowsCategory(m.caps, c));

  return {
    familyId,
    asOf,
    member: toRef(m),
    netWorth: netWorth.totalNetWorth,
    invested: netWorth.portfolio.totalInvested,
    unrealisedPnL: netWorth.portfolio.unrealisedPnL,
    totalLiabilities: netWorth.totalLiabilities,
    netWorthAfterLiabilities: netWorth.netWorthAfterLiabilities,
    allocation: mergeAllocation([netWorth]),
    holdings,
    goals: goalsAll.goals.filter((g) => g.owner.userId === memberUserId),
    protection: protectionAll.members.find((p) => p.userId === memberUserId) ?? null,
    attention: attentionAll.items.filter((i) => i.member.userId === memberUserId),
    hiddenCategories: [...hiddenCategories],
    assetClassesRestricted: m.caps.assetClasses !== null,
  };
}

/** Holdings for one member, intersected with any asset-class grant. */
async function loadMemberHoldings(m: MemberContext): Promise<FamilyMemberHolding[]> {
  return runFor(m, async () => {
    const rows = await prisma.holdingProjection.findMany({
      where: {
        portfolio: { userId: m.userId },
        // `[]` is deny-all and `{ in: [] }` matches nothing, which is right.
        ...(m.caps.assetClasses === null ? {} : { assetClass: { in: m.caps.assetClasses } }),
      },
      orderBy: { currentValue: 'desc' },
      take: 200,
    });

    return rows.map((h) => ({
      assetKey: h.assetKey,
      assetName: h.assetName ?? h.assetKey,
      assetClass: h.assetClass,
      quantity: serializeMoney(d(h.quantity)),
      currentValue: serializeMoney(d(h.currentValue ?? h.totalCost)),
      totalCost: serializeMoney(d(h.totalCost)),
      unrealisedPnL: serializeMoney(d(h.unrealisedPnL)),
    }));
  });
}
