---
id: F-LOAN-008
title: "Amortization schedule with Mark paid and Undo"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-LOAN-005, F-LOAN-007, F-LOAN-012]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Amortization schedule with Mark paid and Undo

`F-LOAN-008` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Amortization schedule** table lists every EMI: **#**, **Date**, **Opening**, **EMI**, **Principal**, **Interest**, **Closing**, **Status** (**Paid** with date, **Overdue**, **Upcoming**) and **Action**. **Mark paid** records that month's EMI in one click; **Undo** removes it. The first 12 months show by default.

**Why it exists:** Inferred from behavior: the quickest way to keep a loan current is to tick off EMIs as they are debited, without typing amounts.

**Where to find it:** Loan detail page → **Amortization schedule** (route `/loans/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Scroll to **Amortization schedule**. The table scrolls to the first unpaid month.
2. Click **Mark paid** on a row. The toast "Marked paid" appears and the row turns green with "Paid <date>".
3. To reverse, click **Undo** on a paid row. The toast "Payment undone" appears.
4. Click **Show all N months** to see the full schedule, **Show less** to fold it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Mark paid** | Button | Records an EMI for that row | On unpaid rows; spinner while saving |
| **Undo** | Button | Deletes the EMI payment for that month | On paid rows; spinner while saving |
| **Show all N months** / **Show less** | Toggle button | Expands / folds the table | Shown only when the schedule has more than 12 rows |

**Fields and rules:** None — the row's values are used.

**Settings and toggles here:** None.

**Results:** **Mark paid** stores an EMI payment dated on the row's due date, for that row's month, with the row's EMI, principal and interest. **Undo** deletes the EMI payment for that month. All loan figures and the dashboard refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Failed to mark paid" | Network or server error | Try again |
| Toast "Payment not found" on **Undo** | No EMI payment matches the row's month (for example the payment was deleted elsewhere) | Reload the page |
| Toast "Failed to undo" | Server error | Try again |

**Limitations:** **Mark paid** always uses the scheduled due date as the paid-on date, not today. Rows show **Overdue** in red when their date is before today and they are unpaid — including EMIs from before you added the loan. "Showing 12 of N months" is shown while folded.

**How it works:** **Mark paid** calls `POST /api/loans/:id/payments` with type EMI, `paidOn` = row date, `forMonth` = row month and the row's split. **Undo** finds the EMI payment whose "for month" (or paid-on month) equals the row's month and calls `DELETE /api/loans/payments/:id`. The schedule is recomputed by the server after each change.

**Related features:** [F-LOAN-005](F-LOAN-005.md), [F-LOAN-007](F-LOAN-007.md), [F-LOAN-012](F-LOAN-012.md).

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:591`, `apps/web/src/pages/loans/LoanDetailPage.tsx:595`, `apps/web/src/pages/loans/LoanDetailPage.tsx:694`, `apps/web/src/pages/loans/LoanDetailPage.tsx:731`, `apps/web/src/pages/loans/LoanDetailPage.tsx:748`, `apps/web/src/pages/loans/loanPayments.ts:8`
