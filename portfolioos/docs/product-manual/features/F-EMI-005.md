---
id: F-EMI-005
title: "Repayment schedule by financial year"
module: "EMI Calculator"
status: Live
roles: "All signed-in"
settings: []
related: [F-EMI-001, F-EMI-009]
---

[← EMI Calculator](../modules/emi-calculator.md) · [Index](../INDEX.md)

# Repayment schedule by financial year

`F-EMI-005` · Live · Roles: All signed-in

**What it does:** Below the result, **Repayment schedule** groups every EMI by financial year ("FY 2026-27") with totals for **EMI paid**, **Interest**, **Principal**, **Prepaid** (only when there are prepayments) and the year-end **Balance**. Click a year to expand its months.

**Why it exists:** Inferred from behavior: yearly totals match how interest certificates and tax returns are organised.

**Where to find it:** **Tools → EMI Calculator → Calculate**, below the results (route `/emi`).

**Who can use it:** All signed-in users.

**Steps**
1. Scroll to **Repayment schedule**.
2. Click **FY …** to expand or collapse that year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **FY yyyy-yy** | Toggle button | Expands / collapses the months | Hidden while inputs are invalid |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is stored.

**Errors and troubleshooting:** None.

**Limitations:** "Whole rupees on screen; the PDF and Excel files show paise." On narrow screens the table becomes stacked cards.

**How it works:** Rows are grouped by consecutive Indian financial year; the group balance is the last month's closing balance.

**Related features:** [F-EMI-001](F-EMI-001.md), [F-EMI-009](F-EMI-009.md).

**Sources:** `apps/web/src/pages/emi/ScheduleTable.tsx:10`, `apps/web/src/pages/emi/ScheduleTable.tsx:26`, `apps/web/src/pages/emi/ScheduleTable.tsx:63`, `packages/shared/src/loans/summary.ts:43`
