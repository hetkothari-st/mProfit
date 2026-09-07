/**
 * Portfolio-level mutual fund analysis
 * (`docs/mf-analytics/04-PORTFOLIO-ANALYSIS.md`, `07-IMPLEMENTATION-PLAN.md`
 * Task 4.2).
 *
 * This is the layer no fund website can offer, because none of them have the
 * user's holdings. Everything here joins the *user's* `HoldingProjection` and
 * `Transaction` rows (the source of truth, `CONTEXT.md §3.2`) to the shared
 * reference tables (`MfSchemeMeta`, `MfPortfolioSnapshot`, `MfSchemeTer`,
 * `MfSchemeMetrics`, `MfSchemeScore`) and returns one
 * `MfPortfolioAnalysisDto` — the exact shape declared in
 * `@portfolioos/shared/mfAnalytics.types.ts`, never a locally-declared
 * near-copy. A page rendering a locally-declared shape is how the `/advisor`
 * page shipped broken (`CONTEXT.md §11`).
 *
 * ## Four rules this file lives under
 *
 * 1. **It runs under the caller's RLS context, never as system.** There is no
 *    `runAsSystem` below. Reading another household member's holdings is done
 *    with `runAsUser(memberId, …)` *after* `familyScope.service.ts` has
 *    proven the caller may read that member — the same shape as
 *    `fanOutRead`. If this file is called with no ambient context, RLS fails
 *    closed and every list comes back empty, which is the designed behaviour
 *    and not a bug to work around (`CONTEXT.md §5`).
 *
 * 2. **`allowedAssetClasses === null` is UNRESTRICTED; `[]` is DENY-ALL.**
 *    Conflating them is a fail-*open* bug that has already shipped once
 *    (`CONTEXT.md §6`). Every visibility decision below goes through
 *    `isAssetClassVisible`, which tests `=== null` explicitly and never uses a
 *    falsy/length check.
 *
 * 3. **Every aggregate computed under caps is a FLOOR.** `scope.partial` and
 *    `scope.hiddenCategories` say so, and `lookThrough.fundsWithoutHoldings`
 *    says the same thing for funds whose disclosure we do not hold. A
 *    restricted total rendered as a total is a lie of omission.
 *
 * 4. **A value that cannot be computed is `null` with a reason, never `0`.**
 *    Zero is a real TER, a real exit load and a real tax bill.
 *
 * ## Money and units
 *
 * `Money` / `Ratio` / `Pct` are branded Decimal strings. `Ratio` is a
 * dimensionless fraction (0.0725 = 7.25%); `Pct` carries percent units
 * (7.250000 = 7.25%). Fund weights coming out of `MfPortfolioHolding.weightPct`
 * are already percent; fund weights *within the user's book* are computed as
 * fractions and converted once, at serialisation. The single most common
 * analytics bug is multiplying by 100 twice, so the internal convention is
 * stated at every boundary below.
 *
 * ## The join path (read before editing a query here)
 *
 * `MfSchemeMeta.schemeCode` is the AMFI code and equals
 * `MutualFundMaster.schemeCode`; NAV history is keyed
 * `MFNav.fundId -> MutualFundMaster.id`. There is deliberately no FK. The
 * user's holdings carry `fundId` (the `MutualFundMaster` cuid), so the walk is
 * `HoldingProjection.fundId -> MutualFundMaster.schemeCode ->
 * MfSchemeMeta.schemeCode`. See the doc comment on `MfSchemeMeta.schemeCode`
 * in `schema.prisma`.
 */

import type { AssetClass, MFCategory, Prisma, Transaction, TransactionType } from '@prisma/client';
import {
  Decimal,
  toDecimal,
  serializeMoney,
  serializeQuantity,
  serializeRatio,
  serializeRatioOrNull,
  serializePct,
  xirr,
  ltcg112aExemptionForFy,
  REBALANCE_BAND_PP,
  resolveSubCategory,
  specFor,
  type Money,
  type Ratio,
  type Pct,
  type MfModelKey,
  type SebiCategory,
  type SebiSubCategory,
  type MfExitLoadRule,
  type MfSchemeMetaDto,
  type MfSchemeScoreDto,
  type MfMetricStatus,
  type MfPillarScore,
  ratingHistoryFor,
  type MfRatingStatus,
  type MfPlanType,
  type MfOptionType,
  type MfSchemeStatus,
  type MfGainType,
  type MfLotDto,
  type MfHeldFundDto,
  type MfOverlapPair,
  type MfLookThrough,
  type MfLookThroughStock,
  type MfMarketCapSplit,
  type MfCreditQualitySplit,
  type MfAllocationComparison,
  type MfCostSummary,
  type MfTaxSummary,
  type MfGoalFitDto,
  type MfPortfolioTotals,
  type MfAnalysisScope,
  type MfPortfolioAnalysisDto,
} from '@portfolioos/shared';

import { prisma } from '../../lib/prisma.js';
import { runAsUser } from '../../lib/requestContext.js';
import {
  canonicalSchemeName,
  effectiveFundCount,
  sharedWeights,
  weightOverlap,
  weightedMeanPairOverlap,
  type WeightsByKey,
  type WeightedPairOverlap,
} from '../mfOverlap.service.js';
import {
  GRANDFATHERING_CUTOFF,
  financialYearOf,
  computeUserCapitalGains,
} from '../capitalGains.service.js';
import { getFmvForUser } from '../fmvOverride.service.js';
import { ratesForDate } from '../tax.service.js';
import { inflationAdjustedTarget } from '../goalMath.js';
import type { EffectiveScope } from '../familyScope.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);
const MS_PER_DAY = 86_400_000;

/**
 * The asset classes this analysis considers "the MF book".
 *
 * `ETF` is in because `mfOverlap.service.ts` already counts it and because an
 * ETF held alongside an index fund is precisely the redundancy `04 §2` exists
 * to surface. Excluding it would let a user hold NIFTYBEES and a Nifty index
 * fund and be told their book is perfectly diversified.
 */
export const MF_ASSET_CLASSES: readonly AssetClass[] = ['MUTUAL_FUND', 'ETF'] as const;

/** `04 §3`: the look-through publishes the top 25 underlying stocks. */
const TOP_STOCKS_LIMIT = 25;

/** How many shared securities to cite per overlap pair. */
const TOP_SHARED_LIMIT = 10;

/**
 * `04 §2`: a pair is only comparable when the two snapshots are at the same
 * `asOf` "or nearest within 1 month". Two disclosures a quarter apart describe
 * two different markets, and the min() of their weights is not an overlap.
 */
const SNAPSHOT_PAIR_MAX_GAP_DAYS = 31;

/**
 * Below this, `fundCagrSamePeriod` is reported as `null` rather than
 * annualised.
 *
 * SEBI's own convention is that sub-1-year performance is stated absolute, not
 * annualised (see `MfReturnMetrics.absolute`). Annualising a six-week holding
 * produces figures like 480% that are arithmetically correct and completely
 * meaningless, and `timingGap` would then be that number minus the user's
 * equally-annualised XIRR.
 */
const MIN_CAGR_DAYS = 365;

/**
 * Long-term holding thresholds, in days, mirroring
 * `capitalGains.service.ts`'s `longTermThresholdMonths(...) * 30`.
 *
 * 12 months x 30 = 360 days is **not** the legal test (which is calendar
 * months), and it is used here deliberately anyway: `capitalGains.service.ts`
 * classifies *realised* gains with exactly this arithmetic, and a product that
 * calls the same lot short-term on the tax page and long-term on the MF page
 * is worse than one that is uniformly approximate by five days. The constant
 * is named so that fixing it means fixing both places at once.
 */
const LT_THRESHOLD_DAYS_EQUITY_ORIENTED = 12 * 30;
const LT_THRESHOLD_DAYS_OTHER = 36 * 30;

/**
 * The goal-suitability matrix (`04 §6`), in years, keyed by scoring model.
 *
 * `min` — below this horizon the fund's volatility can still be sitting on a
 * loss when the money is needed, so it is a `MISMATCH`.
 * `max` — above this horizon the fund cannot plausibly get there, so it is
 * `UNDERPOWERED` (a liquid fund for a 15-year goal is the canonical case).
 *
 * These are horizons, not return forecasts. The projection below deliberately
 * uses the *category median* rolling return rather than these bands.
 */
const GOAL_HORIZON_BANDS: Record<MfModelKey, { min: number; max: number | null }> = {
  ACTIVE_EQUITY: { min: 5, max: null },
  INDEX: { min: 5, max: null },
  HYBRID: { min: 3, max: null },
  DEBT_DURATION: { min: 1, max: 10 },
  DEBT_ULTRA_SHORT: { min: 0, max: 5 },
  SOLUTION: { min: 5, max: null },
  FOF: { min: 5, max: null },
};

/**
 * Small- and mid-cap mandates need a longer runway than the generic equity
 * band: their drawdowns are deeper and their recoveries longer, which is
 * exactly the "small-cap for a < 3-year goal" case `04 §6` names. Detected
 * from the SEBI mandate (`capBand.minSmallPct` / `minMidPct`) rather than from
 * the scheme name, so a fund that renames itself does not change category.
 */
const SMALL_MID_CAP_MIN_HORIZON_YEARS = 7;

/**
 * Token appended to `scope.hiddenCategories` when the caller's caps hide any
 * NON-MF asset class.
 *
 * Those classes never appear in this analysis, but they are in the denominator
 * of `weightInNetWorth` and `effectiveWeightOfNetWorthPct`. Hiding them does
 * not make those weights wrong in a small way — it makes every one of them an
 * over-statement, because the denominator is a floor. Naming the fact is what
 * lets the UI say "share of the net worth we can see" instead of "share of net
 * worth" (`CONTEXT.md §6`).
 */
const HIDDEN_NET_WORTH_TOKEN = 'NET_WORTH';

// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

export interface MfPortfolioAnalysisOptions {
  /**
   * The instant every number is computed against. Defaults to now. Analytics
   * are always evaluated at a point in time; carrying it explicitly is what
   * makes a stored run replayable.
   */
  asOf?: Date;
  /**
   * The `MfAnalysisRun` this analysis belongs to. The engine (Task 5.4) passes
   * the real id; a standalone call gets the sentinel so the DTO is never
   * silently stamped with a plausible-looking id that resolves to nothing.
   */
  runId?: string;
}

/** Used when the caller has not persisted a run. Deliberately not a cuid. */
export const UNPERSISTED_RUN_ID = 'unpersisted';

// ---------------------------------------------------------------------------
// Visibility (CONTEXT.md §6) — the null-vs-[] boundary
// ---------------------------------------------------------------------------

/**
 * **The fail-open guard.** `null` means unrestricted; `[]` means deny-all.
 *
 * Written as an explicit `=== null` test and never as `?.length`, `!caps` or
 * `caps ?? ALL`. The shipped bug was precisely that shape: an empty array read
 * as falsy, was treated as "no restriction", and showed capped members the
 * whole household. Any refactor that reintroduces a truthiness test here
 * reintroduces that bug.
 */
function isAssetClassVisible(scope: EffectiveScope, assetClass: AssetClass): boolean {
  if (scope.allowedAssetClasses === null) return true;
  return scope.allowedAssetClasses.includes(assetClass);
}

/** The MF asset classes this caller may actually see. May legitimately be empty. */
function visibleMfAssetClasses(scope: EffectiveScope): AssetClass[] {
  return MF_ASSET_CLASSES.filter((ac) => isAssetClassVisible(scope, ac));
}

/**
 * `04 §7` + `CONTEXT.md §6`: describe what this view could not see.
 *
 * `04 §7` reads as "aggregate across members only for OWNER, or where the caps
 * include all MF classes". We aggregate over whatever *is* visible instead and
 * label the result a floor, which is a deliberate departure: blanking the
 * section for a member who may see MUTUAL_FUND but not ETF renders as "they
 * have none", and `CONTEXT.md §6`'s UI invariant is explicit that a hidden
 * category must read "not shared with you" rather than as an absence. A
 * labelled floor is more honest than a blank, and strictly more useful.
 */
