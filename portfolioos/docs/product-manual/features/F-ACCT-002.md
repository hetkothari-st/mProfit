---
id: F-ACCT-002
title: "Chart of accounts"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: []
related: [F-ACCT-003, F-ACCT-005]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Chart of accounts

`F-ACCT-002` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows your accounts as a tree with **Code**, **Name**, **Type** (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE) and **Opening Balance**. The first time it is opened, a default chart of 36 accounts is created: Assets (Bank Accounts, Cash in Hand, Investments with Equity, Mutual Fund, Fixed Deposits, Bonds & Debentures, Gold and Other), Liabilities (Loans & Borrowings), Equity & Capital (Capital Account, Retained Earnings), Income (Dividend, Interest, Short-term and Long-term Capital Gains, Rental, Other, Speculative, F&O) and Expenses (Brokerage & Charges, STT, Fund Management Charges, Insurance Premiums, Property Expenses, Capital Losses, Other, Loan Interest, Speculative Loss, Loan Charges, F&O Loss).

**Why it exists:** The accounts every voucher and statement posts to. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Chart of Accounts**.

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Open the tab. Top-level accounts are expanded; click the chevron to expand or collapse others.
2. Hover a row to see its **+** (add a sub-account) and bin (delete) buttons.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Chevron ("Expand" / "Collapse") | Button | Shows/hides sub-accounts | No effect without children |
| **+** (aria "Add account under <name>") | Button | Opens **Add Account** with that parent | Visible on hover |
| Bin (aria "Delete <name>") | Button | [F-ACCT-003](F-ACCT-003.md) | Visible on hover |
| **Add account** | Button | Opens **Add Account** (top level) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None (beyond the first-time default chart).

**Errors and troubleshooting:** "Loading default chart of accounts…" shows while the list is empty.

**Limitations:** Accounts can't be renamed or re-coded in the app. A deleted default account is created again the next time the chart loads.

**How it works:** `GET /api/accounting/accounts/tree` and `/flat` first create any missing default account (by code), then return all accounts ordered by code.

**Related features:** [F-ACCT-003](F-ACCT-003.md), [F-ACCT-005](F-ACCT-005.md).

**Sources:** `packages/api/src/services/accounting/accounting.service.ts:42`, `packages/api/src/services/accounting/accounting.service.ts:78`, `packages/api/src/services/accounting/accounting.service.ts:100`, `packages/api/src/services/accounting/accounting.service.ts:145`, `apps/web/src/pages/accounting/AccountingPage.tsx:35`, `apps/web/src/pages/accounting/AccountingPage.tsx:150`
