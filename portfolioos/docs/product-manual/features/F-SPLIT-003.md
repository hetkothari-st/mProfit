---
id: F-SPLIT-003
title: "New group"
module: "Split Expenses"
status: Live
roles: "R-FREE…R-PRO, R-MANAGER"
settings: [S-SPLIT-001, S-SPLIT-002, S-SPLIT-003]
related: [F-SPLIT-002, F-SPLIT-004, F-SPLIT-015]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# New group

`F-SPLIT-003` · Live · Roles: [R-FREE](../roles.md#r-free)…[R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **New group** creates a group with **Group name**, **Type** (Trip, Home, Couple, Other), **Currency** and **People** (tick saved people, or **+ Add a person**). You are added automatically under your name. After **Create group** the app opens the group.

**Why it exists:** Inferred from behavior: a group holds one shared ledger in one currency.

**Where to find it:** **Tools → Split Expenses → New group**.

**Who can use it:** [R-FREE](../roles.md#r-free) and above, [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Enter **Group name**, choose **Type** and **Currency**, tick people.
2. Click **Create group** ("Group created"); the group page opens.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Type** | Select | [S-SPLIT-001](../settings/split-expenses.md#s-split-001) | — |
| **Currency** | Select | [S-SPLIT-002](../settings/split-expenses.md#s-split-002) | — |
| People checkboxes | Checkbox | Include a saved person | — |
| **+ Add a person** | Link | Opens [F-SPLIT-002](F-SPLIT-002.md); the new person is ticked | — |
| **Create group** / **Cancel** | Buttons | Create or close | Create disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Group name | Text | Yes | 1–120 characters | — | "Name the group" |
| Type | Select | No | Trip / Home / Couple / Other | Trip (server default Other) | — |
| Currency | Select | No | INR, USD, EUR, GBP, AED, SGD, THB, JPY, AUD, CAD | INR | — |
| People | Checkboxes | No | Up to 50 | None | "That person is already in the group" |

**Settings and toggles here:** [S-SPLIT-001](../settings/split-expenses.md#s-split-001) **Group type**, [S-SPLIT-002](../settings/split-expenses.md#s-split-002) **Group currency** (fixed after creation), [S-SPLIT-003](../settings/split-expenses.md#s-split-003) **Simplify debts** (on for new groups).

**Results:** A group with you and the chosen people; activity "created the group".

**Errors and troubleshooting:** "Could not create the group" with the reason.

**Limitations:** The currency can't be changed later ("fixed once a group is created"). The type can't be changed in the page.

**How it works:** `POST /api/split/groups` with `myDisplayName` (your name, or the managed person's when managing an account) and contact ids; created in one transaction with a `GROUP_CREATED` activity.

**Related features:** [F-SPLIT-002](F-SPLIT-002.md), [F-SPLIT-004](F-SPLIT-004.md), [F-SPLIT-015](F-SPLIT-015.md).

**Sources:** `apps/web/src/pages/split/NewGroupDialog.tsx:15`, `apps/web/src/pages/split/NewGroupDialog.tsx:21`, `apps/web/src/pages/split/NewGroupDialog.tsx:41`, `apps/web/src/pages/split/NewGroupDialog.tsx:57`, `apps/web/src/pages/split/useSplitDisplayName.ts:5`, `packages/api/src/controllers/split.controller.ts:34`, `packages/api/src/services/split/groups.service.ts:123`
