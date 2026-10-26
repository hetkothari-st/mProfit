---
id: F-ACCT-006
title: "Delete a voucher"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: []
related: [F-ACCT-007]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Delete a voucher

`F-ACCT-006` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Deletes a voucher after the confirmation "Delete this voucher?".

**Why it exists:** Removes a wrong posting. Inferred from behavior.

**Where to find it:** Bin (title "Delete voucher") on a voucher row.

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Click the bin and confirm. The toast "Deleted" appears.

**Controls:** Bin (title "Delete voucher").

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The voucher and its lines are removed.

**Errors and troubleshooting:** Generic request error if it fails.

**Limitations:** A generated ("auto") voucher comes back the next time you open the ledger or a statement, or click **Generate from activity**, because the books are re-projected from your activity (see DOCUMENTATION_GAPS.md).

**How it works:** `DELETE /api/accounting/vouchers/:id`.

**Related features:** [F-ACCT-007](F-ACCT-007.md).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:525`, `packages/api/src/services/accounting/accounting.service.ts:426`, `packages/api/src/controllers/accounting.controller.ts:142`
