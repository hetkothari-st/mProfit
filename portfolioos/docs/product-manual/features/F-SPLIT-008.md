---
id: F-SPLIT-008
title: "Labels"
module: "Split Expenses"
status: Live
roles: "Group members"
settings: []
related: [F-SPLIT-004, F-SPLIT-005]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Labels

`F-SPLIT-008` · Live · Roles: Group members

**What it does:** Group-level labels (name + one of 7 colours) you can tick on an expense; **New label** creates one. Labels filter the group's expense list.

**Why it exists:** Inferred from behavior: categorise shared spending (for example "Food", "Travel").

**Where to find it:** Expense page → **Labels**; also in the add/edit dialog.

**Who can use it:** Active group members.

**Steps**
1. On an expense click **New label**, type a **Label name**, pick a colour, **Create**.
2. Tick or untick labels on the expense.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Label chips | Toggles | Set labels on the expense | Read-only on a deleted expense |
| **New label** | Button | Opens the create form | — |
| **Label name**, colour | Text / radio | New label | — |
| **Create** / **Cancel** | Buttons | Save or close | Create disabled with an empty name |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Label name | Text | Yes | 1–30 characters, unique in the group | — | "Label name must be 1–30 characters" / "That label already exists" |
| Colour | Choice | Yes | One of 7 hex colours | Red | "Pick a colour like #3D5A80" |
| Labels per expense | — | — | At most 10, from the same group | — | "At most 10 labels" |

**Settings and toggles here:** None.

**Results:** Labels show on the expense and in the group list.

**Errors and troubleshooting:** "Couldn't create the label", "Couldn't update labels".

**Limitations:** Labels can't be renamed or deleted in the page (delete exists in the API).

**How it works:** `GET/POST /api/split/groups/:id/labels`, `PUT /api/split/expenses/:id/labels`, `DELETE /api/split/labels/:id`.

**Related features:** [F-SPLIT-004](F-SPLIT-004.md), [F-SPLIT-005](F-SPLIT-005.md).

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:173`, `apps/web/src/pages/split/ExpenseExtras.tsx:187`, `packages/api/src/services/split/labels.service.ts:13`, `packages/api/src/services/split/labels.service.ts:33`, `packages/api/src/services/split/labels.service.ts:50`
