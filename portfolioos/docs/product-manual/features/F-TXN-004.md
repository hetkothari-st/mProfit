---
id: F-TXN-004
title: "Delete a transaction"
module: "Transactions"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-TXN-003, F-TXN-006]
---

[← Transactions](../modules/transactions.md) · [Index](../INDEX.md)

# Delete a transaction

`F-TXN-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Removes a transaction and recalculates its holding and capital gains.

**Why it exists:** Inferred from behavior: correct mistakes and remove wrong imports.

**Where to find it:** **Transactions** → row → **Delete**.

**Who can use it:** The creator of the portfolio.

**Steps**
1. Open the transaction and click **Delete**.
2. Confirm "Delete this transaction? Holdings will recalculate." "Transaction deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** | Button | Deletes after confirmation | Edit only; disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The row is gone; the holding is recalculated (it disappears when nothing is left); capital-gain records that used it are rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Delete failed" | Not yours, or server error | — |

**Limitations:** No undo.

**How it works:** `DELETE /api/transactions/:id`, then holding and capital-gains recalculation for that asset.

**Related features:** [F-TXN-003](F-TXN-003.md), [F-TXN-006](F-TXN-006.md).

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:304`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:367`, `packages/api/src/services/holdings/transaction.service.ts:549`, `packages/api/src/services/holdings/transaction.service.ts:568`
