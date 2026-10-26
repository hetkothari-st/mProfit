---
id: [F-VEH-017](F-VEH-017.md)
title: "Linked insurance policies on a vehicle"
module: "Vehicles"
status: Hidden
roles: "—"
in_manual: false
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Linked insurance policies on a vehicle

`F-VEH-017` · Hidden · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Vehicles |
| Page / route | none (fetched, never rendered) |
| Actions | — |
| Settings | — |
| Backend | GET /api/vehicles/:id (insurancePolicies) |
| Data read / changed | InsurancePolicy (read) |
| Sources | ``packages/api/src/services/vehicles/vehicles.service.ts:129``, ``apps/web/src/api/vehicles.api.ts:62`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
