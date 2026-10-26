---
id: F-SPLIT-001
title: "Split home"
module: "Split Expenses"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-SPLIT-008]
related: [F-SPLIT-002, F-SPLIT-003, F-SPLIT-016, F-SPLIT-017]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Split home

`F-SPLIT-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Split Expenses** page shows two totals (**You are owed**, **You owe**), your **Groups** (name, number of people, currency and your balance), **Friends** (each person's overall balance with you across groups) and **Recent activity** (the latest 20 events, each linking to its group). Archived groups are hidden behind **Show archived (N)**.

**Why it exists:** Page description: "Share costs with friends, flatmates and trips — see who owes whom and settle up."

**Where to find it:** **Tools → Split Expenses** (route `/split`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) (on the managed person's groups; your display name is the managed person's).

**Steps**
1. Open **Tools → Split Expenses**.
2. Click a group or a friend to open it; use **New group** or **Add person** to start.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Settings** | Link | Opens `/split/settings` ([F-SPLIT-017](F-SPLIT-017.md)) | — |
| **Add person** | Button | [F-SPLIT-002](F-SPLIT-002.md) | — |
| **New group** | Button | [F-SPLIT-003](F-SPLIT-003.md) | — |
| **Show archived (N)** / **Hide archived** | Link button | Shows archived groups | Only when archived groups exist |
| **Retry** | Link button | Reloads a failed section | On error |

**Fields and rules:** None — view only.

**Settings and toggles here:** [S-SPLIT-008](../settings/split-expenses.md#s-split-008) **Home currency** — the currency of the totals and friend balances.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load balances." / "Couldn't load groups." / "Couldn't load activity." | Request failed | **Retry** |
| "No groups yet" | No groups | **New group** |
| "Balances with people appear here once you add expenses." | No friend balances | Add expenses in a group |

**Limitations:** Friend balances from groups in another currency are converted at the latest exchange rate and marked "≈"; if no rate exists for that currency pair, that group's balance is left out of the friend's total without a separate warning. A person you added appears under **Friends** only once they are in one of your groups.

**How it works:** `GET /api/split/friends` walks every group you are in (including 1:1 and archived), computes debts per pair (simplified or pairwise per the group setting), converts to your home currency and sums per person (rounded half-even to 2 places). `GET /api/split/groups` (active, non-1:1) and `?includeArchived=1`; `GET /api/split/activity` (default 50, max 200).

**Related features:** [F-SPLIT-003](F-SPLIT-003.md), [F-SPLIT-016](F-SPLIT-016.md), [F-SPLIT-017](F-SPLIT-017.md).

**Sources:** `apps/web/src/pages/split/SplitHomePage.tsx:81`, `apps/web/src/pages/split/SplitHomePage.tsx:93`, `apps/web/src/pages/split/SplitHomePage.tsx:139`, `apps/web/src/pages/split/SplitHomePage.tsx:160`, `packages/api/src/services/split/ledger.service.ts:33`, `packages/api/src/services/split/ledger.service.ts:58`, `packages/api/src/services/split/ledger.service.ts:68`
