---
id: F-LOAN-007
title: "Record a loan payment and manage payment history"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-LOAN-002]
related: [F-LOAN-005, F-LOAN-008, F-LOAN-012]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Record a loan payment and manage payment history

`F-LOAN-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Records a payment against a loan taken — **EMI**, **Prepayment**, **Foreclosure** or **Processing fee** — and lists every payment in **Payment history** (Date, Type, Amount, Principal, Interest, Note) with a delete action per row. A foreclosure recorded on an active loan closes it as **Foreclosed** on that date; deleting that foreclosure reopens it.

**Why it exists:** Inferred from behavior: the schedule, outstanding balance, interest paid and prepayment savings are all derived from these records, so recording real payments keeps every figure accurate.

**Where to find it:** Loan detail page → **Record payment**; **Payment history** card below the charts (route `/loans/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Record payment**. The **Record payment** dialog opens with type **EMI**.
2. Choose **Payment type**, set **Paid on** and **Amount (₹)**.
3. For an EMI, optionally type **For month (YYYY-MM)** (the schedule month it pays). Optionally fill **Principal part (₹)**, **Interest part (₹)** and **Notes**. For a prepayment the dialog shows "Prepayment savings will be shown after recording".
4. Click **Save**. The toast "Payment recorded" appears. After a prepayment, a green banner may read "This prepayment saves you ₹… in interest!" with **Dismiss**.
5. To remove a payment, hover its row in **Payment history**, click the bin, then **Del** (or **No**). The toast "Payment removed" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Record payment** | Button | Opens the dialog | Never |
| **Cancel** / **Save** | Buttons | Close / save ("Saving…") | **Save** disabled while saving |
| Bin (per payment row) | Icon button | Shows **Del** / **No** | Visible on hover |
| **Del** | Button | Deletes the payment | Disabled while deleting |
| **No** | Button | Cancels the delete | — |
| **Dismiss** | Button | Hides the savings banner | Shown only after a prepayment that produced savings |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Payment type** | Select: EMI, Prepayment, Foreclosure, Processing fee | Yes | — | EMI | — |
| **Paid on \*** | Date | Yes | YYYY-MM-DD | Empty | "Required" |
| **Amount (₹) \*** | Text | Yes | Positive number, no commas | Empty | "Required" |
| **For month (YYYY-MM)** | Text (EMI only) | No | `YYYY-MM` (server) | Empty (the paid-on month is used) | Server: "Expected YYYY-MM" (shown as a generic failure) |
| **Principal part (₹)** / **Interest part (₹)** | Text | No | Positive numbers | Empty (computed by the server) | — |
| **Notes** | Text | No | Up to 500 characters (server) | Empty | — |

**Settings and toggles here:** [S-LOAN-002](../settings/loans.md#s-loan-002) **Prepayment option** decides what a prepayment does to the schedule (shorter tenure or smaller EMI).

**Results:** A payment row is stored. For an EMI the matching schedule month shows **Paid**; a prepayment or foreclosure reduces the balance from the next EMI date; a foreclosure on an active loan sets status **Foreclosed** and the closing date to the payment date. A processing fee is listed but never changes the balance. The loans list, summary, schedule, market comparison and dashboard refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Required" | **Paid on** or **Amount** missing | Fill them |
| Toast "Failed to record payment" and a "Request failed with status code 422" line | **For month** not `YYYY-MM`, or an amount with commas | Correct the format |
| Toast "Failed to remove payment" | The payment no longer exists or is not yours | Reload the page |

**Limitations:** Recording two EMI payments for the same month marks that month once; both still count towards interest and principal paid. The savings banner only appears when the whole-loan saving versus the original plan is above 0. Payments cannot be edited — delete and record again.

**How it works:** `POST /api/loans/:id/payments`. When neither part is given (and the type is not a processing fee), the server stores a split: an EMI pays that month's scheduled interest first (capped at the amount) and the rest is principal; a prepayment or foreclosure is all principal. A foreclosure on an `ACTIVE` loan updates the loan to `FORECLOSED` with `closedDate` = paid-on date. `DELETE /api/loans/payments/:paymentId` checks ownership through the loan; if the deleted payment is the foreclosure that closed the loan (same date, status Foreclosed) the loan returns to `ACTIVE` with no closing date. Prepayment savings = interest of the original plan without payments − (interest paid + interest still payable).

**Related features:** [F-LOAN-005](F-LOAN-005.md), [F-LOAN-008](F-LOAN-008.md), [F-LOAN-012](F-LOAN-012.md).

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:106`, `apps/web/src/pages/loans/LoanDetailPage.tsx:146`, `apps/web/src/pages/loans/LoanDetailPage.tsx:196`, `apps/web/src/pages/loans/LoanDetailPage.tsx:221`, `apps/web/src/pages/loans/LoanDetailPage.tsx:486`, `apps/web/src/pages/loans/LoanDetailPage.tsx:563`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1073`, `packages/api/src/controllers/loans.controller.ts:58`, `packages/api/src/services/loans/loans.service.ts:519`, `packages/api/src/services/loans/loans.service.ts:810`, `packages/api/src/services/loans/loans.service.ts:856`, `packages/api/src/services/loans/loans.service.ts:865`, `packages/api/src/services/loans/loans.service.ts:880`
