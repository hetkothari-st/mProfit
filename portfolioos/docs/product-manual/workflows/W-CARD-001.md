[Index](../INDEX.md)

# Add a credit card and follow a statement to payment

`W-CARD-001` · Credit Cards

**Goal:** Track a card's bill and get due-date reminders.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** Card issuer, product, last 4 digits, limit; this month's statement.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Credit Cards → Add card**; fill issuer, card, last 4 (or full number), limit, due day | Preview of the card face |
| 2 | **Save** | Toast "Card added" |
| 3 | Open the card, **Add statement**: month, amount, minimum due, due date, **Save** | "Statement added"; **Outstanding** becomes the statement amount; **Next due** shows the date |
| 4 | Reminders arrive 30, 15, 7 and 1 days before the due date in **Alerts** | — |
| 5 | After paying, click the tick, confirm amount and date, **Confirm** | "Statement marked as paid"; status Paid |

**Success:** Statement shows **paid** with the date.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Request failed with status code 409" when adding | A statement for that month exists | Use a different month or delete the old one |
| **Outstanding** unchanged after paying | Known defect: payments don't update outstanding | Add the next statement when it arrives |
| "That card number doesn't check out — check for a mistyped digit" | Luhn check failed | Re-type the number |
