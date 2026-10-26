[Index](../INDEX.md)

# Track a loan given on monthly EMIs

`W-LOAN-005` · Loans

**Goal:** Tick off monthly instalments someone pays you.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** Agreed EMI, number of months and first EMI date.

| # | You do | The app does |
|---|---|---|
| 1 | **Lend money**, choose **Monthly EMI**, fill **EMI (₹)**, **Months**, **First EMI on** | Validates ("Enter the EMI amount", "Enter the number of monthly instalments", "Pick the first EMI date") |
| 2 | **Add loan** | The loan page opens with **Repayment schedule** |
| 3 | Each month click **Paid** on the instalment | Toast "EMI N marked paid" |
| 4 | For a short payment click **Partial**, enter **Received (₹)** and **On**, **Save** | Status **Partly paid**; excess flows to later instalments |
| 5 | If late, use **Mark EMI N paid** in the overdue banner | Settles the oldest open instalment |

**Success:** "N of M done"; the loan can be marked settled.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Reopen the loan to update its instalments" | Loan is closed | **More actions → Reopen** |
| A row shows "From history" | A lump-sum repayment covered it | Remove that History entry to free the row |
