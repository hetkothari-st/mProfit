---
id: F-TXN-003
title: "Edit a transaction"
module: "Transactions"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-TXN-002, F-TXN-004, F-TXN-005]
---

[← Transactions](../modules/transactions.md) · [Index](../INDEX.md)

# Edit a transaction

`F-TXN-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Opens a transaction in the same dialog ("Edit transaction") with its values filled in; **Save changes** updates it and recalculates the holding and its capital gains.

**Why it exists:** Code comment: edits cascade "projection + capital-gains" recalculation so nothing is left stale.

**Where to find it:** **Transactions** → click a row.

**Who can use it:** The creator of the portfolio the transaction is in.

**Steps**
1. Click the row. The dialog opens with its values (the asset search box starts empty; the saved asset is kept unless you pick another).
2. Change fields; click **Save changes**. "Transaction updated" appears.

**Controls:** Same as [F-TXN-002](F-TXN-002.md) plus **Delete** ([F-TXN-004](F-TXN-004.md)). Types not offered for new entries (for example DEPOSIT, MATURITY, OPENING BALANCE) still show in the **Type** list for a transaction that has them.

**Fields and rules:** Same as [F-TXN-002](F-TXN-002.md); fields you do not change keep their saved values.

**Settings and toggles here:** None.

**Results:** The row is updated. If its asset or portfolio changed, both the old and the new holding are recalculated, with their capital gains.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Saving this would match a <TYPE> of <qty> <asset> at <price> already recorded on <date>. Save it only if both are genuine." | The edit makes it identical to another row | Check the other row; see Limitations |
| "Transaction not found" | Deleted meanwhile | Refresh the list |

**Limitations:** For an edit, **Record it anyway** on the duplicate banner does not work — the app does not pass the override on edits, so the same warning returns (see DOCUMENTATION_GAPS.md). Change a detail (or delete the other row) instead.

**How it works:** `PATCH /api/transactions/:id` merges your changes with the saved row, re-resolves the asset, recomputes amounts and the asset key, runs the duplicate check excluding itself, saves, then recalculates holdings and capital gains for the old and new asset/portfolio.

**Related features:** [F-TXN-002](F-TXN-002.md), [F-TXN-004](F-TXN-004.md), [F-TXN-005](F-TXN-005.md).

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:179`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:283`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:360`, `packages/api/src/services/holdings/transaction.service.ts:356`, `packages/api/src/services/holdings/transaction.service.ts:461`, `packages/api/src/services/holdings/transaction.service.ts:537`
