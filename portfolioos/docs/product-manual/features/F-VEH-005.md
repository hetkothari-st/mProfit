---
id: F-VEH-005
title: "Delete a vehicle"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: []
related: [F-VEH-001, F-VEH-006, F-VEH-010]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Delete a vehicle

`F-VEH-005` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** Permanently removes a vehicle and its challans.

**Why it exists:** Inferred from behavior: remove sold or mistakenly added vehicles.

**Where to find it:** Trash icon on a card at **Asset Classes → Vehicles**; **Delete** on the vehicle page header; **Delete Vehicle** in the edit dialog.

**Who can use it:** All plans, on their own (or managed person's) vehicles.

**Steps**
1. Click the trash icon (or **Delete**). The browser asks "Delete vehicle <REG>?" (edit dialog: "… This cannot be undone.").
2. Confirm. The app shows "Vehicle <REG> deleted" (list) or "Vehicle deleted" and, from the detail page, returns to `/vehicles`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Trash icon (card) | Icon button | Delete after confirm | While deleting |
| **Delete** (detail) | Button | Delete after confirm | While deleting |
| **Delete Vehicle** (edit dialog) | Button | Delete after confirm | While deleting; shown only when editing |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** The vehicle and all its challans are deleted. Saved valuation history entries stay but lose their vehicle link.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete vehicle" / "Delete failed" | Network or server error | Retry |

**Limitations:** No undo. Challan review items already created in the ingestion review queue are not removed.

**How it works:** `DELETE /api/vehicles/:id` checks the vehicle belongs to you ("Vehicle not found" 404 / 403 otherwise) and deletes it; challans cascade in the database.

**Related features:** [F-VEH-001](F-VEH-001.md), [F-VEH-006](F-VEH-006.md), [F-VEH-010](F-VEH-010.md).

**Sources:** `apps/web/src/pages/vehicles/VehicleListPage.tsx:272`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:176`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:169`, `packages/api/src/services/vehicles/vehicles.service.ts:220`, `packages/api/prisma/schema.prisma:2018`
