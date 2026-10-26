---
id: F-SPLIT-006
title: "Expense details, delete and restore"
module: "Split Expenses"
status: Live
roles: "Group members"
settings: []
related: [F-SPLIT-005, F-SPLIT-007, F-SPLIT-010]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Expense details, delete and restore

`F-SPLIT-006` · Live · Roles: Group members

**What it does:** The expense page shows the description, date and split mode ("Split equally", "Exact amounts", "By percent", "By shares"), the amount (and its group-currency equivalent with the rate if foreign), **Paid by** and **Split between** lists, receipt, labels, comments, Cash Activity ([F-SPLIT-007](F-SPLIT-007.md) to [F-SPLIT-010](F-SPLIT-010.md)) and "Added <date>". **Edit** opens [F-SPLIT-005](F-SPLIT-005.md); **Delete** deletes at once with an 8-second "Expense deleted — Undo" toast; a deleted expense shows **Restore**.

**Why it exists:** Inferred from behavior: a delete is reversible because it changes everyone's balances.

**Where to find it:** Click an expense in a group (route `/split/expenses/:id`).

**Who can use it:** Active group members.

**Steps**
1. Click **Delete**; click **Undo** in the toast to bring it back, or later open it and click **Restore** ("Expense restored").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Edit** | Button | Opens the edit dialog | Hidden when deleted |
| **Delete** | Button | Soft-deletes | Hidden when deleted |
| **Undo** | Toast button | Restores | For 8 seconds |
| **Restore** | Button | Restores | Only when deleted |
| <group name> | Back link | Back to the group | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Deleting removes the expense from balances and from linked Cash Activity entries; restoring puts both back.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This expense isn't available." | Not a member / doesn't exist | **Back** |
| "Could not delete" / "Could not restore" + reason | e.g. a member who left would be left with a balance | Re-add them |

**Limitations:** No confirmation before delete (Undo instead). Receipts, labels and comments are read-only on a deleted expense.

**How it works:** `DELETE /api/split/expenses/:id` sets `deletedAt` and records `EXPENSE_DELETED`; `POST …/restore` clears it. Both re-sync Cash Activity links.

**Related features:** [F-SPLIT-005](F-SPLIT-005.md), [F-SPLIT-007](F-SPLIT-007.md), [F-SPLIT-010](F-SPLIT-010.md).

**Sources:** `apps/web/src/pages/split/ExpenseDetailPage.tsx:19`, `apps/web/src/pages/split/ExpenseDetailPage.tsx:47`, `apps/web/src/pages/split/ExpenseDetailPage.tsx:50`, `apps/web/src/pages/split/ExpenseDetailPage.tsx:74`, `packages/api/src/services/split/expenses.service.ts:184`, `packages/api/src/services/split/expenses.service.ts:190`
