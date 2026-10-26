---
id: F-DASH-008
title: "Investment metric cards"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-DASH-001]
related: [F-PORT-004]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Investment metric cards

`F-DASH-008` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Four cards: **Portfolio value** ("<n> holdings"), **Total invested** (with "XIRR x% · TWR y%"), **Unrealised P&L** (with percentage) and **Today's change** (with percentage), for the portfolios in the picker.

**Why it exists:** Tooltips state each card's meaning: "Tradable + accrual holdings only. Excludes real estate, vehicles and insurance (those sit in Total Net Worth)."; "Sum of cost basis across all holdings (what you put in)."; "Current value minus invested, across holdings only. Accrual assets contribute earned interest; not annualized."; "Day move on market-priced holdings only (equities, MF, crypto, gold). Accrual/cost assets have no intraday change."

**Where to find it:** Dashboard, below the tax strip.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Card tooltips | Hover text | Explain the figure | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-DASH-001](../settings/dashboard.md#s-dash-001) (portfolio picker).

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The XIRR shown is a simple average of each portfolio's XIRR, not a combined XIRR (see DOCUMENTATION_GAPS.md); portfolios with too little history have no XIRR and are left out. TWR is account-wide and ignores the picker. "Today's change" uses the last two prices on record, which may not be today's and yesterday's (e.g. over a weekend). Percent signs show with two decimals; XIRR/TWR with one.

**How it works:** For each selected portfolio `GET /api/portfolios/:id/summary` returns: invested = sum of holding costs; value = sum of current values (cost when unpriced); P&L = value − invested; today's change = Σ (latest price − previous price) × quantity for stocks, mutual funds (NAV), crypto and gold/silver (spot); its % = change ÷ (value − change) × 100. The Dashboard adds the portfolios together exactly (decimal arithmetic). TWR comes from `GET /api/reports/xirr/user`.

**Related features:** [F-PORT-004](F-PORT-004.md), [D-DASH-010](../dependencies.md#d-dash-010) (Reports XIRR).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:375`, `apps/web/src/pages/dashboard/DashboardPage.tsx:412`, `apps/web/src/pages/dashboard/DashboardPage.tsx:451`, `apps/web/src/pages/dashboard/DashboardPage.tsx:476`, `apps/web/src/pages/dashboard/DashboardPage.tsx:867`, `apps/web/src/pages/dashboard/DashboardPage.tsx:875`, `apps/web/src/pages/dashboard/DashboardPage.tsx:890`, `apps/web/src/pages/dashboard/DashboardPage.tsx:901`, `packages/api/src/services/holdings/portfolio.service.ts:420`, `packages/api/src/services/holdings/portfolio.service.ts:440`, `packages/api/src/services/holdings/portfolio.service.ts:518`, `packages/api/src/services/holdings/portfolio.service.ts:534`
