---
id: F-TXN-005
title: "Duplicate warning on save"
module: "Transactions"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-TXN-002, F-TXN-003, F-TXN-006]
---

[← Transactions](../modules/transactions.md) · [Index](../INDEX.md)

# Duplicate warning on save

`F-TXN-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** When a new transaction matches one already recorded, the dialog shows "You may already have this one" with the server's explanation, **Let me check** and **Record it anyway**.

**Why it exists:** Code comment: the same trade can arrive "in a CAS, again in a contract note, again typed in"; this stops double-counting unless you confirm.

**Where to find it:** Top of the Add/Edit transaction dialog after saving.

**Who can use it:** Same as [F-TXN-002](F-TXN-002.md).

**Steps**
1. Click **Let me check** to close the banner and review, or
2. Click **Record it anyway** to save it as a second, genuine trade.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Let me check** | Button | Hides the banner | — |
| **Record it anyway** | Button | Saves with the duplicate check skipped | Disabled while saving; does not work for edits |

**Fields and rules:** A duplicate is another transaction in the same portfolio, same asset, same type, same trade date, same quantity and same price (charges ignored). It is not a duplicate when both rows carry broker order and trade numbers and they differ (two fills of one order).

**Settings and toggles here:** None.

**Results:** With **Record it anyway**, the transaction is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "A <TYPE> of <qty> <asset> at <price> on <date> is already recorded. Record it again only if this is a second, genuine trade." | Duplicate found | Decide as above |

**Limitations:** See [F-TXN-003](F-TXN-003.md) for edits.

**How it works:** Server error 409 `DUPLICATE_TRANSACTION` with the matching row's id; the app keeps your values and resends with `allowDuplicate`.

**Related features:** [F-TXN-002](F-TXN-002.md), [F-TXN-006](F-TXN-006.md).

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:229`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:383`, `packages/api/src/services/holdings/transaction.service.ts:265`, `packages/api/src/services/holdings/transaction.service.ts:288`, `packages/api/src/services/imports/duplicateMatch.ts:244`, `packages/api/src/services/imports/duplicateMatch.ts:262`
