[Index](../INDEX.md)

# Delete your account, and restore it

`W-SET-002` · Settings

**Goal:** Erase the account and its data (or undo within 30 days).
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** Remove members from (or hand over) any family you created that others are in.

| # | You do | The app does |
|---|---|---|
| 1 | **Settings → Danger zone → Delete account** | Lists what will be erased; checks blockers |
| 2 | **Continue**, type DELETE, enter password (or email code), **Continue** | Shows "Last chance" |
| 3 | **Delete my account** | Schedules deletion in 30 days, signs out every device, toast with the date |
| 4 | (To undo) Sign in within 30 days, **Restore account** | Cancels deletion, toast "Your account has been restored." |
| 5 | (Otherwise) Nothing | At 03:30 IST after the date passes, the account and data are erased |

**Success:** Account scheduled for deletion, then erased.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "You own a family with other members (…)…" | Blocker | Remove members or hand over the family ([D-SET-005](../dependencies.md#d-set-005)) |
| "Incorrect password" | Wrong password | Retry or use the email code |
| Account not erased after 30 days | Someone joined your family during the grace period | Sign in, fix the blocker, delete again |
