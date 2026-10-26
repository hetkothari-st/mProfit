[Index](../INDEX.md)

# Bank Accounts

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Bank Accounts keeps your savings, current, salary and NRI accounts: bank, branch and IFSC, holder, nominee, linked debit card, balance and balance history. The full account number is optional, stored encrypted, and shown only when you ask. Balances here are not part of the Dashboard's Total Net Worth.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-BANK-001](../features/F-BANK-001.md) | Bank accounts list | Live | The page "Bank Accounts" ("Your savings, current, and salary accounts in one place — branch, IFSC, balance, nominee, and linked debit card … |
| [F-BANK-002](../features/F-BANK-002.md) | Add or edit a bank account | Live | "Add bank account" / "Edit bank account" records an account's details. |
| [F-BANK-003](../features/F-BANK-003.md) | Delete a bank account | Live | Deletes an account after an in-tile confirmation "Delete <bank> account ending <last 4>?". |
| [F-BANK-004](../features/F-BANK-004.md) | Bank account detail | Live | Shows one account: the large building tile, Edit, Record balance, Share details; an Available balance card ("As of <date>", with a pulsing … |
| [F-BANK-005](../features/F-BANK-005.md) | Reveal full account number | Live | The account number shows as "●●●● ●●●● 1234". |
| [F-BANK-006](../features/F-BANK-006.md) | Share bank details | Live | Share details prepares a text with the bank name, holder, full account number, IFSC, branch and branch address. |
| [F-BANK-007](../features/F-BANK-007.md) | Record balance and balance history | Live | Record balance saves an account's balance on a date. |
| [F-BANK-008](../features/F-BANK-008.md) | Recent activity and live balance from email | Live | Recent activity lists up to 50 latest credits and debits attached to this account (date, description, +/− amount). |

Settings for this module: [settings/bank-accounts.md](../settings/bank-accounts.md)

### What this area doesn't do
- Bank balances are not added to Total Net Worth on the Dashboard.
- There is no direct bank connection here; balances come from what you type, statements you record, or email alerts (account-aggregator connections are under Connectors).
- You cannot import a bank statement file on this page.
- You cannot see or share another family member's bank accounts.
- Deleting a recorded balance does not recalculate the current balance.
