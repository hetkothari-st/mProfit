---
id: F-LOAN-012
title: "EMI due and overdue reminders"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-LOAN-007]
related: [F-LOAN-008]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# EMI due and overdue reminders

`F-LOAN-012` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Creates reminders in **Alerts** for each active loan taken: "<lender> EMI due in N days" 30, 15, 7 and 1 days before the next unpaid EMI, "<lender> EMI due today" on the day, and "<lender> EMI overdue by N days" for a missed EMI. The description reads "EMI of ₹<amount> due on <date>" (or "was due on").

**Why it exists:** Inferred from behavior: to warn before an EMI debit and to flag an EMI you have not marked paid.

**Where to find it:** **Alerts** page and the dashboard's alert list ([D-LOAN-001](../dependencies.md#d-loan-001)); dashboard links for these alerts open `/loans`.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (alerts are created for the loan's owner, including managed profiles).

**Steps:** Not applicable — automatic. Keep EMIs marked paid ([F-LOAN-008](F-LOAN-008.md)) so reminders stop once paid.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-LOAN-007](../settings/loans.md#s-loan-007) **Status** — only **Active** loans are scanned. There is no per-user switch for these reminders.

**Results:** One alert per EMI date and stage (each threshold, and once for overdue); repeats are suppressed by a stored key.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No overdue alert for an old missed EMI | Overdue alerts only cover EMIs due after the loan was added to the app and at most 30 days late | Expected |
| Reminder for an EMI already paid | The EMI was not recorded as paid | Mark it paid on the schedule |

**Limitations:** The scan runs once a day at 20:45 IST (and when the Alerts page triggers a scan), so a reminder can appear up to a day after the threshold is reached if the scan is missed. The amount in the description uses Western digit grouping (for example "₹12,345.00" but "₹1,234,567.00") and an ISO date ("2026-11-05"). A loan whose schedule cannot be built is skipped silently.

**How it works:** The daily alert job lists users and, for each, runs the scanners under that user's database context. For each active loan it rebuilds the schedule and picks one EMI: the latest unpaid EMI dated before today, on or after the date the loan was added and at most 30 days late (overdue); otherwise the next unpaid EMI from today when it is exactly 30, 15, 7, 1 or 0 days away. It creates an alert of type `LOAN_EMI_DUE` unless one with the same key (`loan_emi:<loan>:<emi date>:<stage>`) exists.

**Related features:** [F-LOAN-008](F-LOAN-008.md), [D-LOAN-001](../dependencies.md#d-loan-001).

**Sources:** `packages/api/src/services/loans/loans.service.ts:46`, `packages/api/src/services/loans/loans.service.ts:53`, `packages/api/src/services/loans/loans.service.ts:910`, `packages/api/src/services/loans/loans.service.ts:944`, `packages/api/src/services/loans/loans.service.ts:988`, `packages/api/src/services/loans/loans.service.ts:995`, `packages/api/src/jobs/alertJobs.ts:25`, `packages/api/src/jobs/alertJobs.ts:48`, `packages/api/src/services/notifications/alerts.service.ts:339`
