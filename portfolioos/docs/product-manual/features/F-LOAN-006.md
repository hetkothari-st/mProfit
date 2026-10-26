---
id: F-LOAN-006
title: "Edit a loan from its detail page"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-LOAN-001, S-LOAN-003, S-LOAN-004, S-LOAN-005, S-LOAN-006, S-LOAN-007, S-LOAN-008]
related: [F-LOAN-003, F-LOAN-005]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Edit a loan from its detail page

`F-LOAN-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** A shorter **Edit loan** dialog on the loan's page for the figures that change most: lender, loan type, principal, interest rate, tenure, EMI (with the calculator button), status, tax benefit section, rate type fields and portfolio.

**Why it exists:** Inferred from behavior: rate resets, status changes and tax section are edited while looking at the loan's figures, which refresh immediately after saving.

**Where to find it:** Loan detail page → **Edit** (route `/loans/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Edit**. The dialog opens filled with the loan's values.
2. Change any field; click the calculator button to recompute the EMI.
3. Click **Save**. The toast "Loan updated" appears and the summary, schedule, market comparison and dashboard refresh.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Calculator button (title "Auto-calculate") | Button | Fills **EMI amount** | — |
| **Cancel** / **Save** | Buttons | Close / save ("Saving…") | **Save** disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Lender name \*** | Search / pick | Yes | 1–200 characters | Current | "Required" |
| **Loan type** | Select | No | As in [F-LOAN-003](F-LOAN-003.md) | Current | — |
| **Principal (₹) \*** | Text | Yes | Positive number | Current | "Required" |
| **Interest rate (%) \*** | Text | Yes | Positive number | Current | "Required" |
| **Tenure (months) \*** | Number | Yes | 1–600 | Current | "Required" |
| **EMI amount (₹) \*** | Text | Yes | Positive number | Current | "Required" |
| **Status** | Select | No | Active / Closed / Foreclosed / Default | Current | — |
| **Tax benefit section** | Select | No | None / 80C + 24B (Home loan) / 80E (Education loan) | Current | — |
| **Rate type**, **Linked to**, **Next rate reset (optional)** | Selects / date | No | As in [F-LOAN-003](F-LOAN-003.md) | Current | As in [F-LOAN-003](F-LOAN-003.md) |
| **Portfolio** | Picker | No | "Optional — re-assign this loan to a different portfolio." | Current | — |

**Settings and toggles here:** [S-LOAN-001](../settings/loans.md#s-loan-001), [S-LOAN-003](../settings/loans.md#s-loan-003), [S-LOAN-004](../settings/loans.md#s-loan-004), [S-LOAN-005](../settings/loans.md#s-loan-005), [S-LOAN-006](../settings/loans.md#s-loan-006), [S-LOAN-007](../settings/loans.md#s-loan-007), [S-LOAN-008](../settings/loans.md#s-loan-008) (same meaning as in [F-LOAN-003](F-LOAN-003.md)).

**Results:** The loan is updated; derived figures recompute on the next request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Required" under a field | Empty or non-numeric | Fill it |
| Toast "Failed to update loan" with a "Request failed with status code …" line | Server validation failed | Use plain numbers; tenure 1–600 |

**Limitations:** This dialog has no **Borrower name**, **Account number**, **Disbursement date**, **First EMI date** or **Prepayment option** fields; it sends their current values back unchanged. Use the pencil on the Loans list ([F-LOAN-003](F-LOAN-003.md)) to change them.

**How it works:** `PATCH /api/loans/:id` with the full form (masked account number included, which the server treats as unchanged). On success it invalidates the loan, its summary, schedule, market check, the loans list and the dashboard caches.

**Related features:** [F-LOAN-003](F-LOAN-003.md), [F-LOAN-005](F-LOAN-005.md).

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:263`, `apps/web/src/pages/loans/LoanDetailPage.tsx:319`, `apps/web/src/pages/loans/LoanDetailPage.tsx:339`, `apps/web/src/pages/loans/LoanDetailPage.tsx:463`, `apps/web/src/pages/loans/LoanDetailPage.tsx:475`, `packages/api/src/services/loans/loans.service.ts:766`