function buildScopeHonesty(scope: EffectiveScope): MfAnalysisScope {
  const hidden: string[] = [];

  // `null` = unrestricted: nothing hidden, and no floor label. This is the
  // branch the personal view and the family OWNER take.
  if (scope.allowedAssetClasses !== null) {
    for (const ac of MF_ASSET_CLASSES) {
      if (!scope.allowedAssetClasses.includes(ac)) hidden.push(ac);
    }
    // A non-null cap list is by definition an allow-list, and `AssetClass` has
    // 39 members: a capped view is therefore missing *something* from the
    // net-worth denominator behind `weightInNetWorth` and
    // `effectiveWeightOfNetWorthPct`, even when every MF class is visible.
    // Enumerating exactly which classes are missing would mean importing the
    // whole enum as a runtime value to subtract from; declaring the
    // denominator a floor whenever any cap exists errs in the only safe
    // direction — over-disclosing partiality rather than presenting a floor as
    // a total.
    hidden.push(HIDDEN_NET_WORTH_TOKEN);
  }

  return {
    partial: hidden.length > 0,
    hiddenCategories: hidden,
    // `null` for a personal view — "one member" would imply a household of one
    // rather than "this question does not apply".
    memberCount: scope.familyId === null ? null : scope.readableUserIds.length,
  };
}

/**
 * Run `fn` under `userId`'s RLS context. The caller's own reads stay in the
 * ambient context; a sibling's run under `runAsUser`, exactly as
 * `familyScope.fanOutRead` does — the single-owner RLS policies would
 * otherwise return zero rows for every member but the caller.
 *
 * Membership has already been proven by `getEffectiveScope`; this function
 * makes no authorisation decision of its own.
 */
function asMember<T>(scope: EffectiveScope, userId: string, fn: () => Promise<T>): Promise<T> {
  return userId === scope.callerId ? fn() : runAsUser(userId, fn);
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function yearsBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (365.25 * MS_PER_DAY);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Share of `total`, as a fraction. `null` when the denominator is unusable. */
function fractionOf(part: Decimal, total: Decimal): Decimal | null {
  if (total.lessThanOrEqualTo(0)) return null;
  return part.dividedBy(total);
}

/** Fraction → `Pct`. The x100 lives here and in `ratioToPct`, nowhere else. */
function fractionToPct(f: Decimal): Pct {
  return serializePct(f.times(HUNDRED));
}

function fractionToPctOrNull(f: Decimal | null): Pct | null {
  return f === null ? null : fractionToPct(f);
}

// ---------------------------------------------------------------------------
// FIFO open lots
// ---------------------------------------------------------------------------

/**
 * The transaction types that open and close a lot.
 *
 * These mirror `capitalGains.service.ts` exactly, including `OPENING_BALANCE`
 * as a buy (a CAS import's carried-forward units are a lot with a cost) and
 * `SWITCH_IN`/`SWITCH_OUT` on both sides (an MF switch is a redemption and a
 * fresh purchase for tax, and treating it as neither would leave phantom open
 * lots behind). They are duplicated rather than imported because the CG module
 * does not export them; if that changes, delete these.
 */
const BUY_TYPES: ReadonlySet<TransactionType> = new Set<TransactionType>([
  'BUY',
  'SIP',
  'SWITCH_IN',
  'BONUS',
  'MERGER_IN',
  'DEMERGER_IN',
  'RIGHTS_ISSUE',
  'DIVIDEND_REINVEST',
  'OPENING_BALANCE',
]);

const SELL_TYPES: ReadonlySet<TransactionType> = new Set<TransactionType>([
  'SELL',
  'SWITCH_OUT',
  'MERGER_OUT',
  'DEMERGER_OUT',
  'REDEMPTION',
  'MATURITY',
]);

/** Zero-cost acquisitions: units arrive, cost basis does not. */
const ZERO_COST_TYPES: ReadonlySet<TransactionType> = new Set<TransactionType>([
  'BONUS',
  'MERGER_IN',
  'DEMERGER_IN',
]);

export interface OpenLot {
  buyTxId: string;
  buyDate: Date;
  units: Decimal;
  /** Net of charges, exactly as the CG engine derives it: `netAmount / quantity`. */
  costPerUnit: Decimal;
}

/**
 * FIFO replay returning the lots still OPEN at the end.
 *
 * `capitalGains.service.ts` runs the same replay but keeps only the *matched*
 * (realised) rows and discards the residue; `holdingsProjection.ts` runs a
 * weighted-average model that has no lots at all. `04 §5` needs the residue,
 * so the replay is done once more here. It is deliberately the same algorithm
 * — same type sets, same `netAmount / quantity` cost, same
 * buy-before-sell same-day tie-break — because a lot the tax page has already
 * consumed must not still be open on this one.
 */
export function openLotsFifo(txs: readonly Transaction[]): OpenLot[] {
  const relevant = txs
    .filter((t) => BUY_TYPES.has(t.transactionType) || SELL_TYPES.has(t.transactionType))
    .slice()
    .sort((a, b) => {
      const d = a.tradeDate.getTime() - b.tradeDate.getTime();
      if (d !== 0) return d;
      // Same-day: buys settle first, so an intraday round trip consumes the
      // lot it created rather than an older one.
      return (BUY_TYPES.has(a.transactionType) ? 0 : 1) - (BUY_TYPES.has(b.transactionType) ? 0 : 1);
    });

  const lots: OpenLot[] = [];
  for (const tx of relevant) {
    const qty = toDecimal(tx.quantity);
    if (qty.lessThanOrEqualTo(0)) continue;

    if (BUY_TYPES.has(tx.transactionType)) {
      const net = toDecimal(tx.netAmount);
      lots.push({
        buyTxId: tx.id,
        buyDate: tx.tradeDate,
        units: qty,
        costPerUnit: ZERO_COST_TYPES.has(tx.transactionType) ? ZERO : net.dividedBy(qty),
      });
      continue;
    }

    let remaining = qty;
    while (remaining.greaterThan(0) && lots.length > 0) {
      const lot = lots[0]!;
      const take = Decimal.min(lot.units, remaining);
      lot.units = lot.units.minus(take);
      remaining = remaining.minus(take);
      if (lot.units.lessThanOrEqualTo(0)) lots.shift();
    }
    // `remaining > 0` means the data says more units were sold than held.
    // The CG engine drops the overflow too; correcting it here would make the
    // two disagree about a portfolio that is already inconsistent.
  }
  return lots;
}

// ---------------------------------------------------------------------------
// Cash flows (`04 §1`)
// ---------------------------------------------------------------------------

/**
 * The user's real cash flows for one scheme: every buy, sell, SIP instalment
 * and IDCW payout, signed for XIRR.
 *
 * `DIVIDEND_REINVEST` is an outflow *and* an inflow of equal size on the same
 * date, so it nets to nothing in an XIRR and is skipped on the inflow side —
 * it is already a buy above. `DIVIDEND_PAYOUT` is money that genuinely left
 * the fund and reached the user, so it is an inflow; omitting it (the common
 * mistake) understates the return of every IDCW plan.
 */
const XIRR_OUTFLOW_TYPES: ReadonlySet<TransactionType> = new Set<TransactionType>([
  'BUY',
  'SIP',
  'SWITCH_IN',
  'RIGHTS_ISSUE',
  'DIVIDEND_REINVEST',
]);

const XIRR_INFLOW_TYPES: ReadonlySet<TransactionType> = new Set<TransactionType>([
  'SELL',
  'SWITCH_OUT',
  'REDEMPTION',
  'MATURITY',
  'DIVIDEND_PAYOUT',
]);

interface Flow {
  date: Date;
  amount: Decimal;
}

function userFlows(txs: readonly Transaction[]): Flow[] {
  const out: Flow[] = [];
  for (const tx of txs) {
    const net = toDecimal(tx.netAmount);
    if (net.isZero()) continue;
    if (XIRR_OUTFLOW_TYPES.has(tx.transactionType)) {
      out.push({ date: tx.tradeDate, amount: net.negated() });
    } else if (XIRR_INFLOW_TYPES.has(tx.transactionType)) {
      out.push({ date: tx.tradeDate, amount: net });
    }
  }
  return out;
}

interface XirrOutcome {
  value: Ratio | null;
  status: MfMetricStatus;
  reason?: string;
}

/**
 * Solve XIRR over the user's flows plus the terminal value.
 *
 * Two failure modes, kept apart because they mean different things to the
 * reader: fewer than two opposite-sign flows means "a rate of return is not
 * defined here yet" (a position bought and never valued, or valued at zero);
 * a null back from a solver that *had* usable flows means the search did not
 * converge. Both are `INSUFFICIENT_DATA` because that is the vocabulary
 * `MfMetricStatus` offers, and the reason string carries the distinction —
 * `04 §1` names `xirr_no_convergence` specifically.
 *
 * The iteration cap `04 §1` asks for is the shared solver's own
 * (`NEWTON_MAX_ITERATIONS` + a bounded bisection); reusing it rather than
 * writing a second loop is what keeps this number equal to the dashboard's.
 */
function solveXirr(flows: readonly Flow[], terminal: Decimal, asOf: Date): XirrOutcome {
  const all: Flow[] = flows.slice();
  if (terminal.greaterThan(0)) all.push({ date: asOf, amount: terminal });

  const hasIn = all.some((f) => f.amount.greaterThan(0));
  const hasOut = all.some((f) => f.amount.lessThan(0));
  if (all.length < 2 || !hasIn || !hasOut) {
    return { value: null, status: 'INSUFFICIENT_DATA', reason: 'insufficient_flows' };
  }

  const rate = xirr(all);
  if (rate === null) {
    return { value: null, status: 'INSUFFICIENT_DATA', reason: 'xirr_no_convergence' };
  }
  return { value: serializeRatio(rate), status: 'OK' };
}

// ---------------------------------------------------------------------------
// Loading the user's MF book
// ---------------------------------------------------------------------------

/** One scheme as this analysis sees it, before any serialisation. */
interface HeldFund {
  fundId: string;
  schemeCode: string;
  schemeName: string;
  /** `MutualFundMaster.category` — the tax-side category, not the SEBI one. */
  masterCategory: MFCategory;
  masterIsin: string | null;
  assetClass: AssetClass;
  units: Decimal;
  currentValue: Decimal;
  /** Every transaction the readable members have for this scheme, date-ordered. */
  txs: Transaction[];
  /**
   * The household members holding this scheme. Carried so a merged position
   * remembers whose money it is — the DTO has no member field, but the
   * provenance is needed to reason about a merged row when debugging a
   * household total that does not match a member page.
   */
  ownerUserIds: Set<string>;
}

interface MemberBook {
  userId: string;
  funds: Map<string, HeldFund>;
  /** Sum of every *visible* holding's current value — a floor under caps. */
  netWorthFloor: Decimal;
  /** Any `SipPlan` fundIds that are still active. */
  activeSipFundIds: Set<string>;
}

/**
 * Load one member's MF book under their own RLS context.
 *
 * Positions are keyed by `fundId` rather than by `(portfolioId, assetKey)`:
 * `04` analyses *schemes*, and a user who holds the same fund in two
 * portfolios holds one fund. `HoldingProjection` rows without a `fundId` are
 * skipped — an MF position with no scheme identity cannot be joined to any
 * reference table, and inventing an identity for it would put a nameless row
 * in the overlap matrix.
 */
async function loadMemberBook(
  scope: EffectiveScope,
  userId: string,
  asOf: Date,
): Promise<MemberBook> {
  const mfClasses = visibleMfAssetClasses(scope);

  return asMember(scope, userId, async () => {
    // Net worth denominator first: it spans every visible class, not just MF.
    // `assetClassWhere`-style filtering is inlined because we need the same
    // null-vs-[] semantics on a list we already have.
    const allHoldings = await prisma.holdingProjection.findMany({
      where: { portfolio: { userId } },
      select: { assetClass: true, currentValue: true, totalCost: true },
    });
    let netWorthFloor = ZERO;
    for (const h of allHoldings) {
      if (!isAssetClassVisible(scope, h.assetClass)) continue;
      // `currentValue` is null for assets with no market feed; the projection
      // then carries cost, which is the best available valuation and is what
      // `xirr.service.terminalValue` also falls back to.
      netWorthFloor = netWorthFloor.plus(toDecimal(h.currentValue ?? h.totalCost));
    }

    const funds = new Map<string, HeldFund>();
    if (mfClasses.length === 0) {
      // Deny-all, or a cap that excludes every MF class. Zero funds is the
      // correct answer and `scope.partial` says why.
      return { userId, funds, netWorthFloor, activeSipFundIds: new Set() };
    }

    const rows = await prisma.holdingProjection.findMany({
      where: {
        portfolio: { userId },
        assetClass: { in: mfClasses },
        fundId: { not: null },
        quantity: { gt: 0 },
      },
      select: {
        fundId: true,
        assetClass: true,
        quantity: true,
        currentValue: true,
        totalCost: true,
      },
    });
    if (rows.length === 0) {
      return { userId, funds, netWorthFloor, activeSipFundIds: new Set() };
    }

    const fundIds = Array.from(new Set(rows.map((r) => r.fundId!).filter(Boolean)));
    const masters = await prisma.mutualFundMaster.findMany({
      where: { id: { in: fundIds } },
      select: { id: true, schemeCode: true, schemeName: true, category: true, isin: true },
    });
    const masterById = new Map(masters.map((m) => [m.id, m]));

    for (const r of rows) {
      const master = masterById.get(r.fundId!);
      // No `MutualFundMaster` row means no AMFI scheme code, and therefore no
      // way to reach any reference table: no meta, no disclosure, no TER, no
      // score. Such a position cannot be analysed at all, so it is skipped
      // here rather than added as a nameless row in the overlap matrix. It is
      // an orphaned foreign key on the user's own holding — a data-integrity
      // problem for the import that created it, not something this read path
      // can repair.
      if (!master) continue;
      const value = toDecimal(r.currentValue ?? r.totalCost);
      const existing = funds.get(r.fundId!);
      if (existing) {
        existing.units = existing.units.plus(toDecimal(r.quantity));
        existing.currentValue = existing.currentValue.plus(value);
      } else {
        funds.set(r.fundId!, {
          fundId: r.fundId!,
          schemeCode: master.schemeCode,
          schemeName: master.schemeName,
          masterCategory: master.category,
          masterIsin: master.isin,
          assetClass: r.assetClass,
          units: toDecimal(r.quantity),
          currentValue: value,
          txs: [],
          ownerUserIds: new Set([userId]),
        });
      }
    }

    const heldFundIds = Array.from(funds.keys());
    const txs = await prisma.transaction.findMany({
      where: {
        portfolio: { userId },
        fundId: { in: heldFundIds },
        tradeDate: { lte: asOf },
      },
      orderBy: { tradeDate: 'asc' },
    });
    for (const tx of txs) {
      const fund = tx.fundId ? funds.get(tx.fundId) : undefined;
      if (fund) fund.txs.push(tx);
    }

    const sips = await prisma.sipPlan.findMany({
      where: { userId, isActive: true, fundId: { in: heldFundIds } },
      select: { fundId: true },
    });

    return {
      userId,
      funds,
      netWorthFloor,
      activeSipFundIds: new Set(sips.map((s) => s.fundId!).filter(Boolean)),
    };
  });
}

/**
 * Merge the household's per-member books into one scheme-keyed book.
 *
 * `MfHeldFundDto` has no member field, so a scheme two members both hold is
 * one row whose units and value are the household's. That is the aggregate
 * `04 §7` asks for; the per-member split lives on the family pages
 * (`familyAggregate.service.ts`), which is the module that owns that view.
 */
function mergeBooks(books: readonly MemberBook[]): {
  funds: Map<string, HeldFund>;
  netWorthFloor: Decimal;
  activeSipFundIds: Set<string>;
} {
  const funds = new Map<string, HeldFund>();
  let netWorthFloor = ZERO;
  const activeSipFundIds = new Set<string>();

  for (const book of books) {
    netWorthFloor = netWorthFloor.plus(book.netWorthFloor);
    for (const id of book.activeSipFundIds) activeSipFundIds.add(id);
    for (const [fundId, fund] of book.funds) {
      const existing = funds.get(fundId);
      if (!existing) {
        funds.set(fundId, fund);
        continue;
      }
      existing.units = existing.units.plus(fund.units);
      existing.currentValue = existing.currentValue.plus(fund.currentValue);
      existing.txs = existing.txs.concat(fund.txs);
      for (const uid of fund.ownerUserIds) existing.ownerUserIds.add(uid);
    }
  }

  for (const fund of funds.values()) {
    fund.txs.sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime());
  }
  return { funds, netWorthFloor, activeSipFundIds };
}

