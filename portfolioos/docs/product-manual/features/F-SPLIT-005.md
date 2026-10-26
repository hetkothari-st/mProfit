---
id: F-SPLIT-005
title: "Add or edit an expense"
module: "Split Expenses"
status: Live
roles: "Group members"
settings: [S-SPLIT-005, S-SPLIT-006]
related: [F-SPLIT-004, F-SPLIT-006, F-SPLIT-008, F-SPLIT-010]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Add or edit an expense

`F-SPLIT-005` · Live · Roles: Group members

**What it does:** The **Add expense** / **Edit expense** dialog records **Description**, **Amount**, **Currency** (with "1 <ccy> in <group ccy>" exchange rate when different), **Date**, **Paid by** (one person or **Multiple people** with amounts), **Split** mode — **Equally** (tick people), **Exact** (amount each), **Percent**, **Shares** (all start at 1) — with a live per-person preview, and optional **Labels**.

**Why it exists:** Inferred from behavior: covers the common ways a bill is shared, keeping totals exact to the paisa.

**Where to find it:** Group page → **Add expense**; expense page → **Edit**; friend page → **Add expense** (1:1).

**Who can use it:** Active group members (any member can edit any expense).

**Steps**
1. Enter **Description** and **Amount**; change **Currency** if needed (leave the rate blank to use the latest rate).
2. Pick the **Date** (not later than today).
3. Choose **Paid by**; for several payers choose **Multiple people** and enter each amount.
4. Pick a **Split** mode and fill it in; check the preview column.
5. Optionally tick **Labels**. Click **Save expense** ("Expense added" / "Expense updated").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Currency** | Select | Expense currency ([S-SPLIT-006](../settings/split-expenses.md#s-split-006)) | — |
| **1 <ccy> in <group ccy>** | Number | Exchange rate | Shown only for a foreign currency |
| **Paid by** | Select | One payer or **Multiple people** | — |
| **Equally** / **Exact** / **Percent** / **Shares** | Tabs | Split mode ([S-SPLIT-005](../settings/split-expenses.md#s-split-005)) | — |
| Include / value per person | Checkbox / number | Shares per person | — |
| Label chips | Toggle buttons | Labels for the expense | Shown when the group has labels |
| **Save expense** / **Cancel** | Buttons | Save or close | Save disabled until the form checks out |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Description | Text | Yes | 1–200 characters | — | "Add a description" |
| Amount | Number | Yes | > 0, at most 2 decimals, below 1e12 | — | "Enter an amount above 0 with at most 2 decimals" |
| Exchange rate | Number | No | Positive | Latest rate | "Enter a valid exchange rate or leave it blank" |
| Date | Date | Yes | Real date, not more than 1 day ahead (server) / today (web) | Today | "Invalid date" |
| Paid amounts (multiple) | Numbers | Yes | Must add up to the amount | — | "Paid amounts add up to ₹X, not ₹Y" |
| Exact amounts | Numbers | Yes | At most 2 decimals; must add up | — | "₹X left to assign" / "Over by ₹X" |
| Percent | Numbers | Yes | Must total 100 | — | "Percentages add up to N%, not 100%" |
| Any mode | — | — | At least one person | — | "Pick at least one person to split with" |

**Settings and toggles here:** [S-SPLIT-005](../settings/split-expenses.md#s-split-005) **Split mode**, [S-SPLIT-006](../settings/split-expenses.md#s-split-006) **Expense currency and exchange rate**.

**Results:** The expense is saved with each person's share; balances, "Add my share to Cash Activity" entries and the activity feed update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No <A>/<B> rate — enter one manually" | No stored exchange rate | Type a rate |
| "Re-add <name> before changing their past entries" | The change would leave a member who left with a balance | Re-add them first |
| "A participant is not in this group" | Someone left meanwhile | Reload |
| "Restore the expense before editing it" | Expense is deleted | Restore it |
| "Expense saved, but its labels could not be updated" | Labels step failed | Set labels on the expense page |

**Limitations:** Only the 10 listed currencies (plus the group's) can be picked. Members who left the group can't be chosen.

**How it works:** `POST /api/split/expenses` / `PATCH /api/split/expenses/:id`, then `PUT /api/split/expenses/:id/labels` if labels changed. Allocation is in whole paise: each person gets floor(total × weight ÷ total weight) and leftover paise go one at a time in ascending member-id order; Exact amounts must sum exactly; Percent must total 100. The base-currency amount = amount × rate rounded half-even to 2 places, then spread over shares and payers in proportion.

**Related features:** [F-SPLIT-004](F-SPLIT-004.md), [F-SPLIT-006](F-SPLIT-006.md), [F-SPLIT-008](F-SPLIT-008.md), [F-SPLIT-010](F-SPLIT-010.md).

**Sources:** `apps/web/src/pages/split/AddExpenseDialog.tsx:18`, `apps/web/src/pages/split/AddExpenseDialog.tsx:114`, `apps/web/src/pages/split/AddExpenseDialog.tsx:119`, `apps/web/src/pages/split/AddExpenseDialog.tsx:215`, `apps/web/src/pages/split/expenseForm.ts:152`, `apps/web/src/pages/split/expenseForm.ts:174`, `apps/web/src/pages/split/expenseForm.ts:199`, `apps/web/src/pages/split/expenseForm.ts:204`, `packages/api/src/controllers/split.controller.ts:48`, `packages/api/src/services/split/allocate.ts:31`, `packages/api/src/services/split/allocate.ts:83`, `packages/api/src/services/split/fx.ts:22`, `packages/api/src/services/split/validate.ts:10`, `packages/api/src/services/split/groups.service.ts:53`
