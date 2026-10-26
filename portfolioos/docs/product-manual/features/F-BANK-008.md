---
id: F-BANK-008
title: "Recent activity and live balance from email"
module: "Bank Accounts"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-BANK-007]
---

[← Bank Accounts](../modules/bank-accounts.md) · [Index](../INDEX.md)

# Recent activity and live balance from email

`F-BANK-008` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** **Recent activity** lists up to 50 latest credits and debits attached to this account (date, description, +/− amount). When EveryPaisa reads a bank alert (from your connected Gmail) whose last 4 digits match this account, the credit or debit is attached here and the balance moves with it; the balance then shows "live from Gmail" (tile: "· live").

**Why it exists:** Code comment: lets "UPI/NEFT/INTEREST credits/debits land against the right account based on accountLast4".

**Where to find it:** Bank account detail → **Recent activity** (shown when there is any).

**Who can use it:** The account's owner; requires email ingestion ([D-BANK-001](../dependencies.md#d-bank-001)).

**Steps:** Not applicable — view only; entries arrive automatically.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Inflows add to and outflows subtract from the current balance; a balance record for that day is written with source "auto event".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| An alert's money does not appear on the account | You have two non-closed accounts ending in the same 4 digits, or the alert had no account digits | Give accounts distinct last 4 digits (mark old ones Closed) |
| The balance does not move with alerts | No current balance was ever entered | Enter a current balance once |

**Limitations:** Only the latest 50 entries are shown. Closed accounts are never matched.

**How it works:** When an email-parsed event is turned into a cash flow, the account is matched by last 4 digits among your non-closed accounts (exactly one match required); the balance is changed with an atomic increment, then that day's balance record is upserted. `GET /api/bank-accounts/:id/cashflows?limit=50` lists entries newest first.

**Related features:** [F-BANK-007](F-BANK-007.md), [D-BANK-001](../dependencies.md#d-bank-001), [D-BANK-002](../dependencies.md#d-bank-002) (Cash Activity).

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:136`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:224`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:419`, `packages/api/src/services/banking/bankAccounts.service.ts:458`, `packages/api/src/services/banking/bankAccounts.service.ts:486`, `packages/api/src/services/banking/bankAccounts.service.ts:517`
