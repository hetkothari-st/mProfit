---
id: F-ANLYT-002
title: "Headline numbers (KPI cards)"
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-ANLYT-001]
related: [F-REPORT-008]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Headline numbers (KPI cards)

`F-ANLYT-002` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** Three cards: **Current value** ("You put in ₹…"), **Profit if you sold today** (₹ with sign and % of invested) and **Annualised return** (XIRR; hint "XIRR · counts when each rupee went in", or "Needs N more days · so far x%" when history is too short).

**Why it exists:** "The three numbers this page exists to answer: what is it worth, am I up or down, and what return is that." (code comment).

**Where to find it:** **Overview → Analytics → Overview**, top.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-ANLYT-001](../settings/analytics.md#s-anlyt-001) (not the period — these are as of today).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Annualised return "—" | Less than 90 days of cash flows | Wait; the hint says how many days remain |

**Limitations:** XIRR is suppressed under 90 days of history.

**How it works:** From the snapshot `kpis` block: current value, total cost, unrealised P&L and overall XIRR with a reliability flag (span < 90 days → unreliable).

**Related features:** [F-REPORT-008](F-REPORT-008.md).

**Sources:** `apps/web/src/pages/analytics/widgets/KpiCards.tsx:34`, `apps/web/src/pages/analytics/widgets/KpiCards.tsx:41`, `apps/web/src/pages/analytics/widgets/KpiCards.tsx:51`, `apps/web/src/pages/analytics/widgets/KpiCards.tsx:62`, `packages/api/src/services/analytics/analytics.service.ts:111`, `apps/web/src/pages/analytics/infoCopy.ts:42`
