[Index](../INDEX.md)

# Record a prepayment or close a loan early

`W-LOAN-002` · Loans

**Goal:** Reflect a part-prepayment, or a full foreclosure.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** The loan exists and is Active; choose **Prepayment option** (Reduce tenure / Reduce EMI) in Edit if not set.

| # | You do | The app does |
|---|---|---|
| 1 | Open the loan, click **Record payment** | Opens **Record payment** |
| 2 | Choose **Prepayment** (or **Foreclosure**), set **Paid on** and **Amount (₹)** | For prepayment shows "Prepayment savings will be shown after recording" |
| 3 | Click **Save** | Toast "Payment recorded"; schedule recomputes from the next EMI |
| 4 | (Prepayment) read the banner "This prepayment saves you ₹… in interest!" | **Dismiss** hides it |
| 5 | (Foreclosure) return to **Loans** | The loan moves under **Closed / Foreclosed** |

**Success:** **Remaining months** drops (Reduce tenure) or **Next EMI** amount drops (Reduce EMI); a foreclosed loan shows status Foreclosed.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Foreclosure recorded by mistake | — | Delete the foreclosure row in **Payment history** (**Del**); the loan reopens as Active |
| No savings banner | The saving versus the original plan is 0 or less | Expected |
