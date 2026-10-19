# 04 — Portfolio-Level Analysis

`services/mfAnalytics/mfPortfolioAnalysis.service.ts`. This is the layer no fund
website can offer, because they don't have the user's holdings. Runs under the
caller's RLS context (`runAsUser` in the job, request context in the API) and
must honour `EffectiveScope` in family view (`CONTEXT.md §6`).

Inputs: the user's MF `HoldingProjection` rows + `Transaction` rows (source of
truth), joined to the reference tables. Output: `MfPortfolioAnalysisDto`,
persisted on `MfAnalysisRun.portfolioAnalysis` (Json) so a page never shows a
different number from the run its findings came from.

---

## 1. Per-fund user metrics

For each held scheme:

| Field | Definition |
|---|---|
| `investedValue` | Σ cost of open lots (FIFO from projection) |
| `currentValue` | units × latest `adjustedNav` |
| `absoluteGain`, `absoluteGainPct` | |
| `userXirr` | XIRR over the user's **actual** cash flows (all buys, sells, IDCW payouts, SIPs) + current value as terminal flow |
| `fundCagrSamePeriod` | fund CAGR from first user purchase date to asOf |
| `timingGap` | `userXirr − fundCagrSamePeriod` — negative means the user's entry/exit timing hurt them relative to a lump sum on day one. Report; do not moralise |
| `holdingPeriodDays` | first open lot to asOf |
| `sipActive` | any `SipPlan` row for this scheme |
| `weightInMfPortfolio`, `weightInNetWorth` | |
| `lots` | see §5 |

XIRR: reuse shared finance math; ≥ 2 flows of opposite sign required else `null`.
Guard the solver: cap iterations, return `null` with `status: 'xirr_no_convergence'`
rather than a wild number.

---

## 2. Overlap (extends `mfOverlap.service.ts`)

For every pair of held **equity** schemes with a `MfPortfolioSnapshot` at the
same `asOf` (or nearest within 1 month):

```
overlap(A, B) = Σ_i min(w_A,i, w_B,i)   over common ISINs
```

Report the pairwise matrix, the top shared stocks per pair (name, weight in
each), and two portfolio-level numbers:

- `effectiveFundCount` = `1 / Σ (w_f)²` where `w_f` is the fund's weight in the
  MF portfolio — diversification across funds.
- `redundancyScore` = weighted mean pairwise overlap; ≥ 50% between two funds
  in the same sub-category is a `REDUNDANT_FUNDS` finding.

Debt overlap: by issuer, same formula, reported separately.

---

## 3. Look-through exposure

Aggregate across all held funds using `weight_in_portfolio × holding_weight`:

- **Top 25 underlying stocks** with effective weight, and which funds contribute.
- **Sector weights** vs a reference (Nifty 500 TRI sector weights if
  constituents are loaded; else absolute only).
- **Market-cap split** (large / mid / small / unclassified).
- **Credit-quality split** across debt funds.
- **Asset-class split** (equity / debt / cash / gold / international) across the
  MF book — this is what actually determines the user's risk, not the fund
  labels.
- **Single-stock concentration**: any underlying stock > 5% of the MF book, or
  > 3% of net worth, is a finding.
- **Target comparison**: if the user has a `RiskProfileAssessment` → active
  `ModelPortfolioVersion`, show target vs actual equity/debt/gold/international
  and the drift. Reuse the advisor `REBALANCE` rule's tolerance constants.

---

## 4. Cost

- `weightedTerPct` = Σ `w_f × TER_f`.
- `annualCostInr` = `weightedTerPct × currentValue`.
- `directPlanSavingsInr`: for every REGULAR plan held, the TER difference to its
  DIRECT sibling × current value. This is usually the single largest actionable
  number in a retail portfolio; it gets its own finding (`REGULAR_PLAN_COST`).
- `costCategoryPercentile`: weighted mean of each fund's `terPercentile`.

---

## 5. Tax lots (uses `capitalGains.service.ts`)

For each open lot (FIFO):

