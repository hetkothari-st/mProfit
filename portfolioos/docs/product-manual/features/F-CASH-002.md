---
id: F-CASH-002
title: "Cash flow entries"
module: "Cash Activity"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-CASH-001]
related: [F-CASH-001]
---

[← Cash Activity](../modules/cash-activity.md) · [Index](../INDEX.md)

# Cash flow entries

`F-CASH-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Lists cash-flow entries newest first, 50 per page, with **All** / **Inflows** / **Outflows** tabs, **Inflows (this page)** and **Outflows (this page)** totals, and columns **Date**, **Description**, **Portfolio**, **Amount** (+ green / − red).

**Why it exists:** Page description: "Bank credits and debits parsed from your connected accounts".

**Where to find it:** **Overview → Cash Activity**, below the forecast.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Choose a tab. Use **Previous** / **Next** when there is more than one page ("N total · page X of Y").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All** / **Inflows** / **Outflows** | Tabs | Filter by direction; back to page 1 | — |
| **Previous** / **Next** | Buttons | Page | Disabled at the ends; hidden with one page |

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-CASH-001](../settings/cash-activity.md#s-cash-001) direction tab (not saved).

**Results:** None.

**Errors and troubleshooting:** "No cash flows found — Connect a Gmail account and configure senders to start ingesting bank alerts."

**Limitations:** Totals cover only the visible page. Entries can't be added, edited or deleted here. Amounts are always shown in rupees, including split-expense entries recorded in a foreign currency (see DOCUMENTATION_GAPS.md). A missing description shows "Credit" or "Debit".

**How it works:** `GET /api/cashflows?type=&page=&pageSize=50` (server also accepts portfolio and date filters, max 200 per page). Entries are created by approved inbox events, rent receipts and rent-ledger entries, and split-expense share links.

**Related features:** [F-CASH-001](F-CASH-001.md), [D-CASH-001](../dependencies.md#d-cash-001), [D-CASH-003](../dependencies.md#d-cash-003), [D-CASH-004](../dependencies.md#d-cash-004).

**Sources:** `apps/web/src/pages/cashflows/CashFlowsPage.tsx:14`, `apps/web/src/pages/cashflows/CashFlowsPage.tsx:76`, `apps/web/src/pages/cashflows/CashFlowsPage.tsx:121`, `packages/api/src/controllers/cashflows.controller.ts:28`, `packages/api/src/controllers/cashflows.controller.ts:63`, `packages/api/src/ingestion/projection.ts:271`, `packages/api/src/services/split/shareLink.service.ts:77`
