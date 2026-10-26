---
id: F-DASH-009
title: "Portfolio value over time chart"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-DASH-001, S-DASH-003, S-SHELL-006]
related: [F-DASH-008, F-PORT-008]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Portfolio value over time chart

`F-DASH-009` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** "Trajectory — Portfolio value over time" plots the market value of the selected portfolios day by day. Choose **1M**, **3M**, **6M**, **1Y** (default) or **All**.

**Why it exists:** Inferred from behavior: shows how your investments moved over time.

**Where to find it:** Dashboard, left of the Net worth breakdown.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click a period. The chart reloads.
2. Hover for "Market value" on a date.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **1M**, **3M**, **6M**, **1Y**, **All** | Toggle buttons | 30, 90, 180, 365 days, or from your first transaction | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-DASH-003](../settings/dashboard.md#s-dash-003) **Portfolio chart period** — default **1Y**; not remembered. [S-DASH-001](../settings/dashboard.md#s-dash-001) picker applies. [S-SHELL-006](../settings/app-layout-and-navigation.md#s-shell-006) hides the axis and tooltip values ("•••").

**Results:** Missing stock prices for the period may be downloaded and stored for everyone.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add transactions to see your portfolio value over time" | No transactions in the selected portfolios | Add transactions |

**Limitations:** Only stocks are valued at historical daily closing prices; mutual funds and every other holding are carried at cost on past days, and the chart jumps to live values on today's point. Invested money is not plotted. Axis labels use ₹…Cr, ₹…L, ₹…K.

**How it works:** For each selected portfolio, `GET /api/portfolios/:id/historical-valuation?days=` replays transactions in date order (buys add quantity and cost; sells remove average cost; bonus adds quantity at no cost; splits add quantity) and values each day. If stored stock prices cover less than 40% of the expected days, daily prices are fetched from Yahoo first. Today's point is replaced by the live value of current holdings. The Dashboard adds the series of all selected portfolios by date.

**Related features:** [F-DASH-008](F-DASH-008.md), [F-PORT-008](F-PORT-008.md).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:47`, `apps/web/src/pages/dashboard/DashboardPage.tsx:306`, `apps/web/src/pages/dashboard/DashboardPage.tsx:386`, `apps/web/src/pages/dashboard/DashboardPage.tsx:943`, `apps/web/src/pages/dashboard/DashboardPage.tsx:990`, `packages/api/src/services/holdings/portfolio.service.ts:690`, `packages/api/src/services/holdings/portfolio.service.ts:705`, `packages/api/src/services/holdings/portfolio.service.ts:762`, `packages/api/src/services/holdings/portfolio.service.ts:838`, `packages/api/src/services/holdings/portfolio.service.ts:874`
