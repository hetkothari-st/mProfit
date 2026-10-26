[Index](../INDEX.md)

# Record rent and fix mistakes

`W-RENT-002` · Rental

**Goal:** Keep the khata accurate.
**Who:** Any signed-in user.
**Before you start:** A tenancy exists.

| # | You do | The app does |
|---|---|---|
| 1 | Rental property page → month row → **Received** → amount, date → **Mark received** | Adds a payment, creates a cash inflow, month becomes Received/Partial |
| 2 | (Duplicate) dialog shows "This rent is already on the khata" | Click **Record it anyway** only for a real second payment |
| 3 | Wrong month? Row → **Undo** | Removes payments pinned to that month and their inflows |
| 4 | Rent-free month? **Skip** (undo with **Undo**) | Month no longer owed |
| 5 | Late fee / discount / deposit refund: tenant name → khata → **You gave** / **You got** | Entry added, balance recomputed |

**Success:** Khata balance shows "Settled up" or the correct "To collect".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Skip** or **Undo** does nothing | Server refused silently (payment exists / not pinned) | Delete the payment in the khata, then retry |
| An auto-matched month is wrong | Bank credit matched the wrong month | **Undo** on that row (note: this also removes the bank credit's cash entry — DOCUMENTATION_GAPS [F-RENT-010](../features/F-RENT-010.md)) |
