---
id: F-SPLIT-015
title: "Group settings and members"
module: "Split Expenses"
status: Live
roles: "Group members"
settings: [S-SPLIT-003, S-SPLIT-004]
related: [F-SPLIT-002, F-SPLIT-011, F-SPLIT-019]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Group settings and members

`F-SPLIT-015` · Live · Roles: Group members

**What it does:** The group's **Settings** tab: **Group name** with **Rename**, **Simplify debts (fewest payments to settle)**, "Currency: <ccy> (fixed once a group is created)", the member list (badge "On EveryPaisa" for linked accounts; **Invite** for saved people with an email who have no account; **Remove**, or for yourself, leave), **Add someone…** select, **+ New person**, and **Archive group** / **Unarchive group**. 1:1 groups show only the member list.

**Why it exists:** Inferred from behavior: manage who shares the ledger and keep finished groups out of the way.

**Where to find it:** Group page → **Settings**.

**Who can use it:** Any active member.

**Steps**
1. Change the name and click **Rename** ("Saved").
2. Pick a person in **Add someone…** to add them.
3. Click **Remove** (or on yourself, **Remove** → **Leave**) and confirm.
4. Click **Invite** to email someone an invitation to join ("Invite sent").
5. Click **Archive group**; if balances are unsettled confirm "This group still has unsettled balances. Archive anyway?".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Rename** | Button | Saves the name | Name empty or unchanged; hidden on 1:1 |
| **Simplify debts (fewest payments to settle)** | Checkbox | [S-SPLIT-003](../settings/split-expenses.md#s-split-003) | Hidden on 1:1 |
| **Invite** | Button | Emails an invite | Only for saved people with an email and no account |
| **Remove** / **Leave** | Button + confirm | Removes a member / you | Hidden on 1:1 |
| **Add someone…** | Select | Adds a saved person | Hidden on 1:1 |
| **+ New person** | Link | [F-SPLIT-002](F-SPLIT-002.md), then adds them | Hidden on 1:1 |
| **Archive group** / **Unarchive group** | Button | [S-SPLIT-004](../settings/split-expenses.md#s-split-004) | Hidden on 1:1; disabled until balances load |

**Fields and rules:** Group name 1–120 characters ("Group name is required").

**Settings and toggles here:** [S-SPLIT-003](../settings/split-expenses.md#s-split-003) **Simplify debts**, [S-SPLIT-004](../settings/split-expenses.md#s-split-004) **Archive group**.

**Results:** Membership and settings change; activity records it. Leaving removes the group from your lists.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Settle this member to zero first" | Member has a balance | Settle up first |
| "A group needs at least one active linked member" | Would leave no account-holder in the group | Keep one |
| "That person is already in the group" | Duplicate | — |
| "A 1:1 ledger always has exactly two people" | 1:1 group | — |
| "They're already on EveryPaisa" / "Already invited today" / "Daily invite limit reached - try again tomorrow" / "Add their email address first" | Invite limits | — |

**Limitations:** The group type can't be changed in the page. A removed member who took part in anything is kept as "left" so history still names them; they can be re-added.

**How it works:** `PATCH /api/split/groups/:id` (name, simplifyDebts, archived), `POST /api/split/groups/:id/members`, `DELETE /api/split/groups/:id/members/:memberId`, `POST /api/split/contacts/:id/invite` (one per person per 24 h, 20 per day).

**Related features:** [F-SPLIT-002](F-SPLIT-002.md), [F-SPLIT-011](F-SPLIT-011.md), [F-SPLIT-019](F-SPLIT-019.md).

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:170`, `apps/web/src/pages/split/GroupPage.tsx:174`, `apps/web/src/pages/split/GroupPage.tsx:188`, `apps/web/src/pages/split/GroupPage.tsx:206`, `apps/web/src/pages/split/GroupPage.tsx:223`, `packages/api/src/services/split/groups.service.ts:185`, `packages/api/src/services/split/groups.service.ts:210`, `packages/api/src/services/split/groups.service.ts:214`, `packages/api/src/services/split/linking.service.ts:22`, `packages/api/src/services/split/linking.service.ts:89`