| Field | Definition |
|---|---|
| `units`, `cost`, `currentValue`, `gain` | |
| `purchaseDate`, `holdingDays` | |
| `gainType` | `STCG` / `LTCG` per asset-class rule (equity-oriented: 12 m; others per current law from shared constants) |
| `daysToLtcg` | if STCG, days until it flips |
| `grandfatheredCost` | §112A FMV if applicable (existing logic) |
| `exitLoadPct` | from `exitLoadRules` for `holdingDays`; `null` if unknown |
| `exitLoadInr` | |
| `taxIfSoldTodayInr` | at the statutory CG rate (never the slab — `CONTEXT.md §9.8`) |
| `harvestableLossInr` | if gain < 0 |

Portfolio-level: `unrealisedStcg`, `unrealisedLtcg`, `ltcgExemptionHeadroomInr`
(₹1.25 lakh annual §112A exemption minus realised LTCG this FY — take the limit
from a shared constant, not a literal), `harvestCandidates`, and `switchCost` for
every `SWITCH_CANDIDATE` verdict (exit load + tax on the exit).

---

## 6. Goal fit

If the user has `Goal` rows with MF schemes mapped (existing mapping, or a new
`goalId` on `SipPlan` / a `GoalHoldingLink` table if none exists — check before
adding):

- horizon in years vs fund `modelKey` suitability matrix (e.g. small-cap for a
  < 3-year goal is `GOAL_MISMATCH`; liquid fund for a 15-year goal is
  `GOAL_UNDERPOWERED`).
- projected value at goal date using the fund's **category median** rolling
  return, not its own past return (own past return is the classic over-promise).
  Reuse `goalMath.ts` projection.

---

## 7. Household view

In family scope (`X-Viewing-As-Family`):
- run per member within `readableUserIds`, filtered by caps;
- aggregate look-through and overlap across members only for the `OWNER` role
  or where `allowedAssetClasses` includes all MF classes;
- a restricted view must say so — `PartialDataNotice` on every aggregate that
  is a floor, never a total (`CONTEXT.md §6`).

---

## 8. Output shape — `MfPortfolioAnalysisDto`

```ts
export interface MfPortfolioAnalysisDto {
  asOf: string; runId: string;
  totals: { investedValue: Money; currentValue: Money; absoluteGain: Money; portfolioXirr: Ratio|null;
            weightedTerPct: Pct; annualCostInr: Money; directPlanSavingsInr: Money;
            effectiveFundCount: Ratio; redundancyScore: Ratio|null };
  funds: MfHeldFundDto[];                                // §1 per fund + score + verdict ref
  overlap: { pairs: MfOverlapPair[]; debtPairs: MfOverlapPair[] };
  lookThrough: { topStocks: …; sectors: …; marketCap: …; credit: …; assetClass: …;
                 target?: { model: string; actual: …; target: …; drift: … } };
  tax: { unrealisedStcg: Money; unrealisedLtcg: Money; ltcgExemptionHeadroomInr: Money;
         harvestCandidates: MfLotDto[]; lots: MfLotDto[] };
  goals: MfGoalFitDto[];
  scope: { partial: boolean; hiddenCategories: string[] };  // family-view honesty
}
```

---

## 9. Tests (`test/services/mfAnalytics/mfPortfolioAnalysis.test.ts`)

All inside `scope.runAs(...)` (`CONTEXT.md §12`).

1. XIRR: SIP of 12 × ₹10k into a fund with known NAV path ⇒ hand-computed XIRR
   ±1e-6; lump-sum ⇒ `timingGap ≈ 0`.
2. Overlap: two synthetic snapshots with 3 common ISINs ⇒ exact overlap %.
3. Look-through: three funds ⇒ effective stock weights sum to the equity share.
4. Cost: regular vs direct sibling ⇒ savings figure.
5. Tax: lots straddling 12 months ⇒ correct STCG/LTCG split, `daysToLtcg`,
   exit-load lookup; grandfathering fixture reused from existing CG tests.
6. Family view: VIEWER with `allowedAssetClasses` excluding `MUTUAL_FUND` ⇒
   empty funds list and `scope.partial = true`; `[]` caps ⇒ deny-all, `null` ⇒
   full (the fail-open regression from `CONTEXT.md §6`).
7. RLS: second user's holdings never appear (extend `rls-isolation`).
