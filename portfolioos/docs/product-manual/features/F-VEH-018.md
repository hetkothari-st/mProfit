---
id: [F-VEH-018](F-VEH-018.md)
title: "Vehicle fields with no form input (model, fuel, owner, purchase date/price, current value, permit expiry)"
module: "Vehicles"
status: Backend-only
roles: "—"
in_manual: false
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Vehicle fields with no form input (model, fuel, owner, purchase date/price, current value, permit expiry)

`F-VEH-018` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Vehicles |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | PATCH /api/vehicles/:id |
| Data read / changed | Vehicle |
| Sources | ``packages/api/src/controllers/vehicles.controller.ts:32``, ``apps/web/src/pages/vehicles/VehicleFormDialog.tsx:374`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
