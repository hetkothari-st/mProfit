---
id: F-DASH-004
title: "Liabilities summary (Loans & credit cards)"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-DASH-002]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Liabilities summary (Loans & credit cards)

`F-DASH-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** When you owe anything, a card "Liabilities · FY <year> — Loans & credit cards" shows **Net after debts** ("Assets minus liabilities"), **Total outstanding** ("Across all debts"), **Monthly EMI** (with number of loans), **Card balance** (with number of cards) and **Interest paid YTD** (with "Principal: <amount>"). A footer shows "N EMI(s) overdue" and "Next EMI: <lender> on <date> — <amount>".

**Why it exists:** Inferred from behavior: the headline net worth is gross; this card shows what is left after debts.

**Where to find it:** Dashboard, below the alerts strip. Hidden when total liabilities are zero.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); family roles see members' loans/cards only with the LOAN / CREDIT_CARD categories.

**Steps**
1. Read the figures. Click **Manage** to open Loans.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Manage** | Link | Opens `/loans` | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None stored.

**Errors and troubleshooting:** None.

**Limitations:** Loans and cards are not filtered by the portfolio picker; Net after debts subtracts all liabilities from the (possibly filtered) gross figure. Only ACTIVE loans and ACTIVE credit cards count.

**How it works:** Net after debts = Total Net Worth − (loan outstanding + card outstanding). Loan outstanding = opening balance of the first unpaid instalment in the loan's schedule (the principal when no schedule can be built). Monthly EMI = sum of the EMI amounts of active loans. Card balance = the card's recorded outstanding balance, or, when none is recorded, the total of its pending/partly paid statements. Interest and principal YTD = loan payments dated in the current financial year (April–March) that carry an interest or principal split. The next EMI is the soonest first-unpaid instalment within 30 days; an unpaid instalment dated before today counts as overdue.

**Related features:** [F-DASH-002](F-DASH-002.md), [D-DASH-006](../dependencies.md#d-dash-006), [D-DASH-007](../dependencies.md#d-dash-007) (Credit Cards).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:702`, `apps/web/src/pages/dashboard/DashboardPage.tsx:713`, `apps/web/src/pages/dashboard/DashboardPage.tsx:822`, `packages/api/src/services/analytics/dashboard.service.ts:239`, `packages/api/src/services/analytics/dashboard.service.ts:272`, `packages/api/src/services/analytics/dashboard.service.ts:299`, `packages/api/src/services/analytics/dashboard.service.ts:315`, `packages/api/src/services/analytics/dashboard.service.ts:471`
