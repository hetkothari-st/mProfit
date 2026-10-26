---
id: F-SPLIT-014
title: "Remind and share a pay link"
module: "Split Expenses"
status: Live
roles: "Member who is owed"
settings: [S-SPLIT-007]
related: [F-SPLIT-011, F-SPLIT-017]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Remind and share a pay link

`F-SPLIT-014` · Live · Roles: Member who is owed

**What it does:** On a balance row where someone owes you: **Remind** emails them "Reminder: you owe <you> <amount>"; **Share pay link** opens your phone's share sheet (or copies the link) with "<name>, pay ₹… for <group>: <upi link>" that pays your own UPI ID.

**Why it exists:** Code comment: "requestLink only reveals the caller's own UPI ID."

**Where to find it:** Group page → **Balances** (rows where you are paid).

**Who can use it:** The member who is owed.

**Steps**
1. Click **Remind** ("Reminder sent") or **Share pay link**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Remind** | Button | Emails a reminder | While sending |
| **Share pay link** | Button | Shares/copies your UPI link | INR groups only; disabled while the link loads |
| **Open Split settings** | Link | Shown with a missing-UPI error | — |

**Fields and rules:** None.

**Settings and toggles here:** Your [S-SPLIT-007](../settings/split-expenses.md#s-split-007) **UPI ID** (required for **Share pay link**).

**Results:** An email (Remind) or a shared message.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Already reminded today" | Already reminded this person in this group today | Wait |
| "Daily reminder limit reached - try again tomorrow" | 30 reminders in 24 hours | Wait |
| "<name> has no email on file" | No email for them | Add their email (not possible in the page for an existing person) |
| "Reminder saved but email couldn't be sent right now" | Mail failure | Try later |
| "add your UPI ID in Split settings first" | No UPI ID | **Open Split settings** |

**Limitations:** UPI links only for INR groups.

**How it works:** `POST /api/split/reminders` (once per day per person per group, 30/day per user); `GET /api/split/groups/:id/request-link?from=` uses only your own UPI ID.

**Related features:** [F-SPLIT-011](F-SPLIT-011.md), [F-SPLIT-017](F-SPLIT-017.md).

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:237`, `apps/web/src/pages/split/GroupPage.tsx:286`, `packages/api/src/services/split/notify.service.ts:19`, `packages/api/src/services/split/notify.service.ts:29`, `packages/api/src/services/split/settings.service.ts:111`