// ---------------------------------------------------------------------------
// Reference-data loading
// ---------------------------------------------------------------------------

type SchemeMetaRow = Awaited<ReturnType<typeof prisma.mfSchemeMeta.findMany>>[number];

interface SnapshotRow {
  schemeCode: string;
  asOf: Date;
  holdings: Array<{
    kind: string;
    isin: string | null;
    securityName: string;
    weightPct: Prisma.Decimal;
    sector: string | null;
    marketCapBucket: string | null;
    issuer: string | null;
    creditRating: string | null;
  }>;
}

interface ReferenceData {
  metaByScheme: Map<string, SchemeMetaRow>;
  /** Latest TER effective on or before `asOf`, percent units. */
  terByScheme: Map<string, Decimal>;
  /** Latest disclosure on or before `asOf`. */
  snapshotByScheme: Map<string, SnapshotRow>;
  scoreByScheme: Map<string, MfSchemeScoreDto>;
  /** `schemeCode → horizonYears → categoryMedianCagr`, for the goal projection. */
  categoryMedianByScheme: Map<string, Map<number, Decimal>>;
  /** `schemeCode → terPercentile` from the horizon-0 profile, where known. */
  terPercentileByScheme: Map<string, Decimal>;
  /** Latest NAV date/value per fundId, and the whole series is not loaded. */
  navSeriesByFund: Map<string, Array<{ date: Date; nav: Decimal }>>;
  /** REGULAR schemeCode → its DIRECT sibling's meta, where one was found. */
  directSiblingByScheme: Map<string, { schemeCode: string; terPct: Decimal | null }>;
}

/**
 * All the reference data the analysis needs, in a fixed number of queries.
 *
 * These tables are **not user-scoped** (`CONTEXT.md §5`: a scheme's TER is the
 * same number for every user), so they read straight through the RLS hook with
 * no context juggling. The batching matters: a per-fund fan-out would issue
 * 7 queries per scheme, and a 20-fund household would spend more time on
 * round-trips than on arithmetic.
 */
async function loadReferenceData(
  funds: ReadonlyMap<string, HeldFund>,
  asOf: Date,
): Promise<ReferenceData> {
  const schemeCodes = Array.from(new Set([...funds.values()].map((f) => f.schemeCode)));
  const fundIds = Array.from(funds.keys());

  const empty: ReferenceData = {
    metaByScheme: new Map(),
    terByScheme: new Map(),
    snapshotByScheme: new Map(),
    scoreByScheme: new Map(),
    categoryMedianByScheme: new Map(),
    terPercentileByScheme: new Map(),
    navSeriesByFund: new Map(),
    directSiblingByScheme: new Map(),
  };
  if (schemeCodes.length === 0) return empty;

  const [metas, ters, snapshots, scores, metrics, navs] = await Promise.all([
    prisma.mfSchemeMeta.findMany({ where: { schemeCode: { in: schemeCodes } } }),
    prisma.mfSchemeTer.findMany({
      where: { schemeCode: { in: schemeCodes }, effectiveFrom: { lte: asOf } },
      orderBy: { effectiveFrom: 'desc' },
      select: { schemeCode: true, terPct: true, effectiveFrom: true },
    }),
    prisma.mfPortfolioSnapshot.findMany({
      where: { schemeCode: { in: schemeCodes }, asOf: { lte: asOf } },
      orderBy: { asOf: 'desc' },
      select: {
        schemeCode: true,
        asOf: true,
        holdings: {
          select: {
            kind: true,
            isin: true,
            securityName: true,
            weightPct: true,
            sector: true,
            marketCapBucket: true,
            issuer: true,
            creditRating: true,
          },
        },
      },
    }),
    prisma.mfSchemeScore.findMany({
      where: { schemeCode: { in: schemeCodes }, asOf: { lte: asOf } },
      orderBy: { asOf: 'desc' },
    }),
    prisma.mfSchemeMetrics.findMany({
      where: { schemeCode: { in: schemeCodes }, asOf: { lte: asOf } },
      orderBy: { asOf: 'desc' },
      select: { schemeCode: true, horizonYears: true, metrics: true },
    }),
    prisma.mFNav.findMany({
      where: { fundId: { in: fundIds }, date: { lte: asOf }, isQuarantined: false },
      orderBy: { date: 'asc' },
      select: { fundId: true, date: true, nav: true, adjustedNav: true },
    }),
  ]);

  const metaByScheme = new Map(metas.map((m) => [m.schemeCode, m]));

  // Ordered desc, so the first row per scheme is the one in force at `asOf`.
  const terByScheme = new Map<string, Decimal>();
  for (const t of ters) {
    if (!terByScheme.has(t.schemeCode)) terByScheme.set(t.schemeCode, toDecimal(t.terPct));
  }

  const snapshotByScheme = new Map<string, SnapshotRow>();
  for (const s of snapshots) {
    if (!snapshotByScheme.has(s.schemeCode)) snapshotByScheme.set(s.schemeCode, s as SnapshotRow);
  }

  /**
   * `historyMonths` / `ratedFrom` for a score row, from the meta already in
   * this batch. Returns nulls when the meta row is missing rather than
   * guessing an inception date — an invented fund age would drive the
   * "rated from {date}" promise shown to the user.
   */
  const scoreRatingHistory = (
    meta: SchemeMetaRow | undefined,
    asOfDate: Date,
    ratingStatus: string,
  ): { historyMonths: number | null; ratedFrom: string | null } =>
    meta === undefined
      ? { historyMonths: null, ratedFrom: null }
      : ratingHistoryFor(meta.inceptionDate, asOfDate, ratingStatus as MfRatingStatus);

  const scoreByScheme = new Map<string, MfSchemeScoreDto>();
  for (const s of scores) {
    if (scoreByScheme.has(s.schemeCode)) continue;
    scoreByScheme.set(s.schemeCode, {
      schemeCode: s.schemeCode,
      asOf: isoDate(s.asOf),
      methodologyVersion: s.methodologyVersion,
      modelKey: s.modelKey as MfModelKey,
      ratingStatus: s.ratingStatus as MfRatingStatus,
      composite: serializeRatioOrNull(s.composite),
      rating: (s.rating as 1 | 2 | 3 | 4 | 5 | null) ?? null,
      // The column is the scorer's own `MfPillarScore` map, written by
      // `mfScoring`. Prisma types it as bare `JsonValue`, so the cast is the
      // boundary where the stored shape is re-asserted — the same one
      // `parsePeerRankPayload` makes for `MfPeerRank.percentiles`.
      pillars: (s.pillars ?? {}) as unknown as Record<string, MfPillarScore>,
      universeKey: s.universeKey,
      universeSize: s.universeSize,
      computedAt: s.computedAt.toISOString(),
      // Denormalised onto the score so a rating can never be rendered without
      // the SEBI risk disclosure that must sit beside it (06 §4), and so the
      // "Unrated - N months of history" copy (06 §6) has its figures. Both
      // come from the meta row already loaded in this same batch.
      riskometer: metaByScheme.get(s.schemeCode)?.riskometer ?? null,
      ...scoreRatingHistory(metaByScheme.get(s.schemeCode), s.asOf, s.ratingStatus),
    });
  }

  // `categoryMedianCagr` is the survivorship-adjusted median point-to-point
  // CAGR of the scheme's peer universe at that horizon, written by
  // `mfPeerRank.service.ts` and merged into the metrics row. It is the closest
  // thing the layer holds to `04 §6`'s "category median rolling return", and
  // it is the right one: it is the *category's* number, not the fund's, which
  // is the whole point of the projection basis.
  const categoryMedianByScheme = new Map<string, Map<number, Decimal>>();
  const terPercentileByScheme = new Map<string, Decimal>();
  const seenHorizon = new Set<string>();
  for (const m of metrics) {
    const key = `${m.schemeCode}|${m.horizonYears}`;
    if (seenHorizon.has(key)) continue;
    seenHorizon.add(key);
    const payload = m.metrics as Record<string, unknown> | null;
    if (!payload) continue;

    if (m.horizonYears === 0) {
      const pctl = (payload as { terPercentile?: unknown }).terPercentile;
      if (typeof pctl === 'string') terPercentileByScheme.set(m.schemeCode, toDecimal(pctl));
      continue;
    }
    const returns = payload.returns as { categoryMedianCagr?: unknown } | undefined;
    const median = returns?.categoryMedianCagr;
    if (typeof median !== 'string') continue;
    let byHorizon = categoryMedianByScheme.get(m.schemeCode);
    if (!byHorizon) {
      byHorizon = new Map();
      categoryMedianByScheme.set(m.schemeCode, byHorizon);
    }
    byHorizon.set(m.horizonYears, toDecimal(median));
  }

  const navSeriesByFund = new Map<string, Array<{ date: Date; nav: Decimal }>>();
  for (const n of navs) {
    // `adjustedNav` — never `nav` — is what a return series is built from
    // (`01 §2`): for an IDCW option the raw NAV steps down on every payout and
    // understates the fund's return by the whole distribution. A null means
    // "not yet backfilled", so the point is simply absent rather than silently
    // replaced by the unadjusted figure.
    if (n.adjustedNav === null) continue;
    const series = navSeriesByFund.get(n.fundId) ?? [];
    series.push({ date: n.date, nav: toDecimal(n.adjustedNav) });
    navSeriesByFund.set(n.fundId, series);
  }

  const directSiblingByScheme = await loadDirectSiblings(metas, asOf);

  return {
    metaByScheme,
    terByScheme,
    snapshotByScheme,
    scoreByScheme,
    categoryMedianByScheme,
    terPercentileByScheme,
    navSeriesByFund,
    directSiblingByScheme,
  };
}

