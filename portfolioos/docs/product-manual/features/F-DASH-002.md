---
id: F-DASH-002
title: "Total Net Worth hero"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-DASH-002, S-SHELL-006]
related: [F-DASH-004, F-DASH-010, F-SHELL-007]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Total Net Worth hero

`F-DASH-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The large card at the top shows **Total Net Worth · Consolidated** — hidden as "₹ • • • • • • •" until you click the small eye (**Show net worth**). Beneath it: today's date, your number of holdings and portfolios, and "All accounts" or "Filtered". A breakdown row shows **Investments** and, when they are above zero, **Real Estate**, **Vehicles** and **Sum Assured**.

**Why it exists:** Code comment: hidden by default "so a screen-share or co-worker glance doesn't reveal the headline number".

**Where to find it:** Dashboard, top card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); family roles see the family total.

**Steps**
1. Click the eye next to **Total Net Worth · Consolidated** (**Show net worth**). The amount appears.
2. Click again (**Hide net worth**) to hide it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Show net worth** / **Hide net worth** | Icon toggle | Reveals/hides the headline number | — |
| Tooltip on the label | Text | "Gross: investments + real estate + vehicles, before loans & credit-card liabilities." | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-DASH-002](../settings/dashboard.md#s-dash-002) **Net worth eye** — hidden (default every visit) or shown; not remembered. Independent of [S-SHELL-006](../settings/app-layout-and-navigation.md#s-shell-006) **Hide values**, which masks the breakdown figures too.

**Results:** None stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| The card does not appear | Net-worth figures have not loaded or failed | Reload the page |
| Bank balances or a home you own are not in the total | They are not part of this figure (see Limitations) | — |

**Limitations:** Total Net Worth = Investments + Vehicles + Rental property values + money you lent that is still owed to you. It does not include bank account balances or properties recorded on the **Real Estate** page; **Sum Assured** is displayed but not added. The "Real Estate" figure here is the current value of properties on the **Rental** page. Only Investments follows the portfolio picker. Liabilities are not subtracted here — see **Net after debts** ([F-DASH-004](F-DASH-004.md)). See DOCUMENTATION_GAPS.md.

**How it works:** `GET /api/dashboard/net-worth?portfolioId=` returns gross `totalNetWorth`. Investments = sum over holdings of current value, or cost (total invested) when a holding has no price. Vehicles = sum of vehicle current values; rental = sum of rental property current values; loans given = outstanding amounts owed to you (counted only when you may see the LOAN category). In family view the server computes each member's figures (other members' filtered by your asset-class and category permissions) and adds them up. The holdings count comes from the portfolio summaries of the selected portfolio(s).

**Related features:** [F-DASH-004](F-DASH-004.md), [F-DASH-010](F-DASH-010.md), [F-SHELL-007](F-SHELL-007.md), [D-DASH-003](../dependencies.md#d-dash-003) (Rental), [D-DASH-004](../dependencies.md#d-dash-004) (Vehicles).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:314`, `apps/web/src/pages/dashboard/DashboardPage.tsx:540`, `apps/web/src/pages/dashboard/DashboardPage.tsx:544`, `apps/web/src/pages/dashboard/DashboardPage.tsx:562`, `apps/web/src/pages/dashboard/DashboardPage.tsx:608`, `packages/api/src/routes/dashboard.routes.ts:13`, `packages/api/src/services/analytics/dashboard.service.ts:97`, `packages/api/src/services/analytics/dashboard.service.ts:110`, `packages/api/src/services/analytics/dashboard.service.ts:180`, `packages/api/src/services/analytics/dashboard.service.ts:470`, `packages/api/src/services/analytics/dashboard.service.ts:543`
