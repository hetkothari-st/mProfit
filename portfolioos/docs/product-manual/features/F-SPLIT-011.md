---
id: F-SPLIT-011
title: "Balances and suggested payments"
module: "Split Expenses"
status: Live
roles: "Group members"
settings: [S-SPLIT-003]
related: [F-SPLIT-012, F-SPLIT-013, F-SPLIT-014]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Balances and suggested payments

`F-SPLIT-011` · Live · Roles: Group members

**What it does:** The **Balances** tab lists each member's net ("you are owed / you owe" for you, "is owed / owes" for others) and then **Suggested payments** (when Simplify debts is on) or **Who owes whom** (when off), each as "<A> pays <B> ₹…" with action buttons. "Everyone is settled up." when there is nothing.

**Why it exists:** Settings text: "Simplify debts (fewest payments to settle)".

**Where to find it:** Group page → **Balances**.

**Who can use it:** Active group members.

**Steps**
1. Read the list. Use **Settle**, **Pay**, **Remind** or **Share pay link** on a row ([F-SPLIT-012](F-SPLIT-012.md) to [F-SPLIT-014](F-SPLIT-014.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Settle** | Button | Opens Settle up pre-filled | — |
| **Pay** | Button | [F-SPLIT-013](F-SPLIT-013.md) | Only on rows where you pay, INR groups only |
| **Remind** | Button | [F-SPLIT-014](F-SPLIT-014.md) | Only on rows where you are paid |
| **Share pay link** | Button | [F-SPLIT-014](F-SPLIT-014.md) | Rows where you are paid, INR groups only |

**Fields and rules:** None.

**Settings and toggles here:** [S-SPLIT-003](../settings/split-expenses.md#s-split-003) **Simplify debts**.

**Results:** None.

**Errors and troubleshooting:** "Couldn't load balances." → **Retry**.

**Limitations:** Members who left are shown only while their balance is non-zero.

**How it works:** `GET /api/split/groups/:id/balances`. Net per member = paid − share + payments made − payments received (group currency). Simplified: repeatedly match the largest creditor with the largest debtor. Pairwise: for each expense, each sharer owes each payer in proportion to what they paid, netted per pair, rounded half-even to 2 places.

**Related features:** [F-SPLIT-012](F-SPLIT-012.md), [F-SPLIT-013](F-SPLIT-013.md), [F-SPLIT-014](F-SPLIT-014.md).

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:340`, `apps/web/src/pages/split/GroupPage.tsx:349`, `apps/web/src/pages/split/GroupPage.tsx:356`, `packages/api/src/services/split/balances.ts:16`, `packages/api/src/services/split/balances.ts:30`, `packages/api/src/services/split/balances.ts:63`, `packages/api/src/services/split/ledger.service.ts:20`