/**
 * For every REGULAR plan held, find its DIRECT sibling (`04 §4`).
 *
 * `MfSchemeMeta.growthSiblingSchemeCode` is the *option* sibling
 * (IDCW → growth), not the plan sibling, so there is no column to follow.
 * Matching is by AMC + option type + `canonicalSchemeName` — the same
 * name-canonicalisation `mfOverlap.service.ts` already uses to spot a
 * direct/regular duplicate in the user's own book, reused rather than
 * re-derived so the two features cannot disagree about what "the same scheme"
 * means.
 *
 * A sibling that cannot be found yields no saving figure at all rather than a
 * zero: "we could not find the direct plan" and "the direct plan costs the
 * same" are different answers, and only one of them is good news.
 */
async function loadDirectSiblings(
  metas: readonly SchemeMetaRow[],
  asOf: Date,
): Promise<Map<string, { schemeCode: string; terPct: Decimal | null }>> {
  const regulars = metas.filter((m) => m.planType === 'REGULAR');
  const out = new Map<string, { schemeCode: string; terPct: Decimal | null }>();
  if (regulars.length === 0) return out;

  const amcCodes = Array.from(new Set(regulars.map((m) => m.amcCode)));
  const candidates = await prisma.mfSchemeMeta.findMany({
    where: { amcCode: { in: amcCodes }, planType: 'DIRECT', status: 'ACTIVE' },
    select: { schemeCode: true, schemeName: true, amcCode: true, optionType: true },
  });

  const byAmcAndName = new Map<string, string>();
  for (const c of candidates) {
    byAmcAndName.set(`${c.amcCode}|${c.optionType}|${canonicalSchemeName(c.schemeName)}`, c.schemeCode);
  }

  const matched: Array<{ regular: string; direct: string }> = [];
  for (const r of regulars) {
    const direct = byAmcAndName.get(
      `${r.amcCode}|${r.optionType}|${canonicalSchemeName(r.schemeName)}`,
    );
    if (direct) matched.push({ regular: r.schemeCode, direct });
  }
  if (matched.length === 0) return out;

  const siblingTers = await prisma.mfSchemeTer.findMany({
    where: { schemeCode: { in: matched.map((m) => m.direct) }, effectiveFrom: { lte: asOf } },
    orderBy: { effectiveFrom: 'desc' },
    select: { schemeCode: true, terPct: true },
  });
  const terByCode = new Map<string, Decimal>();
  for (const t of siblingTers) {
    if (!terByCode.has(t.schemeCode)) terByCode.set(t.schemeCode, toDecimal(t.terPct));
  }

  for (const m of matched) {
    out.set(m.regular, { schemeCode: m.direct, terPct: terByCode.get(m.direct) ?? null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scheme metadata → DTO
// ---------------------------------------------------------------------------

/** `MfSchemeMeta.exitLoadRules` is `[{daysUpTo, pct}]` as JSON. Parse defensively. */
function parseExitLoadRules(raw: Prisma.JsonValue | null | undefined): MfExitLoadRule[] | null {
  if (!Array.isArray(raw)) return null;
  const rules: MfExitLoadRule[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const days = rec.daysUpTo;
    const pct = rec.pct;
    if (typeof days !== 'number' || !Number.isFinite(days)) continue;
    if (typeof pct !== 'string' && typeof pct !== 'number') continue;
    rules.push({ daysUpTo: days, pct: serializePct(toDecimal(pct)) });
  }
  if (rules.length === 0) return null;
  rules.sort((a, b) => a.daysUpTo - b.daysUpTo);
  return rules;
}

/**
 * `04 §5`: the exit load that would apply if the lot were redeemed today.
 *
 * `null` means we do not know this scheme's ladder, which is a different
 * statement from "there is no load" — the type comment on
 * `MfLotDto.exitLoadPct` says so explicitly, and a zero here would understate
 * the cost of every switch recommendation built on top.
 *
 * A holding *past* the longest tier genuinely has no load, and that is a known
 * zero, so it is reported as zero rather than as unknown.
 */
function exitLoadPctFor(rules: MfExitLoadRule[] | null, holdingDays: number): Decimal | null {
  if (rules === null) return null;
  for (const rule of rules) {
    if (holdingDays <= rule.daysUpTo) return toDecimal(rule.pct);
  }
  return ZERO;
}

/**
 * Build the meta DTO for a held scheme.
 *
 * When no `MfSchemeMeta` row exists — the analytics reference tables are
 * ingested independently of the user's holdings, so a freshly-imported CAS can
 * name a scheme we have no metadata for — the fund is still returned, with a
 * stand-in built from `MutualFundMaster`. Dropping the position would be the
 * worse failure: the user's own money would silently vanish from their own
 * portfolio page. The stand-in is recognisable (`sebiSubCategory: 'UNMAPPED'`,
 * every optional field null) and the scheme also lands in
 * `fundsWithoutHoldings`, since a fund with no metadata has no disclosure
 * either.
 */
function buildMetaDto(fund: HeldFund, meta: SchemeMetaRow | undefined, asOf: Date): MfSchemeMetaDto {
  if (!meta) {
    // `inceptionDate` is non-nullable in the contract. The earliest date we
    // can defend is the user's own first transaction in the scheme; it is a
    // data-availability stand-in, not a claim about when the fund launched,
    // and `fundAgeYears` is left null so nothing downstream treats it as one.
    const firstTx = fund.txs[0]?.tradeDate ?? asOf;
    return {
      schemeCode: fund.schemeCode,
      isin: fund.masterIsin,
      schemeName: fund.schemeName,
      amcCode: '',
      amcName: '',
      sebiCategory: mapMasterCategoryToSebi(fund.masterCategory),
      sebiSubCategory: 'UNMAPPED',
      // The scheme name is the only signal we have. `detectPlanType` in
      // `mfOverlap.service.ts` returns a third value, `UNKNOWN`, which this
      // contract has no room for; an unmarked name is far more often a regular
      // plan, and that is the conservative guess for a cost comparison because
      // it keeps the fund eligible for a direct-plan saving check rather than
      // silently exempting it.
      planType: /\bdirect\b/i.test(fund.schemeName) ? 'DIRECT' : 'REGULAR',
      optionType: 'GROWTH',
      benchmarkIndexCode: null,
      inceptionDate: isoDate(firstTx),
      status: 'ACTIVE',
      statusChangedAt: null,
      predecessorSchemeCode: null,
      growthSiblingSchemeCode: null,
      riskometer: null,
      exitLoadText: null,
      exitLoadRules: null,
      minSip: null,
      fundAgeYears: null,
    };
  }

  return {
    schemeCode: meta.schemeCode,
    isin: meta.isin,
    schemeName: meta.schemeName,
    amcCode: meta.amcCode,
    amcName: meta.amcName,
    sebiCategory: meta.sebiCategory as SebiCategory,
    sebiSubCategory: meta.sebiSubCategory as SebiSubCategory | 'UNMAPPED',
    planType: meta.planType as MfPlanType,
    optionType: meta.optionType as MfOptionType,
    benchmarkIndexCode: meta.benchmarkIndexCode,
    inceptionDate: isoDate(meta.inceptionDate),
    status: meta.status as MfSchemeStatus,
    statusChangedAt: meta.statusChangedAt ? isoDate(meta.statusChangedAt) : null,
    predecessorSchemeCode: meta.predecessorSchemeCode,
    growthSiblingSchemeCode: meta.growthSiblingSchemeCode,
    riskometer: meta.riskometer,
    exitLoadText: meta.exitLoadText,
    exitLoadRules: parseExitLoadRules(meta.exitLoadRules),
    minSip: meta.minSip === null ? null : serializeMoney(meta.minSip),
    fundAgeYears: serializeRatio(yearsBetween(meta.inceptionDate, asOf)),
  };
}

/** Best-effort SEBI category for a scheme we have no `MfSchemeMeta` row for. */
function mapMasterCategoryToSebi(cat: MFCategory): SebiCategory {
  switch (cat) {
    case 'EQUITY':
    case 'ELSS':
      return 'EQUITY';
    case 'DEBT':
    case 'LIQUID':
    case 'FMP':
      return 'DEBT';
    case 'HYBRID':
      return 'HYBRID';
    case 'SOLUTION_ORIENTED':
      return 'SOLUTION_ORIENTED';
    default:
      // Index funds and ETFs are SEBI's residual bucket, not "uncategorised".
      return 'OTHER';
  }
}

/**
 * Whether a scheme is equity-oriented for **tax** purposes.
 *
 * `MfSchemeMeta.sebiCategory` is the better datum, but the realised-gains
 * engine keys off `MutualFundMaster.category` (`capitalGains.service.ts`,
 * TASK-01), and two answers to "is this fund equity-oriented" is exactly the
 * drift that task existed to remove. So the master category decides, and the
 * SEBI category is used only where the master has nothing to say.
 *
 * An unresolved category falls back to **not** equity-oriented — the
 * debt-conservative treatment (36-month threshold, no §112A grandfathering).
 * Guessing equity is the bug TASK-01 fixed.
 */
function isEquityOriented(fund: HeldFund, meta: SchemeMetaRow | undefined): boolean {
  if (fund.assetClass === 'ETF') return true;
  if (fund.masterCategory === 'EQUITY' || fund.masterCategory === 'ELSS') return true;
  if (fund.masterCategory === 'OTHER' && meta?.sebiCategory === 'EQUITY') return true;
  return false;
}

/** The scoring model this scheme falls under, for the goal-suitability matrix. */
function modelKeyFor(meta: SchemeMetaRow | undefined, score: MfSchemeScoreDto | null): MfModelKey | null {
  if (score) return score.modelKey;
  if (!meta) return null;
  const sub = resolveSubCategory(meta.sebiSubCategory);
  if (!sub) return null;
  return specFor(sub).modelKey;
}

// ---------------------------------------------------------------------------
// §1 — per-fund metrics
// ---------------------------------------------------------------------------

/**
 * `fundCagrSamePeriod` — what a lump sum on the user's first purchase date
 * would have compounded at, to `asOf`.
 *
 * This is the comparison `timingGap` is built on: the difference between what
 * the fund did and what the user got out of it. It is computed from
 * `adjustedNav`, so an IDCW plan is measured on its total return rather than
 * on the sawtooth its published NAV traces.
 */
function fundCagrOverPeriod(
  series: readonly { date: Date; nav: Decimal }[] | undefined,
  from: Date,
  to: Date,
): Decimal | null {
  if (!series || series.length < 2) return null;
  const days = daysBetween(from, to);
  if (days < MIN_CAGR_DAYS) return null;

  const start = navOnOrBefore(series, from);
  const end = navOnOrBefore(series, to);
  if (start === null || end === null) return null;
  if (start.nav.lessThanOrEqualTo(0) || end.nav.lessThanOrEqualTo(0)) return null;

  const actualDays = daysBetween(start.date, end.date);
  if (actualDays < MIN_CAGR_DAYS) return null;

  const years = actualDays / 365.25;
  const growth = end.nav.dividedBy(start.nav);
  // Fractional powers have no exact decimal form; the exponentiation happens
  // in doubles for the same reason the XIRR solver does, and the result is a
  // dimensionless rate that is never summed into a balance.
  const cagr = Math.exp(Math.log(growth.toNumber()) / years) - 1;
  if (!Number.isFinite(cagr)) return null;
  return new Decimal(cagr);
}

/** Binary search for the last NAV point at or before `d`. */
function navOnOrBefore(
  series: readonly { date: Date; nav: Decimal }[],
  d: Date,
): { date: Date; nav: Decimal } | null {
  let lo = 0;
  let hi = series.length - 1;
  let found: { date: Date; nav: Decimal } | null = null;
  const target = d.getTime();
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.date.getTime() <= target) {
      found = series[mid]!;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// §5 — tax lots
// ---------------------------------------------------------------------------

interface LotContext {
  fund: HeldFund;
  meta: SchemeMetaRow | undefined;
  metaDto: MfSchemeMetaDto;
  equityOriented: boolean;
  /** Value per unit implied by the holding itself, so lots sum to the holding. */
  unitValue: Decimal;
  /** ISIN → FMV per unit on 31-Jan-2018, union over the readable owners. */
  fmvByIsin: ReadonlyMap<string, Decimal>;
  asOf: Date;
}

function buildLots(ctx: LotContext, lots: readonly OpenLot[]): MfLotDto[] {
  const rates = ratesForDate(ctx.asOf);
  const thresholdDays = ctx.equityOriented
    ? LT_THRESHOLD_DAYS_EQUITY_ORIENTED
    : LT_THRESHOLD_DAYS_OTHER;
  const exitRules = ctx.metaDto.exitLoadRules;
  const isin = ctx.metaDto.isin ?? ctx.fund.masterIsin;

  return lots.map((lot) => {
    const holdingDays = Math.max(0, daysBetween(lot.buyDate, ctx.asOf));
    const cost = lot.costPerUnit.times(lot.units);
    const currentValue = ctx.unitValue.times(lot.units);
    const gain = currentValue.minus(cost);
    const gainType: MfGainType = holdingDays >= thresholdDays ? 'LTCG' : 'STCG';

    // §112A / §55(2)(ac): for equity-oriented units acquired on or before
    // 31-Jan-2018, the cost of acquisition is
    //   max(actual cost, min(FMV on 31-Jan-2018, full value of consideration)).
    // The inner `min` is mandatory — without it a cheap lot whose FMV exceeds
    // today's value would fabricate a loss. "Full value of consideration" here
    // is the hypothetical sale today, which is what "if sold today" means.
    let grandfatheredCost: Decimal | null = null;
    if (ctx.equityOriented && lot.buyDate <= GRANDFATHERING_CUTOFF && isin) {
      const fmvPerUnit = ctx.fmvByIsin.get(isin);
      if (fmvPerUnit) {
        const fmvBasis = fmvPerUnit.times(lot.units);
        grandfatheredCost = Decimal.max(cost, Decimal.min(fmvBasis, currentValue));
      }
    }

    const taxableBasis = grandfatheredCost ?? cost;
    const taxableGain = currentValue.minus(taxableBasis);

    const exitLoadPct = exitLoadPctFor(exitRules, holdingDays);
    const exitLoadInr = exitLoadPct === null
      ? null
      : currentValue.times(exitLoadPct).dividedBy(HUNDRED);

    return {
      schemeCode: ctx.fund.schemeCode,
      schemeName: ctx.metaDto.schemeName,
      units: serializeQuantity(lot.units),
      cost: serializeMoney(cost),
      currentValue: serializeMoney(currentValue),
      gain: serializeMoney(gain),
      purchaseDate: isoDate(lot.buyDate),
      holdingDays,
      gainType,
      daysToLtcg: gainType === 'STCG' ? Math.max(0, thresholdDays - holdingDays) : null,
      grandfatheredCost: grandfatheredCost === null ? null : serializeMoney(grandfatheredCost),
      exitLoadPct: exitLoadPct === null ? null : serializePct(exitLoadPct),
      exitLoadInr: exitLoadInr === null ? null : serializeMoney(exitLoadInr),
      taxIfSoldTodayInr: taxIfSoldToday(taxableGain, gainType, ctx.equityOriented, rates),
      harvestableLossInr: gain.isNegative() ? serializeMoney(gain.negated()) : null,
    };
  });
}

/**
 * Tax on this lot if it were redeemed today, **at the statutory capital-gains
 * rate and never at the income slab** (`CONTEXT.md §9.8`). Getting this wrong
 * overstates the benefit of every harvest and switch recommendation built on
 * top of it, in the direction that sells the recommendation.
 *
 * Three outcomes, and the difference between the last two matters:
 *
 *  - a loss owes nothing — a **known** zero;
 *  - equity-oriented gains have their own statutory rates (§111A / §112A),
 *    applied here *before* the §112A annual exemption. The exemption is an
 *    annual aggregate across the whole portfolio, so it is applied once at
 *    portfolio level through `ltcgExemptionHeadroomInr`; applying it per lot
 *    would grant it once per lot. Summing these lot figures therefore
 *    overstates the bill by up to the remaining headroom, and the headroom is
 *    published beside them so the reader can net it off;
 *  - short-term gains on a non-equity-oriented fund are taxed at the
 *    **slab**, which is genuinely the statute here and is genuinely not
 *    something we know — the user's slab is not on file, and
 *    `ratesForDate().slabPct` is a top-bracket placeholder, not a fact.
 *    That returns `null`, not a guess and not a zero.
 */
function taxIfSoldToday(
  taxableGain: Decimal,
  gainType: MfGainType,
  equityOriented: boolean,
  rates: ReturnType<typeof ratesForDate>,
): Money | null {
  if (taxableGain.lessThanOrEqualTo(0)) return serializeMoney(ZERO);

  if (equityOriented) {
    const ratePct = gainType === 'LTCG' ? rates.ltcgEquityPct : rates.stcgEquityPct;
    return serializeMoney(taxableGain.times(ratePct).dividedBy(HUNDRED));
  }
  if (gainType === 'LTCG') {
    // Post-Finance-Act-2024: 12.5% flat, no indexation for units acquired
    // after 1-Apr-2023. Indexation for older debt lots is a §112 question the
    // realised engine answers with a CII lookup; an unrealised figure has no
    // sale year to index to, so the non-indexed statutory rate is the honest
    // upper bound and is labelled as the statutory rate, not as a forecast.
    return serializeMoney(taxableGain.times(rates.ltcgOtherNonIndexedPct).dividedBy(HUNDRED));
  }
  return null;
}

// ---------------------------------------------------------------------------
// §2 — overlap
// ---------------------------------------------------------------------------

interface SnapshotWeights {
  schemeCode: string;
  asOf: Date;
  /** ISIN (or name, when unresolved) → weight in percent of the fund. */
  equityByKey: Map<string, Decimal>;
  /** Issuer → weight in percent of the fund. */
  debtByIssuer: Map<string, Decimal>;
  nameByKey: Map<string, string>;
}

function snapshotWeights(snap: SnapshotRow): SnapshotWeights {
  const equityByKey = new Map<string, Decimal>();
  const debtByIssuer = new Map<string, Decimal>();
  const nameByKey = new Map<string, string>();

  for (const h of snap.holdings) {
    const w = toDecimal(h.weightPct);
    if (h.kind === 'EQUITY') {
      // An unresolved ISIN keeps its name and is still counted (`01 §4`);
      // dropping it would understate concentration. The name is a weaker key
      // than an ISIN and can only match another fund that spelled it the same
      // way, which is the honest limit of what we can assert.
      const key = h.isin ?? `name:${h.securityName.trim().toLowerCase()}`;
      equityByKey.set(key, (equityByKey.get(key) ?? ZERO).plus(w));
      if (!nameByKey.has(key)) nameByKey.set(key, h.securityName);
    } else if (h.kind === 'DEBT' && h.issuer) {
      // `04 §2`: debt overlap is by ISSUER, not by security. Two different
      // bonds of the same issuer are the same credit exposure, and an
      // ISIN-keyed comparison would report zero overlap between two funds
      // that both have 8% in the same NBFC.
      const key = h.issuer.trim().toLowerCase();
      debtByIssuer.set(key, (debtByIssuer.get(key) ?? ZERO).plus(w));
      if (!nameByKey.has(key)) nameByKey.set(key, h.issuer);
    }
  }
  return { schemeCode: snap.schemeCode, asOf: snap.asOf, equityByKey, debtByIssuer, nameByKey };
}

interface OverlapInputs {
  schemeCode: string;
  schemeName: string;
  weightFraction: Decimal;
  sebiSubCategory: string;
  weights: SnapshotWeights;
}

/**
 * Pairwise overlap for one keying (ISIN for equity, issuer for debt).
 *
 * **Units.** `overlapPct` is a `Pct`: `50.000000` means half the two books are
 * the same securities. The doc comment on `MfOverlapPair.overlapPct` in the
 * shared types says "0.50 = half", which is the `Ratio` convention and
 * contradicts the branded type it is attached to. `Pct` wins: the brand exists
 * precisely to stop a percent being carried in a fraction-shaped field, the
 * source weights (`MfPortfolioHolding.weightPct`) are already percent, and the
 * field name ends in `Pct`. Consumers comparing against a fractional threshold
 * (`DEFAULT_MF_RULE_CONSTANTS.redundantFundsOverlapFloor`) must scale it.
 */
function buildOverlapPairs(
  funds: readonly OverlapInputs[],
  pick: (w: SnapshotWeights) => Map<string, Decimal>,
): { pairs: MfOverlapPair[]; weighted: WeightedPairOverlap[] } {
  const pairs: MfOverlapPair[] = [];
  const weighted: WeightedPairOverlap[] = [];

  for (let i = 0; i < funds.length; i += 1) {
    for (let j = i + 1; j < funds.length; j += 1) {
      const a = funds[i]!;
      const b = funds[j]!;
      // `04 §2`: same `asOf`, or nearest within a month. Beyond that the two
      // disclosures describe different markets and min() of their weights is
      // not an overlap.
      const gap = Math.abs(daysBetween(a.weights.asOf, b.weights.asOf));
      if (gap > SNAPSHOT_PAIR_MAX_GAP_DAYS) continue;

      const wa: WeightsByKey = pick(a.weights);
      const wb: WeightsByKey = pick(b.weights);
      if (wa.size === 0 || wb.size === 0) continue;

      const overlap = weightOverlap(wa, wb);
      if (overlap.lessThanOrEqualTo(0)) continue;

      const shared = sharedWeights(wa, wb, TOP_SHARED_LIMIT);
      pairs.push({
        schemeCodeA: a.schemeCode,
        schemeCodeB: b.schemeCode,
        schemeNameA: a.schemeName,
        schemeNameB: b.schemeName,
        overlapPct: serializePct(overlap),
        sameSubCategory:
          a.sebiSubCategory !== 'UNMAPPED' && a.sebiSubCategory === b.sebiSubCategory,
        snapshotAsOfA: isoDate(a.weights.asOf),
        snapshotAsOfB: isoDate(b.weights.asOf),
        topShared: shared.map((s) => ({
          isin: s.key.startsWith('name:') ? null : s.key,
          securityName: a.weights.nameByKey.get(s.key) ?? b.weights.nameByKey.get(s.key) ?? s.key,
          weightInA: serializePct(s.weightInA),
          weightInB: serializePct(s.weightInB),
        })),
      });
      // The redundancy score is a *fraction* (`Ratio`), so the percent overlap
      // is divided by 100 exactly once, here.
      weighted.push({
        overlap: overlap.dividedBy(HUNDRED),
        weightA: a.weightFraction,
        weightB: b.weightFraction,
      });
    }
  }

  pairs.sort((x, y) => toDecimal(y.overlapPct).comparedTo(toDecimal(x.overlapPct)));
  return { pairs, weighted };
}

// ---------------------------------------------------------------------------
// §3 — look-through
// ---------------------------------------------------------------------------

/**
 * Advisor asset buckets the MF book maps onto, so the target comparison speaks
 * the same vocabulary as `/advisor`'s REBALANCE rule and the two pages cannot
 * disagree about whether a portfolio has drifted.
 */
const HOLDING_KIND_TO_BUCKET: Record<string, string> = {
  EQUITY: 'EQUITY_DOMESTIC',
  DEBT: 'DEBT',
  CASH: 'CASH_EQUIVALENT',
  GOLD: 'GOLD',
  REIT_INVIT: 'REAL_ASSETS',
  DERIVATIVE: 'OTHER_ALT',
  OTHER: 'OTHER_ALT',
};

interface LookThroughInput {
  schemeCode: string;
  schemeName: string;
  /** Fund's fractional weight in the MF book. */
  weightFraction: Decimal;
  snapshot: SnapshotRow | undefined;
}

function buildLookThrough(
  inputs: readonly LookThroughInput[],
  mfValue: Decimal,
  netWorthFloor: Decimal,
  target: MfAllocationComparison | null,
): MfLookThrough {
  const stocks = new Map<string, {
    isin: string | null;
    name: string;
    weight: Decimal;
    contributors: Array<{ schemeCode: string; schemeName: string; weightPct: Pct }>;
  }>();
  const sectors = new Map<string, Decimal>();
  const cap = { large: ZERO, mid: ZERO, small: ZERO, unclassified: ZERO };
  const credit = new Map<string, Decimal>();
  const byKind = new Map<string, Decimal>();
  const fundsWithoutHoldings: string[] = [];
  let sawDebt = false;

  for (const input of inputs) {
    if (!input.snapshot || input.snapshot.holdings.length === 0) {
      // `04 §3` is explicit: these must be listed. Every aggregate below is a
      // FLOOR without them, and silently omitting a fund makes the sectors
      // add up to something that looks complete and is not.
      fundsWithoutHoldings.push(input.schemeCode);
      continue;
    }

    for (const h of input.snapshot.holdings) {
      // `weight_in_portfolio (fraction) x holding_weight (percent)` = percent
      // of the whole MF book. Deliberately NOT renormalised over the funds we
      // do have disclosures for: renormalising would turn a floor into a
      // confident total and hide the gap `fundsWithoutHoldings` reports.
      const effective = input.weightFraction.times(toDecimal(h.weightPct));
      if (effective.lessThanOrEqualTo(0)) continue;

      const kindBucket = h.kind;
      byKind.set(kindBucket, (byKind.get(kindBucket) ?? ZERO).plus(effective));

      if (h.sector) {
        sectors.set(h.sector, (sectors.get(h.sector) ?? ZERO).plus(effective));
      }

      if (h.kind === 'EQUITY') {
        const key = h.isin ?? `name:${h.securityName.trim().toLowerCase()}`;
        const existing = stocks.get(key);
        const contributor = {
          schemeCode: input.schemeCode,
          schemeName: input.schemeName,
          weightPct: serializePct(toDecimal(h.weightPct)),
        };
        if (existing) {
          existing.weight = existing.weight.plus(effective);
          existing.contributors.push(contributor);
        } else {
          stocks.set(key, {
            isin: h.isin,
            name: h.securityName,
            weight: effective,
            contributors: [contributor],
          });
        }

        switch (h.marketCapBucket) {
          case 'LARGE': cap.large = cap.large.plus(effective); break;
          case 'MID': cap.mid = cap.mid.plus(effective); break;
          case 'SMALL': cap.small = cap.small.plus(effective); break;
          default:
            // ISINs we could not place on the AMFI half-yearly list. Reported,
            // not hidden — folding them into "large" is how a small-cap-heavy
            // book comes to look conservative.
            cap.unclassified = cap.unclassified.plus(effective);
        }
      }

      if (h.kind === 'DEBT') {
        sawDebt = true;
        const rating = (h.creditRating ?? 'Unrated').trim();
        credit.set(rating, (credit.get(rating) ?? ZERO).plus(effective));
      }
    }
  }

  const mfShareOfNetWorth = fractionOf(mfValue, netWorthFloor);

  const topStocks: MfLookThroughStock[] = [...stocks.values()]
    .sort((a, b) => b.weight.comparedTo(a.weight))
    .slice(0, TOP_STOCKS_LIMIT)
    .map((s) => ({
      isin: s.isin,
      securityName: s.name,
      effectiveWeightPct: serializePct(s.weight),
      // A stock's share of net worth is its share of the MF book scaled by the
      // book's share of net worth. Null when we have no denominator — a
      // restricted family view has a floor for net worth, and the caller is
      // told so through `scope.hiddenCategories`.
      effectiveWeightOfNetWorthPct: mfShareOfNetWorth === null
        ? null
        : serializePct(s.weight.times(mfShareOfNetWorth)),
      contributors: s.contributors.sort((a, b) =>
        toDecimal(b.weightPct).comparedTo(toDecimal(a.weightPct)),
      ),
    }));

  return {
    topStocks,
    sectors: Object.fromEntries([...sectors.entries()].map(([k, v]) => [k, serializePct(v)])),
    // Nifty 500 TRI sector weights need an index-constituents table, which the
    // layer does not have. `null` says "no reference to compare against"; an
    // empty object would say "the benchmark has no sectors".
    sectorsBenchmark: null,
    marketCap: {
      large: serializePct(cap.large),
      mid: serializePct(cap.mid),
      small: serializePct(cap.small),
      unclassified: serializePct(cap.unclassified),
    },
    // Null, not an all-zero split, when the book holds no debt at all: a split
    // of zeros asserts a measured credit profile that happens to be empty.
    credit: sawDebt ? buildCreditSplit(credit) : null,
    assetClass: Object.fromEntries([...byKind.entries()].map(([k, v]) => [k, serializePct(v)])),
    target,
    fundsWithoutHoldings,
  };
}

/**
 * Normalise the disclosed rating strings onto `MfCreditQualitySplit`.
 *
 * `MfPortfolioHolding.creditRating` is already normalised at ingest onto the
 * fixed ordinal scale in `01 §4`, so this is a bucketing, not a parser. Ratings
 * that fall outside the scale land in `unrated`, which is where an unknown
 * credit belongs — not in `aaa`.
 */
function buildCreditSplit(byRating: ReadonlyMap<string, Decimal>): MfCreditQualitySplit {
  const acc = { sov: ZERO, aaa: ZERO, aaPlus: ZERO, aa: ZERO, aaMinus: ZERO, aAndBelow: ZERO, unrated: ZERO };
  for (const [rating, weight] of byRating) {
    const r = rating.toUpperCase().replace(/\s+/g, '');
    if (r === 'SOV' || r === 'SOVEREIGN') acc.sov = acc.sov.plus(weight);
    else if (r === 'AAA' || r === 'A1+') acc.aaa = acc.aaa.plus(weight);
    else if (r === 'AA+') acc.aaPlus = acc.aaPlus.plus(weight);
    else if (r === 'AA') acc.aa = acc.aa.plus(weight);
    else if (r === 'AA-') acc.aaMinus = acc.aaMinus.plus(weight);
    else if (/^(A|BBB|BB|B|C|D)/.test(r)) acc.aAndBelow = acc.aAndBelow.plus(weight);
    else acc.unrated = acc.unrated.plus(weight);
  }
  return {
    sov: serializePct(acc.sov),
    aaa: serializePct(acc.aaa),
    aaPlus: serializePct(acc.aaPlus),
    aa: serializePct(acc.aa),
    aaMinus: serializePct(acc.aaMinus),
    aAndBelow: serializePct(acc.aAndBelow),
    unrated: serializePct(acc.unrated),
  };
}

/**
 * Target-vs-actual against the user's active `ModelPortfolioVersion`
 * (`04 §3`).
 *
 * The tolerance is `REBALANCE_BAND_PP`, imported from `@portfolioos/shared`
 * and re-exported by `services/advisor/constants.ts`, because `04 §3` requires
 * this page and the advisor's REBALANCE rule to use one band. A portfolio
 * called drifted on one page and not the other is worse than either answer.
 *
 * **Scope caveat, stated because the number invites misreading:** `actual` is
 * the composition of the *MF book*, since that is all this analysis loads. The
 * model portfolio is a whole-portfolio target. For a user whose investable
 * assets are mostly funds these coincide; for one with a large direct-equity
 * or deposit book they do not, and the drift shown here is the drift of the
 * fund sleeve alone. `/advisor`'s REBALANCE rule is the whole-portfolio view.
 */
async function loadTargetComparison(
  scope: EffectiveScope,
  assetClassSplit: ReadonlyMap<string, Decimal>,
): Promise<MfAllocationComparison | null> {
  // The target is the *caller's* own model portfolio. A household aggregate
  // has no single risk profile, and picking one member's would silently
  // measure everyone against that member's risk appetite.
  const assessment = await prisma.riskProfileAssessment.findFirst({
    where: { userId: scope.callerId, modelPortfolioId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { modelPortfolioId: true },
  });
  if (!assessment?.modelPortfolioId) return null;

  const model = await prisma.modelPortfolio.findFirst({
    where: { id: assessment.modelPortfolioId, isActive: true },
    select: {
      name: true,
      versions: { orderBy: { version: 'desc' }, take: 1, select: { targetWeights: true } },
    },
  });
  const version = model?.versions[0];
  if (!model || !version) return null;

  const raw = version.targetWeights;
  if (!Array.isArray(raw)) return null;

  const target: Record<string, Pct> = {};
  const targetByBucket = new Map<string, Decimal>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const bucket = rec.bucket;
    const pct = rec.targetPct;
    if (typeof bucket !== 'string') continue;
    if (typeof pct !== 'number' && typeof pct !== 'string') continue;
    const value = toDecimal(pct);
    targetByBucket.set(bucket, value);
    target[bucket] = serializePct(value);
  }
  if (targetByBucket.size === 0) return null;

  // Fold the disclosure's holding kinds into advisor buckets, then restate as
  // a share of the MF book so the two sides of the comparison are both
  // percentages of the same thing.
  const actualByBucket = new Map<string, Decimal>();
  let totalDisclosed = ZERO;
  for (const [kind, weight] of assetClassSplit) {
    const bucket = HOLDING_KIND_TO_BUCKET[kind] ?? 'OTHER_ALT';
    actualByBucket.set(bucket, (actualByBucket.get(bucket) ?? ZERO).plus(weight));
    totalDisclosed = totalDisclosed.plus(weight);
  }
  if (totalDisclosed.lessThanOrEqualTo(0)) return null;

  const actual: Record<string, Pct> = {};
  const drift: Record<string, Pct> = {};
  const outsideTolerance: string[] = [];
  const buckets = new Set<string>([...targetByBucket.keys(), ...actualByBucket.keys()]);
  for (const bucket of buckets) {
    // Renormalised over the disclosed part of the book: unlike the look-through
    // aggregates, a drift figure is a *comparison of shares*, and shares that
    // do not sum to 100 would report a spurious under-allocation in every
    // bucket at once for a book whose disclosures are incomplete.
    const actualPct = (actualByBucket.get(bucket) ?? ZERO)
      .dividedBy(totalDisclosed)
      .times(HUNDRED);
    const targetPct = targetByBucket.get(bucket) ?? ZERO;
    const d = actualPct.minus(targetPct);
    actual[bucket] = serializePct(actualPct);
    target[bucket] = serializePct(targetPct);
    drift[bucket] = serializePct(d);
    if (d.abs().greaterThan(REBALANCE_BAND_PP)) outsideTolerance.push(bucket);
  }

  return { model: model.name, actual, target, drift, outsideTolerance };
}

// ---------------------------------------------------------------------------
// §6 — goal fit
// ---------------------------------------------------------------------------

interface GoalFitInput {
  funds: ReadonlyMap<string, HeldFund>;
  /** fundId → the scheme's model key, where known. */
  modelKeyByFund: ReadonlyMap<string, MfModelKey | null>;
  /** fundId → SEBI sub-category, for the small/mid-cap horizon override. */
  subCategoryByFund: ReadonlyMap<string, string>;
  /** fundId → category-median CAGR by horizon. */
  categoryMedianByFund: ReadonlyMap<string, ReadonlyMap<number, Decimal>>;
  asOf: Date;
}

/**
 * Goal fit for every goal the caller has mapped to a portfolio.
 *
 * **The mapping.** `04 §6` says to check for an existing goal→scheme mapping
 * before adding one. There is one: `Goal.portfolioIds`. There is no `goalId`
 * on `SipPlan` and no `GoalHoldingLink` table, and adding either is a schema
 * change this task does not own. So a goal's schemes are the MF schemes held
 * inside its linked portfolios — which is also how `goals.service.ts` already
 * computes goal progress, so the two cannot disagree about which money is
 * earmarked for which goal.
 */
async function buildGoalFits(
  scope: EffectiveScope,
  input: GoalFitInput,
): Promise<MfGoalFitDto[]> {
  // Goals are a capped *category*, not an asset class. `null` is unrestricted
  // and `[]` is deny-all here too.
  if (scope.allowedCategories !== null && !scope.allowedCategories.includes('GOAL')) return [];

  const goals = await prisma.goal.findMany({
    where: { userId: scope.callerId, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      targetDate: true,
      targetAmount: true,
      inflationRate: true,
      portfolioIds: true,
    },
  });
  if (goals.length === 0) return [];

  // fundId → the portfolios it is held in, so a goal's portfolio list can be
  // resolved to schemes without a query per goal.
  const portfoliosByFund = new Map<string, Set<string>>();
  for (const fund of input.funds.values()) {
    for (const tx of fund.txs) {
      const set = portfoliosByFund.get(fund.fundId) ?? new Set<string>();
      set.add(tx.portfolioId);
      portfoliosByFund.set(fund.fundId, set);
    }
  }

  const out: MfGoalFitDto[] = [];
  for (const goal of goals) {
    const linked = new Set(goal.portfolioIds);
    if (linked.size === 0) continue;

    const goalFunds = [...input.funds.values()].filter((f) => {
      const ports = portfoliosByFund.get(f.fundId);
      if (!ports) return false;
      for (const p of ports) if (linked.has(p)) return true;
      return false;
    });
    if (goalFunds.length === 0) continue;

    const horizonYears = yearsBetween(input.asOf, goal.targetDate);
    const { suitability, reason } = assessSuitability(goalFunds, input, horizonYears);

    const currentValue = goalFunds.reduce((acc, f) => acc.plus(f.currentValue), ZERO);
    const projected = projectAtCategoryMedian(goalFunds, input, horizonYears, currentValue);

    // The target is restated at the goal's own inflation assumption where one
    // is set, using the same compounding `goals.service.ts` shows the user, so
    // the shortfall here and the shortfall there are the same number.
    const targetValue = inflationAdjustedTarget(
      toDecimal(goal.targetAmount),
      goal.inflationRate === null ? null : toDecimal(goal.inflationRate),
      Math.max(horizonYears, 0),
    ) ?? toDecimal(goal.targetAmount);

    out.push({
      goalId: goal.id,
      goalName: goal.name,
      targetDate: isoDate(goal.targetDate),
      horizonYears: serializeRatio(horizonYears),
      schemeCodes: goalFunds.map((f) => f.schemeCode),
      suitability,
      reason,
      projectedValue: projected === null ? null : serializeMoney(projected),
      projectionBasis: 'CATEGORY_MEDIAN_ROLLING',
      targetValue: serializeMoney(targetValue),
      // Null, not zero, when we could not project: "no shortfall" and "we
      // cannot tell you whether there is one" must not render the same.
      shortfall: projected === null
        ? null
        : serializeMoney(Decimal.max(ZERO, targetValue.minus(projected))),
    });
  }
  return out;
}

function assessSuitability(
  goalFunds: readonly HeldFund[],
  input: GoalFitInput,
  horizonYears: number,
): { suitability: MfGoalFitDto['suitability']; reason: string } {
  const mismatched: string[] = [];
  const underpowered: string[] = [];

  for (const fund of goalFunds) {
    const modelKey = input.modelKeyByFund.get(fund.fundId) ?? null;
    if (!modelKey) continue; // Unknown mandate: no claim either way.
    const band = GOAL_HORIZON_BANDS[modelKey];
    const sub = input.subCategoryByFund.get(fund.fundId) ?? '';
    const min = isSmallOrMidCapMandate(sub)
      ? Math.max(band.min, SMALL_MID_CAP_MIN_HORIZON_YEARS)
      : band.min;

    if (horizonYears < min) mismatched.push(fund.schemeName);
    else if (band.max !== null && horizonYears > band.max) underpowered.push(fund.schemeName);
  }

  if (mismatched.length > 0) {
    return {
      suitability: 'MISMATCH',
      reason:
        `${mismatched.join(', ')} needs a longer runway than this goal's ` +
        `${horizonYears.toFixed(1)}-year horizon: a drawdown near the target date ` +
        'cannot be waited out.',
    };
  }
  if (underpowered.length > 0) {
    return {
      suitability: 'UNDERPOWERED',
      reason:
        `${underpowered.join(', ')} is built for short horizons; over ` +
        `${horizonYears.toFixed(1)} years its expected return is unlikely to reach the target.`,
    };
  }
  return {
    suitability: 'SUITABLE',
    reason: `Every mapped scheme's mandate fits a ${horizonYears.toFixed(1)}-year horizon.`,
  };
}

/** Small- and mid-cap mandates, from the SEBI cap band rather than the name. */
function isSmallOrMidCapMandate(sub: string): boolean {
  const resolved = resolveSubCategory(sub);
  if (!resolved) return false;
  const band = specFor(resolved).capBand;
  return Boolean(band?.minSmallPct || band?.minMidPct);
}

/**
 * Project the goal's mapped funds to the target date **at the category median
 * rolling return, never at the fund's own past return** (`04 §6`).
 *
 * Using the fund's own history is the classic over-promise and the number
 * every brochure quotes: a fund that has just had three exceptional years
 * projects a corpus nobody should plan around. The category median is a claim
 * about the asset class, which is what a 15-year projection can actually
 * support. `projectionBasis` records which basis was used so the claim travels
 * with the number.
 *
 * `null` — not a fallback rate — when no mapped fund has a category median on
 * file. Substituting a house assumption would present a guess in the same
 * field as a measurement.
 */
function projectAtCategoryMedian(
  goalFunds: readonly HeldFund[],
  input: GoalFitInput,
  horizonYears: number,
  currentValue: Decimal,
): Decimal | null {
  if (horizonYears <= 0 || currentValue.lessThanOrEqualTo(0)) return null;

  // Value-weighted mean of the per-fund category medians, at the horizon
  // closest to the goal's own.
  let weighted = ZERO;
  let covered = ZERO;
  for (const fund of goalFunds) {
    const byHorizon = input.categoryMedianByFund.get(fund.fundId);
    if (!byHorizon || byHorizon.size === 0) continue;
    let best: { horizon: number; value: Decimal } | null = null;
    for (const [horizon, value] of byHorizon) {
      if (best === null || Math.abs(horizon - horizonYears) < Math.abs(best.horizon - horizonYears)) {
        best = { horizon, value };
      }
    }
    if (!best) continue;
    weighted = weighted.plus(best.value.times(fund.currentValue));
    covered = covered.plus(fund.currentValue);
  }
  if (covered.lessThanOrEqualTo(0)) return null;

  const rate = weighted.dividedBy(covered);
  // `inflationAdjustedTarget` is `PV x (1 + r)^n` with no inflation semantics
  // of its own; reusing it means the goal page and this page compound
  // identically rather than through two hand-written pow() calls.
  return inflationAdjustedTarget(currentValue, rate, horizonYears);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Compute the full `04` analysis for a scope.
 *
 * Reads only. There is no `prisma.$transaction` anywhere in this file, and no
 * `runInTransaction` either — nothing here writes, so there is nothing to make
 * atomic. Persisting the result onto `MfAnalysisRun.portfolioAnalysis` belongs
 * to the engine (Task 5.4), and when that write lands it must use
 * `runInTransaction` from `lib/prisma.ts`: `$transaction` is not atomic for
 * user-scoped models, because the RLS hook re-dispatches each operation onto
 * its own connection (`CONTEXT.md §5`).
 */
export async function computeMfPortfolioAnalysis(
  scope: EffectiveScope,
  opts: MfPortfolioAnalysisOptions = {},
): Promise<MfPortfolioAnalysisDto> {
  const asOf = opts.asOf ?? new Date();
  const runId = opts.runId ?? UNPERSISTED_RUN_ID;
  const scopeHonesty = buildScopeHonesty(scope);

  // §7: one book per readable member, each loaded under that member's own RLS
  // context, then merged. `readableUserIds` says who may be read; the caps
  // above say what of them may be seen. Both are applied — `readableUserIds`
  // alone is not an authorisation decision (`CONTEXT.md §6`).
  const books = await Promise.all(
    scope.readableUserIds.map((userId) => loadMemberBook(scope, userId, asOf)),
  );
  const { funds, netWorthFloor, activeSipFundIds } = mergeBooks(books);

  if (funds.size === 0) {
    // Still compute the tax block. There are no lots, but the §112A headroom
    // is a property of the financial year and the caller's realised gains, not
    // of whether they happen to hold a fund today — returning the raw
    // statutory allowance here and a netted one everywhere else would make the
    // same user see two different headrooms depending on their holdings.
    const tax = await buildTaxSummary(scope, [], asOf);
    return emptyAnalysis(asOf, runId, scopeHonesty, tax);
  }

  const ref = await loadReferenceData(funds, asOf);

  // §112A FMV overrides are per-user. In a household view the union is taken:
  // an FMV is a fact about an ISIN on 31-Jan-2018, not about a person, so a
  // value one member has recorded is the right one for a merged lot.
  const fmvByIsin = new Map<string, Decimal>();
  for (const userId of scope.readableUserIds) {
    const perUser = await asMember(scope, userId, () => getFmvForUser(userId));
    for (const [isin, record] of perUser) {
      if (!fmvByIsin.has(isin)) fmvByIsin.set(isin, record.fmvPerUnit);
    }
  }

  const mfValue = [...funds.values()].reduce((acc, f) => acc.plus(f.currentValue), ZERO);

  // -- §1: per fund ---------------------------------------------------------
  const fundDtos: MfHeldFundDto[] = [];
  const allLots: MfLotDto[] = [];
  const allFlows: Flow[] = [];
  const modelKeyByFund = new Map<string, MfModelKey | null>();
  const subCategoryByFund = new Map<string, string>();
  const categoryMedianByFund = new Map<string, ReadonlyMap<number, Decimal>>();
  const overlapInputs: OverlapInputs[] = [];
  const lookThroughInputs: LookThroughInput[] = [];
  const costRows: MfCostSummary['byFund'] = [];

  let weightedTerNumerator = ZERO;
  let terKnownValue = ZERO;
  let directPlanSavings = ZERO;
  let weightedTerPercentileNumerator = ZERO;
  let terPercentileKnownValue = ZERO;
  let equityFundCount = 0;

  for (const fund of funds.values()) {
    const meta = ref.metaByScheme.get(fund.schemeCode);
    const metaDto = buildMetaDto(fund, meta, asOf);
    const score = ref.scoreByScheme.get(fund.schemeCode) ?? null;
    const equityOriented = isEquityOriented(fund, meta);
    if (equityOriented) equityFundCount += 1;

    modelKeyByFund.set(fund.fundId, modelKeyFor(meta, score));
    subCategoryByFund.set(fund.fundId, meta?.sebiSubCategory ?? 'UNMAPPED');
    const medians = ref.categoryMedianByScheme.get(fund.schemeCode);
    if (medians) categoryMedianByFund.set(fund.fundId, medians);

    const lots = openLotsFifo(fund.txs);
    const investedValue = lots.reduce(
      (acc, l) => acc.plus(l.costPerUnit.times(l.units)),
      ZERO,
    );
    const openUnits = lots.reduce((acc, l) => acc.plus(l.units), ZERO);

    // Lots are valued at the unit price the *holding* implies, not at a NAV
    // looked up separately, so `Σ lot.currentValue === fund.currentValue`
    // exactly. A tax page whose lots do not add up to the holding they came
    // from cannot be audited by the person reading it.
    const unitValue = openUnits.greaterThan(0)
      ? fund.currentValue.dividedBy(openUnits)
      : ZERO;

    const lotDtos = buildLots(
      { fund, meta, metaDto, equityOriented, unitValue, fmvByIsin, asOf },
      lots,
    );
    allLots.push(...lotDtos);

    const flows = userFlows(fund.txs);
    allFlows.push(...flows);
    const xirrOutcome = solveXirr(flows, fund.currentValue, asOf);

    const firstBuy = lots[0]?.buyDate ?? fund.txs[0]?.tradeDate ?? null;
    const holdingPeriodDays = firstBuy === null ? 0 : Math.max(0, daysBetween(firstBuy, asOf));
    const fundCagr = firstBuy === null
      ? null
      : fundCagrOverPeriod(ref.navSeriesByFund.get(fund.fundId), firstBuy, asOf);

    const absoluteGain = fund.currentValue.minus(investedValue);
    const weightFraction = fractionOf(fund.currentValue, mfValue) ?? ZERO;

    fundDtos.push({
      schemeCode: fund.schemeCode,
      meta: metaDto,
      units: serializeQuantity(openUnits),
      investedValue: serializeMoney(investedValue),
      currentValue: serializeMoney(fund.currentValue),
      absoluteGain: serializeMoney(absoluteGain),
      absoluteGainPct: fractionToPctOrNull(fractionOf(absoluteGain, investedValue)),
      userXirr: xirrOutcome.value,
      userXirrStatus: xirrOutcome.status,
      ...(xirrOutcome.reason ? { userXirrStatusReason: xirrOutcome.reason } : {}),
      fundCagrSamePeriod: serializeRatioOrNull(fundCagr),
      // Reported, never moralised (`04 §1`). Negative means the user's entry
      // and exit timing cost them relative to a lump sum on day one; that is
      // an observation about cash-flow timing, not about the investor.
      timingGap:
        xirrOutcome.value !== null && fundCagr !== null
          ? serializeRatio(toDecimal(xirrOutcome.value).minus(fundCagr))
          : null,
      holdingPeriodDays,
      sipActive: activeSipFundIds.has(fund.fundId),
      weightInMfPortfolio: fractionToPct(weightFraction),
      weightInNetWorth: fractionToPctOrNull(fractionOf(fund.currentValue, netWorthFloor)),
      score,
      lots: lotDtos,
    });

    // -- §4: cost ----------------------------------------------------------
    const terPct = ref.terByScheme.get(fund.schemeCode) ?? null;
    if (terPct !== null) {
      weightedTerNumerator = weightedTerNumerator.plus(terPct.times(fund.currentValue));
      terKnownValue = terKnownValue.plus(fund.currentValue);
    }
    const terPercentile = ref.terPercentileByScheme.get(fund.schemeCode) ?? null;
    if (terPercentile !== null) {
      weightedTerPercentileNumerator = weightedTerPercentileNumerator.plus(
        terPercentile.times(fund.currentValue),
      );
      terPercentileKnownValue = terPercentileKnownValue.plus(fund.currentValue);
    }

    const sibling = ref.directSiblingByScheme.get(fund.schemeCode) ?? null;
    let annualSavings: Decimal | null = null;
    if (sibling && sibling.terPct !== null && terPct !== null) {
      const delta = terPct.minus(sibling.terPct);
      // Only a positive delta is a saving. A direct plan that costs more than
      // its regular sibling is a data error, and reporting it as a negative
      // "saving" would net against real savings elsewhere in the book.
      if (delta.greaterThan(0)) {
        annualSavings = delta.times(fund.currentValue).dividedBy(HUNDRED);
        directPlanSavings = directPlanSavings.plus(annualSavings);
      } else {
        annualSavings = ZERO;
      }
    }
    costRows.push({
      schemeCode: fund.schemeCode,
      terPct: terPct === null ? null : serializePct(terPct),
      directSiblingSchemeCode: sibling?.schemeCode ?? null,
      directSiblingTerPct: sibling?.terPct == null ? null : serializePct(sibling.terPct),
      annualSavingsInr: annualSavings === null ? null : serializeMoney(annualSavings),
    });

    // -- §2/§3 inputs ------------------------------------------------------
    const snapshot = ref.snapshotByScheme.get(fund.schemeCode);
    lookThroughInputs.push({
      schemeCode: fund.schemeCode,
      schemeName: metaDto.schemeName,
      weightFraction,
      snapshot,
    });
    if (snapshot) {
      overlapInputs.push({
        schemeCode: fund.schemeCode,
        schemeName: metaDto.schemeName,
        weightFraction,
        sebiSubCategory: metaDto.sebiSubCategory,
        weights: snapshotWeights(snapshot),
      });
    }
  }

  fundDtos.sort((a, b) => toDecimal(b.currentValue).comparedTo(toDecimal(a.currentValue)));

  // -- §2: overlap ----------------------------------------------------------
  const equityOverlap = buildOverlapPairs(overlapInputs, (w) => w.equityByKey);
  const debtOverlap = buildOverlapPairs(overlapInputs, (w) => w.debtByIssuer);
  const fundWeights = [...funds.values()].map(
    (f) => fractionOf(f.currentValue, mfValue) ?? ZERO,
  );
  const effFundCount = effectiveFundCount(fundWeights);
  // Redundancy is measured on the equity overlap only: two debt funds sharing
  // an issuer is a concentration finding, not a duplication one, and mixing
  // the two would make a diversified equity book look redundant because its
  // liquid sleeve holds the same treasury bills as everyone else's.
  const redundancy = weightedMeanPairOverlap(equityOverlap.weighted);

  // -- §3: look-through -----------------------------------------------------
  const assetClassSplit = new Map<string, Decimal>();
  for (const input of lookThroughInputs) {
    if (!input.snapshot) continue;
    for (const h of input.snapshot.holdings) {
      const effective = input.weightFraction.times(toDecimal(h.weightPct));
      assetClassSplit.set(h.kind, (assetClassSplit.get(h.kind) ?? ZERO).plus(effective));
    }
  }
  const target = await loadTargetComparison(scope, assetClassSplit);
  const lookThrough = buildLookThrough(lookThroughInputs, mfValue, netWorthFloor, target);

  // -- §4: cost totals ------------------------------------------------------
  // A weighted mean over the funds whose TER we actually know, not over the
  // whole book: including a null TER as zero would report a portfolio as
  // cheaper than it is, in proportion to how much of it we cannot see.
  // `annualCostInr` is then charged on that same known subset, so the rupee
  // figure is what the breakdown in `byFund` adds up to rather than an
  // extrapolation over funds with no TER on file.
  // Null, not zero, when NOT ONE held fund discloses a TER. Zero is a real and
  // enviable expense ratio, so reporting it for "we don't know" tells the user
  // their portfolio is free — the precise null-as-zero failure this layer's
  // status vocabulary exists to prevent (`00-README.md` invariant 4). Where
  // some funds are known the mean is a FLOOR over that subset, and `byFund`
  // carries `terPct: null` per fund so the reader can see which ones are
  // missing rather than infer it from a suspiciously low headline.
  const terIsKnown = terKnownValue.greaterThan(0);
  const weightedTer = terIsKnown ? weightedTerNumerator.dividedBy(terKnownValue) : null;
  const annualCost = weightedTer === null
    ? null
    : weightedTer.times(terKnownValue).dividedBy(HUNDRED);
  const costPercentile = terPercentileKnownValue.greaterThan(0)
    ? weightedTerPercentileNumerator.dividedBy(terPercentileKnownValue)
    : null;

  const cost: MfCostSummary = {
    weightedTerPct: weightedTer === null ? null : serializePct(weightedTer),
    annualCostInr: annualCost === null ? null : serializeMoney(annualCost),
    directPlanSavingsInr: serializeMoney(directPlanSavings),
    costCategoryPercentile: serializeRatioOrNull(costPercentile),
    byFund: costRows,
  };

  // -- §5: tax --------------------------------------------------------------
  const tax = await buildTaxSummary(scope, allLots, asOf);

  // -- §6: goals ------------------------------------------------------------
  const goals = await buildGoalFits(scope, {
    funds,
    modelKeyByFund,
    subCategoryByFund,
    categoryMedianByFund,
    asOf,
  });

  // -- totals ---------------------------------------------------------------
  const investedTotal = fundDtos.reduce((acc, f) => acc.plus(toDecimal(f.investedValue)), ZERO);
  const portfolioXirr = solveXirr(allFlows, mfValue, asOf);

  const totals: MfPortfolioTotals = {
    investedValue: serializeMoney(investedTotal),
    currentValue: serializeMoney(mfValue),
    absoluteGain: serializeMoney(mfValue.minus(investedTotal)),
    portfolioXirr: portfolioXirr.value,
    portfolioXirrStatus: portfolioXirr.status,
    weightedTerPct: cost.weightedTerPct,
    annualCostInr: cost.annualCostInr,
    directPlanSavingsInr: cost.directPlanSavingsInr,
    effectiveFundCount: serializeRatio(effFundCount ?? ZERO),
    redundancyScore: serializeRatioOrNull(redundancy),
    fundCount: fundDtos.length,
    equityFundCount,
  };

  return {
    asOf: isoDate(asOf),
    runId,
    totals,
    funds: fundDtos,
    overlap: { pairs: equityOverlap.pairs, debtPairs: debtOverlap.pairs },
    lookThrough,
    cost,
    tax,
    goals,
    scope: scopeHonesty,
  };
}

/**
 * Portfolio-level tax aggregates (`04 §5`).
 *
 * `ltcgExemptionHeadroomInr` is the §112A annual allowance **for the financial
 * year of `asOf`**, less the equity-oriented LTCG already realised in it. The
 * allowance is FY-dependent — ₹1,00,000 through FY2023-24, ₹1,25,000 from
 * FY2024-25 — so it comes from `ltcg112aExemptionForFy` and never from a
 * literal. Hardcoding ₹1.25 lakh understates the tax on any report for an
 * earlier year, which is the drift `CII_BY_FY` exists to prevent for
 * indexation.
 */
async function buildTaxSummary(
  scope: EffectiveScope,
  lots: readonly MfLotDto[],
  asOf: Date,
): Promise<MfTaxSummary> {
  let unrealisedStcg = ZERO;
  let unrealisedLtcg = ZERO;
  for (const lot of lots) {
    const gain = toDecimal(lot.gain);
    if (lot.gainType === 'LTCG') unrealisedLtcg = unrealisedLtcg.plus(gain);
    else unrealisedStcg = unrealisedStcg.plus(gain);
  }

  const fy = financialYearOf(asOf);

  // Realised equity-oriented LTCG this FY, across every readable member — the
  // exemption is an annual aggregate, so a household view has to net the
  // household's realised gains against it or the headroom is overstated once
  // per member.
  //
  // The rows are filtered by the caller's caps for the same reason every other
  // aggregate here is: a headroom silently reduced by gains on an asset class
  // the caller may not see would leak the existence and size of those gains
  // through a number that looks unrelated to them. Under caps the headroom is
  // therefore a CEILING on what is actually free, which is the safe direction
  // — it never understates the tax a sale would attract.
  let realisedLtcg = ZERO;
  for (const userId of scope.readableUserIds) {
    const { rows } = await asMember(scope, userId, () => computeUserCapitalGains(userId));
    for (const row of rows) {
      if (row.financialYear !== fy) continue;
      if (row.capitalGainType !== 'LONG_TERM') continue;
      if (!row.isEquityOriented) continue;
      if (!isAssetClassVisible(scope, row.assetClass)) continue;
      realisedLtcg = realisedLtcg.plus(row.gainLoss);
    }
  }

  // `null` from the lookup means §112A did not exist in that year (pre-FY
  // 2018-19, when §10(38) exempted listed-equity LTCG outright). No allowance
  // is needed, so the headroom is genuinely zero rather than unknown.
  const allowance = ltcg112aExemptionForFy(fy) ?? ZERO;
  const headroom = Decimal.max(ZERO, allowance.minus(realisedLtcg));

  const harvestCandidates = lots
    .filter((l) => l.harvestableLossInr !== null)
    .sort((a, b) => toDecimal(b.harvestableLossInr!).comparedTo(toDecimal(a.harvestableLossInr!)));

  return {
    unrealisedStcg: serializeMoney(unrealisedStcg),
    unrealisedLtcg: serializeMoney(unrealisedLtcg),
    ltcgExemptionHeadroomInr: serializeMoney(headroom),
    financialYear: fy,
    harvestCandidates,
    lots: lots.slice(),
  };
}

/**
 * The shape returned when the caller holds no visible MF units — either
 * because they hold none, or because the caps hide every MF class.
 *
 * Every aggregate is a real zero *for what this caller can see*, and
 * `scope.partial` + `scope.hiddenCategories` are what tell the UI which of the
 * two it is. That distinction is the whole point of `CONTEXT.md §6`'s rule
 * that a hidden category must read "not shared with you" rather than as an
 * absence.
 */
function emptyAnalysis(
  asOf: Date,
  runId: string,
  scope: MfAnalysisScope,
  tax: MfTaxSummary,
): MfPortfolioAnalysisDto {
  const zeroMoney: Money = serializeMoney(ZERO);
  const zeroRatio: Ratio = serializeRatio(ZERO);
  return {
    asOf: isoDate(asOf),
    runId,
    totals: {
      investedValue: zeroMoney,
      currentValue: zeroMoney,
      absoluteGain: zeroMoney,
      portfolioXirr: null,
      portfolioXirrStatus: 'INSUFFICIENT_DATA',
      // An empty book genuinely costs nothing, so `annualCostInr` is a true
      // zero. The weighted *rate*, though, is 0/0 — undefined, not 0% — and
      // rendering "0.00% expense ratio" for someone holding no funds invites
      // exactly the wrong reading. The two fields differ on purpose.
      weightedTerPct: null,
      annualCostInr: zeroMoney,
      directPlanSavingsInr: zeroMoney,
      effectiveFundCount: zeroRatio,
      redundancyScore: null,
      fundCount: 0,
      equityFundCount: 0,
    },
    funds: [],
    overlap: { pairs: [], debtPairs: [] },
    lookThrough: {
      topStocks: [],
      sectors: {},
      sectorsBenchmark: null,
      marketCap: { large: null, mid: null, small: null, unclassified: null } as MfMarketCapSplit,
      credit: null,
      assetClass: {},
      target: null,
      fundsWithoutHoldings: [],
    },
    cost: {
      weightedTerPct: null,
      annualCostInr: zeroMoney,
      directPlanSavingsInr: zeroMoney,
      costCategoryPercentile: null,
      byFund: [],
    },
    tax,
    goals: [],
    scope,
  };
}
