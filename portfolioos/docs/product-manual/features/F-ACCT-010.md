---
id: F-ACCT-010
title: "Trial Balance"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: []
related: [F-ACCT-011, F-ACCT-012]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Trial Balance

`F-ACCT-010` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Lists every account grouped as **Assets**, **Liabilities**, **Equity**, **Income**, **Expenses** with **Code**, **Account**, **Opening** (wide screens), **Debit**, **Credit** and **Balance**, and a **Total** row, as of a date.

**Why it exists:** Standard check that the books balance. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Reports → Trial Balance**.

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Optionally set **As of date** (blank = everything to date).

**Controls:** **As of date** (date).

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (re-projection first).

**Errors and troubleshooting:** None specific.

**Limitations:** The **Total** row's **Balance** is total debits − total credits, which ignores opening balances.

**How it works:** `GET /api/accounting/reports/trial-balance?asOf=`; vouchers on or before the date; closing = opening + movement on the normal side.

**Related features:** [F-ACCT-011](F-ACCT-011.md), [F-ACCT-012](F-ACCT-012.md).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:647`, `packages/api/src/services/accounting/accounting.service.ts:553`
