---
id: F-LOAN-022
title: "Repayment-due reminders for loans given"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-LOAN-010]
related: [F-LOAN-012, F-LOAN-017, F-LOAN-020]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Repayment-due reminders for loans given

`F-LOAN-022` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Creates reminders in **Alerts** for each active loan given with a next payment: "<borrower>'s repayment is due in N days" 30, 15, 7 and 1 days before, and "<borrower>'s repayment is overdue by N days" once it is late, with "₹<amount> due on <dd/mm/yyyy>" (or "was due on").

**Why it exists:** The form promises it under **Expected back by**: "You'll get reminders before this date."

**Where to find it:** **Alerts** and the dashboard alert list ([D-LOAN-001](../dependencies.md#d-loan-001)); dashboard links for these alerts open `/loans?view=given`.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps:** Not applicable — automatic. Set **Expected back by** (flexible) or EMI terms so the loan has a next payment.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-LOAN-010](../settings/loans.md#s-loan-010) **How will it be repaid?** — flexible loans are reminded only when **Expected back by** is set and something is owed; EMI loans follow the first instalment not fully covered.

**Results:** One alert per due date and stage; the overdue alert is created once per due date.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No reminder | No **Expected back by** date, nothing owed, or the loan is closed | Set a date or reopen |

**Limitations:** Daily at 20:45 IST (or when the Alerts page triggers a scan). There is no reminder on the due day itself (thresholds are 30, 15, 7 and 1 days). The amount uses Western digit grouping.

**How it works:** Same daily job as [F-LOAN-012](F-LOAN-012.md). For each active loan given, the summary's next due date and amount are used; an alert of type `LOAN_GIVEN_DUE` is created when days left is 30, 15, 7 or 1, or below 0, unless one with key `loan_given:<loan>:<due date>:<stage>` exists.

**Related features:** [F-LOAN-017](F-LOAN-017.md), [F-LOAN-020](F-LOAN-020.md), [D-LOAN-001](../dependencies.md#d-loan-001).

**Sources:** `packages/api/src/services/loans/loansGiven.service.ts:35`, `packages/api/src/services/loans/loansGiven.service.ts:689`, `packages/api/src/services/loans/loansGiven.service.ts:725`, `packages/api/src/jobs/alertJobs.ts:48`

**What this area doesn't do**
- You can't import loans from a bank statement, CIBIL report or email here; loans are entered by hand (the onboarding quick-add is also manual).
- You can't link a loan to a vehicle or property from these screens.
- You can't reveal a loan's full account number in the web app.
- You can't edit a recorded loan payment or a ledger entry — delete and re-add it.
- The loans pages don't switch to family view; family totals are on the family dashboard ([D-LOAN-009](../dependencies.md#d-loan-009)).
- Loans taken have no document vault; loans given do (**Proof & documents**).
- There is no per-loan switch to silence EMI reminders.
