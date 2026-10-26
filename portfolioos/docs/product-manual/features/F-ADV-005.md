---
id: F-ADV-005
title: "Refresh recommendations (advice engine run)"
module: "Investment Advisor"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-ADV-001, S-ADV-007, S-ADV-009]
related: [F-ADV-006, F-ADV-010, F-ADV-014]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Refresh recommendations (advice engine run)

`F-ADV-005` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Refresh recommendations** runs six rules over your current data and updates your recommendation list. A toast reports "1 recommendation ready" or "N recommendations ready" (N = new plus re-affirmed live recommendations).

**Why it exists:** Code comment: "`/regenerate` is the user-facing 'refresh my advice' button". There is no scheduled run, so advice changes only when you press it.

**Where to find it:** **Overview → Advisor**, page header button.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager); requires a risk profile.

**Steps**
1. Click **Refresh recommendations**. The icon spins.
2. When the toast appears, the **Open** tab of the feed shows the current advice.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh recommendations** | Button | Runs the engine | No risk profile; run in progress |

**Fields and rules:** None.

**Settings and toggles here:** Uses [S-ADV-001](../settings/investment-advisor.md#s-adv-001)…[S-ADV-007](../settings/investment-advisor.md#s-adv-007) (profile) and the override list ([S-ADV-009](../settings/investment-advisor.md#s-adv-009), [F-ADV-010](F-ADV-010.md)).

**Results:** New recommendations are added with status Open; unchanged live ones keep their figures; materially changed ones are replaced (the old one is kept as history and hidden).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not refresh your recommendations" or the server message | The run failed | Retry later |
| "0 recommendations ready" | No rule found anything to suggest | Nothing to do |

**Limitations:** A recommendation that a rule no longer produces is not closed automatically — it stays in **Open** until you act on it. Tax-loss harvesting only runs from 1 October to 31 March. Named funds (rather than "buy debt" with no product) appear only when the operator has enabled the house methodology and a signed, fresh ranking exists ([F-ADV-014](F-ADV-014.md)), or when you have an override list for that bucket; otherwise a NAV-based fallback ranking or no product is used.

**How it works:** `POST /api/advisor/regenerate` (body optional, default triggered by USER). The engine builds facts once, records an `AdvisorRun` (engine version 1.0.0) with every rule's version, runs each rule (a failing rule is logged on the run; the others continue), sorts drafts by priority, then for each draft finds the newest recommendation with the same rule and dedupe key: none → create; existing Open/Snoozed and unchanged → refresh its input snapshot only; existing Open/Snoozed and materially changed → create a new row and point the old one at it; existing Accepted/Dismissed/Done and unchanged → suppressed; existing closed and changed → new row. "Materially changed" = different rule version, different instrument/direction/leg shape, or total amount moved by more than 10%. Rules and their base priority (lower = more urgent; plus 0–4 by size — 0 if ≥10% of the portfolio, 1 if ≥5%, 2 if ≥2%, 3 if ≥1%, else 4): Tax-loss harvest 5 (Oct–Mar only; loss ≥ ₹5,000; sells the whole position); Concentration trim 15 (any holding above 15% of the portfolio, trimmed back to 15%, one instruction capped at 25% of the portfolio, minimum trade ₹5,000); Rebalance 20 (buckets outside the 5 pp band; pairs the largest overweight with the largest underweight; trades only investable buckets; minimum ₹5,000); Cash deployment 35 (idle cash above a 6-month emergency fund, surplus over ₹25,000; silent when monthly expenses are unknown); Goal shortfall SIP 40 (off-track goals; top-up at least ₹500/month); Risk profile review 55 (profile older than 12 months, or never taken). Product naming order: your override list → house methodology → NAV-based fallback → none.

**Related features:** [F-ADV-006](F-ADV-006.md), [F-ADV-010](F-ADV-010.md), [F-ADV-014](F-ADV-014.md), [D-ADV-003](../dependencies.md#d-adv-003), [D-ADV-004](../dependencies.md#d-adv-004).

**Sources:** `apps/web/src/pages/advisor/AdvisorPage.tsx:71`, `packages/api/src/routes/advisor.routes.ts:38`, `packages/api/src/controllers/advisor.controller.ts:304`, `packages/api/src/services/advisor/advisorEngine.service.ts:101`, `packages/api/src/services/advisor/advisorEngine.service.ts:172`, `packages/api/src/services/advisor/advisorEngine.service.ts:255`, `packages/api/src/services/advisor/constants.ts:20`, `packages/api/src/services/advisor/constants.ts:42`, `packages/api/src/services/advisor/constants.ts:47`, `packages/api/src/services/advisor/constants.ts:80`, `packages/api/src/services/advisor/rules/taxLossHarvest.rule.ts:59`, `packages/api/src/services/advisor/rules/rebalanceDrift.rule.ts:52`, `packages/api/src/services/advisor/productResolution.ts:11`
