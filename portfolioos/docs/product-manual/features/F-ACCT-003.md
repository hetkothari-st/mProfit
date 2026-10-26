---
id: F-ACCT-003
title: "Add or delete an account"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: [S-ACCT-001, S-ACCT-002, S-ACCT-003]
related: [F-ACCT-002]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Add or delete an account

`F-ACCT-003` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Add Account** creates an account with code, type, name, parent and opening balance. Delete removes an account that has no voucher entries and no sub-accounts.

**Why it exists:** To shape the chart to your books. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Chart of Accounts → Add account**, or a row's **+** / bin.

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Click **Add account** (or **+** on a row). **Add Account** opens.
2. Fill **Code** (placeholder "e.g. 1001"), **Type**, **Name**, **Parent Account** (**None (top-level)** or an account), **Opening Balance (₹)**.
3. Click **Create**. The toast "Account created" appears.
4. To delete: click the bin and confirm `Delete account "<name>"?`. The toast "Account deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Create** | Button | Saves; "Creating…" | Disabled until code and name are filled, and while saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Code** | Text | Yes | 1–20, unique | Empty | Server: "Account code <code> already exists" (shown as a generic error) |
| **Type** | Select: ASSET, LIABILITY, EQUITY, INCOME, EXPENSE | Yes | — | ASSET | — |
| **Name** | Text | Yes | 1–200 | Empty | — |
| **Parent Account** | Select | No | Your accounts | None (top-level), or the row's account | Server: "Parent account … not found" |
| **Opening Balance (₹)** | Number | No | Positive decimal only | 0 | Server validation (shown as a generic error) |

**Settings and toggles here:** [S-ACCT-001](../settings/accounting.md#s-acct-001) **Type**; [S-ACCT-002](../settings/accounting.md#s-acct-002) **Parent Account**; [S-ACCT-003](../settings/accounting.md#s-acct-003) **Opening Balance (₹)**.

**Results:** The account appears in the tree and in every account picker. Delete removes it.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Generic request error on delete | The account has voucher entries ("Cannot delete account with existing voucher entries") or sub-accounts ("Cannot delete account with sub-accounts") | Delete those first |

**Limitations:** Opening balances can't be negative; a credit opening on an asset account (or the reverse) can't be entered. If you close **Add Account** without saving, what you typed is kept for the next time it opens.

**How it works:** `POST /api/accounting/accounts`, `DELETE /api/accounting/accounts/:id`.

**Related features:** [F-ACCT-002](F-ACCT-002.md).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:86`, `apps/web/src/pages/accounting/AccountingPage.tsx:119`, `packages/api/src/schemas/accounting.schema.ts:38`, `packages/api/src/services/accounting/accounting.service.ts:193`, `packages/api/src/services/accounting/accounting.service.ts:254`, `packages/api/src/services/accounting/accounting.service.ts:258`
