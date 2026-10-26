---
id: F-DASH-013
title: "Recent transactions card"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-TXN-001]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Recent transactions card

`F-DASH-013` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** "Recent transactions" lists your 5 latest transactions: name, trade date · type, net amount and quantity @ price. **View all** opens Transactions.

**Why it exists:** Inferred from behavior: quick check that your latest entries or imports landed.

**Where to find it:** Dashboard, bottom.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **View all** to open `/transactions`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **View all** | Link | Opens `/transactions` | — |

**Fields and rules:** None.

**Settings and toggles here:** None (not filtered by the portfolio picker).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add a manual transaction to see activity here." | No transactions | Add one |

**Limitations:** Rows are not clickable here.

**How it works:** `GET /api/transactions?pageSize=5`, newest trade date first (then newest created).

**Related features:** [F-TXN-001](F-TXN-001.md).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:381`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1449`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1475`, `packages/api/src/services/holdings/transaction.service.ts:653`
