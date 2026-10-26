---
id: F-DASH-012
title: "Real Estate, Vehicles and Insurance cards"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-SHELL-004]
related: []
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Real Estate, Vehicles and Insurance cards

`F-DASH-012` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Three cards. **Real Estate** (rental properties): Property value, Monthly rent ("active tenancies"), Income YTD, Net P&L YTD and "N overdue receipt(s)". **Vehicles**: Total value, Pending challans ("None" when zero) and up to four "Expiring soon" items, or "All documents up to date". **Insurance**: Total sum assured ("N active policies"), Annual premium ("per year total") and up to four "Upcoming premiums" ("Due now" or days), or "No premiums due in the next 30 days". Each card has **Manage**.

**Why it exists:** Inferred from behavior: summaries of the non-investment parts of your wealth.

**Where to find it:** Dashboard, below Top holdings. The cards follow your sidebar order; a card is hidden when its sidebar entry is hidden.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); family roles see members' items only with the RENTAL, VEHICLE, INSURANCE categories.

**Steps**
1. Click **Manage** on a card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Manage** (Real Estate) | Link | Opens `/rental` | Card hidden when **Real Estate** is hidden in the sidebar |
| **Manage** (Vehicles) | Link | Opens `/vehicles` | Card hidden when **Vehicles** is hidden |
| **Manage** (Insurance) | Link | Opens `/insurance` | Card hidden when **Insurance** is hidden |

**Fields and rules:** None.

**Settings and toggles here:** [S-SHELL-004](../settings/app-layout-and-navigation.md#s-shell-004) (order and visibility).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No properties added yet." / "No vehicles added yet." / "No policies added yet." | Nothing recorded | Add items on those pages |

**Limitations:** The Real Estate card shows rental properties and opens Rental, but its position and visibility follow the **Real Estate** sidebar entry. Not filtered by the portfolio picker. Item colours: 7 days or fewer red, up to 15 amber, otherwise blue.

**How it works:** Income YTD = rent payment entries since 1 April; Net P&L YTD = that minus property expenses paid since 1 April (deposits and discounts are not income). Monthly rent = rent of active tenancies. Annual premium = each active policy's premium converted to a yearly amount. Upcoming premiums = active policies with next premium due within 30 days.

**Related features:** [D-DASH-003](../dependencies.md#d-dash-003), [D-DASH-004](../dependencies.md#d-dash-004), [D-DASH-005](../dependencies.md#d-dash-005).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:1248`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1309`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1365`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1429`, `packages/api/src/services/analytics/dashboard.service.ts:184`, `packages/api/src/services/analytics/dashboard.service.ts:199`, `packages/api/src/services/analytics/dashboard.service.ts:222`, `packages/api/src/services/analytics/dashboard.service.ts:226`
