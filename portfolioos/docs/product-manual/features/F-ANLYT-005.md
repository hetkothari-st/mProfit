---
id: F-ANLYT-005
title: "Allocation and concentration"
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-ANLYT-001]
related: [F-ANLYT-010]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Allocation and concentration

`F-ANLYT-005` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** **Allocation by class** — a pie of today's value by asset type. **Concentration** — your largest holdings (up to 10) with each one's share, and a sentence "Your top N holdings are X% of everything you own" (or "Your biggest holding is X% of everything you own" when the listed holdings are the whole portfolio).

**Why it exists:** Shows where the money sits and how much sits in one place. From info text.

**Where to find it:** **Analytics → Overview**.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-ANLYT-001](../settings/analytics.md#s-anlyt-001).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings yet" | No holdings | — |

**Limitations:** The info text says shares "above 60% is flagged", but the card shows no flag (see DOCUMENTATION_GAPS.md).

**How it works:** Snapshot `allocationByClass` and `concentrationRisk` (top 10 of the holdings treemap by value, with running cumulative %).

**Related features:** [F-ANLYT-010](F-ANLYT-010.md).

**Sources:** `apps/web/src/pages/analytics/widgets/AllocationWidgets.tsx:21`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:100`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:119`, `packages/api/src/services/analytics/analytics.service.ts:230`, `packages/api/src/services/analytics/analytics.service.ts:357`, `apps/web/src/pages/analytics/infoCopy.ts:115`
