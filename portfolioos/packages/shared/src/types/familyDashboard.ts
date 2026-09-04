import type { AssetClass } from './enums.js';

/**
 * Family dashboard response contract — the wire shapes of
 * `/api/families/:familyId/dashboard/{wealth,goals,protection,attention}`.
 *
 * This file is the SINGLE definition of those four payloads. The API service
 * (`familyAggregate.service.ts`) imports these types and returns values typed
 * by them; the web client (`familyDashboard.api.ts`) imports the same types to
 * describe what it receives. Neither side is allowed to restate a field name
 * locally, so a rename on the server that the client has not followed is a
 * compile error rather than a runtime `undefined` on a rendered page. (That
 * exact failure — a server field the client had guessed the name of — already
 * shipped once on /advisor.)
 *
 * ── Units, fixed by contract ────────────────────────────────────────────
 *
 * MONEY is always a decimal STRING. The server holds it as `Decimal` end to
 * end and serialises it exactly once, at the return boundary, via
 * `serializeMoney`. A client must never `Number()` it — hand it to `formatINR`
 * / `<Money>`, or to `toDecimal()` when a chart needs geometry.
 *
 * PERCENTAGES are numbers (0–100), already computed in Decimal against their
 * own correct denominator — a per-member percentage against that member's
 * total, a household percentage against the household total. They are never
 * averages of other percentages.
 *
 * DATES are ISO strings: `asOf` is a full timestamp, `targetDate` / `dueDate`
 * are `YYYY-MM-DD`.
 *
 * ── The permission model is part of the contract ────────────────────────
 *
 * Every payload carries a `visibility` block and a top-level
 * `hiddenMemberCount`, and every member row carries `restricted`. They exist
 * so a partial total can be labelled as partial instead of being presented as
 * the household's real number. A client that ignores them renders something
 * that looks complete and is not.
 */

/**
 * The closed sets a family goal's `category` / `priority` / `status` can take,
 * so a client can map every token to a label exhaustively instead of falling
 * back to a raw enum name.
 */
export const GOAL_CATEGORIES = [
  'RETIREMENT',
  'CHILD_EDUCATION',
  'HOME_PURCHASE',
  'EMERGENCY_FUND',
  'FIRE_CORPUS',
  'VEHICLE_PURCHASE',
  'TRAVEL',
  'WEALTH_BUILDING',
  'CUSTOM',
] as const;

export const GOAL_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export const GOAL_STATUSES = ['ACTIVE', 'ACHIEVED', 'PAUSED', 'ABANDONED'] as const;

export type GoalCategory = (typeof GOAL_CATEGORIES)[number];
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];
export type GoalStatus = (typeof GOAL_STATUSES)[number];

// ── Member resolution ────────────────────────────────────────────────────

/** Identity + the caps that apply to THIS member's slice for THIS caller. */
export interface FamilyMemberRef {
  userId: string;
  name: string | null;
  email: string;
  /** True for the caller's own row — their data is never cap-filtered. */
  isSelf: boolean;
  /**
   * True when the caller's visibility grant was applied to this member's
   * slice. It does not by itself mean anything was removed — only that the
   * numbers below are a filtered view and may be lower than reality.
   */
  restricted: boolean;
}

/**
 * Summary of what the caller was NOT allowed to see, so the UI can say the
 * household total is partial rather than silently showing a wrong number.
 *
 * The caps are a property of the CALLER, not of each sibling, so
 * `hiddenMemberCount` is either 0 or "every sibling" — but it is reported as a
 * count (and `restrictedMemberIds` as a list) because the UI renders per
 * member, and because an OWNER-only future grant model would make it vary.
 */
export interface VisibilitySummary {
  /** The caller has any cap at all (i.e. is not an unrestricted OWNER). */
  restricted: boolean;
  allowedAssetClasses: AssetClass[] | null;
  allowedCategories: readonly string[] | null;
  /** Members whose slice was filtered by the caps. Never includes the caller. */
  restrictedMemberIds: string[];
  restrictedMemberCount: number;
  /**
   * Members for whom the caps hide EVERY dimension this endpoint reports, so
   * their contribution to the totals is structurally zero.
   */
  hiddenMemberCount: number;
  /** Shorthand: the totals below exclude data that exists. */
  partial: boolean;
}

// ══ 1. Wealth ════════════════════════════════════════════════════════════

