---
id: F-DASH-014
title: "Refresh prices (dashboard)"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-PORT-005, F-PORT-008]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Refresh prices (dashboard)

`F-DASH-014` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** **Refresh** fetches the latest prices for the stocks you hold and re-values all your holdings, then reloads the Dashboard.

**Why it exists:** Inferred from behavior: prices also update on a schedule ([F-PORT-008](F-PORT-008.md)); this lets you force it.

**Where to find it:** Dashboard header → **Refresh**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **Refresh**. A spinner replaces the icon.
2. A message appears: "Updated N price(s) · M holding(s)" or "Data refreshed — no new prices available".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Refreshes prices | Disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Stock prices and your holdings' current values, P&L and price dates are updated.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Refresh failed" (or the server's message) | Price source or server error | Try again later |

**Limitations:** Stock prices come from Yahoo; other holdings are re-valued from the latest stored prices (fund NAVs, crypto, gold arrive by their scheduled jobs).

**How it works:** `POST /api/assets/refresh-prices` → update Yahoo prices for held stocks, then refresh every holding's price; the Dashboard, portfolio and holdings caches are then reloaded.

**Related features:** [F-PORT-005](F-PORT-005.md), [F-PORT-008](F-PORT-008.md).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:433`, `apps/web/src/pages/dashboard/DashboardPage.tsx:437`, `apps/web/src/pages/dashboard/DashboardPage.tsx:523`, `packages/api/src/controllers/assets.controller.ts:85`
