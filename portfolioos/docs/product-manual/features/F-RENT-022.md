---
id: [F-RENT-022](F-RENT-022.md)
title: "Receipt list, expense list, manual overdue flip, ledger entry edit"
module: "Rental"
status: Backend-only
roles: "—"
in_manual: false
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Receipt list, expense list, manual overdue flip, ledger entry edit

`F-RENT-022` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Rental |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | GET /api/rental/receipts, GET /api/rental/expenses, POST /api/rental/receipts/mark-overdue, PATCH /api/rental/entries/:id |
| Data read / changed | RentReceipt, PropertyExpense, RentLedgerEntry |
| Sources | ``packages/api/src/routes/rental.routes.ts:61``, ``packages/api/src/routes/rental.routes.ts:67``, ``packages/api/src/routes/rental.routes.ts:70``, ``packages/api/src/routes/rental.routes.ts:54`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
