---
id: F-BANK-001
title: "Bank accounts list"
module: "Bank Accounts"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-BANK-002, F-BANK-003, F-BANK-005, F-BANK-006, F-BANK-008]
---

[← Bank Accounts](../modules/bank-accounts.md) · [Index](../INDEX.md)

# Bank accounts list

`F-BANK-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The page "Bank Accounts" ("Your savings, current, and salary accounts in one place — branch, IFSC, balance, nominee, and linked debit card details.") shows a summary strip — **Total balance** ("across N active account(s)"), **Active accounts** ("with known balances") and **Inactive** ("dormant or closed") — and a tile per account drawn as a bank building: bank logo or initials, type, nickname, masked account number with an eye, **Available balance** (or the status), and **Holder**. Under each tile: Customer ID, IFSC, Branch, Status, "As of <date>" ("· live" when updated from email) and **Share details**.

**Why it exists:** Inferred from the page text: all bank details in one place, for reference and for sharing when someone needs to pay you.

**Where to find it:** **Asset Classes → Bank Accounts** (route `/bank-accounts`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) — your own accounts only (family view does not add other members' accounts). [R-MANAGER](../roles.md#r-manager) sees the managed person's accounts.

**Steps**
1. Hover a tile (on touch screens the buttons are always shown) and use **Edit**, **Delete** or **Open**; or click the tile to open it.
2. Click **Add account** to add one ([F-BANK-002](F-BANK-002.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add account** / **Add first account** | Button | Opens the account dialog | — |
| **Edit** | Icon button | Opens the dialog for this account | Shown on hover (always on touch screens) |
| **Delete** | Icon button | [F-BANK-003](F-BANK-003.md) | Same |
| **Open** / tile | Link | Opens `/bank-accounts/:id` | — |
| Eye on the account number | Toggle | [F-BANK-005](F-BANK-005.md) | — |
| **Share details** | Button | [F-BANK-006](F-BANK-006.md) | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No bank accounts yet — Add your first bank account to see balances, branch details, and linked transactions." | None added | **Add first account** |

**Limitations:** **Total balance** adds the balances of ACTIVE accounts only; "Active accounts" counts all active accounts whether or not a balance is known. Accounts are ordered by status (Active, then Closed, then Dormant), then bank name, then newest. Balances are hidden by **Hide values**.

**How it works:** `GET /api/bank-accounts` returns your accounts with their latest balance record; the full account number is never sent, only whether one is saved.

**Related features:** [F-BANK-002](F-BANK-002.md) to [F-BANK-008](F-BANK-008.md).

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:29`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:73`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:156`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:206`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:224`, `apps/web/src/components/bankAccounts/BankAccountVisual.tsx:90`, `packages/api/src/services/banking/bankAccounts.service.ts:126`, `packages/api/src/services/banking/bankAccounts.service.ts:144`
