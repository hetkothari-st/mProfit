---
id: F-ACCT-001
title: "Accounting page and plan lock"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER (manager's plan); others locked"
settings: []
related: [F-ACCT-002, F-ACCT-013]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Accounting page and plan lock

`F-ACCT-001` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) (manager's plan); others locked

**What it does:** Shows four tabs — **Chart of Accounts**, **Vouchers**, **Ledger**, **Reports** — under the header "Double-entry bookkeeping — chart of accounts, vouchers, ledger, and financial statements", with **Export to Tally** in the header for Pro/Advisor accounts.

**Why it exists:** Page description (above).

**Where to find it:** **Tools → Accounting** (route `/accounting`).

**Who can use it:** [R-PRO](../roles.md#r-pro) (server-enforced: ACCOUNTING_MODULE). [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family) see the tabs blurred behind "Accounting Module is locked — Upgrade to Pro/Advisor to unlock Accounting Module." with **View plans**. [R-MANAGER](../roles.md#r-manager): the manager's plan decides; books are the managed person's. [R-PROF](../roles.md#r-prof) reaches a client's books through the CA workspace ([D-ACCT-004](../dependencies.md#d-acct-004)).

**Steps**
1. Open **Tools → Accounting**. **Chart of Accounts** is the default tab.
2. Switch tabs as needed.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Chart of Accounts** / **Vouchers** / **Ledger** / **Reports** | Tabs | Switch section | — |
| **Export to Tally** | Button | [F-ACCT-013](F-ACCT-013.md) | Hidden below Pro/Advisor |
| **View plans** | Link | Opens Pricing | Shown only when locked |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Messages like "Request failed with status code 400" on any action | The page shows the browser's generic error instead of the server's reason (defect) | See the specific feature for likely causes |

**Limitations:** Error toasts on this page show the generic request error, not the server's message (see DOCUMENTATION_GAPS.md).

**How it works:** Every `/api/accounting/*` route requires sign-in and the ACCOUNTING_MODULE feature (Pro/Advisor), answering "This feature requires the PRO_ADVISOR plan or higher" otherwise.

**Related features:** [F-ACCT-002](F-ACCT-002.md) to [F-ACCT-013](F-ACCT-013.md).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:897`, `apps/web/src/pages/accounting/AccountingPage.tsx:910`, `apps/web/src/pages/accounting/AccountingPage.tsx:105`, `packages/api/src/routes/accounting.routes.ts:32`, `packages/api/src/middleware/requirePlan.ts:18`
