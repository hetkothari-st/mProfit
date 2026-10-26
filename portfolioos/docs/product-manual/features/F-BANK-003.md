---
id: F-BANK-003
title: "Delete a bank account"
module: "Bank Accounts"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-BANK-001]
---

[← Bank Accounts](../modules/bank-accounts.md) · [Index](../INDEX.md)

# Delete a bank account

`F-BANK-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Deletes an account after an in-tile confirmation "Delete <bank> account ending <last 4>?".

**Why it exists:** Inferred from behavior: remove accounts you no longer track (you can also mark them Closed instead).

**Where to find it:** **Bank Accounts** → tile → **Delete**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **Delete** on the tile. The tile turns into a confirmation.
2. Click **Delete** to confirm ("Account deleted") or **Cancel**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** / **Cancel** | Buttons | Confirm / cancel | **Delete** disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The account and its balance history are deleted; cash-flow entries that were attached to it are kept but no longer linked to an account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete account" | Server error | Try again |

**Limitations:** No undo; there is no Delete button on the detail page.

**How it works:** `DELETE /api/bank-accounts/:id` (owner checked); balance snapshots are removed by cascade; cash flows keep their rows with the account link cleared.

**Related features:** [F-BANK-001](F-BANK-001.md).

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:185`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:243`, `packages/api/src/services/banking/bankAccounts.service.ts:259`, `packages/api/prisma/schema.prisma:3232`, `packages/api/prisma/schema.prisma:1259`
