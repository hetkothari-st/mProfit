---
id: [F-RENT-020](F-RENT-020.md)
title: "Edit tenancy terms, end or delete a tenancy"
module: "Rental"
status: Backend-only
roles: "—"
in_manual: false
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Edit tenancy terms, end or delete a tenancy

`F-RENT-020` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Rental |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | PATCH /api/rental/tenancies/:id (rent, end date, due day, isActive), DELETE /api/rental/tenancies/:id |
| Data read / changed | Tenancy, RentReceipt |
| Sources | ``packages/api/src/routes/rental.routes.ts:57``, ``packages/api/src/services/rental/rental.service.ts:463``, ``packages/api/src/services/rental/rental.service.ts:634`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
