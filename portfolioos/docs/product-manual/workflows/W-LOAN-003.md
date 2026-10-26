[Index](../INDEX.md)

# Check whether refinancing pays off

`W-LOAN-003` · Loans

**Goal:** Compare your loan with today's lowest market rate after switching costs.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** The loan is Active and its type is not **Other**.

| # | You do | The app does |
|---|---|---|
| 1 | Open the loan, find **Compare with market** | Shows "Your rate X%" and "Market from Y% (<lender>, as of <date>)" |
| 2 | If asked "Fixed or floating?", click one | Saves the rate type |
| 3 | Enter the new lender's **Processing fee (%)** and **Other charges (₹)** | Recomputes **Net saving** and **Break-even** |
| 4 | Click **Open in calculator** | Opens the EMI Calculator with the outstanding at the market rate over the remaining months |

**Success:** A green **Net saving** and "Break-even in month N".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Market rates are not available yet." | No fresh market rate | Try after the next 07:30 IST refresh |
| "Your rate is already at or below the lowest market rate." | Nothing cheaper | — |
| "Switching would not pay off at these costs" | Costs exceed interest saved | Negotiate lower fees |

Continues in the EMI Calculator ([W-EMI-001](W-EMI-001.md)). Daily alerts for this check are switched in **Settings → Notifications → Loan rate alerts** ([D-LOAN-002](../dependencies.md#d-loan-002)).
