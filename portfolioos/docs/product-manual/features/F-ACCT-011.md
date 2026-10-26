---
id: F-ACCT-011
title: "P&L Statement"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: []
related: [F-ACCT-010]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# P&L Statement

`F-ACCT-011` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows **Income** and **Expenses** accounts with their movement in a period, **Total Income**, **Total Expenses** and **Net Profit** or **Net Loss**. The period defaults to the current Indian financial year (April–March).

**Why it exists:** Standard profit and loss for the period. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Reports → P&L Statement**.

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Adjust **From** and **To** if needed.

**Controls:** **From**, **To** (dates).

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (re-projection first).

**Errors and troubleshooting:** "No income recorded" / "No expenses recorded" when empty.

**Limitations:** None known.

**How it works:** `GET /api/accounting/reports/pnl?from=&to=`; each account's balance at **To** minus its balance before **From**.

**Related features:** [F-ACCT-010](F-ACCT-010.md).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:716`, `packages/api/src/services/accounting/accounting.service.ts:593`