export interface FamilyMemberWealth extends FamilyMemberRef {
  /** Gross assets: portfolio + vehicles + real estate. */
  netWorth: string;
  invested: string;
  unrealisedPnL: string;
  /** pnl / invested for THIS member — not an average of anything. */
  unrealisedPnLPct: number;
  totalLiabilities: string;
  netWorthAfterLiabilities: string;
  /** This member's netWorth as a % of the household's netWorth. */
  sharePct: number;
}

export interface FamilyAllocationSlice {
  key: string;
  label: string;
  value: string;
  /** Share of the HOUSEHOLD total, recomputed — never a merged member %. */
  percent: number;
  category: string;
}

export interface FamilyWealth {
  familyId: string;
  callerId: string;
  /** ISO timestamp: when these numbers were computed. */
  asOf: string;
  /** Members whose entire slice the caller's grant hides. Mirrors `visibility`. */
  hiddenMemberCount: number;
  totals: {
    memberCount: number;
    netWorth: string;
    invested: string;
    unrealisedPnL: string;
    unrealisedPnLPct: number;
    totalLiabilities: string;
    netWorthAfterLiabilities: string;
  };
  members: FamilyMemberWealth[];
  allocation: FamilyAllocationSlice[];
  visibility: VisibilitySummary;
}

// ══ 2. Goals ═════════════════════════════════════════════════════════════

export interface FamilyGoal {
  id: string;
  name: string;
  /** One of GOAL_CATEGORIES - a closed set, exported above. */
  category: GoalCategory;
  priority: GoalPriority;
  status: GoalStatus;
  owner: FamilyMemberRef;
  targetAmount: string;
  currentValue: string;
  /** target − current, floored at zero. */
  shortfall: string;
  /** Shortfall against the inflation-adjusted target; null when no rate is set. */
  inflationAdjustedTarget: string | null;
  inflationAdjustedShortfall: string | null;
  progressPct: number;
  yearsRemaining: number;
  targetDate: string;
  requiredCagr: number | null;
  /** Monthly contribution needed to close the shortfall by targetDate. */
  requiredMonthlySip: string | null;
  expectedReturn: string | null;
  isOnTrack: boolean | null;
}

export interface FamilyGoalsByMember extends FamilyMemberRef {
  goalCount: number;
  totalTarget: string;
  totalCurrent: string;
  totalShortfall: string;
  requiredMonthlySip: string;
  /** This member's current / this member's target — own denominator. */
  progressPct: number;
}

export interface FamilyGoals {
  familyId: string;
  callerId: string;
  /** ISO timestamp: when these numbers were computed. */
  asOf: string;
  /** Members whose goals the caller's grant hides entirely. */
  hiddenMemberCount: number;
  goals: FamilyGoal[];
  totals: {
    goalCount: number;
    totalTarget: string;
    totalCurrent: string;
    totalShortfall: string;
    requiredMonthlySip: string;
    /** Household current / household target. */
    progressPct: number;
  };
  byMember: FamilyGoalsByMember[];
  visibility: VisibilitySummary;
}

// ══ 3. Protection ════════════════════════════════════════════════════════

export interface UpcomingRenewal {
  policyId: string;
  insurer: string;
  type: string;
  planName: string | null;
  dueDate: string;
  daysUntil: number;
  amount: string;
}

export interface MemberLiabilities {
  loanCount: number;
  loanOutstanding: string;
  monthlyEmi: string;
  creditCardCount: number;
  creditCardOutstanding: string;
  totalLiabilities: string;
}

export interface FamilyMemberProtection extends FamilyMemberRef {
  policyCount: number;
  lifeCover: string;
  healthCover: string;
  otherCover: string;
  monthlyIncome: string;
  annualIncome: string;
  /**
   * 10x annual income — the heuristic healthScoreMath.insuranceScore uses.
   *
   * `null` when we have no income on file for this member. Ten times an
   * unknown income is not zero: rendering ₹0 there reads as "needs no cover",
   * when what is true is "cannot size it yet". Members with no income records
   * are exactly the ones who have not finished setting up, so this is the
   * common case, not an edge one.
   */
  requiredLifeCover: string | null;
  /** required − life cover, floored at zero. `null` when required is unknown. */
  lifeCoverGap: string | null;
  /** healthScoreMath.insuranceScore: 0-100, 50 when the member has no policy. */
  coverAdequacyScore: number;
  /**
   * True when this member holds no ACTIVE policy of any kind. `null` when the
   * caller's grant hides the INSURANCE category for them — "we cannot see"
   * must not be reported as "they have none".
   */
  hasNoCover: boolean | null;
  annualPremiumTotal: string;
  upcomingRenewals: UpcomingRenewal[];
  liabilities: MemberLiabilities;
}

