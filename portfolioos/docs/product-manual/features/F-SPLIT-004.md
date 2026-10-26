---
id: F-SPLIT-004
title: "Group page and expense list"
module: "Split Expenses"
status: Live
roles: "Group members"
settings: [S-SPLIT-003]
related: [F-SPLIT-005, F-SPLIT-006, F-SPLIT-011, F-SPLIT-012, F-SPLIT-015]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Group page and expense list

`F-SPLIT-004` · Live · Roles: Group members

**What it does:** A group page shows the name, people count and currency (or "Your 1:1 expenses"), **Your balance**, and four tabs: **Expenses**, **Balances** ([F-SPLIT-011](F-SPLIT-011.md)), **Activity**, **Settings** ([F-SPLIT-015](F-SPLIT-015.md)). **Expenses** lists expenses and payments by day (newest first): each expense shows a paperclip when it has a receipt, "<who> paid <amount>" (or "N people paid"), up to two label chips (+N), and your line ("you lent ₹…", "you borrowed ₹…", "settled", "not involved"); payments show "Payment — <A> paid <B> <amount>" with a delete button. Label chips at the top (**All**, then each label) filter expenses (payments are hidden while a label is selected).

**Why it exists:** Inferred from behavior: one view of what was spent and paid in the group.

**Where to find it:** **Tools → Split Expenses →** a group (route `/split/groups/:id`).

**Who can use it:** Active members of the group ([R-FREE](../roles.md#r-free) and above, [R-MANAGER](../roles.md#r-manager)).

**Steps**
1. Click an expense to open it ([F-SPLIT-006](F-SPLIT-006.md)).
2. Click a label chip to filter; **All** to clear.
3. Click the bin on a payment and confirm **Delete** to remove it ("Payment deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Settle up** | Button | [F-SPLIT-012](F-SPLIT-012.md) | — |
| **Add expense** | Button | [F-SPLIT-005](F-SPLIT-005.md) | — |
| Tabs **Expenses** / **Balances** / **Activity** / **Settings** | Tabs | Switch view | — |
| Label filter chips | Toggle buttons | Filter by label | Shown when the group has labels |
| Delete payment (bin) | Icon | Asks "Delete this payment? Balances will change back." | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-SPLIT-003](../settings/split-expenses.md#s-split-003) affects balances.

**Results:** Deleting a payment restores the balances it had settled.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This group doesn't exist or you're no longer in it." | Not a member | **Back to Split Expenses** |
| "Couldn't load expenses." / "Couldn't load payments." / "Couldn't load activity." | Request failed | **Retry** |
| "No expenses yet." | Empty group | **Add expense** |

**Limitations:** Payments can't be edited in the page (API only). Deleted expenses are not listed in the group; you reach one again only through its own address or the **Undo** toast (the API can list them).

**How it works:** `GET /api/split/groups/:id`, `/expenses`, `/settlements`, `/balances`, `/labels`, `/activity`; `DELETE /api/split/settlements/:id` (soft delete with `SETTLEMENT_DELETED` activity; refused if it would leave a member who has left the group with a non-zero balance).

**Related features:** [F-SPLIT-005](F-SPLIT-005.md), [F-SPLIT-006](F-SPLIT-006.md), [F-SPLIT-011](F-SPLIT-011.md), [F-SPLIT-012](F-SPLIT-012.md), [F-SPLIT-015](F-SPLIT-015.md).

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:31`, `apps/web/src/pages/split/GroupPage.tsx:68`, `apps/web/src/pages/split/GroupPage.tsx:118`, `apps/web/src/pages/split/GroupPage.tsx:294`, `apps/web/src/pages/split/GroupPage.tsx:310`, `apps/web/src/pages/split/GroupPage.tsx:386`, `packages/api/src/services/split/groups.service.ts:47`
