---
id: F-ADV-004
title: "Allocation vs target (drift)"
module: "Investment Advisor"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-ADV-002, F-ADV-005, F-ADV-012]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Allocation vs target (drift)

`F-ADV-004` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The card **Where you sit vs. your target** shows **Total value**, a bar chart of current vs target weight for each of seven buckets (Equity — Domestic, Equity — International, Debt, Gold, Real assets, Cash equivalent, Other / alternatives) and a table **Bucket / Current / Target / Drift / In rupees**. If the largest gap is 5 percentage points or more, a line reads "Your largest gap is <bucket> — overweight/underweight by N pp (₹…)". Drift under 5 pp is shown in grey.

**Why it exists:** Card text: "Drift is your current weight minus your target weight, in percentage points. Anything under 5 pp is usually noise — rebalancing it costs more in tax and charges than it gains." The server comment says the figure shown is computed by the same function the rebalance rule uses "so the two can never disagree".

**Where to find it:** **Overview → Advisor**, card under the risk profile.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Chart tooltip | Hover | Shows Current / Target percentage for a bucket | — |

**Fields and rules:** None — view only.

**Settings and toggles here:** Target weights come from a model portfolio (default weights per category; editing them is API-only, [F-ADV-012](F-ADV-012.md)).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your allocation. Try again shortly." | Request failed | Reload later |
| "No allocation yet. Add holdings and we'll measure them against your model portfolio." | No holdings with a value | Add holdings |
| "No target weights are set yet, so every bucket below reads as a 100% overweight…" | No model portfolio with targets | Take the risk assessment |
| Targets do not match your risk category | Known defect — see Limitations | — |

**Limitations:** Known defect: the card's targets come from the most recently created *active* model portfolio, not from the model portfolio linked to your current assessment. All four model portfolios are created active in the order Conservative, Balanced, Growth, Aggressive, so the card normally measures you against the **Aggressive** targets whatever your category, while the recommendations use your category's targets (see DOCUMENTATION_GAPS.md). Holdings with no market value use their cost. Mutual funds are moved to Debt (categories DEBT, LIQUID, GILT, MONEY_MARKET, OVERNIGHT) or Gold (GOLD) by their scheme category; NPS, PPF and EPF count as Debt; FDs, RDs and post-office deposits as Cash equivalent; property, REITs, InvITs and silver as Real assets; derivatives, crypto, ULIPs and insurance as Other / alternatives.

**How it works:** `GET /api/advisor/allocation` reads every `HoldingProjection` in your portfolios, buckets each by asset class (and fund category), sums value per bucket, and calls `computeDrift(current, targets, total)`. Default targets (percent): Conservative — Equity Domestic 20, Intl 0, Debt 50, Gold 10, Cash 20; Balanced — 40, 5, 37, 8, 10; Growth — 58, 10, 22, 5, 5; Aggressive — 72, 10, 12, 3, 3; Real assets and Other 0 in all four. The material-drift threshold on screen is 5 pp; the engine's rebalance band is also 5 pp.

**Related features:** [F-ADV-002](F-ADV-002.md), [F-ADV-005](F-ADV-005.md), [F-ADV-012](F-ADV-012.md).

**Sources:** `apps/web/src/pages/advisor/widgets/AllocationDriftCard.tsx:38`, `apps/web/src/pages/advisor/widgets/AllocationDriftCard.tsx:134`, `apps/web/src/pages/advisor/widgets/AllocationDriftCard.tsx:145`, `apps/web/src/pages/advisor/widgets/AllocationDriftCard.tsx:155`, `packages/api/src/controllers/advisor.controller.ts:203`, `packages/api/src/controllers/advisor.controller.ts:241`, `packages/api/src/services/advisor/riskProfile.service.ts:100`, `packages/api/src/services/advisor/constants.ts:98`, `packages/api/src/services/advisor/assetBuckets.ts:13`, `packages/api/src/services/advisor/assetBuckets.ts:80`