export interface FamilyProtection {
  familyId: string;
  callerId: string;
  /** ISO timestamp: when these numbers were computed. */
  asOf: string;
  /**
   * Members whose cover, premiums and liabilities are all hidden from the
   * caller. Without it, a household with zero visible cover is
   * indistinguishable from a household that is genuinely uninsured.
   */
  hiddenMemberCount: number;
  members: FamilyMemberProtection[];
  totals: {
    lifeCover: string;
    healthCover: string;
    requiredLifeCover: string;
    /**
     * Members whose requirement could not be sized because no income is on
     * file. They contribute nothing to the totals above, so a household gap
     * shown without this count reads as more complete than it is.
     */
    unsizedMemberCount: number;
    /**
     * Sum of the PER-MEMBER gaps, not (household required − household cover).
     * One member's surplus term plan does not insure another member's life, so
     * netting the two would understate the household's real exposure.
     */
    protectionGap: string;
    annualPremiumTotal: string;
    upcomingRenewalCount: number;
    membersWithNoCover: FamilyMemberRef[];
    liabilities: MemberLiabilities;
  };
  visibility: VisibilitySummary;
}

// ══ 4. Attention ═════════════════════════════════════════════════════════

export type AttentionType =
  | 'FD_MATURITY'
  | 'INSURANCE_PREMIUM_DUE'
  | 'LOAN_EMI_DUE'
  | 'LOAN_EMI_OVERDUE'
  | 'STALE_PRICES'
  | 'NO_ACCOUNTS_CONNECTED';

export type AttentionUrgency = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AttentionItem {
  id: string;
  type: AttentionType;
  title: string;
  description: string;
  urgency: AttentionUrgency;
  /** Negative = overdue by that many days. Null when the item has no date. */
  daysUntil: number | null;
  /**
   * Explicitly nullable: not every kind carries a date or a rupee figure. A
   * NO_ACCOUNTS_CONNECTED nudge has neither, and an empty string would be a
   * lie dressed up as data.
   */
  dueDate: string | null;
  amountInr: string | null;
  /** Which member this belongs to. Every item carries one — no orphan rows. */
  member: FamilyMemberRef;
}

export interface FamilyAttention {
  familyId: string;
  callerId: string;
  /** ISO timestamp: when this feed was computed. */
  asOf: string;
  /**
   * Members every one of whose items the caller's grant hides. An empty feed
   * with `hiddenMemberCount > 0` means "nothing you may see", not "nothing to
   * do" - the client must render those two states differently.
   */
  hiddenMemberCount: number;
  items: AttentionItem[];
  perMember: Array<FamilyMemberRef & { total: number; shown: number }>;
  totalItemCount: number;
  shownItemCount: number;
  visibility: VisibilitySummary;
}

// ─── One member, in full ─────────────────────────────────────────

export interface FamilyMemberHolding {
  assetKey: string;
  assetName: string;
  assetClass: string;
  quantity: string;
  currentValue: string;
  totalCost: string;
  unrealisedPnL: string;
}

/**
 * Everything the caller is permitted to see about ONE member.
 *
 * `restricted` and `hiddenCategories` are not decoration: a member viewing a
 * sibling under a partial grant is looking at an incomplete picture, and a page
 * that does not say so is claiming to be complete. The caller's own detail is
 * never restricted — the caps govern what they see OF THE FAMILY, not of
 * themselves.
 */
export interface FamilyMemberDetail {
  familyId: string;
  asOf: string;
  member: FamilyMemberRef;
  netWorth: string;
  invested: string;
  unrealisedPnL: string;
  totalLiabilities: string;
  netWorthAfterLiabilities: string;
  allocation: FamilyAllocationSlice[];
  holdings: FamilyMemberHolding[];
  goals: FamilyGoal[];
  protection: FamilyMemberProtection | null;
  attention: AttentionItem[];
  /** Categories the caller's grant hides for this member, named so the UI can
   *  say what is missing rather than silently omitting it. */
  hiddenCategories: string[];
  /** True when an asset-class grant limits the holdings and allocation above. */
  assetClassesRestricted: boolean;
}
