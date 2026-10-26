---
id: F-CARD-007
title: "Credit card payment reminders"
module: "Credit Cards"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-CARD-001]
related: [F-CARD-006, F-LOAN-012]
---

[← Credit Cards](../modules/credit-cards.md) · [Index](../INDEX.md)

# Credit card payment reminders

`F-CARD-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Creates reminders in **Alerts** for unpaid statements of active cards: "<issuer> <card> ••••<last 4> payment due in N days" 30, 15, 7 and 1 days before the due date, and "… payment overdue by N days" once late, with "<YYYY-MM> statement of ₹<amount> due on <date>". The first overdue reminder also changes a Pending statement's status to **Overdue**.

**Why it exists:** Inferred from behavior: to avoid late-payment charges.

**Where to find it:** **Alerts** and the dashboard alert list ([D-CARD-003](../dependencies.md#d-card-003)).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps:** Not applicable — automatic. Add statements ([F-CARD-006](F-CARD-006.md)) to receive reminders.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-CARD-001](../settings/credit-cards.md#s-card-001) **Status** — only **Active** cards are scanned.

**Results:** One alert per statement and stage; the overdue alert is created once per statement.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No reminder for a bill | No statement added, the card is not Active, or the statement is already Paid / Overdue | Add the statement; mark paid when paid |

**Limitations:** Runs daily at 20:45 IST (or when the Alerts page triggers a scan). No reminder on the due day itself. Reminders are based on statements only, not the card's due day. The amount uses Western digit grouping and the date is shown as YYYY-MM-DD.

**How it works:** Same daily alert job as [F-LOAN-012](F-LOAN-012.md). Pending and Partial statements of Active cards are read; days left = due date − today (UTC days). An alert of type `CREDIT_CARD_DUE` is created at 30, 15, 7 or 1 days, or when overdue, unless one with key `credit_card_due:<statement>:<stage>` exists; an overdue Pending statement is then set to Overdue (a failure there is logged, not shown).

**Related features:** [F-CARD-006](F-CARD-006.md), [D-CARD-003](../dependencies.md#d-card-003).

**Sources:** `packages/api/src/services/banking/creditCards.service.ts:30`, `packages/api/src/services/banking/creditCards.service.ts:438`, `packages/api/src/services/banking/creditCards.service.ts:488`, `packages/api/src/services/banking/creditCards.service.ts:515`, `packages/api/src/jobs/alertJobs.ts:48`

**What this area doesn't do**
- It doesn't import card statements or transactions from email, PDFs or the bank; statements are entered by hand.
- It doesn't track individual card transactions, rewards points or EMIs on cards.
- It doesn't keep a running outstanding balance from payments.
- It never asks for or stores CVV or expiry.
- The credit cards pages don't switch to family view.
