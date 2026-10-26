---
id: F-RENT-003
title: "Delete a rental property"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: []
related: [F-RENT-001, F-REST-009]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Delete a rental property

`F-RENT-003` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** Deletes a rental property and everything under it.

**Why it exists:** Inferred from behavior: remove properties no longer held.

**Where to find it:** Trash icon on a card at **Asset Classes → Rental**.

**Who can use it:** All plans.

**Steps**
1. Click the trash icon. The card shows "Delete "<name>"?".
2. Click **Yes, delete** (or **Cancel**). "Property deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Yes, delete** / **Cancel** | Buttons | Confirm / abort | While deleting |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** The property, its tenancies, rent schedule, khata entries, expenses, reminders and photos are deleted. A linked Real Estate property loses its rental link but keeps the status Rented out.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete property" | Server error | Retry |

**Limitations:** No undo. Cash-flow entries created when rent was recorded are not deleted with the property (see DOCUMENTATION_GAPS [F-RENT-003](F-RENT-003.md)) and remain in Cash Activity.

**How it works:** `DELETE /api/rental/properties/:id`; the database cascades through tenancies → receipts, ledger entries, reminders, and expenses.

**Related features:** [F-RENT-001](F-RENT-001.md), [F-REST-009](F-REST-009.md).

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:686`, `apps/web/src/pages/rental/RentalListPage.tsx:776`, `packages/api/src/services/rental/rental.service.ts:324`, `packages/api/prisma/schema.prisma:2157`, `packages/api/prisma/schema.prisma:2239`
