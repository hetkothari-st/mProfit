---
id: F-DASH-011
title: "Top holdings"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-DASH-001, S-SHELL-004]
related: [F-PORT-004, F-SHELL-002]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Top holdings

`F-DASH-011` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** "Top holdings — Ranked by current value · N positions" lists your 10 largest holdings across the selected portfolios: rank, asset (and symbol), class, quantity, average cost, value, and unrealised P&L with percentage. Clicking a row opens that holding's page or its asset-class page.

**Why it exists:** Inferred from behavior: the positions that matter most at a glance.

**Where to find it:** Dashboard, below the charts.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click a row (or press Enter on it) to open it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Holding row ("Open <name>") | Row link | FD → its FD page; physical gold, gold bond, gold ETF → its gold page; crypto → its crypto page; other classes → their list page (NPS, PMS, AIF, private equity, REIT, InvIT, art, cash, other → **Others**) | Not clickable when the class has no page |
| **View all** | Link | Opens `/holdings` — this address does not exist and shows "This page doesn't exist" | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-SHELL-004](../settings/app-layout-and-navigation.md#s-shell-004) hides classes; [S-DASH-001](../settings/dashboard.md#s-dash-001) picker.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **View all** shows "This page doesn't exist" | The link points to a page that is not in the app | Use **Portfolios → Inspect**, or the asset-class pages |
| "Add transactions to see your top holdings" | No holdings | Add transactions |

**Limitations:** Ranked by current value, or by cost when there is no price ("cost basis" under the value, "no price" in the P&L column). Non-market holdings show "accrued" (interest-earning) or "at cost" under the P&L (phones: "accr"/"cost"). Quantities show up to 4 decimals.

**How it works:** Holdings of each selected portfolio (`GET /api/portfolios/:id/holdings`) are combined, sorted by value (cost when unpriced), filtered by sidebar visibility, and the first 10 shown.

**Related features:** [F-PORT-004](F-PORT-004.md), [F-SHELL-002](F-SHELL-002.md).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:259`, `apps/web/src/pages/dashboard/DashboardPage.tsx:418`, `apps/web/src/pages/dashboard/DashboardPage.tsx:502`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1057`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1061`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1226`, `apps/web/src/App.tsx:282`
