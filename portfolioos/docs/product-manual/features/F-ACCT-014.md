---
id: [F-ACCT-014](F-ACCT-014.md)
title: "Accounting endpoints without a screen (edit account, get/edit voucher, suggest voucher)"
module: "Accounting"
status: Backend-only
roles: "[R-PRO](../roles.md#r-pro) callers"
in_manual: false
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Accounting endpoints without a screen (edit account, get/edit voucher, suggest voucher)

`F-ACCT-014` · Backend-only · Roles: [R-PRO](../roles.md#r-pro) callers

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Accounting |
| Page / route | none |
| Actions | API only |
| Settings | — |
| Backend | PATCH accounts/:id; GET/PATCH vouchers/:id; GET suggest/transaction/:id |
| Data read / changed | Account, Voucher |
| Sources | ``packages/api/src/routes/accounting.routes.ts:64`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
