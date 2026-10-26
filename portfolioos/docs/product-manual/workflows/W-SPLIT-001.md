[Index](../INDEX.md)

# Share a trip's costs and settle up

`W-SPLIT-001` · Split Expenses

**Goal:** Track a trip's shared spending and settle balances.
**Who:** Any signed-in user ([R-FREE](../roles.md#r-free) and above).

| # | You do | The app does |
|---|---|---|
| 1 | **Tools → Split Expenses → Add person** for each friend (add their email to invite them later) | "<name> added" |
| 2 | **New group**, name it, Type **Trip**, choose **Currency**, tick friends, **Create group** | Opens the group |
| 3 | **Add expense** for each bill (description, amount, who paid, split mode) | Expense listed; your line shows lent/borrowed |
| 4 | Open **Balances** | **Suggested payments** list "<A> pays <B> ₹…" |
| 5 | Record repayments with **Settle** (cash) or **Pay** (UPI, INR groups) | "Payment recorded"; balances drop |
| 6 | When everyone is at zero, **Settings → Archive group** | Group moves under **Show archived** |

**Success:** "Everyone is settled up."
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "No <A>/<B> rate — enter one manually" | Foreign-currency bill without a stored rate | Type the rate |
| "Settle this member to zero first" | Removing someone with a balance | Settle first |
| "<name> hasn't shared a UPI ID in this group yet" | Payee has no UPI ID | Ask them to add one in **Split settings**, or **Settle** in cash |
