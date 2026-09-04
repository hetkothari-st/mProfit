import { api, unwrap } from './client';
import type {
  ApiResponse,
  AttentionType,
  FamilyAttention,
  FamilyGoals,
  FamilyMemberDetail,
  FamilyMemberRef,
  FamilyProtection,
  FamilyWealth,
  GoalCategory,
} from '@portfolioos/shared';

/**
 * Family dashboard contract — the read-only household view behind
 * `/api/families/:familyId/dashboard/*`. Four endpoints, one per panel on
 * the Family → Overview tab: wealth, goals, protection, attention.
 *
 * THE RESPONSE TYPES ARE NOT DECLARED HERE. `FamilyWealth`, `FamilyGoals`,
 * `FamilyProtection` and `FamilyAttention` come from `@portfolioos/shared`,
 * which is the same declaration `familyAggregate.service.ts` types its return
 * values with. Restating them locally is what let this page and the server
 * disagree about every field name while both typechecked; with one
 * declaration, a server-side rename breaks the build here instead of
 * rendering `undefined`. Never re-declare a response shape in this file —
 * change it in packages/shared and let the compiler find the callers.
 *
 * Gated at the FAMILY tier on the server; the UI wraps the whole Overview
 * tab in <LockedFeature requiredTier="FAMILY"> so a PLUS user sees the
 * upgrade card rather than four failed requests.
 *
 * Money always arrives as a decimal STRING. Never coerce it with Number() —
 * hand it to formatINR / <Money>, and go through `toDecimal()` when a chart
 * needs geometry (§3.2).
 *
 * Percentages (`sharePct`, `percent`, `progressPct`) are dimensionless and
 * arrive as JS numbers — they are display-only ratios the server already
 * computed in Decimal.
 *
 * ─── The permission model is part of the contract ───
 * `restricted`, `hiddenMemberCount` and the `visibility` block are how the
 * server tells us a payload is PARTIAL. A caller who ignores them renders a
 * household total that looks complete but isn't. Every widget in
 * pages/family/widgets consumes them and says so on screen. All four
 * endpoints carry their own `hiddenMemberCount`, so no widget has to borrow
 * another endpoint's figure.
 */

export type {
  AttentionItem,
  AttentionType,
  AttentionUrgency,
  FamilyAllocationSlice,
  FamilyAttention,
  FamilyGoal,
  FamilyGoals,
  FamilyGoalsByMember,
  FamilyMemberDetail,
  FamilyMemberHolding,
  FamilyMemberProtection,
  FamilyMemberRef,
  FamilyMemberWealth,
  FamilyProtection,
  FamilyWealth,
  GoalCategory,
  MemberLiabilities,
  UpcomingRenewal,
  VisibilitySummary,
} from '@portfolioos/shared';

// ─── Client ──────────────────────────────────────────────────────────────────

const base = (familyId: string) => `/api/families/${familyId}/dashboard`;

export const familyDashboardApi = {
  async wealth(familyId: string): Promise<FamilyWealth> {
    const { data } = await api.get<ApiResponse<FamilyWealth>>(`${base(familyId)}/wealth`);
    return unwrap(data);
  },
  async goals(familyId: string): Promise<FamilyGoals> {
    const { data } = await api.get<ApiResponse<FamilyGoals>>(`${base(familyId)}/goals`);
    return unwrap(data);
  },
  async protection(familyId: string): Promise<FamilyProtection> {
    const { data } = await api.get<ApiResponse<FamilyProtection>>(
      `${base(familyId)}/protection`,
    );
    return unwrap(data);
  },
  async attention(familyId: string): Promise<FamilyAttention> {
    const { data } = await api.get<ApiResponse<FamilyAttention>>(
      `${base(familyId)}/attention`,
    );
    return unwrap(data);
  },

  /**
   * ONE member, in full — everything behind a name on the family tree.
   *
   * Not under `/dashboard`: it hangs off the member resource itself
   * (`/api/families/:familyId/members/:userId/detail`), because it is a view
   * of a person rather than of the household.
   *
   * The same caps govern it as govern the four panels above, and it reports
   * what they removed rather than dropping it silently:
   * `assetClassesRestricted` says the holdings/allocation are a filtered
   * slice, `hiddenCategories` names the categories withheld, and a null
   * `protection` means "not shared" — never "no cover".
   */
  async memberDetail(familyId: string, userId: string): Promise<FamilyMemberDetail> {
    const { data } = await api.get<ApiResponse<FamilyMemberDetail>>(
      `/api/families/${familyId}/members/${userId}/detail`,
    );
    return unwrap(data);
  },
};

/**
 * Query keys nest under the existing `['families', familyId, …]` prefix so
 * the page's `invalidateQueries({ queryKey: ['families', familyId] })` after
 * a membership change also refreshes the dashboard — a revoked member must
 * drop out of the household total immediately.
 */
export const familyDashboardKeys = {
  root: (familyId: string) => ['families', familyId, 'dashboard'] as const,
  wealth: (familyId: string) => ['families', familyId, 'dashboard', 'wealth'] as const,
  goals: (familyId: string) => ['families', familyId, 'dashboard', 'goals'] as const,
  protection: (familyId: string) =>
    ['families', familyId, 'dashboard', 'protection'] as const,
  attention: (familyId: string) =>
    ['families', familyId, 'dashboard', 'attention'] as const,
  memberDetail: (familyId: string, userId: string) =>
    ['families', familyId, 'dashboard', 'member', userId] as const,
};

/**
 * Display labels for the goal categories the goals endpoint emits.
 *
 * Keyed by `GoalCategory`, so the compiler requires a label for every token
 * in the shared `GOAL_CATEGORIES` set and rejects one that no longer exists.
 */
export const FAMILY_GOAL_CATEGORY_LABEL: Record<GoalCategory, string> = {
  RETIREMENT: 'Retirement',
  CHILD_EDUCATION: 'Child education',
  HOME_PURCHASE: 'Home purchase',
  EMERGENCY_FUND: 'Emergency fund',
  FIRE_CORPUS: 'FIRE corpus',
  VEHICLE_PURCHASE: 'Vehicle purchase',
  TRAVEL: 'Travel',
  WEALTH_BUILDING: 'Wealth building',
  CUSTOM: 'Custom',
};

/**
 * Human label for an attention item's `type`.
 *
 * `AttentionType` is a closed set on the server, so this is an exhaustive
 * Record rather than a lookup with a string fallback — a new kind of alert
 * cannot reach the UI as a raw SCREAMING_SNAKE token.
 */
export const ATTENTION_TYPE_LABEL: Record<AttentionType, string> = {
  FD_MATURITY: 'Maturity',
  INSURANCE_PREMIUM_DUE: 'Premium due',
  LOAN_EMI_DUE: 'EMI due',
  LOAN_EMI_OVERDUE: 'EMI overdue',
  STALE_PRICES: 'Stale prices',
  NO_ACCOUNTS_CONNECTED: 'No accounts',
};

/**
 * How a member is named on screen.
 *
 * `FamilyMemberRef.name` is nullable — a member who was invited but has not
 * finished setting up their profile has only an email. Falling back to the
 * email keeps every row attributable; an unattributed row on a household
 * surface is useless.
 */
export function memberLabel(member: FamilyMemberRef): string {
  return member.name ?? (member.email || 'Unknown member');
}
