---
id: F-LOAN-017
title: "Lend money / edit a loan given"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-LOAN-010]
related: [F-LOAN-016, F-LOAN-018, F-LOAN-020, F-LOAN-022]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Lend money / edit a loan given

`F-LOAN-017` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Lend money** dialog (titled **Edit loan given** when editing) records who you lent to, how much, when, the yearly interest rate and how it will be repaid — **Whenever** (flexible, with an optional date you expect it back by) or **Monthly EMI** (EMI amount, number of months, first EMI date).

**Why it exists:** Inferred from behavior: to track receivables separately from loans you owe; the schema notes that every reader of loans taken treats a row as debt, so money lent is kept apart.

**Where to find it:** **Loans given → Lend money** or **Record a loan you gave** (route `/loans`); **Edit** on a loan-given page (route `/loans/given/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Lend money**. The dialog opens with **Lent on** set to today and **Whenever** selected.
2. Fill **Lent to**, optionally **Relationship (optional)** and **Phone or email (optional)**.
3. Fill **Amount lent (₹)**; optionally **Interest % / yr** (leave empty for interest-free).
4. Under **How will it be repaid?** choose **Whenever** ("Repaid in any amounts, any time") and optionally **Expected back by (optional)** — "You'll get reminders before this date." — or **Monthly EMI** ("Fixed amount every month") and fill **EMI (₹)**, **Months** and **First EMI on**.
5. Optionally add **Notes (optional)**.
6. Click **Add loan** (or **Save changes**). The toast "Loan added" / "Loan updated" appears; a new loan opens on its detail page.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Whenever** / **Monthly EMI** | Toggle buttons | Choose repayment mode; show the matching fields | — |
| **Cancel** | Button | Closes | Disabled while saving |
| **Add loan** / **Save changes** | Submit button | Saves | Disabled (spinner) while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Lent to** | Text | Yes | 1–200 characters (server, trimmed) | Empty | "Enter who you lent to" |
| **Relationship (optional)** | Select: —, Friend, Family, Colleague, Business, Other | No | — | — | — |
| **Phone or email (optional)** | Text | No | Up to 200 characters | Empty | — |
| **Amount lent (₹)** | Text | Yes | Number > 0; commas, spaces and ₹ are stripped | Empty | "Enter the amount lent" |
| **Lent on** | Date | Yes | YYYY-MM-DD | Today | — |
| **Interest % / yr** | Text | No | Plain number; empty = 0 ("0 = interest-free") | Empty | "Enter the interest rate as a number, e.g. 12" |
| **Expected back by (optional)** | Date (Whenever only) | No | Not before **Lent on** (date picker minimum) | Empty | — |
| **EMI (₹)** | Text (Monthly EMI only) | Yes for EMI | Number > 0 | Empty | "Enter the EMI amount" |
| **Months** | Digits (Monthly EMI only) | Yes for EMI | Whole number ≥ 1 (server max 600) | Empty | "Enter the number of monthly instalments" |
| **First EMI on** | Date (Monthly EMI only) | Yes for EMI | Not before **Lent on** | Empty | "Pick the first EMI date" |
| **Notes (optional)** | Text area | No | Up to 5000 characters | Empty | — |

**Settings and toggles here:** [S-LOAN-010](../settings/loans.md#s-loan-010) **How will it be repaid?** — **Whenever**: balance = lent − repaid − forgiven, simple interest accrues daily, reminders use **Expected back by**; **Monthly EMI**: an instalment schedule is generated and reminders follow the next unpaid instalment. Switching mode on edit clears the other mode's fields.

**Results:** The loan is saved. Summary, schedule and reminders are recomputed from the terms on every read.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Messages listed in the table above | Client checks | Correct the field |
| "EMI loans need the EMI amount, number of months and first EMI date" | Server check when EMI terms are incomplete | Fill all three |
| "Could not save the loan" or the server's message | Other server error | Retry |

**Limitations:** The EMI amount is not computed for you — type the agreed instalment. There is no check that EMI × months covers the amount lent plus interest.

**How it works:** `POST /api/loans-given` / `PATCH /api/loans-given/:id`. The server validates amounts as positive decimal strings, the relationship as one of FRIEND / FAMILY / COLLEAGUE / BUSINESS / OTHER and tenure 1–600, and refuses EMI mode without all three EMI terms. On save, the web invalidates the loans-given caches.

**Related features:** [F-LOAN-016](F-LOAN-016.md), [F-LOAN-018](F-LOAN-018.md), [F-LOAN-020](F-LOAN-020.md), [F-LOAN-022](F-LOAN-022.md).

**Sources:** `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:28`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:113`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:149`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:225`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:263`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:330`, `packages/api/src/controllers/loansGiven.controller.ts:26`, `packages/api/src/services/loans/loansGiven.service.ts:450`, `packages/api/src/services/loans/loansGiven.service.ts:458`, `packages/api/prisma/schema.prisma:2997`
