---
id: F-DASH-010
title: "Net worth breakdown pie"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-DASH-001, S-SHELL-004]
related: [F-DASH-002, F-SHELL-002]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Net worth breakdown pie

`F-DASH-010` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** A ring chart "Net worth breakdown" with one slice per kind of holding (Equity, Mutual Fund, Fixed Deposit, …) plus Vehicles, Real Estate (rental properties) and Loans given, and a list of each slice's value and percentage.

**Why it exists:** Inferred from behavior: shows how your wealth is spread across asset types.

**Where to find it:** Dashboard, right of the portfolio chart.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps:** Not applicable — view only (hover a slice for "<amount> (<percent>%)").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Slices and legend rows | Chart | Show value and share | Slices with zero value and classes hidden in the sidebar are left out |

**Fields and rules:** None.

**Settings and toggles here:** [S-SHELL-004](../settings/app-layout-and-navigation.md#s-shell-004) (sidebar visibility) hides slices; [S-DASH-001](../settings/dashboard.md#s-dash-001) picker narrows the holdings slices.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add holdings to see breakdown" | Nothing to show | Add holdings |
| Hiding **Vehicles** in the sidebar does not remove the Vehicles slice (hiding **Others** does) | Known mapping defect | See DOCUMENTATION_GAPS.md |

**Limitations:** Percentages are of gross net worth (holdings + vehicles + rental + loans given). In family view, slice sizes in the ring use the first member's value for a merged slice while the list shows the combined value — see DOCUMENTATION_GAPS.md.

**How it works:** Uses `allocationBreakdown` from `GET /api/dashboard/net-worth`: holdings grouped by asset class (value or cost when unpriced), then vehicles, rental, loans given, sorted largest first; percent = slice ÷ total × 100.

**Related features:** [F-DASH-002](F-DASH-002.md), [F-SHELL-002](F-SHELL-002.md).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:218`, `apps/web/src/pages/dashboard/DashboardPage.tsx:503`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1002`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1010`, `packages/api/src/services/analytics/dashboard.service.ts:329`, `packages/api/src/services/analytics/dashboard.service.ts:386`, `packages/api/src/services/analytics/dashboard.service.ts:677`
