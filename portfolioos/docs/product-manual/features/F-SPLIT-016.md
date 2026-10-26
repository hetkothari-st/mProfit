---
id: F-SPLIT-016
title: "Friend balances and 1:1 expenses"
module: "Split Expenses"
status: Live
roles: "R-FREE…R-PRO, R-MANAGER"
settings: [S-SPLIT-008]
related: [F-SPLIT-001, F-SPLIT-005]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Friend balances and 1:1 expenses

`F-SPLIT-016` · Live · Roles: [R-FREE](../roles.md#r-free)…[R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** A friend's page shows **Overall** (owes you / you owe, "≈" if converted), "Includes groups in other currencies, converted at the latest rate." when relevant, and **By group** (each group's balance; the 1:1 ledger shows as "Just you two"). **Add expense** opens a 1:1 ledger with that person (created on first use).

**Why it exists:** Inferred from behavior: track money between two people without making a group.

**Where to find it:** **Tools → Split Expenses →** a name under **Friends** (route `/split/friends/:key`).

**Who can use it:** [R-FREE](../roles.md#r-free) and above, [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Click **Add expense** to add a 1:1 expense ([F-SPLIT-005](F-SPLIT-005.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add expense** | Button | Opens/creates the 1:1 ledger and the expense dialog | Hidden for people who are not your saved contacts ("Add expenses with <name> inside your shared groups.") |
| Group rows | Links | Open the group | — |

**Fields and rules:** As [F-SPLIT-005](F-SPLIT-005.md).

**Settings and toggles here:** [S-SPLIT-008](../settings/split-expenses.md#s-split-008) **Home currency**.

**Results:** A 1:1 group (type "DIRECT") the first time.

**Errors and troubleshooting:** "No balances with this person." / "Could not open your 1:1 expenses".

**Limitations:** 1:1 ledgers always have exactly two people.

**How it works:** `POST /api/split/groups/direct` (finds or creates under a lock so two tabs can't create two); balances from `GET /api/split/friends`.

**Related features:** [F-SPLIT-001](F-SPLIT-001.md), [F-SPLIT-005](F-SPLIT-005.md).

**Sources:** `apps/web/src/pages/split/FriendPage.tsx:48`, `apps/web/src/pages/split/FriendPage.tsx:55`, `apps/web/src/pages/split/FriendPage.tsx:62`, `packages/api/src/services/split/groups.service.ts:231`
