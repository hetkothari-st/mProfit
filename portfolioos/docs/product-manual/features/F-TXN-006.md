---
id: F-TXN-006
title: "Find duplicates"
module: "Transactions"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-TXN-004, F-TXN-005]
---

[← Transactions](../modules/transactions.md) · [Index](../INDEX.md)

# Find duplicates

`F-TXN-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** "Duplicates" ("Rows that record the same money twice. The oldest row in each set is kept; tick anything else you want removed. Holdings, gains and the rent khata are recalculated after.") scans all your transactions and rent entries, groups repeats, and deletes only the rows you tick.

**Why it exists:** Code comment: "The same trade can reach the books from a CAS, a contract note and a typed entry — three sources, one event."

**Where to find it:** **Transactions → Find duplicates**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) — over your own portfolios and rentals only.

**Steps**
1. Click **Find duplicates**. "Looking through your books…" shows.
2. Review each set: its label ("N × <TYPE> <qty> <asset> on <date> (<portfolio>)"), reason, a badge **Duplicate** or **Probably fine**, and its rows (amount · source · order/trade numbers · "added <date>"). The oldest row is marked "oldest — kept".
3. Tick or untick rows. Rows in **Duplicate** sets are pre-ticked except the oldest; **Probably fine** sets start unticked.
4. Click **Remove N selected**, then **Yes — remove N row(s)** to confirm. "Removed N transaction(s) and M rent entr(y/ies)" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Row checkbox ("Remove <row>") | Checkbox | Marks a row for removal | — |
| **Remove N selected** → **Yes — remove N row(s)** | Two-step button | Deletes ticked rows | Disabled with nothing ticked or while removing; hidden when there are no sets |
| **Close** | Button | Closes | — |

**Fields and rules:** Up to 1,000 transaction ids and 1,000 rent-entry ids per removal; at least one ("Nothing selected to remove").

**Settings and toggles here:** None.

**Results:** Each ticked row is deleted through its normal delete (holdings, capital gains and rent ledger recalculated).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing is recorded twice across N transactions and M rent entries." | No repeats | — |
| "Could not read your transactions" | Scan failed | Reopen |
| "Could not remove the selected rows" | A delete failed (earlier rows may already be removed) | Reopen and retry |

**Limitations:** A set is "Probably fine" when every row has its own broker order+trade number, or all rows came from one imported file. Rent entries repeat when tenancy, entry type, date, amount and month match ("usually the 'mark received' button pressed twice"). Family members' portfolios are not scanned.

**How it works:** `GET /api/transactions/duplicates` groups by portfolio + asset + type + date + quantity + price (trailing zeros ignored); `POST /api/transactions/duplicates/remove` deletes ids one by one.

**Related features:** [F-TXN-004](F-TXN-004.md), [F-TXN-005](F-TXN-005.md), [D-TXN-001](../dependencies.md#d-txn-001) (Rental khata).

**Sources:** `apps/web/src/pages/transactions/DuplicatesDialog.tsx:42`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:66`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:131`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:158`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:228`, `packages/api/src/controllers/transaction.controller.ts:98`, `packages/api/src/services/imports/duplicates.service.ts:24`, `packages/api/src/services/imports/duplicates.service.ts:120`, `packages/api/src/services/imports/duplicateMatch.ts:81`, `packages/api/src/services/imports/duplicateMatch.ts:124`, `packages/api/src/services/imports/duplicateMatch.ts:189`
