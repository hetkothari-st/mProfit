[Index](../INDEX.md)

# Add a home loan and keep it up to date

`W-LOAN-001` · Loans

**Goal:** Track an existing home loan so the outstanding balance, next EMI, tax benefit and reminders are right.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) ([R-MANAGER](../roles.md#r-manager) for the managed person).
**Before you start:** Have the sanction letter or loan statement: principal, rate, tenure in months, EMI, disbursement date, first EMI date.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Asset Classes → Loans**, click **Add loan** | Opens **Add loan** (type Home, Reduce tenure, Not sure, None, Active) |
| 2 | Pick the lender, fill borrower, principal, rate, tenure, EMI (or click the calculator button), both dates | Validates required fields ("Required") |
| 3 | Set **Tax benefit section** to **80C + 24B (Home loan)**; set **Rate type** **Floating**, **Linked to** **Repo rate (EBLR)** if applicable | Shows the floating fields |
| 4 | Click **Save** | Toast "Loan added"; the loan card appears with **Outstanding**, **Next EMI**, **EMIs left** |
| 5 | Open the loan, scroll to **Amortization schedule** | Table scrolls to the first unpaid month; earlier unpaid months show **Overdue** |
| 6 | Click **Mark paid** on each EMI already paid | Toast "Marked paid" per row; outstanding and interest paid update |
| 7 | Each month, click **Mark paid** on the new EMI (or wait for the reminder in **Alerts**) | Reminders arrive 30, 15, 7, 1 days before and on the due day |

**Success:** **Outstanding balance** matches your lender statement within rounding; **Tax benefit — Section 80C + 24(b)** shows this year's estimate.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Toast "Failed to add loan" with "Request failed with status code 422" | An amount has commas or ₹, or tenure is above 600 | Use plain numbers |
| Outstanding differs from the bank's figure | Your bank's EMI/rounding or past rate resets differ from the stored terms | Edit the rate/EMI to current values, or record prepayments |
| Dashboard liability higher than the Loans page | Past EMIs not marked paid count differently on the dashboard | Mark past EMIs paid |
