[Index](../INDEX.md)

# Close an F&O position at expiry

`W-FNO-002` · Futures & Options

**Goal:** Book the expiry of a contract held to expiry.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

| # | You do | The app does |
|---|---|---|
| 1 | Expiry day, after 17:30 IST | Job creates an expiry close request, sets status "EXPIRY ?", alert "… expires today" |
| 2 | **F & O** → **Expiry** | Lists "Expiry close <date>" with contracts and settlement |
| 3 | Click **Approve** | "Approved"; closing trade booked at settlement; position closed (EXPIRED_WORTHLESS if 0) |

**Success:** The contract moves to **Closed**; P&L appears under **Tax / P&L**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "No settlement price for this contract yet — add it before closing the position at expiry." | Bhavcopy not stored | Retry after the 16:45 bhavcopy job has run; there is no manual price field |
| Clicked **Reject** by mistake | Request rejected; position stays "EXPIRY ?" | No in-app way to re-open it (DOCUMENTATION_GAPS.md) |
