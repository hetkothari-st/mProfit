---
id: F-SPLIT-009
title: "Comments"
module: "Split Expenses"
status: Live
roles: "Group members"
settings: []
related: [F-SPLIT-006]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Comments

`F-SPLIT-009` · Live · Roles: Group members

**What it does:** A comment thread on each expense: author, time, text; **Post** adds one; your own comments have a delete button ("Delete this comment?").

**Why it exists:** Inferred from behavior: discuss an expense with the group.

**Where to find it:** Expense page → **Comments**.

**Who can use it:** Active group members; delete only your own.

**Steps**
1. Type in **Add a comment** and click **Post**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add a comment** | Text area | Comment text | Hidden on a deleted expense |
| **Post** | Button | Posts | Empty text; while posting |
| Delete comment (bin) | Icon | Deletes after confirmation | Only on your comments; not on a deleted expense |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Comment | Text | Yes | 1–1,000 characters | — | "Write a comment first" / "Comments can be at most 1000 characters" |

**Settings and toggles here:** None.

**Results:** The comment appears to all members; activity records "commented on".

**Errors and troubleshooting:** "Couldn't post the comment", "Couldn't delete the comment", "Only the author can delete a comment".

**Limitations:** Comments can't be edited.

**How it works:** `GET/POST /api/split/expenses/:id/comments`, `DELETE /api/split/comments/:id`.

**Related features:** [F-SPLIT-006](F-SPLIT-006.md).

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:237`, `packages/api/src/controllers/split.controller.ts:147`, `packages/api/src/services/split/comments.service.ts:54`
