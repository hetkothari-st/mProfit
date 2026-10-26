# Workflows and Troubleshooting — Loans, EMI Calculator, Credit Cards (B04)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Loans, EMI Calculator, Credit Cards

<!-- BEGIN WORKFLOWS -->
## Add a home loan and keep it up to date <!-- W-LOAN-001 -->
**Goal:** Track an existing home loan so the outstanding balance, next EMI, tax benefit and reminders are right.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-MANAGER for the managed person).
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

## Record a prepayment or close a loan early <!-- W-LOAN-002 -->
**Goal:** Reflect a part-prepayment, or a full foreclosure.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
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

## Check whether refinancing pays off <!-- W-LOAN-003 -->
**Goal:** Compare your loan with today's lowest market rate after switching costs.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
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

Continues in the EMI Calculator (W-EMI-001). Daily alerts for this check are switched in **Settings → Notifications → Loan rate alerts** (D-LOAN-002).

## Record money you lent and track repayments <!-- W-LOAN-004 -->
**Goal:** Track an informal loan to a friend or relative repaid whenever.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Know the amount, date and any interest agreed.

| # | You do | The app does |
|---|---|---|
| 1 | **Loans → Lend money** | Opens **Lend money** with **Whenever** selected |
| 2 | Fill **Lent to**, **Amount lent (₹)**, **Lent on**, optional **Interest % / yr** and **Expected back by (optional)** | — |
| 3 | Click **Add loan** | Toast "Loan added"; the loan's page opens showing **Still owed to you** |
| 4 | When money comes back, click **Record payment**, choose **Repayment received**, enter amount and date, **Add** | Toast "Entry added"; still owed and interest due update |
| 5 | When fully repaid, **More actions → Mark settled**, confirm the date | Toast "Marked settled"; loan moves to **Settled / Written off** |

**Success:** History lists every repayment; the loan is Settled.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Enter who you lent to" / "Enter the amount lent" | Missing fields | Fill them |
| No reminder before the date | No **Expected back by** set | Edit the loan and set it |
| Settled by mistake | — | **More actions → Reopen** |
| Borrower will not pay | — | **More actions → Write off** (forgives the principal still owed) |

## Track a loan given on monthly EMIs <!-- W-LOAN-005 -->
**Goal:** Tick off monthly instalments someone pays you.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
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

## Plan a loan with prepayments and export the schedule <!-- W-EMI-001 -->
**Goal:** See EMI, total cost, APR and tax saving for a planned loan, and save a file.
**Who:** Any signed-in user.
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | **Tools → EMI Calculator** | Calculate tab with defaults |
| 2 | Enter loan amount, rate, tenure, first EMI date | **Result** updates |
| 3 | Open **Advanced**, **Add prepayment**, tick **Processing fee and charges** and **Tax benefit** | Shows **Interest saved by prepaying**, **APR**, **Tax saved**, **Cost after tax** |
| 4 | Click **PDF** or **Excel** | Downloads `emi-schedule.pdf` / `.xlsx` |
| 5 | Click **Share** | "Link copied" |

**Success:** File downloaded; link copied.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Fix the highlighted fields to see your EMI." | Invalid inputs | Fix the field messages |
| PDF/Excel buttons disabled | Inputs invalid, an export running, or not on Calculate | Fix inputs / switch tab |
| "Too many exports - please wait a minute" | More than 10 exports in a minute | Wait |

## Compare offers starting from live rates <!-- W-EMI-002 -->
**Goal:** Pick the cheapest of two or three lender offers.
**Who:** Any signed-in user.
**Before you start:** Offers' rate, fee and tenure.

| # | You do | The app does |
|---|---|---|
| 1 | **Live rates**, choose **Loan type** | Lists lenders lowest first, **Lowest** highlighted |
| 2 | **Use this rate** on a lender | Calculate tab uses that rate ("Using <lender> X% - check it against your own offer") |
| 3 | **Compare**, fill each offer, **Add offer** for a third | Result cards with **Cheapest overall** |

**Success:** One offer marked **Cheapest overall** (and **Cheapest after tax** when tax is on).
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Couldn't load rates right now. The calculator still works." | Rate request failed | **Try again** |
| "Fix these to compare the offers:" | An error on the Calculate tab (for example first EMI date) | Fix it there |

## Add a credit card and follow a statement to payment <!-- W-CARD-001 -->
**Goal:** Track a card's bill and get due-date reminders.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
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

## Look up a saved card number <!-- W-CARD-002 -->
**Goal:** See the full card number you saved.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** The full number was typed when adding or editing the card.

| # | You do | The app does |
|---|---|---|
| 1 | Click the eye on the card face ("Show card number") | Fetches and shows the number; writes an audit entry |
| 2 | Click again ("Hide card number") | Masks it |

**Success:** The number is visible on the card face.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Only the last 4 digits are saved. Edit the card to add the full number." | No full number saved | Edit the card and type it |
| "Could not reveal the card number. Try again in a minute." | Over 5 reveals a minute or a server error | Wait a minute |
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| A loan, payment or card form fails with "Request failed with status code 422" | The server only accepts plain numbers (no commas or ₹) and `YYYY-MM` / `YYYY-MM-DD` formats in these forms | Re-type amounts as digits with an optional decimal point |
| Loan figures on the dashboard or sidebar differ from the Loans page | The dashboard counts outstanding from the earliest unpaid EMI, the Loans page from the next EMI on or after today | Mark past EMIs paid on each loan's schedule |
| A reminder appears a day late or not at all | Reminders are created by a once-a-day scan at 20:45 IST at exact thresholds | Open **Alerts**, which can trigger a scan |
| Credit card **Outstanding** never goes down | Marking statements paid does not change it (known defect) | Rely on each statement's status; add the next statement |
| Live rates or market card empty | Lender pages could not be read, or no administrator rate exists | Check again after 07:30 IST next day |
<!-- END TROUBLESHOOTING -->
