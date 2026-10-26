---
id: F-ANLYT-003
title: "Portfolio value over time"
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-ANLYT-001, S-ANLYT-002]
related: [F-REPORT-009]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Portfolio value over time

`F-ANLYT-003` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** A line chart: solid line = market value of your holdings, dashed line = amount invested in them, over the selected period.

**Why it exists:** "The one chart that tells the whole story" (code comment); the gap between lines is your gain or loss.

**Where to find it:** **Analytics → Overview**, under the KPI cards.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" button | Popover | Definition | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-ANLYT-001](../settings/analytics.md#s-anlyt-001), [S-ANLYT-002](../settings/analytics.md#s-anlyt-002).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No history yet" | No valuation points in the period | Choose a longer period |

**Limitations:** Month-end/dated valuation points from transaction replay; not intraday.

**How it works:** Snapshot `portfolioValueLine` for the period's days (All = full history).

**Related features:** [F-REPORT-009](F-REPORT-009.md).

**Sources:** `apps/web/src/pages/analytics/widgets/PerformanceWidgets.tsx:23`, `apps/web/src/pages/analytics/widgets/PerformanceWidgets.tsx:38`, `packages/api/src/services/analytics/analytics.service.ts:656`, `apps/web/src/pages/analytics/infoCopy.ts:74`
