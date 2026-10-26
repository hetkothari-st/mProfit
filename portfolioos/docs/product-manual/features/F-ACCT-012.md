---
id: F-ACCT-012
title: "Balance Sheet"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: []
related: [F-ACCT-010]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Balance Sheet

`F-ACCT-012` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows **Assets** and **Liabilities & Equity** (including **Retained Earnings** = income − expenses to date) with totals, as of a date. When opening balances don't net to zero, a **Difference in Opening Balances** line is added to the short side so the totals agree.

**Why it exists:** Code comment: shown "as Tally does" instead of leaving totals unequal.

**Where to find it:** **Tools → Accounting → Reports → Balance Sheet**.

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Optionally set **As of date**.

**Controls:** **As of date**.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (re-projection first).

**Errors and troubleshooting:** None specific.

**Limitations:** None known.

**How it works:** `GET /api/accounting/reports/balance-sheet?asOf=`; difference = debit-side openings − credit-side openings.

**Related features:** [F-ACCT-010](F-ACCT-010.md).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:787`, `apps/web/src/pages/accounting/AccountingPage.tsx:814`, `packages/api/src/services/accounting/accounting.service.ts:619`
