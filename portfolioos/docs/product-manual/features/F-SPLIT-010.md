---
id: F-SPLIT-010
title: "Add my share to Cash Activity"
module: "Split Expenses"
status: Live
roles: "Members with a share"
settings: [S-SPLIT-009, S-SPLIT-012]
related: [F-SPLIT-017]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Add my share to Cash Activity

`F-SPLIT-010` · Live · Roles: Members with a share

**What it does:** A switch "Add my share (₹…) to Cash Activity" on each expense you are part of. On, it creates an outflow in your Cash Activity for your share ("Split: <description> (<group>)") and keeps it in step when anyone edits, deletes or restores the expense. If you have no default portfolio it first asks "Pick a portfolio for this entry".

**Why it exists:** Code comment: "'Add my share to Cash Activity'… the CashFlow it points at is derived from the expense and rewritten on every sync."

**Where to find it:** Expense page → **Cash Activity**.

**Who can use it:** Members with a share in the expense.

**Steps**
1. Turn the switch on. If asked, choose a portfolio.
2. Turn it off to remove the entry.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "Add my share (…) to Cash Activity" | Switch | [S-SPLIT-012](../settings/split-expenses.md#s-split-012) | Disabled on a deleted expense; replaced by "Not part of this split" when your share is 0 |
| Portfolio picker ("Choose a portfolio") | Select | Portfolio for the entry | Shown when no default portfolio is set |

**Fields and rules:** Portfolio must be one of yours ("Pick one of your portfolios for Cash Activity").

**Settings and toggles here:** [S-SPLIT-012](../settings/split-expenses.md#s-split-012) **Add my share to Cash Activity**; [S-SPLIT-009](../settings/split-expenses.md#s-split-009) **Default portfolio** (used automatically).

**Results:** An outflow in **Cash Activity** ([D-SPLIT-001](../dependencies.md#d-split-001)) for your share, in the group currency, with an INR equivalent at the latest rate for foreign groups ("(rate unavailable)" added to the description when no rate exists).

**Errors and troubleshooting:** "you're not part of this expense", "Couldn't update Cash Activity", "Couldn't load Cash Activity."

**Limitations:** Payments (settlements) are not added to Cash Activity.

**How it works:** `GET/PUT /api/split/expenses/:id/share-link`. Each link's cash flow is re-synced after expense create/edit/delete/restore (run as system so another member's edit updates your entry) and by a nightly reconcile at 02:30 IST.

**Related features:** [F-SPLIT-017](F-SPLIT-017.md), [D-SPLIT-001](../dependencies.md#d-split-001), [D-SPLIT-002](../dependencies.md#d-split-002).

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:284`, `apps/web/src/pages/split/ExpenseExtras.tsx:302`, `apps/web/src/pages/split/ExpenseExtras.tsx:310`, `packages/api/src/services/split/shareLink.service.ts:155`, `packages/api/src/services/split/shareLink.service.ts:176`, `packages/api/src/services/split/expenses.service.ts:175`, `packages/api/src/jobs/splitShareLinkReconcileJob.ts:22`
