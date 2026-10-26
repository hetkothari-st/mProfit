[Index](../INDEX.md)

# Transactions

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Transactions are the record from which every holding, gain and chart is calculated: buys, sells, SIPs, switches, dividends, bonuses, splits and redemptions, whether typed in, imported or created automatically. Editing or deleting a transaction recalculates the holding it belongs to.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-TXN-001](../features/F-TXN-001.md) | Transactions list | Live | The Transactions page ("All buys, sells, dividends, SIPs, and corporate actions") lists every transaction, newest trade date first, 50 per … |
| [F-TXN-002](../features/F-TXN-002.md) | Add a transaction | Live | The "Add transaction" dialog ("Record a buy, sell, SIP, dividend, or corporate action. |
| [F-TXN-003](../features/F-TXN-003.md) | Edit a transaction | Live | Opens a transaction in the same dialog ("Edit transaction") with its values filled in; Save changes updates it and recalculates the holding … |
| [F-TXN-004](../features/F-TXN-004.md) | Delete a transaction | Live | Removes a transaction and recalculates its holding and capital gains. |
| [F-TXN-005](../features/F-TXN-005.md) | Duplicate warning on save | Live | When a new transaction matches one already recorded, the dialog shows "You may already have this one" with the server's explanation, Let me … |
| [F-TXN-006](../features/F-TXN-006.md) | Find duplicates | Live | "Duplicates" ("Rows that record the same money twice. |
| [F-TXN-007](../features/F-TXN-007.md) | Add the missing purchase (from Reports) | Live | When a report finds a sale with no purchase behind it, its link opens Transactions with "Add transaction" pre-filled: BUY, the portfolio, … |

Settings for this module: [settings/transactions.md](../settings/transactions.md)

### What this area doesn't do
- There is no bulk edit, bulk delete (other than duplicates) or export from this page (exports are on Reports).
- You cannot search transactions or filter by date, type or asset on this page.
- You cannot attach photos here (photo attachments exist only on Gold pages).
- You cannot add transactions to a portfolio someone else created, even in a family.
- F&O-specific fields (strike, expiry, option type, lot size) are not in this form; F&O is entered on its own page.
