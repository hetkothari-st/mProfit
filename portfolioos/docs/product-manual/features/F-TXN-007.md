---
id: F-TXN-007
title: "Add the missing purchase (from Reports)"
module: "Transactions"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-TXN-002]
---

[← Transactions](../modules/transactions.md) · [Index](../INDEX.md)

# Add the missing purchase (from Reports)

`F-TXN-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** When a report finds a sale with no purchase behind it, its link opens Transactions with "Add transaction" pre-filled: BUY, the portfolio, asset and quantity filled in, and **Trade date** left blank with the hint "When you bought these units — on or before the sale on <date>." (dates after the sale cannot be picked).

**Why it exists:** Code comment: "A prefilled purchase has no known date. Left blank … rather than defaulted: a default the user forgets to change would book a wrong holding period".

**Where to find it:** Reached from the Reports data-quality banner ([D-TXN-002](../dependencies.md#d-txn-002)); address `/transactions?add=purchase&…`.

**Who can use it:** Same as [F-TXN-002](F-TXN-002.md).

**Steps**
1. Follow the link from Reports. The dialog opens pre-filled.
2. Enter the purchase **Trade date** and **Price**; click **Add transaction**.

**Controls:** As [F-TXN-002](F-TXN-002.md).

**Fields and rules:** Trade date must be on or before the sale date (date picker maximum).

**Settings and toggles here:** None.

**Results:** As [F-TXN-002](F-TXN-002.md). The address is cleaned so reloading does not reopen the form.

**Errors and troubleshooting:** As [F-TXN-002](F-TXN-002.md) (a blank date gives no message).

**Limitations:** Quantity is pre-filled only when it is a positive number.

**How it works:** Reads `portfolioId`, `assetClass` (default EQUITY), `symbol`, `assetName`, `isin`, `quantity`, `onOrBefore` from the address once, then clears it.

**Related features:** [F-TXN-002](F-TXN-002.md), [D-TXN-002](../dependencies.md#d-txn-002).

**Sources:** `apps/web/src/pages/transactions/TransactionsPage.tsx:27`, `apps/web/src/pages/transactions/TransactionsPage.tsx:42`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:104`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:215`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:518`
