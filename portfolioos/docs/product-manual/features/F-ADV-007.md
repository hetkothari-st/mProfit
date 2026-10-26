---
id: F-ADV-007
title: "Recommendation card and actions"
module: "Investment Advisor"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-ADV-006, F-ADV-008, F-ADV-009]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Recommendation card and actions

`F-ADV-007` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Each card shows the category (for example "Tax Harvest", "Rebalance"), an urgency badge, the status if not Open, "Suggested <date>", where the product came from (**Adviser-approved product**, **House methodology**, **Algorithmically ranked** or **No product named**), **What to do** (Buy / Sell / Switch legs with instrument, bucket, units and amount, or "No trade attached — this is guidance only."), and **Why we're suggesting it** (the engine's reasoning text). Four buttons record your decision.

**Why it exists:** Code comment: "Status is the only field a user can change… a recommendation is a record of what was advised, not a mutable to-do item."

**Where to find it:** **Overview → Advisor → What to do next**.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Read **What to do** and **Why we're suggesting it**.
2. Click **Accept**, **Done**, **Snooze 7 days** or **Dismiss**. A toast says "Marked accepted" (etc.) and the card moves to that tab.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Accept** | Button | Status → Accepted | Already Accepted; while saving |
| **Done** | Button | Status → Done | Already Done; while saving |
| **Snooze 7 days** | Button | Status → Snoozed until 7 days from now | Already Snoozed; while saving |
| **Dismiss** | Button | Status → Dismissed | Already Dismissed; while saving |
| **Why this** | Toggle link | Expands [F-ADV-008](F-ADV-008.md) | — |
| **Explain in plain English** | Button | [F-ADV-009](F-ADV-009.md) | Hidden unless narration is enabled and no narration exists |

**Fields and rules:** None (the API also accepts an optional note up to 1,000 characters; the page does not send one).

**Settings and toggles here:** None.

**Results:** Only the status, its time and (for Snooze) the snooze date change. Accepted, Dismissed and Done recommendations are not re-issued by later runs unless the advice changes materially.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This recommendation has been superseded by a newer one — act on that instead" | A later run replaced it | Act on the newer card |
| "Could not update this recommendation" | Request failed | Retry |

**Limitations:** Known defect: the urgency badge shows **Do first** only for priority 1 and **Soon** for 2–3, but the engine's lowest priority is 5, so every card shows **When convenient** (see DOCUMENTATION_GAPS.md). The buttons only record a decision; you place any trade yourself.

**How it works:** `PATCH /api/advisor/recommendations/:id/status` with `{ status }` (Snooze sends `snoozedUntil` = now + 7 days; the server defaults to 7 days when absent and rejects dates in the past). Leaving Snoozed clears the snooze date.

**Related features:** [F-ADV-006](F-ADV-006.md), [F-ADV-008](F-ADV-008.md), [F-ADV-009](F-ADV-009.md).

**Sources:** `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:70`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:86`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:390`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:504`, `packages/api/src/controllers/advisor.controller.ts:106`, `packages/api/src/services/advisor/advisorRecommendations.service.ts:32`, `packages/api/src/services/advisor/advisorRecommendations.service.ts:209`, `packages/api/src/services/advisor/constants.ts:80`
