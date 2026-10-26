[Index](../INDEX.md)

# Turn an owned property into a rental

`W-REST-003` · Real Estate

**Goal:** Track tenants for a property you own.
**Who:** Any signed-in user.
**Before you start:** The property exists in Real Estate and is not sold.

| # | You do | The app does |
|---|---|---|
| 1 | Property page → **Make rental** | Creates a linked Rental record; status Rented out; toast with **Undo** |
| 2 | Click **Open rental record** | Opens `/rental/:id` |
| 3 | Continue with [W-RENT-001](W-RENT-001.md) step 3 | — |

**Success:** Banner "This property is also tracked in Rentals." on the Real Estate page.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Undo failed" / "Internal server error" when removing | The rental has tenancies or expenses | Keep the link (tenancies cannot be deleted in the app) |
