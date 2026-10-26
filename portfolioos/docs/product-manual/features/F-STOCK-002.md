---
id: F-STOCK-002
title: "Add, edit and delete stock transactions"
module: "Stocks"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER (portfolio owner)"
settings: []
related: [F-STOCK-001]
---

[← Stocks](../modules/stocks.md) · [Index](../INDEX.md)

# Add, edit and delete stock transactions

`F-STOCK-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) (portfolio owner)

**What it does:** **Add transaction** opens the app's standard transaction form to record a stock or ETF trade. In an expanded stock row each transaction has a pencil (**Edit**) that opens the same form pre-filled, and a bin (**Delete**) that asks "Sure?" with **Yes** / **No**.

**Why it exists:** Holdings are built only from transactions, so this is how you change what the page shows. Inferred from behavior.

**Where to find it:** **Asset Classes → Stocks** → **Add transaction** (header or empty state); edit/delete inside an expanded row (route `/stocks`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) on the managed person's portfolios. Only the owner of the portfolio can save or delete (others get "Forbidden").

**Steps**
1. Click **Add transaction**. The "Add transaction" form opens ([D-ASSET-002](../dependencies.md#d-asset-002)).
2. Fill it in and save. The holdings and transactions refresh.
3. To edit, expand a stock row and click the pencil. The "Edit transaction" form opens pre-filled; change and save.
4. To delete, click the bin, then **Yes**. The toast "Transaction deleted" appears and the holding is rebuilt; **No** cancels.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add transaction** | Button | Opens the add form | — |
| Edit (pencil, tooltip "Edit") | Icon button | Opens the edit form for that transaction | — |
| Delete (bin, tooltip "Delete") | Icon button | Shows "Sure?" **Yes** / **No** | — |
| **Yes** | Button | Deletes the transaction | Spinner while deleting |
| **No** | Button | Cancels the delete | — |

**Fields and rules:** The form's fields and rules are documented with the Transactions module ([D-ASSET-002](../dependencies.md#d-asset-002)).

**Settings and toggles here:** None.

**Results:** A new, changed or deleted transaction makes the server rebuild the holding for that stock and recompute capital gains for it; the page, portfolio and dashboard data refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete" (or the server's message) | Delete refused, e.g. "Forbidden" for a portfolio you don't own, "Transaction not found" | Check you own the portfolio; reload |

**Limitations:** Delete has no undo.

**How it works:** Delete calls `DELETE /api/transactions/:id`; the server checks the portfolio belongs to you, deletes the row, rebuilds the holding (FIFO replay) and recomputes stored capital gains for that asset. Saving a new Equity/ETF transaction also triggers a background refresh of held stock prices.

**Related features:** [F-STOCK-001](F-STOCK-001.md), [D-ASSET-002](../dependencies.md#d-asset-002).

**Sources:** `apps/web/src/pages/assetClasses/StocksPage.tsx:100`, `apps/web/src/pages/assetClasses/StocksPage.tsx:221`, `apps/web/src/pages/assetClasses/StocksPage.tsx:654`, `apps/web/src/pages/assetClasses/StocksPage.tsx:681`, `packages/api/src/services/holdings/transaction.service.ts:549`, `packages/api/src/services/holdings/transaction.service.ts:344`
