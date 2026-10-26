---
id: F-LOAN-005
title: "Loan detail: summary, progress and charts"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-LOAN-006, S-LOAN-007]
related: [F-LOAN-006, F-LOAN-007, F-LOAN-008, F-LOAN-009, F-LOAN-010, F-LOAN-011]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Loan detail: summary, progress and charts

`F-LOAN-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows one loan in depth. The header shows the lender, "<type> loan · <borrower>" and "●●●● <last 4>" of the account number, with **Edit** and **Record payment** buttons. Four metric cards follow — **Outstanding balance** ("of ₹… principal"), **Interest paid** ("Principal paid: ₹…"), **Remaining months** ("N EMIs left"), **Next EMI** (amount and date) — then two progress bars (**Principal repaid**, **Tenure elapsed**) and **Total interest payable**. Below are the tax benefit panel, the **Compare with market** card, linked vehicle/property cards, three charts (**Outstanding balance over time**, **EMI split — principal vs interest**, **Total cost** donut with "Interest as % of cost"), **Payment history** and the **Amortization schedule**.

**Why it exists:** Inferred from behavior: it answers "how much do I still owe, how much interest am I paying, and when does this end" for one loan.

**Where to find it:** **Asset Classes → Loans**, click a loan card (route `/loans/:id`). Loan-check alerts also open this page ([D-LOAN-001](../dependencies.md#d-loan-001)).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click a loan card on the Loans page. The page loads with placeholder cards, then the figures.
2. Read the metrics and progress bars. Hover a chart to see the value for a month.
3. Click **Back to loans** (top left) to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to loans** | Link | Opens `/loans` | Never |
| **Edit** | Button | Opens the short **Edit loan** dialog ([F-LOAN-006](F-LOAN-006.md)) | Never |
| **Record payment** | Button | Opens **Record payment** ([F-LOAN-007](F-LOAN-007.md)) | Never |
| Charts | Hover tooltips | Show balance / principal / interest for a point | Hidden when the schedule is empty |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-LOAN-006](../settings/loans.md#s-loan-006) **Tax benefit section** decides whether the tax panel appears; [S-LOAN-007](../settings/loans.md#s-loan-007) **Status** decides whether **Compare with market** appears (Active only).

**Results:** Nothing is changed by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Loan not found." | The id is wrong, the loan was deleted, or it is not yours | Click **Back to loans** |
| "No amortization data available" | The schedule has no rows (for example a 0 balance) | Check principal, rate and EMI in Edit |
| Metrics show "…" | The summary is still loading | Wait |

**Limitations:** **Tenure elapsed** counts EMI payment records against the original tenure, not the shortened plan after a prepayment. The charts downsample long schedules to about 60 points and use display-only numbers. **Total cost** uses the remaining interest payable (from the summary) plus the principal in the schedule, not the interest already paid.

**How it works:** The page calls `GET /api/loans/:id` (all payments, oldest first), `GET /api/loans/:id/summary` and `GET /api/loans/:id/amortization`. The schedule is rebuilt on every request from the loan's terms and payments (nothing is stored): month by month, interest = opening balance × annual rate ÷ 12 ÷ 100 rounded half-even to paise, principal = EMI − interest (the last row takes the remaining balance), and prepayments or foreclosures dated on or before an EMI date are taken off the balance first, after which **Reduce tenure** recomputes the remaining months at the same EMI and **Reduce EMI** recomputes the EMI over the remaining months. The schedule stops at a balance ≤ ₹0.005, at 3 × tenure rows or at 600 rows. A row is "paid" when an EMI payment exists for its month (its "for month", or the month it was paid in). The summary's **Outstanding balance** is the opening balance of the first unpaid EMI dated today or later; **Interest paid** / **Principal paid** add up the split of every EMI, prepayment and foreclosure payment (a payment saved without a split takes that month's scheduled interest first; prepayments and foreclosures count as all principal); **Total interest payable** is the interest in the unpaid rows from today. **Principal repaid** = principal paid ÷ principal amount.

**Related features:** [F-LOAN-006](F-LOAN-006.md), [F-LOAN-007](F-LOAN-007.md), [F-LOAN-008](F-LOAN-008.md), [F-LOAN-009](F-LOAN-009.md), [F-LOAN-010](F-LOAN-010.md), [F-LOAN-011](F-LOAN-011.md).

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:1048`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1102`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1108`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1126`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1154`, `apps/web/src/pages/loans/LoanDetailPage.tsx:810`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1273`, `packages/api/src/services/loans/loans.service.ts:275`, `packages/api/src/services/loans/loans.service.ts:311`, `packages/api/src/services/loans/loans.service.ts:441`, `packages/api/src/services/loans/loans.service.ts:464`, `packages/api/src/services/loans/loans.service.ts:493`
