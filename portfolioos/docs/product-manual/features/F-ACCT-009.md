---
id: F-ACCT-009
title: "Ledger"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: []
related: [F-ACCT-007, F-ACCT-010]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Ledger

`F-ACCT-009` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows one account's postings in a date range: **Opening** and **Closing** balances and a table of **Date**, **Voucher**, **Narration**, **Debit**, **Credit** and running **Balance**.

**Why it exists:** To check an account's movement. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Ledger**.

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Pick an **Account** ("Select an account to view its ledger." until you do).
2. Optionally set **From** and **To**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Account** | Select | Chooses the account | — |
| **From** / **To** | Dates | Range | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (the books are re-projected first — [F-ACCT-007](F-ACCT-007.md)).

**Errors and troubleshooting:** "No entries in this period."

**Limitations:** None beyond [F-ACCT-007](F-ACCT-007.md).

**How it works:** `GET /api/accounting/ledger/:accountId?from=&to=`. Opening = the account's opening balance + every posting before **From**. Balances are on the account's normal side: debits raise assets and expenses, credits raise liabilities, equity and income.

**Related features:** [F-ACCT-007](F-ACCT-007.md), [F-ACCT-010](F-ACCT-010.md).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:557`, `apps/web/src/pages/accounting/AccountingPage.tsx:589`, `packages/api/src/services/accounting/accounting.service.ts:474`, `packages/api/src/services/accounting/accounting.service.ts:462`
