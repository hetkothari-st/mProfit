---
id: F-ADV-006
title: "Recommendation feed and status tabs"
module: "Investment Advisor"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-ADV-008]
related: [F-ADV-005, F-ADV-007, F-ADV-008, F-ADV-009]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Recommendation feed and status tabs

`F-ADV-006` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The section **Recommendations — What to do next** lists your recommendations as cards ([F-ADV-007](F-ADV-007.md)), filtered by the tabs **Open**, **Accepted**, **Snoozed**, **Done**, **Dismissed**, sorted by priority (most urgent first), ties newest first.

**Why it exists:** Inferred from behavior: it separates advice still to act on from advice you have already decided about.

**Where to find it:** **Overview → Advisor**, below the allocation card.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Pick a tab. The list reloads for that status.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open** / **Accepted** / **Snoozed** / **Done** / **Dismissed** | Tabs | Filters by status ([S-ADV-008](../settings/investment-advisor.md#s-adv-008)) | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-ADV-008](../settings/investment-advisor.md#s-adv-008) **Recommendation status tab** — not saved; the page always opens on **Open**.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your recommendations. Try again shortly." | Request failed | Reload later |
| "No open recommendations" — "Nothing needs your attention right now. Refresh after your next set of transactions." | Nothing open | Refresh after new data |

**Limitations:** Up to 50 recommendations per tab (server default). Superseded recommendations are never shown. A snoozed recommendation stays on the **Snoozed** tab after its snooze date passes; it does not return to **Open** on its own (see DOCUMENTATION_GAPS.md).

**How it works:** `GET /api/advisor/recommendations?status=<tab>` (limit default 50, max 200, superseded excluded). The server's rule that hides still-snoozed items applies only when no status filter is sent, and the page always sends one.

**Related features:** [F-ADV-005](F-ADV-005.md), [F-ADV-007](F-ADV-007.md), [F-ADV-008](F-ADV-008.md), [F-ADV-009](F-ADV-009.md).

**Sources:** `apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:15`, `apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:33`, `packages/api/src/controllers/advisor.controller.ts:95`, `packages/api/src/services/advisor/advisorRecommendations.service.ts:165`
