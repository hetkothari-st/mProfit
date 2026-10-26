---
id: F-LOAN-018
title: "Loan given detail page"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-LOAN-010]
related: [F-LOAN-017, F-LOAN-019, F-LOAN-020, F-LOAN-021, F-LOAN-022]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Loan given detail page

`F-LOAN-018` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows one loan given: the borrower's initials, name, status badge and a line "<relationship> · <contact> · Monthly EMI / Flexible repayment · X% p.a. / Interest-free"; an overdue banner when a payment is late; a summary panel (**Still owed to you** or **Lent**, "of ₹… lent on <date>", progress bar with "N of M EMIs" or "₹… back") and four figures (**Next payment** or **Closed on**, **Received so far**, then **Left to receive** / **Interest due** / **Expected back by**, then **Forgiven** / **EMI** / **Interest received**); the EMI **Repayment schedule** (EMI loans); **History** ("Every payment, top-up and write-off, newest first", ending with the original **Lent** row); **Terms**; **Notes**; and **Proof & documents**.

**Why it exists:** Inferred from behavior: one page to see what a borrower still owes, what has come back and the agreed terms, with proof attached.

**Where to find it:** Click a card in **Loans given** (route `/loans/given/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Open the loan from **Loans given**.
2. If overdue, the banner reads "₹… overdue by N days" with "EMI N was due <date>" (or "Was due <date>") and "· N EMIs behind" when several are late. For EMI loans click **Mark EMI N paid** to settle the oldest open instalment.
3. Use **Record payment** / **Add entry**, **Edit** and **More actions** (⋯) as described in [F-LOAN-019](F-LOAN-019.md) and [F-LOAN-021](F-LOAN-021.md).
4. Click **Back to loans** to return to the given section.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to loans** | Link | Opens `/loans?view=given` | Never |
| **Record payment** (flexible) / **Add entry** (EMI) | Button | Opens the entry dialog ([F-LOAN-019](F-LOAN-019.md)) | Hidden when the loan is not Active |
| **Edit** | Button | Opens **Edit loan given** ([F-LOAN-017](F-LOAN-017.md)) | Never |
| **More actions** (⋯) | Menu | **Mark settled**, **Write off** (active) or **Reopen** (closed); **Delete loan** | — |
| **Mark EMI N paid** | Button (overdue banner) | Marks the oldest open instalment paid | Shown only for overdue EMI loans; disabled while saving |
| **Remove entry** (bin on a History row) | Icon button | Deletes that entry immediately | Disabled while another action runs |

**Fields and rules:** Not applicable — view only (entry forms are in [F-LOAN-019](F-LOAN-019.md)).

**Settings and toggles here:** [S-LOAN-010](../settings/loans.md#s-loan-010) **How will it be repaid?** decides which figures and the schedule appear.

**Results:** Viewing changes nothing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This loan could not be found." with **Back to loans given** | Wrong id, deleted, or not yours | Go back |
| Toast "Could not update the EMI" | **Mark EMI N paid** failed | Retry |

**Limitations:** **Remove entry** deletes without asking for confirmation. For EMI loans, **Still owed to you** is the principal left on a standard amortising loan after the number of full instalments' worth of money received, not the sum of unpaid instalments.

**How it works:** `GET /api/loans-given/:id`. Summary (server): lent = principal + extra lent; **Received so far** = repayments + interest received. Flexible loans: still owed = lent − repaid − forgiven (not below 0); with interest > 0, simple interest accrues day by day at rate ÷ 100 ÷ 365 on the balance between ledger events (interest received does not reduce the balance), up to today or the closing date; **Interest due** = accrued − interest received; next payment = still owed + interest due on the expected-back date. EMI loans: expected total = EMI × months + extra lent; k = whole instalments covered by (received + forgiven); still owed = P(1+r)^k − EMI × ((1+r)^k − 1) ÷ r with r = rate ÷ 1200 (P − EMI × k when interest-free), plus extra lent, minus any money beyond k instalments; **Left to receive** = expected total − (received + forgiven); next payment = the first instalment not fully covered. **Overdue by** = days since that date. Dates are UTC calendar days.

**Related features:** [F-LOAN-019](F-LOAN-019.md), [F-LOAN-020](F-LOAN-020.md), [F-LOAN-021](F-LOAN-021.md), [F-LOAN-022](F-LOAN-022.md), [D-LOAN-006](../dependencies.md#d-loan-006).

**Sources:** `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:241`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:310`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:355`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:435`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:474`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:567`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:620`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:646`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:693`, `packages/api/src/services/loans/loansGiven.service.ts:244`, `packages/api/src/services/loans/loansGiven.service.ts:290`, `packages/api/src/services/loans/loansGiven.service.ts:330`
