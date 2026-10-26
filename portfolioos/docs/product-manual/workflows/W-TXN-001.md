[Index](../INDEX.md)

# Record a trade and clean up a duplicate

`W-TXN-001` · Transactions

**Goal:** Add a buy, handle a "duplicate" warning, and remove a double entry.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** A portfolio you created.

| # | You do | The app does |
|---|---|---|
| 1 | **Transactions → Add transaction** | The dialog opens with today's date and type BUY |
| 2 | Pick the portfolio; search the stock (2+ letters) and pick it | "Selected: <name>"; asset class becomes EQUITY |
| 3 | Enter **Quantity**, **Price**, optional **Charges (optional)**; check **Net (outflow)** | Gross, charges and net update as you type |
| 4 | Click **Add transaction** | "Transaction added", or the banner "You may already have this one" |
| 5 | If the banner appears and it really is a second trade, click **Record it anyway**; otherwise **Let me check** and **Cancel** | Saved, or nothing saved |
| 6 | Later, after an import, click **Find duplicates** | Sets of repeated rows; obvious repeats are pre-ticked |
| 7 | Review, then **Remove N selected** → **Yes — remove N row(s)** | "Removed N transaction(s) …"; holdings recalculate |

**Success:** Each trade appears once; holdings and gains are correct.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Add transaction** does nothing | Trade date or price invalid/blank (no message is shown) | Fill a valid date and price |
| "Forbidden" | The portfolio was created by someone else | Add it in your own portfolio |
| Editing shows "Saving this would match …" and **Record it anyway** does nothing | Override is not sent for edits | Change a detail or delete the other row |
