---
id: F-DASH-006
title: "FX rates strip"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: []
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# FX rates strip

`F-DASH-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** A thin strip "FX" shows USD/INR, EUR/INR, GBP/INR and JPY/INR with two decimals and a source badge (green for RBI or FRANKFURTER, blue otherwise). Clicking it opens the Forex page.

**Why it exists:** Code comment: "Compact rates strip … quick glance + click-through to /forex".

**Where to find it:** Dashboard, below the net worth chart. Hidden when no rates are available.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Read the rates; click the strip to open `/forex`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| FX strip | Link | Opens `/forex` | Hidden with no rates |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None — the strip simply hides.

**Limitations:** Rates are shown, not used in Dashboard totals.

**How it works:** `GET /api/forex/ticker` for the four pairs, refreshed every 30 seconds.

**Related features:** [D-DASH-008](../dependencies.md#d-dash-008) (Forex).

**Sources:** `apps/web/src/pages/forex/DashboardFxStrip.tsx:11`, `apps/web/src/pages/forex/DashboardFxStrip.tsx:17`, `apps/web/src/pages/forex/DashboardFxStrip.tsx:24`, `apps/web/src/api/forex.api.ts:197`
