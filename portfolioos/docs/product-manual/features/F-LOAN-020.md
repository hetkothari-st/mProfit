---
id: F-LOAN-020
title: "EMI repayment schedule for a loan given"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-LOAN-018, F-LOAN-019, F-LOAN-021, F-LOAN-022]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# EMI repayment schedule for a loan given

`F-LOAN-020` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** For a loan given on **Monthly EMI**, the **Repayment schedule** card ("₹… every month · N EMIs from <date>") lists each instalment: **#**, **Due** (and "paid <date>" when paid on another day), **EMI**, **Interest** and **Principal** (interest-bearing loans only), **Received** (with "₹… forgiven" and "₹… left"), **Status** (**Paid**, **Forgiven**, **Partly paid** — "· late" when overdue — **Overdue**, **Due soon**, **Pending**) and one-click actions. Badges show "N of M done", "N partial" and "N overdue".

**Why it exists:** Inferred from behavior: monthly instalments from a friend or relative are usually ticked off one by one.

**Where to find it:** Loan given page → **Repayment schedule** (route `/loans/given/:id`), shown only for EMI loans.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person. Actions only while the loan is **Active**.

**Steps**
1. On an open instalment click **Paid** — the toast "EMI N marked paid" appears.
2. Or click **Partial**, enter **Received (₹)** and **On** in **Part payment · EMI N** ("₹… was due <date>. Anything above the EMI counts toward the next ones."), then **Save** — the toast "EMI N updated" appears.
3. From **More options for EMI N** (⋯) choose **Forgive this EMI**, **Change amount** (paid rows) or **Mark pending** (rows marked from the schedule).
4. On a paid row, **Undo** clears its marks ("EMI N marked pending"). A row covered by a History repayment shows "From history" instead.
5. Click **Show all N EMIs** to unfold a long schedule; **Show fewer** to fold it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Paid** | Button | Adds a repayment for what the instalment still needs | On rows not fully covered; hidden when loan not Active; desktop shows later rows' actions on hover |
| **Partial** | Button | Opens **Part payment · EMI N** | As above |
| **Undo** | Button | Clears the instalment's marks | On fully covered rows marked from the schedule |
| "From history" | Label | Row covered by an untied ledger repayment | — |
| **Forgive this EMI** | Menu item | Adds a forgiveness for what the instalment still needs | Hidden on forgiven rows |
| **Change amount** | Menu item | Opens **Part payment** on a covered row | Only on fully covered rows |
| **Mark pending** | Menu item | Clears the instalment's marks | Only on rows marked from the schedule |
| **Show all N EMIs** / **Show fewer** | Button | Fold / unfold | Shown when more than 12 EMIs and rows remain below the fold |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Received (₹)** | Text | Yes | Number > 0 | Empty | "Enter the amount received" |
| **On** | Date | Yes | YYYY-MM-DD | Due date if past, otherwise today | — |

**Settings and toggles here:** None.

**Results:** **Paid** / **Forgive** add a repayment / forgiveness entry tied to that instalment for the amount it still needs, dated on the due date (or today if not yet due). **Partial** replaces that instalment's earlier marks with one repayment of the amount typed. **Undo** / **Mark pending** delete the instalment's marked entries (untied History repayments still count).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Reopen the loan to update its instalments" | Loan is settled or written off | **Reopen** first ([F-LOAN-021](F-LOAN-021.md)) |
| "Only EMI loans have instalments" / "This loan has N instalments" | Server checks | — |
| Toast "Could not update the EMI" | Other error | Retry |

**Limitations:** **Interest** and **Principal** columns are an indicative amortisation split; what you receive is matched to instalments by amount, not split into principal and interest. "Due soon" means within 7 days.

**How it works:** `PUT /api/loans-given/:id/installments/:no` with action PAID, PARTIAL, WAIVED or PENDING. The schedule is computed from the terms and the ledger: marked entries fill their own instalment first (overflow joins the pool), then untied repayments, interest received and forgiveness fill instalments oldest first, in date order. Status: fully covered → Paid (or Forgiven if nothing was paid); partly covered → Partly paid; uncovered and past due → Overdue; due within 7 days → Due soon; otherwise Pending. The partial update runs in one database transaction.

**Related features:** [F-LOAN-018](F-LOAN-018.md), [F-LOAN-019](F-LOAN-019.md), [F-LOAN-022](F-LOAN-022.md).

**Sources:** `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:33`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:57`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:67`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:118`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:162`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:212`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:310`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:450`, `apps/web/src/pages/loans/given/InstallmentStatusChip.tsx:4`, `packages/api/src/services/loans/loansGiven.service.ts:112`, `packages/api/src/services/loans/loansGiven.service.ts:118`, `packages/api/src/services/loans/loansGiven.service.ts:580`, `packages/api/src/services/loans/loansGiven.service.ts:587`
