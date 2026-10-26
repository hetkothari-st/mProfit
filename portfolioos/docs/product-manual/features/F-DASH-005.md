---
id: F-DASH-005
title: "Net worth over time chart"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-DASH-004]
related: [F-DASH-018]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Net worth over time chart

`F-DASH-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** "Trend — Net worth over time" draws your net worth after liabilities from one snapshot per day, with the change over the chosen period ("+₹X (+Y%) this 1Y"). Choose **1M**, **3M**, **6M**, **1Y** (default) or **All**.

**Why it exists:** Code comment: "the 'look how far you've come' dashboard element."

**Where to find it:** Dashboard, below the Liabilities card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). Always your own figures — not the family's and not the selected portfolio.

**Steps**
1. Click a period button. The chart and change line redraw.
2. Hover (or touch) the line to see the date and value.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **1M**, **3M**, **6M**, **1Y**, **All** | Toggle buttons | Period of 30, 90, 180, 365 days or everything | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-DASH-004](../settings/dashboard.md#s-dash-004) **Net worth trend period** — default **1Y**; not remembered.

**Results:** None stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Come back tomorrow to see your net worth trend. We snapshot your net worth once a day." | Fewer than 2 snapshots in the period | Wait for more daily snapshots |
| "Couldn't load your net worth trend. Try again shortly." | Request failed | Reload later |
| "N of these days were priced from the last NAVs we had" and an estimate chip | Some snapshots were taken while fund prices were stale | No action — those points are estimates |

**Limitations:** One point per day, taken at 23:45 IST ([F-DASH-018](F-DASH-018.md)); today's changes appear tomorrow. The percentage is blank when the first value is zero. The chart's axis and tooltip are not hidden by **Hide values** — see DOCUMENTATION_GAPS.md.

**How it works:** `GET /api/intelligence/net-worth/history?period=` reads your snapshots from the start of the period (UTC date) onward. Change = last − first net-worth-after-liabilities; percent = change ÷ |first| × 100. Points flagged as not OK are marked "Net worth (estimate)" in the tooltip.

**Related features:** [F-DASH-018](F-DASH-018.md).

**Sources:** `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:13`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:30`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:124`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:137`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:145`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:177`, `packages/api/src/controllers/intelligence.controller.ts:16`, `packages/api/src/services/analytics/netWorthHistory.service.ts:7`, `packages/api/src/services/analytics/netWorthHistory.service.ts:84`
