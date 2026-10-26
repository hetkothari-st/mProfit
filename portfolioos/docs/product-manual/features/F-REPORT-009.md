---
id: F-REPORT-009
title: "Historical tab"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-REPORT-001]
related: [F-ANLYT-003]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Historical tab

`F-REPORT-009` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** "Monthly valuation history · N points": one row per month-end since your first transaction, with Cost, Value and number of Holdings.

**Why it exists:** Shows how the book's value and cost moved over time. Inferred from behavior.

**Where to find it:** **Tools → Reports → Historical**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Click **Historical**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-REPORT-001](../settings/reports.md#s-report-001).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Not enough transaction history." | No transactions | Add transactions |

**Limitations:** Monthly only on this page (the API also supports quarterly). No download.

**How it works:** `GET /api/reports/historical-valuation?granularity=MONTHLY` replays transactions to each month-end from the month of the first trade to today and values positions at the prices available for those dates.

**Related features:** [F-ANLYT-003](F-ANLYT-003.md).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:921`, `apps/web/src/pages/reports/ReportsPage.tsx:958`, `packages/api/src/services/reports/reports.service.ts:195`
